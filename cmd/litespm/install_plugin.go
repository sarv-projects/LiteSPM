package main

// install_plugin.go — installing a catalog plugin into agent host configs.
//
// # What a plugin install IS
//
// A plugin is a bundle: a manifest, some MCP servers, some skills, and (in
// most plugins) commands, agents, hooks and LSP servers. Two of those classes
// are portable and are installed here: MCP servers are registered in each
// target host's config through the same writer as a standalone server
// (internal/host.InstallServerEntry), and skills are copied into each agent's
// own skills tree through the same installer and ledger as a standalone skill
// (install_plugin_skills.go).
//
// The host-specific extras are COUNTED and REPORTED with a reason, never
// projected. LiteSPM has no adapter for a command, an agent or a hook, and a
// half-projection is worse than none: an install that claims to have installed
// a plugin whose commands were silently dropped is a lie the user cannot see.
//
// # Partial installs need consent
//
// Because the skip set is named by the plugin's own manifest inside the pinned
// tree, it is not knowable when the plan is written — only after the approved
// tree is fetched. So the acknowledgement (--allow-partial, or allowPartial on
// prepare_install) is sealed into the plan at plan time and checked at
// execution time, after the manifest is read and before any write: a plugin
// that declares an unprojected component is refused with LPSM-INSTALL-PARTIAL
// naming the classes it would skip, rather than installing its portable half
// and mentioning the loss in a note. A plugin whose only portable component is
// a skill is installable; installing part of a plugin is a decision a person
// makes, not a default.
//
// # The order of the work
//
//  1. the authorization gate: a recorded plan and a consumed human approval
//     (install_authz.go). Nothing is fetched before that gate answers, so an
//     unapproved install never touches the network;
//  2. the artifact: the plan sealed the repository, the pinned commit and the
//     path inside it, so the approval binds exact bytes — a commit id, not a
//     branch name;
//  3. the fetch: internal/artifact's GitTreeFetcher fetches that commit,
//     verifies that the remote served exactly it, and extracts the tree
//     through the shared safe extractor (archive-slip, symlink, size,
//     file-count, 100:1 compression ratio) and the canonical tree digest;
//  4. the manifest: internal/interop's parser, which refuses what it does
//     not understand, never executes a command source, and takes environment
//     NAMES only;
//  5. the host pre-flight: every target host is checked BEFORE any config is
//     touched, so a host that cannot take an entry fails the whole install
//     instead of half-installing it;
//  6. the policy gate;
//  7. the writes: one host-config write per (host, server), each with its own
//     compensation, and every state row in one SQLite transaction. A failure
//     at any point leaves the machine byte-identical.
//
// # The dispatch
//
// The command layer reaches this path in three calls, and the kind gate's
// pluginInstallDispatched flag (install_kind.go) is flipped to true next to
// them:
//
//	targetHosts := flags.hosts
//	if len(targetHosts) == 0 {
//		targetHosts = host.RegisteredBridgeHosts(ctx, flags.scope)
//	}
//	grant, dropped, gerr := authorizeHumanPluginInstall(ctx, db, catClient, listing,
//		flags.version, flags.scope, projectRoot, targetHosts, len(flags.hosts) > 0, flags.force, flags.envNames)
//	// ... the grant's context authorizes the install ...
//	binding, berr := pluginInstallBindingFromPlan(ctx, grant.Plan, listing, flags.scope)
//	outcome, ierr := installPluginFromListing(ctx, db, paths.DataRoot, listing, grant.Version,
//		flags.scope, projectRoot, binding)
//
// The daemon's resolver.prepare_plan and install.execute need the same two
// calls (buildPluginInstallPlan and installPluginFromListing), and the
// wizard's find-and-install needs them too: the kind gate admits a plugin
// exactly when every caller can execute one.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/sarv-projects/litespm/internal/artifact"
	"github.com/sarv-projects/litespm/internal/catalog"
	"github.com/sarv-projects/litespm/internal/config"
	"github.com/sarv-projects/litespm/internal/deployment"
	"github.com/sarv-projects/litespm/internal/domain"
	"github.com/sarv-projects/litespm/internal/host"
	"github.com/sarv-projects/litespm/internal/interop"
	"github.com/sarv-projects/litespm/internal/lifecycle"
	"github.com/sarv-projects/litespm/internal/policy"
	"github.com/sarv-projects/litespm/internal/skills"
	"github.com/sarv-projects/litespm/internal/state"
)

// pluginArtifact is the pinned artifact a plugin plan seals: the repository,
// the commit it is pinned to, and the path inside it.
//
// The commit is the pin. A ref (a branch or tag name) is a mutable name, and
// content that changes under an install is not an install, so a plan without
// a commit id is refused rather than resolved to "whatever is there now".
type pluginArtifact struct {
	Repo   string `json:"repo"`
	Commit string `json:"commit"`
	Path   string `json:"path,omitempty"`
}

// ref renders the sealed artifact as the domain's artifact reference.
func (a pluginArtifact) ref() domain.ArtifactRef {
	return domain.ArtifactRef{
		ArtifactID:   "art_plugin",
		Type:         domain.ArtifactGitTree,
		Locator:      a.Repo,
		ImmutableRef: a.Commit,
		Subpath:      a.Path,
		FetchPolicy:  domain.FetchImmutable,
	}
}

// pluginInstallBinding is the execution-relevant plugin configuration captured
// in an install plan: the target hosts, the pinned artifact, and the install
// options. The same value is sealed into every host change, so one approval
// binds the exact target set and the exact bytes.
type pluginInstallBinding struct {
	Hosts    []string
	Artifact pluginArtifact
	EnvNames []string
	Force    bool
	// SkillDests are the skills trees the plugin's portable skill components
	// may be copied into. They are a subset of Hosts — one root per target
	// host that is also a skills target — and they are sealed in the plan, so
	// a plugin cannot copy a skill into a tree nobody approved.
	SkillDests []skillDestination
	// ExplicitHosts marks a target set the USER named. An explicitly named
	// host is never filtered away for capability: the user asked for exactly
	// that host, so an incapable one fails by name instead of being silently
	// dropped. An unmarked set is LiteSPM's own default choice and is
	// filtered to the hosts that can take the entry, with the drops
	// reported.
	ExplicitHosts bool
	// AllowPartial records that the person asked for this install KNOWING a
	// plugin can deliver only part of what it declares. It is sealed into the
	// plan, so the approval covers the acknowledgement itself; without it an
	// install that would skip declared components is refused before any
	// write (see skippedPluginComponents).
	AllowPartial bool
}

