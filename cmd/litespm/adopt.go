package main

// adopt.go — `litespm adopt`: taking ownership of a server that is already
// in an agent's configuration.
//
// # Why this exists
//
// An agent's config is full of servers LiteSPM did not install: the ones the
// user added by hand, the ones another tool wrote, the ones that were there
// before LiteSPM existed. LiteSPM could see them (every adapter lists them
// read-only) and could do nothing with them — `litespm list` called them
// "observed", which is honest but terminal: an observed server is not
// upgraded, not removed, and not restored.
//
// Adoption is ownership, and ownership is reversible. `litespm adopt` records
// the named server as LiteSPM's, WITHOUT writing a single byte to the host's
// configuration: the entry is already there, and it stays exactly as it is.
// What changes is LiteSPM's ledger, which now knows that this node is
// managed — and, crucially, what the node looked like when it took over.
//
// # The rule that makes it safe
//
// A removal must never delete something LiteSPM did not create. The adopted
// row therefore records the node's CURRENT image as its pre-image, and the
// node's own text as the prior entry: when the ownership is undone, the node
// is RESTORED, not deleted, and a user who edited it in the meantime keeps
// their edit (exactly like a node LiteSPM installed).
//
// # What it refuses
//
// A name LiteSPM does not see in that host's configuration is refused with
// LPSM-HOST-CONFIG-NOT-FOUND. Adopting something that is not there would
// record ownership of a node that does not exist, and the removal that
// follows would have nothing to restore.

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/state"
)

const adoptUsage = `Usage: litespm adopt <name> --host <host-id> [--scope user|project] [--workspace <dir>]

Adopts a server that is already registered in an agent's configuration file, so
LiteSPM manages it from now on. The configuration file is NOT modified: the
entry is already there, and adoption only records that LiteSPM now owns it.

  <name>       the entry name in the host's config (the key under mcpServers)
  --host       the agent host the entry lives in (e.g. claude-code, codex)
  --scope      user (the agent's global config) or project (a project's
               config). Default: user.
  --workspace  the project directory a project-scope entry lives in. Required
               for --scope project; the working directory is used otherwise.

The adoption is reversible: 'litespm install remove <installId>' puts the
entry back exactly as it was, and keeps any edit you made to it meanwhile.`

// adoptOptions is the parsed command line for `litespm adopt`.
type adoptOptions struct {
	name   string
	hostID string
	// scope is where the entry lives: the agent's global config (user) or a
	// project's config (project). A project adoption needs the project root,
	// which --workspace names.
	scope     domain.InstallScope
	workspace string
}

// parseAdoptArgs parses `litespm adopt` strictly: an unknown flag, a missing
// flag value, a missing name and a missing host are all usage errors.
func parseAdoptArgs(args []string) (adoptOptions, error) {
	opts := adoptOptions{}
	positional := 0
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch arg {
		case "--host":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("flag %s requires a value", arg)
			}
			i++
			opts.hostID = strings.TrimSpace(args[i])
		case "--help", "-h":
			return opts, fmt.Errorf("help requested")
		default:
			if strings.HasPrefix(arg, "-") {
				return opts, fmt.Errorf("unknown flag %q", arg)
			}
			positional++
			if positional > 1 {
				return opts, fmt.Errorf("unexpected argument %q", arg)
			}
			opts.name = strings.TrimSpace(arg)
		}
	}
	if opts.name == "" {
		return opts, fmt.Errorf("missing <name>")
	}
	if opts.hostID == "" {
		return opts, fmt.Errorf("missing --host")
	}
	return opts, nil
}

// runAdopt is the production entry point for `litespm adopt`.
func runAdopt(args []string) int {
	opts, err := parseAdoptArgs(args)
	if err != nil {
		if err.Error() == "help requested" {
			fmt.Println(adoptUsage)
			return 0
		}
		fmt.Fprintf(os.Stderr, "Adopt error: %v\n\n", err)
		fmt.Println(adoptUsage)
		return 2
	}
	paths, err := config.ResolvePlatformPaths()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: failed to resolve platform paths: %v\n", err)
		return 1
	}
	if err := paths.EnsureDirectories(); err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: failed to initialize storage directories: %v\n", err)
		return 1
	}
	db, err := state.Open(paths.StateDBPath())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Fatal: failed to open state database: %v\n", err)
		return 1
	}
	defer db.Close()
	return runAdoptTo(os.Stdout, os.Stderr, db, opts)
}

