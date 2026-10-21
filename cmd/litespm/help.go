package main

// help.go — `litespm help` (ARCH/38 §3).
//
// Three surfaces, one catalog:
//
//	litespm help            the default page (`--help`/`-h` print it too)
//	litespm help <command>  USAGE / WHAT IT DOES / WHAT IT DOES NOT / EXAMPLES /
//	                        EXIT CODES / SEE ALSO for one shipped command
//	litespm help concepts   the vocabulary glossary
//
// helpCatalog is keyed by exactly the strings the dispatch switch in main.go
// matches, aliases included. TestHelpCoversEveryDispatchCase parses that
// switch, so a command cannot ship without help and help cannot advertise a
// command that does not dispatch. printUsage() in main.go is an alias of
// renderDefaultHelp.

import (
	"fmt"
	"io"
	"os"
	"strings"
)

// commandHelp is one command's help page.
type commandHelp struct {
	// Canonical is the name the page is titled and listed under.
	Canonical string
	// Aliases share this page.
	Aliases  []string
	Group    string
	Purpose  string   // one line, printed under the title
	Synopsis []string // USAGE lines
	Does     []string // 2-4 entries
	DoesNot  []string // the limits, at least one
	Examples []string // 2-4 copy-pasteable invocations
	SeeAlso  []string // dispatched names only
	ExitNote string   // extra exit-code lines (" " = none)
}

// helpGroup orders the default page.
type helpGroup struct {
	Label   string
	Entries []string
}

// helpGroups is the section layout of `litespm help` (ARCH/38 §3.1).
var helpGroups = []helpGroup{
	{"DISCOVER", []string{"search", "agent", "catalog"}},
	{"VIEW", []string{"list", "inventory"}},
	{"MANAGE", []string{"install", "copy", "lock", "skills", "grant", "approve", "adopt"}},
	{"RECOVER", []string{"restore", "doctor", "audit", "uninstall"}},
	{"CONFIGURE", []string{"setup", "host", "daemon", "bridge", "auth"}},
	{"SYSTEM", []string{"self-update", "version", "capabilities", "invoke"}},
	{"HELP", []string{"help"}},
}

// helpCatalog maps every literal the dispatch switch matches to its page.
var helpCatalog = buildHelpCatalog()