// pluginInstallPlanValue is the sealed value of a plugin plan.
type pluginInstallPlanValue struct {
	Artifact     pluginArtifact `json:"artifact"`
	EnvNames     []string       `json:"envNames,omitempty"`
	Force        bool           `json:"force,omitempty"`
	AllowPartial bool           `json:"allowPartial,omitempty"`
}

func pluginInstallPlanValueJSON(binding *pluginInstallBinding) string {
	if binding == nil {
		return ""
	}
	data, err := json.Marshal(pluginInstallPlanValue{
		Artifact:     binding.Artifact,
		EnvNames:     append([]string(nil), binding.EnvNames...),
		Force:        binding.Force,
		AllowPartial: binding.AllowPartial,
	})
	if err != nil {
		return ""
	}
	return string(data)
}

// pluginServerEntry is one MCP server a plugin's manifest declared, resolved
// into the shape a host config stores.
type pluginServerEntry struct {
	Name     string
	Command  string
	Args     []string
	Endpoint string
	// Transport is the registry vocabulary of a remote entry ("streamable-http"
	// or "sse"); empty for a stdio entry.
	Transport string
	// EnvNames are the variables the user asked to forward. The manifest's own
	// environment contributes NAMES to the report, never values to the
	// config.
	EnvNames []string
	// DeclaredEnvNames are the variables the manifest says this server wants.
	DeclaredEnvNames []string
}

// pluginInstallOutcome is the honest result of a plugin install: the servers
// that were registered, the skills that were copied, the hosts they were
// written to, the pinned artifact they came from, and the components the
// plugin declares that LiteSPM does not install.
type pluginInstallOutcome struct {
	InstallID string
	ListingID string
	Version   string
	Scope     domain.InstallScope
	// Artifact is the pinned artifact that was fetched and verified.
	Artifact pluginArtifact
	// TreeDigest is the canonical digest of the verified tree.
	TreeDigest string
	// Servers are the MCP servers that were registered.
	Servers []pluginServerEntry
	// Hosts are the host config writes, one per (host, server).
	Hosts []*host.EntryInstallResult
	// Skills are the portable skill components that were copied, with every
	// directory each one landed in.
	Skills []pluginSkillResult
	// Skipped are the declared component classes this build cannot project,
	// each with the reason. A non-empty list means the install is partial.
	Skipped []skippedComponent
	// NotInstalled counts the components the manifest declares that this
	// install did not project.
	NotInstalled map[string]int
	// AllowPartial records that the partial projection was acknowledged in the
	// approved plan rather than merely tolerated.
	AllowPartial bool
	// Warnings are the manifest's reported facts.
	Warnings []string
}

// pluginManifestNames are the files a plugin's manifest may be published
// under, in the order they are looked for: the Agent Plugins 1.0.0 name at
// the plugin root, then the Claude Code plugin directory.
var pluginManifestNames = []string{
	filepath.Join("plugin.json"),
	filepath.Join(".claude-plugin", "plugin.json"),
}

// placeholderPattern matches a ${...} placeholder in a launch line. A
// plugin's own server may name the plugin's directory (${CLAUDE_PLUGIN_ROOT}
// and its relatives); only the plugin's own host expands that, and LiteSPM
// does not materialize a plugin's files into the host, so such an entry would
// be written with the placeholder unexpanded — a broken entry that looks
// installed.
var placeholderPattern = regexp.MustCompile(`\$\{[A-Za-z_][A-Za-z0-9_]*\}`)

// pluginArtifactFor finds the artifact a plugin's published version record
// carries, and refuses everything that is not a pinned git tree.
//
// The refusals are the plugin install's provenance gate: a row with no
// artifact has no proven source, an unpinned one has a mutable source, and a
// non git-tree one has a source this build cannot fetch. All three are
// refused with LPSM-ARTIFACT-UNAVAILABLE and a reason that says which.
func pluginArtifactFor(listing *domain.Listing, rec *domain.VersionRecord) (pluginArtifact, error) {
	id := ""
	if listing != nil {
		id = listing.ID
	}
	if rec == nil {
		return pluginArtifact{}, domain.ErrArtifactUnavailable(id,
			"the catalog publishes no version record for this plugin, so no artifact is proven")
	}
	if len(rec.Artifacts) == 0 {
		return pluginArtifact{}, domain.ErrArtifactUnavailable(id,
			"the catalog publishes no artifact for this plugin, so there is nothing to fetch")
	}
	var chosen *domain.ArtifactRef
	for i := range rec.Artifacts {
		a := &rec.Artifacts[i]
		if a.Type != domain.ArtifactGitTree {
			continue
		}
		chosen = a
		break
	}
	if chosen == nil {
		return pluginArtifact{}, domain.ErrArtifactUnavailable(id,
			fmt.Sprintf("the plugin's artifact is a %q; only a git tree can be fetched, so this plugin cannot be installed",
				rec.Artifacts[0].Type))
	}
	if chosen.FetchPolicy != domain.FetchImmutable || !commitIDPattern.MatchString(strings.ToLower(strings.TrimSpace(chosen.ImmutableRef))) {
		return pluginArtifact{}, domain.ErrArtifactUnavailable(id,
			"the plugin's artifact is not pinned to an immutable commit: a branch or tag name is mutable, "+
				"so the content it names can change under the install")
	}
	return pluginArtifact{
		Repo:   strings.TrimSpace(chosen.Locator),
		Commit: strings.ToLower(strings.TrimSpace(chosen.ImmutableRef)),
		Path:   strings.TrimSpace(chosen.Subpath),
	}, nil
}

// commitIDPattern is a full 40-hex lowercase commit id.
var commitIDPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)