// runAdoptTo runs the adoption against explicit streams, so a test can read
// what was printed.
// adoptOutcome is what an adoption recorded.
type adoptOutcome struct {
	InstallID  string
	ListingID  string
	HostID     string
	EntryName  string
	ConfigPath string
	Digest     string
	Scope      domain.InstallScope
	Files      int
}

// adoptHostEntry records ownership of a server that is ALREADY in a host's
// configuration, without writing a byte to that configuration.
//
// This is the one implementation: the CLI command and the daemon's
// adopt.execute handler both call it, so the two can never disagree about
// what an adoption does. The configuration file is never modified — the entry
// is already there, and only LiteSPM's ledger changes — and the node's
// current image is recorded as the pre-image, so a later removal RESTORES
// the node rather than deleting it.
func adoptHostEntry(ctx context.Context, db *state.DB, opts adoptOptions) (*adoptOutcome, error) {
	if db == nil {
		return nil, domain.NewError("LPSM-INTERNAL-ERROR", "no state database", nil)
	}
	if opts.scope == "" {
		opts.scope = domain.ScopeUser
	}
	adapter, err := host.GetAdapter(opts.hostID)
	if err != nil {
		return nil, err
	}
	if err := host.ValidateServerEntryName(opts.name); err != nil {
		return nil, err
	}

	// A project-scope entry lives in the PROJECT's config file, so the
	// project root has to be resolved before anything is read. It is
	// absolute: the workspace is the identity of the project, exactly as it
	// is for a project-scope install.
	projectRoot := ""
	if opts.scope == domain.ScopeProject {
		root := opts.workspace
		if root == "" {
			cwd, cerr := os.Getwd()
			if cerr != nil {
				return nil, fmt.Errorf("resolve the project directory: %w", cerr)
			}
			root = cwd
		}
		abs, aerr := filepath.Abs(root)
		if aerr != nil {
			return nil, fmt.Errorf("resolve the project directory %s: %w", root, aerr)
		}
		projectRoot = abs
		if _, ok := host.ProjectConfigPathFor(adapter, projectRoot); !ok {
			return nil, domain.NewError("LPSM-HOST-CONFIG-NOT-FOUND", fmt.Sprintf(
				"%s documents no project-scope configuration file, so a project adoption cannot be located there",
				adapter.Descriptor().DisplayName),
				map[string]any{"hostId": opts.hostID, "scope": string(opts.scope)})
		}
	}

	// The host's own config is the authority on what is in it: a name it
	// does not list is a name LiteSPM does not see, and adopting it would
	// record ownership of a node that does not exist.
	entries, derr := host.ListServerEntriesWithValues(ctx, opts.hostID, opts.scope, projectRoot)
	if derr != nil {
		return nil, fmt.Errorf("read %s: %w", adapter.Descriptor().DisplayName, derr)
	}
	seen := false
	for _, entry := range entries {
		if entry.Name == opts.name {
			seen = true
			break
		}
	}
	if !seen {
		return nil, domain.NewError("LPSM-HOST-CONFIG-NOT-FOUND", fmt.Sprintf(
			"%s does not register a server named %q, so there is nothing to adopt",
			adapter.Descriptor().DisplayName, opts.name),
			map[string]any{"hostId": opts.hostID, "name": opts.name})
	}

	entryState, serr := host.ReadServerEntryState(ctx, opts.hostID, opts.name, opts.scope, projectRoot)
	if serr != nil {
		return nil, fmt.Errorf("read the entry %q: %w", opts.name, serr)
	}
	if entryState == nil {
		return nil, domain.NewError("LPSM-HOST-CONFIG-NOT-FOUND", fmt.Sprintf(
			"%s does not register a server named %q, so there is nothing to adopt",
			adapter.Descriptor().DisplayName, opts.name),
			map[string]any{"hostId": opts.hostID, "name": opts.name})
	}

	locator, lerr := hostLocatorFor(opts.hostID, opts.name, opts.scope)
	if lerr != nil {
		return nil, lerr
	}

	installID := adoptInstallID(opts.hostID, opts.name, opts.scope)
	listingID := "mcp:adopted:" + opts.name
	now := time.Now().UTC()
	rec := &domain.InstallRecord{
		InstallID:   installID,
		ListingID:   listingID,
		Kind:        domain.KindMCP,
		Version:     "adopted",
		TreeDigest:  entryState.Fingerprint,
		InstallPath: entryState.ConfigPath,
		Scope:       opts.scope,
		ProjectRoot: projectRoot,
		Status:      domain.InstallActive,
		InstalledAt: now,
		UpdatedAt:   now,
	}
	mutation := deployment.Adoption(installID, listingID, opts.hostID, string(opts.scope),
		entryState.ConfigPath, hostStructureTypeFor(opts.hostID), locator,
		entryState.Fingerprint, entryState.Raw)

	// One transaction: the install row, its component and the ownership row
	// land together or not at all.
	if err := db.WithTx(ctx, func(tx *sql.Tx) error {
		if err := db.SaveInstallExec(ctx, tx, rec); err != nil {
			return fmt.Errorf("record the adoption: %w", err)
		}
		if err := db.SaveInstallComponentExec(ctx, tx, &domain.InstallComponentRecord{
			InstallID:     installID,
			Kind:          domain.ComponentMCPProvider,
			ComponentName: opts.name,
			Path:          entryState.ConfigPath,
		}); err != nil {
			return fmt.Errorf("record the adopted component: %w", err)
		}
		if err := deployment.SaveMutationExec(ctx, tx, mutation); err != nil {
			return fmt.Errorf("record the ownership: %w", err)
		}
		return nil
	}); err != nil {
		return nil, err
	}

	return &adoptOutcome{
		InstallID:  installID,
		ListingID:  listingID,
		HostID:     opts.hostID,
		EntryName:  opts.name,
		ConfigPath: entryState.ConfigPath,
		Digest:     entryState.Fingerprint,
		Scope:      opts.scope,
	}, nil
}