func buildHelpCatalog() map[string]commandHelp {
	pages := []commandHelp{
		{
			Canonical: "search",
			Group:     "DISCOVER",
			Purpose:   "Search the local catalog index.",
			Synopsis: []string{
				"litespm search <query> [--json] [--limit <n>]",
			},
			Does: []string{
				"Searches the index that `litespm catalog sync` writes and prints up to 25 matches with id, kind, publisher and summary.",
				"`--json` prints a `litespm-search/v1` document instead of the table: id, kind, publisher, summary, version and installability per row, plus `indexCount`. The Pi `/marketplace` panel reads this form.",
				"`--limit <n>` sets the cap between 1 and 500.",
			},
			DoesNot: []string{
				"Does not search the network. An empty index is reported as empty, with the sync hint.",
				"Does not install anything, and does not rank by popularity; the catalog publishes none.",
				"Accepts no other flags. An unknown flag is a usage error (exit 2).",
			},
			Examples: []string{
				"litespm search github",
				"litespm search postgres",
				"litespm search github --json --limit 200",
				"litespm catalog sync   # fill the index first if it is empty",
			},
			SeeAlso: []string{"install", "catalog", "list"},
		},
		{
			Canonical: "agent",
			Group:     "DISCOVER",
			Purpose:   "List installable coding agents and resolve a launch spec.",
			Synopsis: []string{
				"litespm agent list [--registry <url>] [--file <path>] [--json]",
				"litespm agent resolve <id> [--registry <url>] [--file <path>] [--json]",
			},
			Does: []string{
				"`list` prints the agents in the registry, with the launch strategy for this OS and architecture.",
				"`resolve <id>` prints that agent's launch spec: executable, arguments, environment, and the archive and SHA-256 when the registry publishes them.",
			},
			DoesNot: []string{
				"Does not download, install or start the agent. It resolves the spec only.",
				"Does not install MCP servers or skills; use `litespm install` or `litespm skills add`.",
			},
			Examples: []string{
				"litespm agent list",
				"litespm agent list --json",
				"litespm agent resolve <agent-id>",
			},
			SeeAlso: []string{"install", "host", "capabilities"},
		},
		{
			Canonical: "catalog",
			Group:     "DISCOVER",
			Purpose:   "Sync the catalog index, or build the release tree.",
			Synopsis: []string{
				"litespm catalog sync",
				"litespm catalog build [--dataset <file>] [--out <dir>] [--release-id <id>]",
			},
			Does: []string{
				"`sync` fetches the release pointer, manifest and listings, verifies every digest, and replaces the local index only when the whole chain checks out.",
				"`build` compiles a dataset into the static /v1 tree the site serves. `--verify` checks a tree against its pointer.",
			},
			DoesNot: []string{
				"Does not install, update or remove anything. The index feeds `search`, `install` and `lock`.",
				"Does not write a partial index: a failed sync leaves the previous cache in place.",
			},
			Examples: []string{
				"litespm catalog sync",
				"litespm search postgres   # after a sync",
				"litespm catalog build --verify web/public",
			},
			SeeAlso: []string{"search", "install", "lock"},
		},
		{
			Canonical: "list",
			Group:     "VIEW",
			Purpose:   "Show what is deployed on this machine.",
			Synopsis: []string{
				"litespm list [agents|mcp|skills|plugins] [flags]",
				"  --agent <id>        only this agent",
				"  --managed           only what LiteSPM controls",
				"  --observed          only what it found but does not control",
				"  --drifted           only what changed since install",
				"  --project <dir>     only project-scope rows for that directory",
				"  --global            only user-scope rows",
				"  --kind <kind>       the same filter as the positional word",
				"  --json              the inventory document instead of tables",
			},
			Does: []string{
				"Reads install rows, the deployment ledger, the skills ledger and each adapter's detection, then prints tables grouped by agent and kind.",
				"Counts capabilities apart from deployments: one skill in three agents is one capability and three deployments. The headline reads `N unique capabilities · M deployments`.",
				"Labels each row managed, observed, adopted, drifted or broken. A value the data cannot answer prints `—`.",
			},
			DoesNot: []string{
				"Does not health-check anything. No process starts, so no row claims Ready or running.",
				"Does not write, repair or adopt. `list` is read-only, and adoption is `litespm adopt`.",
				"Does not invent counts, versions or compatibility.",
			},
			Examples: []string{
				"litespm list",
				"litespm list agents",
				"litespm list --drifted",
				"litespm list --json",
			},
			SeeAlso: []string{"inventory", "doctor", "host"},
		},
		{
			Canonical: "inventory",
			Group:     "VIEW",
			Purpose:   "Print one JSON record per deployment.",
			Synopsis: []string{
				"litespm inventory [mcp|skills|plugins] [--agent <id>]",
				"  [--managed|--observed|--drifted]  [--project <dir>|--global]  [--json]",
			},
			Does: []string{
				"Emits the same sources `litespm list` reads as a stable `litespm.inventory/v1` document: kind, id, name, agent, scope, state, placement, origin, install id, config path, locator, entry style, digests, timestamps and a short detail.",
				"`counts` separates `uniqueCapabilities` from `deployments`; `warnings` lists every source that could not be read.",
			},
			DoesNot: []string{
				"Does not health-check, and leaves unknown fields empty rather than guessing.",
				"Does not write anything. JSON is the only output; `--json` is accepted for symmetry.",
			},
			Examples: []string{
				"litespm inventory",
				"litespm inventory --json",
				"litespm inventory mcp --agent codex --json",
			},
			SeeAlso: []string{"list", "doctor"},
		},
		{
			Canonical: "install",
			Aliases:   []string{"add", "i"},
			Group:     "MANAGE",
			Purpose:   "Install a capability, or remove one install.",
			Synopsis: []string{
				"litespm install <listing-id> [--version <ver>] [--scope user|project]",
				"               [--workspace <dir>] [--agent <id>]... [--all-detected]",
				"               [--host <host-id>]... [--env <VAR>]... [--force] [--frozen]",
				"               [--dry-run] [--allow-partial]",
				"litespm install remove <installId>",
			},
			Does: []string{
				"Resolves the listing in the local index, records a plan and your approval, then installs. Skills are copied into the agent's skills tree; MCP servers are written into each target agent's config.",
				"`--agent` names the targets (repeatable, `*` for all): a host id for an MCP server or plugin, a skills target id for a skill. `--host` is the older spelling. The resolved directories are sealed into the plan before any write, so naming one agent never writes another. Without either flag, a skill uses the detected agents and an MCP server or plugin uses every host set up with `litespm host setup`; `--all-detected` states that default explicitly.",
				"`--workspace <dir>` installs for one project (default: the current directory) and implies `--scope project`.",
				"`install remove <installId>` strips only LiteSPM's entries and keeps a node you edited. `--frozen` installs exactly the locked version. `--dry-run` prints the plan and stops before recording, approving or writing.",
			},
			DoesNot: []string{
				"Never writes a secret value. `--env` records a variable name, and the config holds a reference.",
				"A plugin installs the portable components named in its pinned source: MCP servers into host configs, skills into skills trees. Extras it declares (commands, hooks, subagents, LSP servers) are not installed, and an install that would skip one is refused with LPSM-INSTALL-PARTIAL unless `--allow-partial` accepts the loss. The skip set is still reported and the result reads PARTIAL. Only a plugin can be partial, so the flag is refused for other kinds.",
				"Does not touch an agent without a bridge entry unless you name it. A name collision is refused rather than overwritten without `--force`.",
			},
			Examples: []string{
				"litespm install <listing-id>",
				"litespm install <listing-id> --agent codex --env GITHUB_TOKEN",
				"litespm install <listing-id> --frozen",
				"litespm install remove <installId>",
			},
			SeeAlso: []string{"restore", "lock", "skills", "list"},
		},
		{
			Canonical: "copy",
			Group:     "MANAGE",
			Purpose:   "Port one agent's MCP servers and skills into another.",
			Synopsis: []string{
				"litespm copy [items|kinds...] --from <host> --to <host> [flags]",
				"  --conflict ask|keep-target|use-source|compatible|skip   --apply   --yes",
				"  --exclude <id>   --dry-run   --project <dir>   --global",
			},
			Does: []string{
				"Reads the source agent through its adapter, normalizes each entry, and renders it through the target adapter. An array-shaped command becomes the target's own command-and-args layout with no per-pair translator.",
				"Prints the plan first and writes on approval: interactively in a terminal, or with `--apply --yes`. Writes go through the install path, so a copy is recorded, listed and undoable with `install remove` or `restore`.",
			},
			DoesNot: []string{
				"Does not copy secrets. An environment variable in the source is listed by name under `Needs` and dropped.",
				"Does not modify the source agent and does not keep the two in sync.",
				"Reports kinds it cannot represent, with a reason, instead of dropping or converting them.",
			},
			Examples: []string{
				"litespm copy --from <source-host> --to <target-host>",
				"litespm copy --from <source-host> --to <target-host> --apply --yes",
				"litespm copy mcp --from <source-host> --to <target-host> --conflict keep-target",
				"litespm copy --from <source-host> --to <target-host> --dry-run",
			},
			SeeAlso: []string{"list", "install", "restore"},
		},
		{
			Canonical: "lock",
			Group:     "MANAGE",
			Purpose:   "Resolve litespm.yml into a deterministic litespm.lock.",
			Synopsis: []string{
				"litespm lock [--check] [--sbom cyclonedx-json|spdx-json] [--verify]",
			},
			Does: []string{
				"Reads the manifest and the local index and writes a byte-identical lock for the same inputs. `litespm lock --check` in CI catches a manifest or catalog that moved without a re-lock.",
				"`--sbom` emits an SBOM from the lock. `--verify` re-checks the lock digest and manifest binding.",
			},
			DoesNot: []string{
				"Does not fetch anything. Sync the index first.",
				"Does not fill fields the catalog omits: signature and license stay `none` and `NOASSERTION` until a real check produces a value.",
			},
			Examples: []string{
				"litespm lock",
				"litespm lock --check",
				"litespm lock --verify",
				"litespm install <listing-id> --frozen",
			},
			SeeAlso: []string{"install", "catalog"},
		},
		{
			Canonical: "skills",
			Group:     "MANAGE",
			Purpose:   "Add, use, find, list, update and remove SKILL.md skills.",
			Synopsis: []string{
				"litespm skills add <source> [--skill <n>] [--agent <id>] [--global] [--yes] [--all] [--full-depth]",
				"litespm skills use <source>[@<skill>] [--skill <n>] [--json]",
				"litespm skills find [<query>] [--owner <org>]",
				"litespm skills list|ls [-g] [-a <id>] [--json]",
				"litespm skills update [<name>...] [--source <src>] [--ref <r>] [-g|-p] [-y] [--dry-run]",
				"litespm skills remove|rm [<name>|<source>...] [--all] [-a <id>] [-s <name>] [--scope project|global] [--dry-run]",
			},
			Does: []string{
				"`add` copies SKILL.md directories into each selected agent's skills tree and records every directory in the skills ledger. `--skill '*'` and `--agent '*'` select a whole axis; `--all` means `--skill '*' --agent '*' --yes`.",
				"Sources: `owner/repo`, an https or ssh git URL, a local directory, a GitHub or GitLab browse URL, a direct SKILL.md URL, or a zip/tar URL. Archives are detected from the bytes.",
				"`use` resolves a source like `add` but installs nothing; it prints the prompt for piping into an agent. `find` searches the catalog index by keyword or `--owner`.",
				"`list` prints the ledger; `update` re-copies from each row's recorded source; `remove` deletes only directories the ledger names and reports what it kept.",
			},
			DoesNot: []string{
				"Does not guess a path. A directory holding files you added afterwards is kept unless you pass `--force`.",
				"Does not audit skill safety; a skill reports as unverified rather than trusted.",
				"Refuses a cross-scope removal per entry instead of deleting (`remove --all` still honours `--scope`).",
				"`use --agent <id>` is not wired: LiteSPM configures agents, it does not launch them. Pipe the prompt instead.",
				"A skill marked `metadata.internal` is hidden and refused unless `INSTALL_INTERNAL_SKILLS=1` is set.",
			},
			Examples: []string{
				"litespm skills list",
				"litespm skills use <source>@<skill> | claude",
				"litespm skills find design --owner vercel-labs",
				"litespm skills remove --all --dry-run",
			},
			SeeAlso: []string{"install", "list", "agent"},
		},
		{
			Canonical: "grant",
			Group:     "MANAGE",
			Purpose:   "Issue, list and revoke the grants that authorize invocations.",
			Synopsis: []string{
				"litespm grant <capability-id>",
				"litespm grant list",
				"litespm grant revoke <capability-id>",
			},
			Does: []string{
				"`grant <capability-id>` shows what the tool may do and records your decision, bound to its current input schema. `list` shows recorded grants and `revoke` withdraws one.",
				"The policy engine checks these grants before an invocation runs.",
			},
			DoesNot: []string{
				"Refuses to run without a terminal: a person gives a grant, not the process asking for it.",
				"Does not grant an undiscovered capability (run `litespm capabilities refresh` first). A grant stops matching when the tool's input schema changes, and you re-approve it.",
			},
			Examples: []string{
				"litespm grant <capability-id>",
				"litespm grant list",
				"litespm grant revoke <capability-id>",
			},
			SeeAlso: []string{"approve", "invoke", "capabilities"},
		},
		{
			Canonical: "approve",
			Group:     "MANAGE",
			Purpose:   "Approve a stored install plan in a terminal.",
			Synopsis:  []string{"litespm approve <plan-id>"},
			Does: []string{
				"Shows the stored plan and, on yes, records a single-use approval and prints the token an agent passes to `request_install`.",
				"Records the approval and its origin, so the audit trail names the human who approved this plan.",
			},
			DoesNot: []string{
				"Refuses to run without a terminal: approvals cannot be scripted by the process that wants them.",
				"Does not execute the plan. Approval unblocks the install that asks for it.",
			},
			Examples: []string{
				"litespm approve <plan-id>",
				"litespm approve <plan-id>   # type yes; the token is single-use",
			},
			SeeAlso: []string{"grant", "install"},
		},
		{
			Canonical: "restore",
			Group:     "RECOVER",
			Purpose:   "Roll an install back to its pre-install bytes.",
			Synopsis: []string{
				"litespm restore <installId> [--dry-run]",
				"litespm restore --host <host-id> [--dry-run]",
			},
			Does: []string{
				"Replays the backup recorded for each write, so the config ends up exactly as it was before the install, comments and formatting included.",
				"`--host` rolls back every install that touched one agent. `--dry-run` prints the plan and writes nothing.",
			},
			DoesNot: []string{
				"Refuses when a node you edited after the install would be overwritten, and prints what differs.",
				"Never recreates a file you deleted, and never restores another install's writes.",
			},
			Examples: []string{
				"litespm restore <installId> --dry-run",
				"litespm restore <installId>",
				"litespm restore --host codex",
			},
			SeeAlso: []string{"install", "doctor", "list"},
		},
		{
			Canonical: "doctor",
			Group:     "RECOVER",
			Purpose:   "Run the diagnostic checks.",
			Synopsis: []string{
				"litespm doctor [--repair] [--yes]",
			},
			Does: []string{
				"Runs 10 checks over the storage directories, state database, operation journal, CAS store, staging, credential vault and the rest, and prints each as PASS, WARN or FAIL with a recommendation.",
				"`--repair` fixes what it can, asking first; `--yes` approves non-interactively.",
			},
			DoesNot: []string{
				"Does not start your MCP servers or probe their tools, so it reports configuration and storage health, not runtime health. `litespm capabilities refresh` probes servers.",
				"Changes nothing without `--repair`.",
			},
			Examples: []string{
				"litespm doctor",
				"litespm doctor --repair",
			},
			SeeAlso:  []string{"capabilities", "list", "restore"},
			ExitNote: "a failed check also returns its category code: 10 catalog · 20 resolve · 30 approval · 40 install · 50 provider · 60 host · 70 state; the most severe failed category wins (ARCH/20).",
		},
		{
			Canonical: "audit",
			Group:     "RECOVER",
			Purpose:   "Check the published catalogue and the local receipt chain.",
			Synopsis:  []string{"litespm audit [--ci] [--sarif <path>] [--dataset <path>] [--json]"},
			Does: []string{
				"Applies the rules in `internal/scan`: a discovery-only row carrying a launch line, a plugin with no fetchable source, an internal skill published publicly, a credential in a public URL.",
				"Verifies the local receipt chain, where one exists (ARCH/34 §6).",
				"`--sarif` writes a SARIF 2.1.0 report with stable rule ids for CI.",
			},
			DoesNot: []string{
				"Repairs nothing and decides nothing about a release; it reports.",
				"Audits the catalogue as published unless `--dataset` names an unpublished file.",
			},
			Examples: []string{
				"litespm audit",
				"litespm audit --ci --sarif audit.sarif",
			},
			SeeAlso:  []string{"doctor", "install", "list"},
			ExitNote: "1 when a finding has error severity, 2 for a usage error, 0 otherwise.",
		},
		{
			Canonical: "uninstall",
			Group:     "RECOVER",
			Purpose:   "Remove LiteSPM's bridge entry from every agent config it wrote.",
			Synopsis:  []string{"litespm uninstall [--dry-run]"},
			Does: []string{
				"Plans first with `--dry-run`, then strips the bridge entry from each agent config, keeping a pre-edit backup and leaving sibling entries alone.",
				"Reports what it left behind (servers from `litespm install`, skill directories from `litespm skills add`) with the command that removes each.",
			},
			DoesNot: []string{
				"Does not remove MCP server entries registered by `litespm install`; each belongs to its install record (`litespm install remove <installId>`).",
				"Does not delete skill directories, which may hold files you added (`litespm skills remove` is the opt-in).",
				"Does not delete the backups it wrote.",
			},
			Examples: []string{
				"litespm uninstall --dry-run",
				"litespm uninstall",
			},
			SeeAlso: []string{"host", "skills", "install", "restore"},
		},
		{
			Canonical: "auth",
			Group:     "CONFIGURE",
			Purpose:   "Store, report and revoke provider credentials.",
			Synopsis: []string{
				"litespm auth login <provider> --client-id <id> --auth-url <url> --token-url <url>",
				"              [--client-secret-env <VAR>] [--scope <scope>]... [--timeout <seconds>]",
				"litespm auth status [provider]",
				"litespm auth logout <profile-id>",
			},
			Does: []string{
				"`login` runs an OAuth 2.0 PKCE flow through a loopback listener on 127.0.0.1, exchanges the code once, and stores the credential in the platform vault. A remote MCP provider that names the profile sends the stored token.",
				"`status` reports the provider, profile id, status and vault reference. `logout` revokes the credential and drops the profile row, unless a provider still names it; that row is kept as revoked so the provider is refused rather than dialled anonymously.",
			},
			DoesNot: []string{
				"Never prints a token or writes one to a file. Rows hold a pointer to a vault entry.",
				"Does not print or keep the authorization code.",
				"Does not refresh credentials on its own or talk to a provider.",
			},
			Examples: []string{
				"litespm auth status",
				"litespm auth login github --client-id abc --auth-url https://idp/authorize --token-url https://idp/token",
				"litespm auth logout prof_github",
			},
			SeeAlso: []string{"install", "list", "doctor"},
		},
		{
			Canonical: "adopt",
			Group:     "MANAGE",
			Purpose:   "Take ownership of a server an agent already has.",
			Synopsis: []string{
				"litespm adopt <name> --host <host-id>",
			},
			Does: []string{
				"Records a server already registered in an agent's config as LiteSPM-managed, so `litespm list` shows it as managed instead of observed.",
				"Writes nothing to the agent's config; the entry stays byte-for-byte as it is and only the local ledger changes.",
				"Records the entry's current image, so undoing it or `install remove` restores the entry and keeps any edit you made since.",
			},
			DoesNot: []string{
				"Does not adopt a name the config does not register: that fails with LPSM-HOST-CONFIG-NOT-FOUND, since there would be nothing to restore.",
				"Does not probe, start or install the server, and downloads nothing.",
			},
			Examples: []string{
				"litespm adopt github --host claude-code",
				"litespm host detect   # find the host id first",
				"litespm install remove inst_user_adopt_claude-code_github",
			},
			SeeAlso: []string{"install", "list", "host"},
		},
		{
			Canonical: "setup",
			Group:     "CONFIGURE",
			Purpose:   "Connect LiteSPM to an agent.",
			Synopsis: []string{
				"litespm setup [--agent <host-id>]",
				"litespm setup --help",
			},
			Does: []string{
				"With no arguments it opens the wizard. On a machine with nothing connected it asks which agent to connect, finds that agent's config, and writes the bridge entry after a backup.",
				"On a configured machine it starts from what is connected and offers the other actions: update the catalog, find and install, remove, list, connect another agent.",
				"`--agent <host-id>` skips the wizard and connects that agent through the same plan-and-apply path as `litespm host setup <host-id>`.",
			},
			DoesNot: []string{
				"Without `--agent`, needs a terminal; with nobody to answer it refuses and points at `litespm host setup <host-id>`.",
				"Does not guess a config path. When detection fails, the wizard offers a path you type, a snippet to paste, or another look.",
				"`init` is no longer an alias of this command; `litespm init` scaffolds a SKILL.md.",
			},
			Examples: []string{
				"litespm setup",
				"litespm setup --agent codex",
				"litespm host setup codex   # the same write path",
			},
			SeeAlso: []string{"host", "daemon", "install"},
		},
		{
			Canonical: "host",
			Group:     "CONFIGURE",
			Purpose:   "Inspect and configure the agent host adapters.",
			Synopsis: []string{
				"litespm host list",
				"litespm host detect",
				"litespm host setup <host-id>",
				"litespm host remove <host-id> | --all",
			},
			Does: []string{
				"`list` prints every supported adapter and the config file it reads. `detect` scans this machine and reports which configs exist and whether the bridge is registered.",
				"`setup <host-id>` plans and applies the bridge entry with a backup. `remove` takes it out.",
			},
			DoesNot: []string{
				"`list` and `detect` are read-only. `remove` keeps the pre-edit backup and leaves the rest of the file alone.",
				"Detection looks only at each adapter's documented config file, not at project or undocumented locations.",
			},
			Examples: []string{
				"litespm host list",
				"litespm host detect",
				"litespm host setup <host-id>",
			},
			SeeAlso: []string{"bridge", "install", "list"},
		},
		{
			Canonical: "daemon",
			Group:     "CONFIGURE",
			Purpose:   "Run the background supervisor and IPC engine.",
			Synopsis:  []string{"litespm daemon serve"},
			Does: []string{
				"Recovers any interrupted install from the operation journal, then serves the IPC endpoint the bridge and agents call.",
				"Runs in the foreground, so your terminal or process supervisor owns its lifetime.",
			},
			DoesNot: []string{
				"Does not install itself as an OS service.",
				"Does not install packages or edit agent configs.",
			},
			Examples: []string{
				"litespm daemon serve",
				"litespm daemon serve >> litespm.log 2>&1   # keep the log",
			},
			SeeAlso: []string{"bridge", "setup", "invoke"},
		},
		{
			Canonical: "bridge",
			Group:     "CONFIGURE",
			Purpose:   "Serve the stdio MCP bridge an agent host launches.",
			Synopsis:  []string{"litespm bridge stdio [--host <host-id>] [--workspace <dir>]"},
			Does: []string{
				"Speaks MCP over stdio for the agent and forwards requests to the running daemon: catalog search, plans, `list_installed`, skill loading and invocation.",
				"`--workspace <dir>` reports the project the agent is working in (default: the working directory). It widens what `list_installed`, `load_skill` and `read_skill_resource` can see; each project row is labelled with its scope.",
				"Starts without the daemon and says so, so an agent gets an empty bridge instead of a hang.",
			},
			DoesNot: []string{
				"Does not persist anything, and does not health-check capabilities; an unobserved status renders unknown.",
				"Does not start the daemon.",
				"`--workspace` selects which recorded installs are listed. It is not an authorization boundary, and the bridge does not read that path.",
			},
			Examples: []string{
				"litespm bridge stdio --host codex",
				"litespm bridge stdio   # --host defaults to generic",
				"litespm bridge stdio --host codex --workspace /path/to/project",
			},
			SeeAlso: []string{"daemon", "host", "capabilities"},
		},
		{
			Canonical: "self-update",
			Aliases:   []string{"update"},
			Group:     "SYSTEM",
			Purpose:   "Replace this binary with a newer release.",
			Synopsis:  []string{"litespm self-update [--force] [--help]"},
			Does: []string{
				"Fetches the release manifest, downloads the release asset (never the release page) when a newer version exists, verifies its SHA-256, and replaces the executable atomically.",
				"`--force` reinstalls or downgrades even when the manifest version is not newer.",
			},
			DoesNot: []string{
				"Does not update installed packages or skills; that is `litespm skills update`.",
				"Refuses an unverified download when signature verification is required and unavailable.",
			},
			Examples: []string{
				"litespm self-update",
				"litespm self-update --force",
			},
			SeeAlso: []string{"version", "skills"},
		},
		{
			Canonical: "version",
			Aliases:   []string{"--version", "-v"},
			Group:     "SYSTEM",
			Purpose:   "Print the version and build details.",
			Synopsis:  []string{"litespm version", "litespm --version", "litespm -v"},
			Does: []string{
				"Prints the version with the protocol version, OS, architecture and Go toolchain.",
				"These are the numbers to quote in a bug report.",
			},
			DoesNot: []string{
				"Does not contact the network, so it cannot tell you whether an update exists (`litespm self-update` does).",
				"Reads and changes nothing on disk.",
			},
			Examples: []string{
				"litespm version",
				"litespm --version",
			},
			SeeAlso: []string{"self-update", "doctor"},
		},
		{
			Canonical: "capabilities",
			Aliases:   []string{"caps"},
			Group:     "SYSTEM",
			Purpose:   "List, search and describe tools discovered from installed servers.",
			Synopsis: []string{
				"litespm capabilities list [--limit <n>]",
				"litespm capabilities search <query> [--limit <n>]",
				"litespm capabilities describe --capability <id>",
				"litespm capabilities refresh [--host <id>]...",
			},
			Does: []string{
				"`refresh` starts each installed MCP server LiteSPM registered and records the tools it exposes. `list` and `search` read those rows; `describe` prints one tool's input schema and its command.",
				"`refresh --host` limits probing to named agents (repeatable); the default is every agent with a verified bridge entry.",
			},
			DoesNot: []string{
				"Probes nothing until you run `refresh`: an empty list means nothing was discovered, not that you have no tools.",
				"Does not invoke tools (`litespm invoke` does). A server that will not start is reported on its own.",
			},
			Examples: []string{
				"litespm capabilities refresh",
				"litespm capabilities list",
				"litespm capabilities search github",
			},
			SeeAlso: []string{"invoke", "grant", "doctor"},
		},
		{
			Canonical: "invoke",
			Group:     "SYSTEM",
			Purpose:   "Call one discovered capability from the terminal.",
			Synopsis:  []string{"litespm invoke <capability-id> [--arguments '<json>']"},
			Does: []string{
				"Calls the tool through the same path the bridge uses, after checking that its input schema still matches the grant.",
				"Prints the tool's output and exits non-zero when the tool reports an error.",
			},
			DoesNot: []string{
				"Does not bypass policy: when no engine can enforce your rules, the invocation is refused.",
				"Does not accept malformed arguments; `--arguments` must be valid JSON.",
			},
			Examples: []string{
				"litespm invoke <capability-id>",
				"litespm invoke <capability-id> --arguments '{\"q\":\"lite\"}'",
			},
			SeeAlso: []string{"capabilities", "grant"},
		},
		{
			Canonical: "help",
			Aliases:   []string{"--help", "-h"},
			Group:     "HELP",
			Purpose:   "Explain the commands, one command, or the vocabulary.",
			Synopsis: []string{
				"litespm help",
				"litespm help <command>",
				"litespm help concepts",
			},
			Does: []string{
				"`litespm help` prints the quick start and the shipped commands, grouped by purpose.",
				"`litespm help <command>` prints usage, what it does, what it does not, examples, exit codes and related commands. `litespm help concepts` defines the vocabulary.",
			},
			DoesNot: []string{
				"Documents only commands that dispatch. An unknown target prints the shipped list and exits 2.",
				"There is no `litespm help error <code>` yet; error families are in ARCH/20.",
			},
			Examples: []string{
				"litespm help",
				"litespm help install",
				"litespm help concepts",
			},
			SeeAlso: []string{"list", "inventory"},
		},
	}

	cat := make(map[string]commandHelp, len(pages)+8)
	for _, page := range pages {
		cat[page.Canonical] = page
		for _, alias := range page.Aliases {
			cat[alias] = page
		}
	}
	return cat
}