// buildPluginInstallPlan resolves a plugin and seals the outcome into a plan
// the human approves.
//
// The plan seals the artifact (repository, pinned commit, path) and the
// target host set. It does NOT seal the entry names: those are named by the
// plugin's own manifest, which lives inside the pinned tree. The commit id
// is what binds them — the approval covers the exact bytes, and the bytes
// name the entries.
func buildPluginInstallPlan(
	ctx context.Context,
	catClient *catalog.Client,
	listing *domain.Listing,
	version string,
	scope domain.InstallScope,
	projectRoot string,
	hosts []string,
	explicit bool,
	force bool,
	envNames []string,
	allowPartial bool,
) (*domain.InstallPlan, []hostCapabilityDrop, error) {
	if listing == nil || listing.Kind != domain.KindPlugin {
		return nil, nil, fmt.Errorf("buildPluginInstallPlan: the listing is not a plugin")
	}
	rec, err := catClient.VersionRecordFor(listing.ID, catalogRecordVersion(version))
	if err != nil {
		return nil, nil, domain.ErrArtifactUnavailable(listing.ID,
			fmt.Sprintf("the catalog publishes no version record for this plugin: %v", err))
	}
	artifact, err := pluginArtifactFor(listing, rec)
	if err != nil {
		return nil, nil, err
	}
	if len(hosts) == 0 {
		return nil, nil, domain.ErrInstallTargetUnavailable(
			"no agent host has a verified LiteSPM bridge entry; run 'litespm host setup <host-id>' first, " +
				"or pass --host to name one explicitly")
	}
	// The target set: an explicitly named host is never filtered away (it
	// fails by name instead), while LiteSPM's own default set is filtered to
	// the hosts that can take a server entry at all.
	kept := make([]string, 0, len(hosts))
	var drops []hostCapabilityDrop
	for _, hostID := range hosts {
		reason := pluginHostCapabilityReason(ctx, hostID, scope)
		if reason == "" {
			kept = append(kept, hostID)
			continue
		}
		if explicit {
			return nil, nil, domain.ErrInstallTargetUnavailable(fmt.Sprintf("host %q %s", hostID, reason))
		}
		drops = append(drops, hostCapabilityDrop{HostID: hostID, Reason: reason})
	}
	if len(kept) == 0 {
		reasons := make([]string, 0, len(drops))
		for _, d := range drops {
			reasons = append(reasons, d.Reason)
		}
		return nil, nil, domain.ErrInstallTargetUnavailable(fmt.Sprintf(
			"none of the configured agent hosts can take an MCP server entry: %s", strings.Join(reasons, "; ")))
	}

	planID, err := newPlanID()
	if err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	binding := &pluginInstallBinding{
		Hosts:         kept,
		Artifact:      artifact,
		EnvNames:      append([]string(nil), envNames...),
		Force:         force,
		ExplicitHosts: explicit,
		AllowPartial:  allowPartial,
		// The hosts that also have a skills tree. Sealed now, so the skill
		// components of the plugin can only be copied where a human approved.
		SkillDests: pluginSkillRootsFor(kept, scope, projectRoot),
	}
	plan := &domain.InstallPlan{
		SchemaVersion: 2,
		PlanID:        planID,
		CreatedAt:     now,
		ExpiresAt:     now.Add(15 * time.Minute),
		Request: domain.PlanRequest{
			ListingID:        listing.ID,
			RequestedVersion: version,
			TargetScope:      scope,
			WorkspaceID:      domain.WorkspaceIDForProjectRoot(projectRoot),
			ProjectRoot:      projectRoot,
		},
		Resolved: domain.PlanResolved{
			Version:       rec.Version,
			ImmutableRefs: []string{artifact.Commit},
			Artifacts: []domain.PlanArtifact{{
				ArtifactID: "art_plugin",
				Type:       string(domain.ArtifactGitTree),
				Locator:    artifact.Repo,
			}},
		},
		// The effects a human reads before approving: the tree is fetched
		// (network.outbound), the files are unpacked (package.install) and
		// the host configs are edited (host.config.write).
		Effects: []string{
			string(policy.EffectPackageInstall),
			string(policy.EffectHostConfig),
			string(policy.EffectNetworkOutbound),
		},
		Preconditions:   domain.PlanPreconditions{},
		HostChanges:     pluginHostChanges(ctx, kept, scope, projectRoot, binding),
		RequestedAccess: nil,
	}
	planHash, err := domain.ComputePlanHash(plan)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to compute the plan hash: %w", err)
	}
	plan.PlanHash = planHash
	return plan, drops, nil
}

// pluginHostChanges lists the config files the install will write.
//
// The path is resolved the way the WRITE resolves it (host.InstallServerEntry
// opens the project's own config file at project scope, not the user's), so
// the plan names the file that will actually be touched.
//
// The EntryKey is empty on purpose: the key each server is stored under is
// named by the plugin's manifest, which lives inside the pinned tree, so it
// is not knowable at plan time. The pinned commit in the sealed value is
// what binds it.
func pluginHostChanges(ctx context.Context, hosts []string, scope domain.InstallScope, projectRoot string, binding *pluginInstallBinding) []domain.HostChange {
	changes := make([]domain.HostChange, 0, len(hosts))
	for _, hostID := range hosts {
		configPath := pluginConfigPathFor(ctx, hostID, scope, projectRoot)
		changes = append(changes, domain.HostChange{
			HostID:     hostID,
			ConfigPath: configPath,
			Action:     "register_command",
			EntryKey:   "",
			ValueJSON:  pluginInstallPlanValueJSON(binding),
		})
	}
	// A plugin's portable skills are directories, not config entries, so each
	// destination tree is a separate host change. The skill's own name lives
	// inside the pinned tree, which is why the root is what the plan seals;
	// the commit in the value JSON is what binds the contents.
	for _, dest := range binding.SkillDests {
		changes = append(changes, domain.HostChange{
			HostID:     dest.AgentID,
			ConfigPath: dest.Root,
			Action:     skillWriteAction,
			EntryKey:   "",
			ValueJSON:  pluginInstallPlanValueJSON(binding),
		})
	}
	return changes
}

// pluginConfigPathFor resolves the config file a host's server entry is
// written to at the given scope: the user's own file at user scope, and the
// project's own file at project scope (a host that documents no project file
// is refused by the capability gate before this is asked).
func pluginConfigPathFor(ctx context.Context, hostID string, scope domain.InstallScope, projectRoot string) string {
	adapter, err := host.GetAdapter(hostID)
	if err != nil {
		return ""
	}
	if scope == domain.ScopeProject {
		if path, ok := host.ProjectConfigPathFor(adapter, projectRoot); ok {
			return path
		}
		return ""
	}
	path, err := adapter.DetectConfig(ctx, scope)
	if err != nil {
		return ""
	}
	return path
}