func runAdoptTo(out, errOut io.Writer, db *state.DB, opts adoptOptions) int {
	ctx := context.Background()
	// The scope is defaulted HERE as well as in the parser: a caller that
	// builds the options directly must not reach the ledger with an empty
	// scope, which its CHECK constraint would refuse.
	if opts.scope == "" {
		opts.scope = domain.ScopeUser
	}
	outcome, err := adoptHostEntry(ctx, db, opts)
	if err != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", err)
		return 1
	}
	adapter, aerr := host.GetAdapter(outcome.HostID)
	if aerr != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", aerr)
		return 1
	}
	fmt.Fprintf(out, "✓ Adopted %q in %s\n", outcome.EntryName, adapter.Descriptor().DisplayName)
	fmt.Fprintf(out, "  Config:    %s (unchanged)\n", outcome.ConfigPath)
	fmt.Fprintf(out, "  Image:     %s\n", outcome.Digest)
	fmt.Fprintf(out, "  Install:   %s\n", outcome.InstallID)
	fmt.Fprintf(out, "  Undo:      litespm install remove %s\n", outcome.InstallID)
	return 0
}

// adoptInstallID is the install id an adoption is recorded under. It names the
// host, the entry and the SCOPE, because the same entry name can be adopted
// on more than one host — and in both a global config and a project's — and
// each is its own ownership.
func adoptInstallID(hostID, name string, scope domain.InstallScope) string {
	scopePart := "user"
	if scope == domain.ScopeProject {
		scopePart = "project"
	}
	return fmt.Sprintf("inst_%s_adopt_%s_%s", scopePart, safeInstallIDPart(hostID), safeInstallIDPart(name))
}