// runHelp is the dispatch entry point for `litespm help`/`--help`/`-h`.
func runHelp(args []string) {
	if code := helpTo(os.Stdout, os.Stderr, args); code != 0 {
		os.Exit(code)
	}
}

// helpTo renders against explicit writers so tests can capture both streams:
// 0 for a page that exists, 2 for an unknown target.
func helpTo(out, errOut io.Writer, args []string) int {
	if len(args) > 1 {
		fmt.Fprintf(errOut, "help: at most one target, got %d\n\n", len(args))
		renderShippedList(errOut)
		return 2
	}
	if len(args) == 0 {
		renderDefaultHelp(out)
		return 0
	}
	target := args[0]
	if strings.EqualFold(target, "concepts") {
		renderConcepts(out)
		return 0
	}
	if page, ok := helpCatalog[target]; ok {
		renderHelp(out, page)
		return 0
	}
	fmt.Fprintf(errOut, "Unknown help target %q. Shipped commands:\n\n", target)
	renderShippedList(errOut)
	fmt.Fprintln(errOut)
	fmt.Fprintln(errOut, "Run `litespm help concepts` for the vocabulary.")
	return 2
}

// printUsage lives in main.go and is an alias of renderDefaultHelp.

// renderDefaultHelp writes the default page: a quick start, the shipped
// commands grouped by purpose, examples, and pointers to the other two help
// forms.
func renderDefaultHelp(w io.Writer) {
	fmt.Fprint(w, `LiteSPM — the package manager for AI agents.
Discover, install, port and manage MCP servers, skills and plugins across
the agent hosts LiteSPM supports (`+"`litespm host list`"+` prints them).

QUICK START
  litespm host detect          which agent hosts this machine has
  litespm search github        find capabilities in the local index
  litespm list                 see what is deployed here
  litespm doctor               check the setup and how to fix it

`)
	for _, g := range helpGroups {
		fmt.Fprintf(w, "%-12s%s\n", g.Label, strings.Join(g.Entries, " · "))
	}
	fmt.Fprint(w, `
EXAMPLES
  litespm search github
  litespm list --json
  litespm skills list
  litespm help concepts

Run `+"`litespm help <command>`"+` for detail on one command, `+"`litespm help concepts`"+`
for the vocabulary. Exit codes: 0 success · 1 refused or failed · 2 usage.

Documentation: https://github.com/sarv-projects/litespm
`)
}