// pluginHostCapabilityReason answers "can this host take an MCP server
// entry?". "" means yes. The reasons are the same predicates the write
// itself enforces, so a refusal happens before anything is written.
func pluginHostCapabilityReason(ctx context.Context, hostID string, scope domain.InstallScope) string {
	adapter, err := host.GetAdapter(hostID)
	if err != nil {
		return fmt.Sprintf("is not a supported agent host")
	}
	if _, _, ok := host.EntryLayoutForScope(adapter, scope); !ok {
		return fmt.Sprintf("declares no MCP entry layout, so a server entry cannot be written to it")
	}
	if scope == domain.ScopeProject && !host.SupportsProjectScope(adapter) {
		return fmt.Sprintf("has no documented project-scope config path, so it cannot take a project install")
	}
	return ""
}

// pluginInstallBindingFromPlan validates the approved plan's target details
// and returns only the pinned values. It deliberately does not re-resolve a
// missing host set or artifact from mutable machine or catalog state: the
// approval covers this plan's hash, and the plan is the record of what was
// approved.
func pluginInstallBindingFromPlan(ctx context.Context, plan *domain.InstallPlan, listing *domain.Listing, scope domain.InstallScope) (*pluginInstallBinding, error) {
	if plan == nil || listing == nil || listing.Kind != domain.KindPlugin {
		return nil, fmt.Errorf("the plugin install plan is missing its listing or plan document")
	}
	if len(plan.HostChanges) == 0 {
		return nil, domain.ErrInstallTargetUnavailable("the approved plan contains no plugin host targets; prepare a new plan after configuring a host")
	}
	binding := &pluginInstallBinding{}
	seen := make(map[string]bool, len(plan.HostChanges))
	var expected *pluginInstallPlanValue
	for _, change := range plan.HostChanges {
		// Skill roots are validated in the second pass, after the target host
		// set is known: a skill root is only meaningful for a host the plan
		// also targets.
		if change.Action == skillWriteAction {
			continue
		}
		if change.HostID == "" || seen[change.HostID] {
			return nil, domain.ErrPlanStale(plan.PlanID, "the plugin host target set is empty or contains duplicates")
		}
		seen[change.HostID] = true
		if change.Action != "register_command" || change.ConfigPath == "" {
			return nil, domain.ErrPlanStale(plan.PlanID, fmt.Sprintf("the plugin host change for %q is incomplete", change.HostID))
		}
		if _, err := host.GetAdapter(change.HostID); err != nil {
			return nil, domain.ErrPlanStale(plan.PlanID, fmt.Sprintf("the plugin target host %q is no longer supported", change.HostID))
		}
		currentPath := pluginConfigPathFor(ctx, change.HostID, scope, plan.Request.ProjectRoot)
		if currentPath == "" || filepath.Clean(currentPath) != filepath.Clean(change.ConfigPath) {
			return nil, domain.ErrPlanStale(plan.PlanID, fmt.Sprintf("the config target for host %q changed after the plan was prepared", change.HostID))
		}
		var value pluginInstallPlanValue
		if err := json.Unmarshal([]byte(change.ValueJSON), &value); err != nil {
			return nil, domain.ErrPlanStale(plan.PlanID, fmt.Sprintf("the plugin artifact for host %q is missing or invalid", change.HostID))
		}
		if expected == nil {
			copyValue := value
			expected = &copyValue
		} else if expected.Artifact != value.Artifact || expected.Force != value.Force ||
			expected.AllowPartial != value.AllowPartial ||
			strings.Join(expected.EnvNames, ",") != strings.Join(value.EnvNames, ",") {
			return nil, domain.ErrPlanStale(plan.PlanID, "the plugin host changes disagree about the approved artifact")
		}
		binding.Hosts = append(binding.Hosts, change.HostID)
	}
	if len(binding.Hosts) == 0 {
		return nil, domain.ErrInstallTargetUnavailable("the approved plan contains no plugin host targets; prepare a new plan after configuring a host")
	}
	if expected == nil {
		return nil, domain.ErrPlanStale(plan.PlanID, "the approved plan contains no plugin artifact")
	}
	// The sealed skills roots, re-checked against the machine: a relocated
	// agent home must fail closed rather than redirect a copy.
	hostSet := make(map[string]bool, len(binding.Hosts))
	for _, hostID := range binding.Hosts {
		hostSet[hostID] = true
	}
	for _, change := range plan.HostChanges {
		if change.Action != skillWriteAction {
			continue
		}
		if !hostSet[change.HostID] {
			return nil, domain.ErrPlanStale(plan.PlanID, fmt.Sprintf(
				"the plan seals a skills destination for %q, which is not one of its target hosts", change.HostID))
		}
		want, ok := pluginSkillRootFor(change.HostID, scope, plan.Request.ProjectRoot, userHome())
		if !ok || filepath.Clean(want) != filepath.Clean(change.ConfigPath) {
			return nil, domain.ErrPlanStale(plan.PlanID, fmt.Sprintf(
				"the skills directory for host %q changed after the plan was prepared", change.HostID))
		}
		binding.SkillDests = append(binding.SkillDests, skillDestination{AgentID: change.HostID, Root: want})
	}
	// The sealed artifact is re-validated here: a plan that names a mutable
	// or non-https source must not reach a fetch.
	if _, err := artifact.NewGitTreeFetcher(pluginFetchOptions).ResolveImmutable(ctx, expected.Artifact.ref()); err != nil {
		return nil, err
	}
	binding.Artifact = expected.Artifact
	binding.EnvNames = append([]string(nil), expected.EnvNames...)
	binding.Force = expected.Force
	binding.AllowPartial = expected.AllowPartial
	return binding, nil
}

