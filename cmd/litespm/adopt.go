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
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/state"
)

const adoptUsage = `Usage: litespm adopt <name> --host <host-id>

Adopts a server that is already registered in an agent's configuration file, so
LiteSPM manages it from now on. The configuration file is NOT modified: the
entry is already there, and adoption only records that LiteSPM now owns it.

  <name>       the entry name in the host's config (the key under mcpServers)
  --host       the agent host the entry lives in (e.g. claude-code, codex)

The adoption is reversible: 'litespm install remove <installId>' puts the
entry back exactly as it was, and keeps any edit you made to it meanwhile.`

// adoptOptions is the parsed command line for `litespm adopt`.
type adoptOptions struct {
	name   string
	hostID string
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
func runAdoptTo(out, errOut io.Writer, db *state.DB, opts adoptOptions) int {
	ctx := context.Background()
	if db == nil {
		fmt.Fprintln(errOut, "Adopt error: no state database")
		return 1
	}
	adapter, err := host.GetAdapter(opts.hostID)
	if err != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", err)
		return 1
	}
	if err := host.ValidateServerEntryName(opts.name); err != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", err)
		return 2
	}

	// The host's own detection is the authority on what is in its config: a
	// name it does not list is a name LiteSPM does not see, and adopting it
	// would record ownership of a node that does not exist.
	comps, derr := adapter.DetectPreExistingComponents(ctx)
	if derr != nil {
		fmt.Fprintf(errOut, "Adopt error: read %s: %v\n", adapter.Descriptor().DisplayName, derr)
		return 1
	}
	seen := false
	for _, comp := range comps {
		if comp.Name == opts.name {
			seen = true
			break
		}
	}
	if !seen {
		e := domain.NewError("LPSM-HOST-CONFIG-NOT-FOUND", fmt.Sprintf(
			"%s does not register a server named %q, so there is nothing to adopt",
			adapter.Descriptor().DisplayName, opts.name),
			map[string]any{"hostId": opts.hostID, "name": opts.name})
		fmt.Fprintf(errOut, "Adopt error: %v\n", e)
		return 1
	}

	// The node's current image: what it looks like now, and the canonical
	// text a removal will put back.
	entryState, serr := host.ReadServerEntryState(ctx, opts.hostID, opts.name, domain.ScopeUser, "")
	if serr != nil {
		fmt.Fprintf(errOut, "Adopt error: read the entry %q: %v\n", opts.name, serr)
		return 1
	}
	if entryState == nil {
		e := domain.NewError("LPSM-HOST-CONFIG-NOT-FOUND", fmt.Sprintf(
			"%s does not register a server named %q, so there is nothing to adopt",
			adapter.Descriptor().DisplayName, opts.name),
			map[string]any{"hostId": opts.hostID, "name": opts.name})
		fmt.Fprintf(errOut, "Adopt error: %v\n", e)
		return 1
	}

	locator, lerr := hostLocatorFor(opts.hostID, opts.name, domain.ScopeUser)
	if lerr != nil {
		fmt.Fprintf(errOut, "Adopt error: %v\n", lerr)
		return 1
	}

	installID := adoptInstallID(opts.hostID, opts.name)
	listingID := "mcp:adopted:" + opts.name
	now := time.Now().UTC()
	rec := &domain.InstallRecord{
		InstallID:   installID,
		ListingID:   listingID,
		Kind:        domain.KindMCP,
		Version:     "adopted",
		TreeDigest:  entryState.Fingerprint,
		InstallPath: entryState.ConfigPath,
		Scope:       domain.ScopeUser,
		Status:      domain.InstallActive,
		InstalledAt: now,
		UpdatedAt:   now,
	}
	mutation := deployment.Adoption(installID, listingID, opts.hostID, string(domain.ScopeUser),
		entryState.ConfigPath, hostStructureTypeFor(opts.hostID), locator,
		entryState.Fingerprint, entryState.Raw)

	// One transaction: the install row, its component and the ownership row
	// land together or not at all. The install path stays the only writer of
	// install state, and this writes through the same transaction it uses.
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
		fmt.Fprintf(errOut, "Adopt error: %v\n", err)
		return 1
	}

	fmt.Fprintf(out, "✓ Adopted %q in %s\n", opts.name, adapter.Descriptor().DisplayName)
	fmt.Fprintf(out, "  Config:    %s (unchanged)\n", entryState.ConfigPath)
	fmt.Fprintf(out, "  Image:     %s\n", entryState.Fingerprint)
	fmt.Fprintf(out, "  Install:   %s\n", installID)
	fmt.Fprintf(out, "  Undo:      litespm install remove %s\n", installID)
	return 0
}

// adoptInstallID is the install id an adoption is recorded under. It names the
// host and the entry, because the same entry name can be adopted on more than
// one host and each is its own ownership.
func adoptInstallID(hostID, name string) string {
	return fmt.Sprintf("inst_user_adopt_%s_%s", safeInstallIDPart(hostID), safeInstallIDPart(name))
}