// renderShippedList prints the grouped command names; an unknown help target
// falls back to it.
func renderShippedList(w io.Writer) {
	for _, g := range helpGroups {
		fmt.Fprintf(w, "  %-12s%s\n", g.Label, strings.Join(g.Entries, " · "))
	}
}

// renderHelp writes one command's page (ARCH/38 §3.1 template).
func renderHelp(w io.Writer, page commandHelp) {
	fmt.Fprintf(w, "LITESPM %s\n\n", strings.ToUpper(page.Canonical))
	if page.Purpose != "" {
		fmt.Fprintln(w, page.Purpose)
		fmt.Fprintln(w)
	}
	if len(page.Synopsis) > 0 {
		fmt.Fprintln(w, "USAGE")
		for _, line := range page.Synopsis {
			// A synopsis line that fits keeps its own alignment (flag
			// columns carry meaning); longer lines are folded.
			if pre := "  " + line; len(pre) <= 78 {
				fmt.Fprintln(w, pre)
				continue
			}
			writeWrapped(w, "  ", line)
		}
		fmt.Fprintln(w)
	}
	writeSection(w, "WHAT IT DOES", page.Does)
	writeSection(w, "WHAT IT DOES NOT", page.DoesNot)
	if len(page.Examples) > 0 {
		fmt.Fprintln(w, "EXAMPLES")
		for i, ex := range page.Examples {
			writeWrapped(w, fmt.Sprintf("  %d. ", i+1), ex)
		}
		fmt.Fprintln(w)
	}
	fmt.Fprintln(w, "EXIT CODES")
	fmt.Fprintln(w, "  0  success, including nothing to do")
	fmt.Fprintln(w, "  1  refused or failed")
	fmt.Fprintln(w, "  2  usage error (unknown flag, missing argument, unknown command)")
	if page.ExitNote != "" {
		writeWrapped(w, "  ", page.ExitNote)
	}
	fmt.Fprintln(w)
	if len(page.SeeAlso) > 0 {
		fmt.Fprintln(w, "SEE ALSO")
		writeWrapped(w, "  ", strings.Join(page.SeeAlso, " · "))
	}
}