// installPluginFromListing installs one catalog plugin into the given hosts.
//
// The hosts are the exact approved target set. The installer never
// re-resolves an empty set from machine state: the plan captured the targets
// before the approval, and an empty set fails closed.
//
// projectRoot is the project directory a project-scope install belongs to,
// and "" for a user-scope install.
func installPluginFromListing(
	ctx context.Context,
	db *state.DB,
	dataRoot string,
	listing *domain.Listing,
	version string,
	scope domain.InstallScope,
	projectRoot string,
	binding *pluginInstallBinding,
) (*pluginInstallOutcome, error) {
	if listing == nil || listing.Kind != domain.KindPlugin {
		return nil, fmt.Errorf("installPluginFromListing: the listing is not a plugin")
	}
	// The authorization gate: a plugin install writes into somebody else's
	// agent config, so it runs only under a consumed approval for a recorded
	// plan. Checked before any network fetch.
	if _, authorized := installAuthorizationFrom(ctx); !authorized {
		return nil, domain.ErrUnauthorized("plugin.install",
			"no recorded plan and approval authorize this install; run `litespm install` "+
				"or have a human approve the plan with `litespm approve <plan-id>`")
	}
	if binding == nil {
		return nil, domain.ErrInternal("the plugin install has no sealed plan binding", nil)
	}
	if len(binding.Hosts) == 0 {
		return nil, domain.ErrInstallTargetUnavailable(
			"no agent host has a verified LiteSPM bridge entry; run 'litespm host setup <host-id>' first, " +
				"or pass --host to name one explicitly")
	}

	// The fetch. The artifact is the one the approved plan sealed: the
	// repository, the pinned commit and the path inside it.
	treeDir, cleanup, err := fetchPluginTree(ctx, listing.ID, binding.Artifact)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	treeDigest, err := artifact.ComputeCanonicalTreeDigest(treeDir)
	if err != nil {
		return nil, fmt.Errorf("compute the plugin tree digest: %w", err)
	}

	// The manifest. It is untrusted input from a stranger's repository, and
	// the parser refuses what it does not understand.
	manifest, err := readPluginManifest(treeDir, listing.ID)
	if err != nil {
		return nil, err
	}
	// The portable components: servers (registered in a host config) and
	// skills (copied into an agent's skills tree). A plugin that bundles only
	// skills is installable — the old "no MCP server" refusal was this build's
	// projection limit, not a property of the plugin.
	skillComponents, err := resolvePluginSkills(treeDir, manifest)
	if err != nil {
		return nil, err
	}
	if len(manifest.MCPServers) == 0 && len(skillComponents) == 0 {
		return nil, domain.ErrArtifactUnavailable(listing.ID,
			"the plugin's manifest declares no MCP server and no skill, so there is no component this build can install; "+
				"its host-specific components (commands, hooks, subagents, LSP servers) have no adapter here")
	}

	// The consent gate. A plugin can deliver only the components this build
	// projects, and the rest is lost — so a partial projection is a choice the
	// person installing has to make knowingly. The skip set is named by the
	// plugin's own manifest inside the pinned tree, which is fetched only
	// after the approval, so the acknowledgement is sealed in the plan at
	// plan time and checked here, after the manifest is read and before the
	// policy gate, the host pre-flight or any write. The refusal carries
	// LPSM-INSTALL-PARTIAL with the classes it would skip.
	skipped := skippedPluginComponents(manifest.NotInstalled)
	if !binding.AllowPartial {
		if unacknowledged := unprojectedComponentCounts(skipped); len(unacknowledged) > 0 {
			return nil, domain.ErrInstallPartial(listing.ID, unacknowledged, "--allow-partial")
		}
	}

	entries, err := pluginServerEntries(listing, manifest, binding.EnvNames)
	if err != nil {
		return nil, err
	}

	// The host pre-flight: every target host is checked BEFORE any config is
	// touched, so a host that cannot take an entry fails the whole install
	// instead of half-installing it.
	if err := preflightPluginHosts(ctx, listing, scope, projectRoot, binding, entries); err != nil {
		return nil, err
	}

	// The policy gate.
	if err := authorizePluginInstallPolicy(ctx, db, dataRoot, listing, scope, binding.Hosts, entries); err != nil {
		return nil, err
	}

	if db == nil {
		return nil, fmt.Errorf("installing %s requires a state database", listing.ID)
	}

	outcome := &pluginInstallOutcome{
		ListingID:    listing.ID,
		Version:      version,
		Scope:        scope,
		Artifact:     binding.Artifact,
		TreeDigest:   treeDigest,
		NotInstalled: manifest.NotInstalled,
		Skipped:      skipped,
		AllowPartial: binding.AllowPartial,
		Warnings:     manifest.Warnings,
	}

	// The install is one unit (ARCH/33 §5): each host config write registers
	// its own compensation as it happens, and every state row lands in one
	// SQLite transaction. A failure at any point restores every config
	// byte-for-byte (LIFO) and leaves no state row behind.
	txn := lifecycle.BeginInstall(ctx)
	defer txn.RollbackUnlessCommitted()

	backupDir := filepath.Join(dataRoot, "backups")
	for _, hostID := range binding.Hosts {
		for _, entry := range entries {
			result, err := host.InstallServerEntry(ctx, hostID, host.ServerEntry{
				Name:      entry.Name,
				Command:   entry.Command,
				Args:      entry.Args,
				Endpoint:  entry.Endpoint,
				Transport: entry.Transport,
				EnvNames:  entry.EnvNames,
			}, host.EntryInstallOptions{
				BackupDir:   backupDir,
				Scope:       scope,
				ProjectRoot: projectRoot,
				Force:       binding.Force,
			})
			if err != nil {
				return nil, errors.Join(err, txn.Rollback())
			}
			outcome.Hosts = append(outcome.Hosts, result)
			written := result
			txn.Undo(func(ctx context.Context) error { return undoHostConfigWrite(written) })
		}
	}
	outcome.Servers = entries

	// The portable skills, copied into the sealed roots. Each copy goes
	// through the skills installer: same policy gate, same provenance ledger,
	// same compensation. A failure here rolls the host writes back too.
	skillResults, skillEntries, err := installPluginSkillComponents(ctx, txn, db, dataRoot, listing, binding, skillComponents, scope)
	if err != nil {
		return nil, errors.Join(err, txn.Rollback())
	}
	outcome.Skills = skillResults

	// The install id is content-bound: the same plugin installed from the
	// same pinned tree is the same install, and a different tree is a
	// different one.
	outcome.InstallID = fmt.Sprintf("inst_%s_%s_%s", scope, safeInstallIDPart(listing.ID), shortDigest(treeDigest))
	installPath := ""
	if len(outcome.Hosts) > 0 {
		installPath = outcome.Hosts[0].ConfigPath
	}
	// A skills-only plugin has no config write to point at; the install path
	// is the first directory it actually copied into.
	if installPath == "" && len(outcome.Skills) > 0 && len(outcome.Skills[0].Destinations) > 0 {
		installPath = outcome.Skills[0].Destinations[0]
	}
	now := time.Now().UTC()
	rec := &domain.InstallRecord{
		InstallID:   outcome.InstallID,
		ListingID:   listing.ID,
		Kind:        domain.KindPlugin,
		Version:     version,
		TreeDigest:  treeDigest,
		InstallPath: installPath,
		Scope:       scope,
		WorkspaceID: domain.WorkspaceIDForProjectRoot(projectRoot),
		ProjectRoot: projectRoot,
		Status:      domain.InstallActive,
		InstalledAt: now,
		UpdatedAt:   now,
	}
	// The install row, a component row per registered server, one
	// host_registrations row per written config, one deployment-ledger row
	// per owned write and one provider row per server — all in one
	// transaction. The ledger row carries the node-level pre-image and
	// post-image, so the reconcile pre-image arm is live and a removal can
	// distinguish "the user edited our node" from "the file changed
	// elsewhere" (ARCH/33 §4).
	if err := db.WithTx(ctx, func(tx *sql.Tx) error {
		if err := db.SaveInstallExec(ctx, tx, rec); err != nil {
			return fmt.Errorf("record the install: %w", err)
		}
		for _, entry := range entries {
			if err := db.SaveInstallComponentExec(ctx, tx, &domain.InstallComponentRecord{
				InstallID:     outcome.InstallID,
				Kind:          domain.ComponentMCPProvider,
				ComponentName: entry.Name,
				Path:          installPath,
			}); err != nil {
				return fmt.Errorf("record the installed component: %w", err)
			}
		}
		// The portable skill components: one component row and one ledgered
		// mutation per copied directory, so `litespm list`, removal and restore
		// see them exactly as they see a standalone skill install.
		byDest := make(map[string]skills.LedgerEntry, len(skillEntries))
		for _, e := range skillEntries {
			byDest[e.DestDir] = e
		}
		for _, sk := range outcome.Skills {
			firstPath := ""
			if len(sk.Destinations) > 0 {
				firstPath = sk.Destinations[0]
			}
			if err := db.SaveInstallComponentExec(ctx, tx, &domain.InstallComponentRecord{
				InstallID:     outcome.InstallID,
				Kind:          domain.ComponentSkill,
				ComponentName: sk.SkillName,
				Path:          firstPath,
			}); err != nil {
				return fmt.Errorf("record the plugin's installed skill component: %w", err)
			}
			for _, dest := range sk.Destinations {
				e, ok := byDest[dest]
				if !ok {
					return fmt.Errorf("the skill copy at %s has no ledger entry to record", dest)
				}
				m := lifecycle.OwnedWrite(outcome.InstallID, listing.ID,
					e.AgentID, string(scope), dest, "skill-dir",
					"skills."+sk.SkillName, "", e.ContentDigest, "", "")
				if err := deployment.SaveMutationExec(ctx, tx, m); err != nil {
					return fmt.Errorf("record the skill mutation for %s: %w", dest, err)
				}
			}
		}
		for _, result := range outcome.Hosts {
			if err := db.SaveHostRegistrationExec(ctx, tx, &domain.HostRegistrationRecord{
				HostID:           result.HostID,
				Scope:            scope,
				WorkspaceID:      domain.WorkspaceIDForProjectRoot(projectRoot),
				ConfigPath:       result.ConfigPath,
				ConfigFormat:     string(hostConfigFormatFor(result.HostID)),
				ManagedEntryKey:  result.Name,
				EntryFingerprint: result.Fingerprint,
				RegisteredAt:     now,
				Status:           "active",
			}); err != nil {
				return fmt.Errorf("record the host registration: %w", err)
			}
			locator, locErr := hostLocatorFor(result.HostID, result.Name, scope)
			if locErr != nil {
				return locErr
			}
			m := lifecycle.OwnedWrite(outcome.InstallID, listing.ID,
				result.HostID, string(scope), result.ConfigPath,
				hostStructureTypeFor(result.HostID), locator,
				result.PriorFingerprint, result.Fingerprint, result.PriorEntry, result.BackupPath)
			if err := deployment.SaveMutationExec(ctx, tx, m); err != nil {
				return fmt.Errorf("record the deployment mutation: %w", err)
			}
		}
		for _, entry := range entries {
			if err := db.SaveProviderExec(ctx, tx, providerRecordForInstall(outcome.InstallID, entry.Name, host.ServerEntry{
				Command:   entry.Command,
				Args:      entry.Args,
				Endpoint:  entry.Endpoint,
				Transport: entry.Transport,
			})); err != nil {
				return fmt.Errorf("record the provider: %w", err)
			}
		}
		return nil
	}); err != nil {
		return nil, errors.Join(err, txn.Rollback())
	}
	if err := txn.Commit(); err != nil {
		return nil, err
	}
	return outcome, nil
}

// pluginFetchOptions are the options the plugin fetch runs with.
//
// It is a variable so a test can point the fetch at a local fixture
// repository. The production value is the strict one: https only, no local
// repositories, a bounded clone and the standard extraction limits.
var pluginFetchOptions = artifact.DefaultGitFetcherOptions()

// fetchPluginTree fetches the pinned tree into a temporary directory and
// returns it with its cleanup function.
//
// The tree is NOT kept: a plugin install is a registration, exactly like an
// MCP install — the plugin's files are not materialized on this machine, and
// the canonical digest of the verified tree is what the install row records.
func fetchPluginTree(ctx context.Context, listingID string, art pluginArtifact) (string, func(), error) {
	fetcher := artifact.NewGitTreeFetcher(pluginFetchOptions)
	resolved, err := fetcher.ResolveImmutable(ctx, art.ref())
	if err != nil {
		return "", func() {}, err
	}
	dir, err := os.MkdirTemp("", "litespm-plugin-*")
	if err != nil {
		return "", func() {}, fmt.Errorf("prepare the plugin workspace: %w", err)
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	info, err := fetcher.FetchTree(ctx, resolved, dir)
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	if info == nil || info.TreeDigest == "" {
		cleanup()
		return "", func() {}, domain.ErrArtifactUnavailable(listingID,
			"the pinned tree was fetched but produced no verifiable content")
	}
	return dir, cleanup, nil
}

// readPluginManifest reads the plugin's manifest out of the fetched tree.
//
// The manifest is read with the interop bounds (8 MiB) and parsed with the
// interop rules. A tree with no manifest is refused: LiteSPM installs what
// the manifest declares, and a tree that declares nothing is not a plugin
// this build can install.
func readPluginManifest(treeDir string, listingID string) (*interop.PluginInstallManifest, error) {
	for _, name := range pluginManifestNames {
		path := filepath.Join(treeDir, name)
		data, err := interop.ReadFileBounded(path)
		if err != nil {
			// errors.Is, not os.IsNotExist: the reader wraps the syscall
			// error, and os.IsNotExist does not look through a wrapper — so
			// the first name that is absent would abort the search and the
			// second name (the Agent Plugins directory) would never be
			// tried.
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			return nil, fmt.Errorf("read the plugin manifest %s: %w", name, err)
		}
		manifest, err := interop.ParsePluginInstallManifest(data)
		if err != nil {
			return nil, fmt.Errorf("the plugin manifest %s is not usable: %w", name, err)
		}
		if manifest.MCPServersRef != "" {
			servers, disabled, rerr := resolvePluginServerReference(treeDir, manifest.MCPServersRef, listingID)
			if rerr != nil {
				return nil, rerr
			}
			manifest.MCPServers = servers
			manifest.NotInstalled["disabled servers"] += disabled
		}
		return manifest, nil
	}
	return nil, domain.ErrArtifactUnavailable(listingID,
		"the plugin's tree declares no manifest: LiteSPM looked for plugin.json and .claude-plugin/plugin.json")
}

// resolvePluginServerReference reads the file a manifest points its MCP
// servers at ("mcpServers": "./mcp.json") and returns the servers it
// declares.
//
// The reference is relative to the PLUGIN'S OWN TREE - the pinned,
// digest-verified tree the fetcher produced - so reading it reads the same
// bytes the commit id names. A reference that leaves the tree, or that
// names something that is not a file, is refused.
//
// The referenced file is the standard MCP configuration shape: either
// {"mcpServers": {...}} or the bare map of servers.
func resolvePluginServerReference(treeDir, ref, listingID string) ([]interop.PluginMCPServer, int, error) {
	clean := strings.TrimSpace(ref)
	if clean == "" {
		return nil, 0, domain.ErrArtifactUnavailable(listingID, "the plugin's manifest names an empty file for its MCP servers")
	}
	if filepath.IsAbs(clean) {
		return nil, 0, domain.ErrArtifactUnavailable(listingID,
			fmt.Sprintf("the plugin's manifest points its MCP servers at %q, which is an absolute path; a plugin may only reference files inside its own tree", ref))
	}
	root, err := filepath.Abs(treeDir)
	if err != nil {
		return nil, 0, fmt.Errorf("resolve the plugin's MCP server reference: %w", err)
	}
	resolved, err := filepath.Abs(filepath.Join(treeDir, filepath.FromSlash(clean)))
	if err != nil {
		return nil, 0, fmt.Errorf("resolve the plugin's MCP server reference: %w", err)
	}
	if resolved != root && !strings.HasPrefix(resolved, root+string(filepath.Separator)) {
		return nil, 0, domain.ErrArtifactUnavailable(listingID,
			fmt.Sprintf("the plugin's manifest points its MCP servers at %q, which is outside the plugin's own tree", ref))
	}
	data, err := interop.ReadFileBounded(resolved)
	if err != nil {
		return nil, 0, domain.ErrArtifactUnavailable(listingID,
			fmt.Sprintf("the plugin's manifest points its MCP servers at %q, which could not be read: %v", ref, err))
	}
	servers, disabled, err := interop.ParsePluginMCPServersDocument(data)
	if err != nil {
		return nil, 0, domain.ErrArtifactUnavailable(listingID,
			fmt.Sprintf("the file the plugin's manifest points its MCP servers at (%q) is not usable: %v", ref, err))
	}
	return servers, disabled, nil
}

// pluginServerEntries turns the manifest's servers into the entries a host
// config stores, refusing every server it cannot express.
func pluginServerEntries(listing *domain.Listing, manifest *interop.PluginInstallManifest, envNames []string) ([]pluginServerEntry, error) {
	entries := make([]pluginServerEntry, 0, len(manifest.MCPServers))
	for _, server := range manifest.MCPServers {
		if err := host.ValidateServerEntryName(server.Name); err != nil {
			return nil, domain.ErrArtifactUnavailable(listing.ID,
				fmt.Sprintf("the plugin declares an MCP server named %q, which no host can store: %v", server.Name, err))
		}
		entry := pluginServerEntry{
			Name:             server.Name,
			Command:          server.Command,
			Args:             server.Args,
			DeclaredEnvNames: server.EnvNames,
		}
		if server.URL != "" {
			// A remote entry is a network destination: the same static egress
			// guard the MCP path applies runs here, so an unsafe URL never
			// reaches an approval prompt or a config file.
			if err := checkRemoteEndpoint(server.URL); err != nil {
				return nil, err
			}
			entry.Endpoint = server.URL
			entry.Transport = host.RegistryRemoteTransport(server.Type)
		} else {
			// A launch line that names a placeholder would be written
			// unexpanded: only the plugin's own host expands it, and
			// LiteSPM does not materialize the plugin's files.
			if placeholder := placeholderIn(server.Command, server.Args); placeholder != "" {
				return nil, domain.ErrArtifactUnavailable(listing.ID,
					fmt.Sprintf("the plugin's MCP server %q launches through the placeholder %s, which only the plugin's own host expands: "+
						"LiteSPM does not materialize a plugin's files into the host, so the entry would be written broken", server.Name, placeholder))
			}
		}
		entry.EnvNames = append([]string(nil), envNames...)
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name < entries[j].Name })
	return entries, nil
}