func writeSection(w io.Writer, title string, items []string) {
	if len(items) == 0 {
		return
	}
	fmt.Fprintln(w, title)
	for _, item := range items {
		writeWrapped(w, "  - ", item)
	}
	fmt.Fprintln(w)
}

// writeWrapped prints text prefixed by indent, folding at 78 columns with a
// hanging indent.
func writeWrapped(w io.Writer, indent, text string) {
	const width = 78
	words := strings.Fields(text)
	if len(words) == 0 {
		fmt.Fprintln(w, strings.TrimRight(indent, " "))
		return
	}
	line := indent
	for i, word := range words {
		if i > 0 && len(line)+1+len(word) > width {
			fmt.Fprintln(w, strings.TrimRight(line, " "))
			line = strings.Repeat(" ", len(indent))
		}
		if i > 0 {
			line += " "
		}
		line += word
	}
	fmt.Fprintln(w, line)
}

// renderConcepts writes the §3.3 glossary.
func renderConcepts(w io.Writer) {
	fmt.Fprint(w, `LiteSPM concepts

The words `+"`litespm list`"+`, `+"`litespm inventory`"+` and every help page use.

PACKAGE
  A thing you install from the catalog: one row with an id such as
  mcp:<source>:<name>, a version and a publisher. A package may hold more
  than one piece (a plugin can bundle a skill, an MCP server and a hook).

CAPABILITY
  Something your agent can do. A tool such as "search the web" or "read a
  file" is a capability. `+"`litespm capabilities list`"+` shows the ones
  discovered from your installed MCP servers.

AGENT
  The AI coding tool you work with. LiteSPM configures agents; it is not one.
  Each supported agent reads its own config file, and the adapters know where
  each keeps it (`+"`litespm host list`"+`).

MCP SERVER
  A small service an agent talks to through the Model Context Protocol, which
  is how an AI works with GitHub, databases or a browser. In an agent's config
  it appears as one named entry with a command and arguments.

SKILL
  A portable set of instructions (a SKILL.md directory) that teaches an agent
  a kind of task. LiteSPM copies it into the agent's skills tree and records
  the directory in the skills ledger.

PLUGIN
  A bundle of the pieces above (skills, MCP servers, rules, hooks) shipped as
  one package. LiteSPM installs the skills and MCP servers it can place. A
  plugin that declares extras it cannot install needs `+"`--allow-partial`"+`,
  and the result then reports PARTIAL.

BRIDGE
  The one entry LiteSPM registers in an agent's config. The agent starts
  `+"`litespm bridge stdio`"+` when it needs a capability, and the bridge forwards
  to the daemon. One entry serves every managed package, so installing does
  not grow your config.

SCOPE
  user (also called global) applies to everything on this machine; project
  applies to one checkout. `+"`--global`"+` and `+"`--project <dir>`"+` select between
  them.

MANAGED / OBSERVED / ADOPTED
  managed: LiteSPM controls its lifecycle, and `+"`install remove`"+` or
  `+"`restore`"+` can take it out.
  observed: LiteSPM found it in an agent's config and reports it read-only.
  adopted: you took over an existing entry with `+"`litespm adopt`"+`, so it is
  managed with its origin recorded as adopted, never catalog-verified.

CAPABILITY vs DEPLOYMENT
  A capability is the thing itself; a deployment is one copy of it in one
  place. The same skill in three agents is one capability and three
  deployments, which is why `+"`litespm list`"+` counts both:
  18 unique capabilities · 27 deployments.

REFERENCE vs VALUE
  A reference is the name of an environment variable (GITHUB_TOKEN); a value
  is what it holds. LiteSPM moves references only: `+"`install --env`"+` writes
  ${GITHUB_TOKEN} into a config, and a literal secret found in a source is
  reported by name and dropped.

DRIFT AND EMPTY CELLS
  drifted: the recorded write and what is on disk no longer agree. LiteSPM
  reports it and changes nothing.
  broken: something recorded is missing.
  A cell the data cannot answer prints `+"`—`"+` or "not knowable".
`)
}