// placeholderIn returns the first ${...} placeholder a launch line carries.
func placeholderIn(command string, args []string) string {
	if m := placeholderPattern.FindString(command); m != "" {
		return m
	}
	for _, a := range args {
		if m := placeholderPattern.FindString(a); m != "" {
			return m
		}
	}
	return ""
}

// preflightPluginHosts checks every target host before anything is written:
// the host must be able to take the entry, and the entry must not collide
// with one the user already has.
func preflightPluginHosts(
	ctx context.Context,
	listing *domain.Listing,
	scope domain.InstallScope,
	projectRoot string,
	binding *pluginInstallBinding,
	entries []pluginServerEntry,
) error {
	for _, hostID := range binding.Hosts {
		if reason := pluginHostCapabilityReason(ctx, hostID, scope); reason != "" {
			return domain.ErrInstallTargetUnavailable(fmt.Sprintf("host %q %s", hostID, reason))
		}
		for _, entry := range entries {
			if entry.Endpoint != "" {
				if reason := remoteHostCapabilityReason(hostID, entry.Transport); reason != "" {
					return domain.ErrInstallTargetUnavailable(fmt.Sprintf("host %q %s", hostID, reason))
				}
			}
			if len(entry.EnvNames) > 0 {
				if _, ok := host.EnvForwarding(hostID); !ok {
					adapter, _ := host.GetAdapter(hostID)
					name := hostID
					if adapter != nil {
						name = adapter.Descriptor().DisplayName
					}
					return domain.ErrInstallTargetUnavailable(fmt.Sprintf(
						"host %q (%s) cannot carry a forwarded environment variable — its MCP entry has no environment field, "+
							"or no documented spelling for one — so --env would be silently ignored there; "+
							"install without --env and add the variable to that host's config by hand", name, hostID))
				}
			}
			if binding.Force {
				continue
			}
			names, err := host.ListServerEntries(ctx, hostID, scope, projectRoot)
			if err != nil {
				continue // InstallServerEntry reports the real parse/IO failure
			}
			for _, existing := range names {
				if existing == entry.Name {
					return domain.ErrNameConflict(fmt.Sprintf(
						"host %q already registers a server named %q; re-run with --force to replace it", hostID, entry.Name))
				}
			}
		}
	}
	return nil
}

// authorizePluginInstallPolicy is the plugin install path's policy gate.
// TargetRef is the canonical listing id, and the entry names ride as
// TargetAliases, so a deny rule keyed on either refuses the install.
func authorizePluginInstallPolicy(
	ctx context.Context,
	db *state.DB,
	dataRoot string,
	listing *domain.Listing,
	scope domain.InstallScope,
	hosts []string,
	entries []pluginServerEntry,
) error {
	auth, authorized := installAuthorizationFrom(ctx)
	if !authorized {
		return domain.ErrUnauthorized("package.install", "no recorded plan and approval authorize this install")
	}
	cfg, _ := config.LoadCurrentConfig()
	engine, err := newPolicyEngine(db, dataRoot, policyDefaultsFrom(cfg))
	if err != nil {
		return fmt.Errorf("load policy: %w", err)
	}
	aliases := make([]string, 0, len(entries))
	for _, entry := range entries {
		aliases = append(aliases, entry.Name)
	}
	effects := []policy.EffectDeclaration{
		{Effect: policy.EffectPackageInstall, Provenance: domain.ProvenanceUserClassified, Target: listing.ID},
		{Effect: policy.EffectHostConfig, Provenance: domain.ProvenanceUserClassified},
	}
	for _, hostID := range hosts {
		decision := engine.Evaluate(ctx, policy.PolicyInput{
			Actor:         "user",
			HostID:        hostID,
			Operation:     "install",
			TargetRef:     listing.ID,
			TargetAliases: aliases,
			Effects:       effects,
			Scope:         scope,
		})
		switch decision.Decision {
		case policy.DecisionAllow:
		case policy.DecisionAsk:
			// The command or the bridge already consumed a human approval for
			// this exact plan before reaching the installer.
			if auth.Origin != approvalActorHumanCLI || auth.ApprovalID == "" || auth.PlanID == "" {
				return domain.ErrUnauthorized("package.install", "policy requires a human approval for this host config write")
			}
		default:
			return domain.ErrUnauthorized("package.install", decision.Detail)
		}
	}
	return nil
}

// printPluginInstall reports a completed plugin install: what was registered,
// where, from which pinned commit, and what the plugin declares that this
// build did not install.
func printPluginInstall(outcome *pluginInstallOutcome) {
	printPluginInstallTo(os.Stdout, outcome)
}

// printPluginInstallTo is the report on a writer, so the partial-install
// wording is testable rather than only visible on a terminal.
func printPluginInstallTo(w io.Writer, outcome *pluginInstallOutcome) {
	fmt.Fprintf(w, "✓ Registered plugin %s\n", outcome.ListingID)
	fmt.Fprintf(w, "  • Install ID:  %s\n", outcome.InstallID)
	fmt.Fprintf(w, "  • Version:     %s\n", outcome.Version)
	fmt.Fprintf(w, "  • Scope:       %s\n", outcome.Scope)
	fmt.Fprintf(w, "  • Commit:      %s\n", outcome.Artifact.Commit)
	if outcome.Artifact.Path != "" {
		fmt.Fprintf(w, "  • Path:        %s\n", outcome.Artifact.Path)
	}
	if outcome.TreeDigest != "" {
		fmt.Fprintf(w, "  • Tree digest: %s\n", outcome.TreeDigest)
	}
	for _, server := range outcome.Servers {
		if server.Endpoint != "" {
			fmt.Fprintf(w, "  • %-24s %s (%s)\n", server.Name, server.Endpoint, entryTransportLabel(host.ServerEntry{Endpoint: server.Endpoint, Transport: server.Transport}))
		} else {
			fmt.Fprintf(w, "  • %-24s %s %s\n", server.Name, server.Command, strings.Join(server.Args, " "))
		}
		if len(server.DeclaredEnvNames) > 0 {
			fmt.Fprintf(w, "      wants: %s (forward it with --env <NAME>; no value was written)\n",
				strings.Join(server.DeclaredEnvNames, ", "))
		}
	}
	for _, h := range outcome.Hosts {
		verb := "added"
		switch {
		case h.Replaced:
			verb = "replaced"
		case h.Created:
			verb = "created"
		}
		fmt.Fprintf(w, "  • %-12s %s entry %q in %s\n", h.HostID, verb, h.Name, h.ConfigPath)
	}
	for _, sk := range outcome.Skills {
		fmt.Fprintf(w, "  • skill      %s -> %s\n", sk.SkillName, strings.Join(sk.Destinations, ", "))
	}
	if len(outcome.Skipped) > 0 {
		parts := make([]string, 0, len(outcome.Skipped))
		for _, skipped := range outcome.Skipped {
			parts = append(parts, fmt.Sprintf("%d %s", skipped.Count, skipped.Kind))
		}
		acknowledged := ""
		if outcome.AllowPartial {
			acknowledged = " (acknowledged with --allow-partial)"
		}
		fmt.Fprintf(w, "  Note: this is a PARTIAL install%s — the plugin also declares %s.\n"+
			"        LiteSPM installs a plugin's MCP servers and skills; the host-specific extras have no adapter here.\n",
			acknowledged, strings.Join(parts, ", "))
		for _, skipped := range outcome.Skipped {
			fmt.Fprintf(w, "        %s: %s\n", skipped.Kind, skipped.Reason)
		}
	}
	for _, warning := range outcome.Warnings {
		fmt.Fprintf(w, "  Note: %s\n", warning)
	}
}

// sortedCountKeys returns the counted kinds in a stable order.
func sortedCountKeys(counts map[string]int) []string {
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
