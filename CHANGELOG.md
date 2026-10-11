# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-11

### Added

- **Release `rel-2026-10-11-01` (sequence 146) — 69,376 capabilities, and installs that actually work.**
  The headline is not the row count, it is that **25,401 MCP servers are `metadata_verified`** where the
  previous release had **zero** (every MCP and skill row there was `discovery_only`, so
  `litespm install <mcp>` could only ever refuse). Six of the seven catalog sources are complete;
  `feed:mcpmarket-com` is incomplete by budget and **accepted deliberately** — its crawl is bounded at
  `MCPMARKET_MAX_PAGE_FETCHES` pages, and closing it would mean an uncapped crawl of a third-party
  directory for rows the official MCP Registry feed already covers. The state is published honestly
  (`incompleteSources: ["feed:mcpmarket-com"]`) rather than papered over. The pointer, the site's
  `release.json` and `web/data/catalog.json` were verified to agree with each other before commit, which
  also closes the long-standing dataset-versus-pointer incoherence.

- **Pi gets a real `/marketplace` panel, not a wall of text.** `litespm host setup pi-agent` now writes
  a companion extension that registers `/marketplace [query]`: it opens a focused overlay
  (`ctx.ui.custom`, the documented way an extension mounts a panel) with a search line, a keyboard-driven
  list with `[installed]` badges, an inspector pane showing the publisher, summary, id and installability,
  and Enter to install into Pi. Typing filters the fetched set locally rather than shelling out per
  keystroke; a bare `/marketplace` lists what is installed here and says how to search the catalog. The
  panel is deliberately self-contained — only `node:` builtins plus a type-only import — so extension
  loading cannot fail on module resolution, and it renders without ANSI so it cannot clash with the host
  theme. It locates its own binary from the bridge entry in `mcp.json`, falling back to `PATH`. The
  emitted TypeScript is type-checked with `tsc --strict` against the real pi 0.80.10 types, and the panel
  itself is exercised headlessly (render, filter, backspace, arrow, Enter) — the previous extension
  registered successfully and then threw `command.handler is not a function` the first time anyone used it.

- **`litespm search` can answer a machine.** `--json` prints a `litespm-search/v1` document (id, kind,
  publisher, summary, version and installability per row, plus `indexCount` so "no match" is
  distinguishable from "empty index"), and `--limit <n>` raises the cap to 500 for a caller that filters
  client-side. This is what the Pi panel reads; before it existed the only way to search programmatically
  was to parse a padded table.

### Changed

- **The Pi `/marketplace` panel is now built for people who have never opened a config file.** The
  previous version read like a log line. It now has a framed layout with aligned columns (the cursor
  renders as spaces on every other row, so nothing shifts as the selection moves), colour taken from the
  `Theme` instance the host passes into the panel factory — semantic slots, so it follows the user's
  light or dark theme without the extension importing anything — and states in the vocabulary
  `claude mcp list` already teaches people: `✔ added`, `add`, `not yet`. It explains itself in the detail
  band, in the words a non-developer needs: *"It connects your agent to a service or database"*,
  *"Press Enter to add it to Pi (~/.pi/agent/mcp.json). Nothing else on your computer changes"*,
  *"Not installable yet: LiteSPM has not verified a build for this one, so it will not run it for you"*,
  and on success *"Added. Quit and restart Pi to use it."* Installed rows offer removal. Long sentences
  wrap rather than clip. The source moved out of a Go string literal into
  `internal/host/pi_extension.ts`, embedded with `go:embed`, so it is type-checked and read like any
  other TypeScript in the repository.

- **An installed MCP server can be given a credential without the credential ever touching LiteSPM.**
  `litespm install <mcp-id> --env <VARIABLE_NAME>` (repeatable) records that a server needs a variable. It takes **names only, never values**: the host config
  receives a reference the host expands at spawn time, so the secret stays in the environment your agent was started in and never enters a config file, a backup, the
  install ledger or a shell history. This could not be one constant, so the behaviour is verified per-host data in `internal/envref`, each row carrying the vendor URL
  it was read from: `${NAME}` for Claude Code, Copilot CLI, Gemini CLI, Kiro, Pi and Grok Build; `${env:NAME}` for Cursor and Cline; `{env:NAME}` under the differently
  named `environment` key for OpenCode; and **Codex forwards by name** through a separate `env_vars` list, because its `env` table is documented as copied into the
  subprocess as-is — a reference written there would reach the child as the literal text of that reference and be used as the credential. A host with no documented
  behaviour is refused before any config is touched rather than written on an assumption.

  Three documented behaviours fail *silently*, so the install reports them per host instead of leaving them in a design note: Gemini substitutes an **empty string**
  for an unset variable, leaving the server starting and answering unauthenticated; Kiro **refuses to expand** a name absent from its `mcp.approvedEnvVars` allowlist,
  leaving the reference as written; and Claude Code and Cline pass the reference's literal text through. `litespm capabilities refresh` is the second reader of the same
  reference — it expands it itself when it spawns the server, because the host's expansion does not apply to a process LiteSPM starts — and deliberately refuses to
  resolve the two forms some hosts also document, `{file:/path}` and `!command`, since honouring them during a probe would turn discovering an installed server into
  a local file-read and command-execution primitive. Verified end to end 2026-10-06: install → refresh → invoke returned the resolved value on both a reference host
  and the name-list host, and an unset variable reported `<unset>` rather than being blanked over or passed through literally.

- **Installed MCP servers are discoverable and callable.** Installing a server wrote a config entry and stopped there: nothing knew what the server
  could do, so `capabilities.search`, `capabilities.describe` and `provider.invoke` answered `-32601` with the reason "no capability rows are persisted".
  `internal/discover` closes that chain — it spawns a configured host's registered server, probes its tools through `mcpclient`, writes `providers` and
  `capabilities` rows (the first production callers of those writers), and invokes one capability after re-checking its schema fingerprint, refusing a
  call whose arguments would no longer match what was validated. A drift refusal is a hard stop, not a warning. `provider.invoke` stays synchronous,
  as ARCH/06 §4 specifies; `invocation.get` / `invocation.cancel` remain `-32601` because the cancellable registry is ARCH/34 (`DESIGNED`), and their
  reason now says so. New CLI: `litespm capabilities list|search|describe|refresh` and `litespm invoke <capability-id>`. Verified end to end against a
  locally published release and a real MCP server: sync → install → probe (2 tools) → list → describe → invoke, plus refusal after the server changed
  its schema.

- **`providers` rows are written correctly.** `SaveProvider` put the argument list in `runtime_adapter` and the auth profile id in `launch_spec_json`,
  and wrote the transport straight into a CHECK-constrained enum column that does not contain `stdio`. It had no production caller, and its test had
  been written to fit the confusion — passing a hand-built launch spec through `ArgsJSON` and a pre-translated mode — which is what kept the mapping
  wrong. It now builds a real launch specification, translates the transport to the column's enum, and resolves `component_id` as the foreign key it
  is; `GetProvider` reads a row back into the same record it was written from.

- **`ConnectStdio` completes the MCP handshake.** It sent `initialize` and stopped, never sending `notifications/initialized`, which every real server
  requires before it will answer anything else: a session would connect, initialize, and then hang on the first `tools/list`. The legacy and HTTP
  clients both sent it. `internal/discover`'s test server refuses to answer until it arrives, so the hang is now a test failure rather than a
  production surprise.

- **MCP server installs complete.** `litespm install <mcp-id>` and the Bridge `request_install` →
  `install.execute` path now register a catalog MCP server with agent hosts. Two gaps had to close first. The release already published a launch line
  in `versions.json` (`components[].runtime` — `command`, `args`, `type`), but `catalog sync` downloaded only the pointer, manifest and listings, so
  nothing could read it; `versions.json` is now fetched, digest-verified against the manifest, cached verbatim before the pointer commit marker, and
  indexed (`internal/catalog/versions_test.go` covers the fetch, tamper rejection and the fail-closed case where a version publishes no runnable
  component). Then `host.InstallServerEntry` (`internal/host/entry_install.go`) writes the entry: surgical splice, atomic backup, refusal on collision
  (`LPSM-NAME-CONFLICT`), refusal when no host is set up (`LPSM-INSTALL-TARGET-UNAVAILABLE`), per-host entry shape taken from the target table or
  `bespokeEntrySpecs`, and one `installs` plus one `host_registrations` row per modified config. `--host` and `--force` were added to
  `litespm install`. Verified against the live catalog on a JSON host (comment, theme and a foreign server all preserved) and a TOML host.
  Two limits are reported to the user rather than papered over: the dataset's `transport` field is an emoji heuristic from the upstream registry's
  README (1,665 of 4,079 rows claim `sse` while carrying a local command, and no URL is published anywhere), so it is recorded but never obeyed; and
  the dataset publishes no `env`, so a server needing credentials is registered but will need them added by hand.

- **Host documentation audit (2026-10-06, `ARCH/30` §8.1).** Every bridge target and all six hand-written adapters were re-checked against live vendor
  documentation. The table header had claimed each row was checked against the agent's own documentation; for a number of rows that was not true, and the
  defects found share one failure mode — the bridge is written, `host verify` reports ready, and the host never reads it. Corrected: an invented OpenCode
  `mcp.servers` layout (the host has only a flat `mcp` map), Cline's settings file (it moved out of the VS Code `globalStorage` into
  `~/.cline/data/settings/`), Pi's undocumented fallback paths and its wrong container, Amp's container (a literal top-level `"amp.mcpServers"` key, not a
  nested object — its schema sets `additionalProperties:false`), Crush's Windows path and its schema-required `type`, `CODEX_HOME`/`GROK_HOME`/
  `AIDER_DESK_HOME_DIR`/`QWEN_HOME`/`PI_CODING_AGENT_DIR`/`OPENCODE_CONFIG_DIR` overrides, CodeBuddy's and Kilo's documented candidates, fx's project key,
  Kode's `KODE_CONFIG_DIR` filename, AstrBot's root, and three rows missing a documented scope. `RenderManualSetup` also emitted the entry object where the
  server name belongs, so the wizard's paste-this-snippet fallback printed invalid JSON for all 44 data rows. New: `FlatKey` and `ShapeStdioTyped` target
  metadata, and `internal/host/host_docs_audit_test.go`, which asserts the host-visible result (valid JSON, the server named, the entry under the key the
  vendor documents) for every registered adapter rather than only that our writer round-trips. Vendor self-contradictions on `type` (Cursor, Firebender, the
  two Snowflake pages) are recorded rather than guessed at.

- **`litespm catalog build`.** Converts the committed dataset into the static
  `/v1` release tree (`manifest.json`, `listings.json`, `versions.json`) and
  owns the served pointer `web/public/v1/current.json`: release ids derive per
  day with a `-NN` suffix, sequences advance from the released pointer, reused
  release ids and non-advancing sequences fail closed (release paths are
  CDN-immutable), and `-materialize` reproduces a released tree byte for byte —
  `scripts/deploy-pages.sh` uses it for every packaging run.
- **Catalog client integrity hardening.** `catalog sync` now verifies that the
  pointer's `manifestDigest` matches the served manifest bytes before trusting
  the release, validates `schemaVersion` and release-id path safety, caches
  served bytes verbatim (pointer last, as a commit marker), and re-verifies
  pointer/manifest/listings digests on every offline cache load.
- **Published catalog release tree.** The live origin serves release
  `rel-2026-10-05-01` (sequence 143, 5,814 capabilities) byte-identically to the
  committed release, with the pointer digest matching the served manifest;
  `litespm catalog sync` and `search` were verified against it from a clean data
  root with no registry override.
- **HTTPS artifact fetcher (ARCH/17 §4).** `internal/artifact/fetcher.go` adds
  the retrieval half the artifact layer was missing: HTTPS-only, no credentials
  in URLs, SSRF refusal of loopback/link-local/private/unspecified/multicast
  addresses at dial time (dialing the checked IP, so DNS rebinding cannot bypass
  it), redirect cap with no https→http downgrade, request timeout, bounded spool
  with streaming SHA-256, and fail-closed verification that refuses an unpinned
  artifact. Data-only; extraction is unchanged. Covered by
  `internal/artifact/fetcher_test.go` and `test/archive_install_e2e_test.go`
  (download → verify → extract → CAS install). It has no production caller yet:
  the catalog carries no artifact locators.
- **Marketplace skill installs.** `litespm install <skill-id>` and the Bridge
  `request_install` → `install.execute` path install real skills: the listing's
  source is fetched (GitHub `/tree/<ref>/<path>` browse URLs resolve to a clone
  target plus pinned ref and subpath), the skill is written into the detected
  agents' skill directories through the existing ledger and policy gate, and an
  install record is persisted. The previous in-memory synthetic package is
  removed; MCP/plugin listings fail closed with `LPSM-ARTIFACT-UNAVAILABLE`
  because the catalog carries no artifact locator for them.

- **Host config splice contract (`ARCH/16` §3.7.1).** Every JSON/JSONC host —
  the four bespoke adapters as well as the 44 data-driven targets — now edits a
  user config by byte offset (`renderBridgeEntryJSON`) instead of parsing into a
  map and re-serializing. Comments, key order, indentation, unknown keys and the
  trailing newline survive byte for byte; `cline`, `claude-code`, `opencode` and
  `pi-agent` previously reformatted, re-sorted and reflowed the whole document.
  Reads go through a comment-tolerant parse, so a JSONC config (Cline's lives in
  VS Code's globalStorage settings) can be set up and inspected instead of being
  refused; genuinely invalid JSON is still refused.
- **`host remove` layout tolerance.** Removal now tries every documented
  container path and rewrites only the one that actually holds the bridge entry.
  OpenCode's real v1 layout is `mcp.<name>`, while removal looked for a
  top-level `mcpServers`, so `host remove` could leave a registration behind; a
  JSONC config also defeated the old layout detection. Removal additionally
  repairs the residue of cutting a member (a comma stranded before a closing
  brace, a comment line that documented the removed member) and refuses rather
  than writing a document it has just proved is broken.

- **A manifest can declare `[binding] mode = "native"`.** `manifest.Parse` hard-coded
  `BindingMode() == "managed"` and ignored the optional `[binding]` table the format documents (the
  P6 one-bridge default), so the table was accepted and discarded. It is now parsed and validated
  against `internal/binding`'s modes: an absent table stays `managed`, only an explicit `native` opts
  into per-package registration, an unknown mode is refused at parse time, and a non-default mode
  round-trips through `MarshalCanonical`.

- **Project-scope installs are first-class, and an agent can see the ones in its own project.**
  `litespm install <id> --workspace <dir>` names the project (it implies `--scope project`; the working
  directory is the default) and `resolver.prepare_plan` requires a `projectRoot` for `scope=project`. Both
  seal `request.workspaceId` (`ws_` + 16 hex of `sha256(absolute project root)`, so the id is a pure
  function of the path) and `request.projectRoot` into the plan, which the **plan hash covers** — the
  approval a human gives therefore binds the workspace, and `install.execute` re-derives it from the sealed
  plan rather than from a fresh argument. The install row and every host registration carry the workspace,
  and the approval prompt names it (`project : <root> (<ws>)`). The Bridge forwards its own project root
  (`bridge stdio --workspace <dir>`, else the process working directory), so `list_installed`,
  `load_skill` and `read_skill_resource` include that workspace's project-scope installs, each row labelled
  with its `scope`; without a root they stay user-scope-only, and a user-scope install of the same name wins
  a collision. The root is a *selection* key, not an authorization boundary — the IPC peer is already
  authenticated as the same uid, and these tools only choose which database rows to read, never read the
  filesystem at the supplied path.

### Changed

- **Deployment renamed to `litespm`.** The live Cloudflare Worker moved from the
  pre-rebrand `litepsm` hostname to
  `https://litespm.sarveshbh-2022.workers.dev`; `DefaultRegistryURL`, the site
  default, npm docs and `wrangler.toml` were updated together, and the stale
  Pages-only `pages_build_output_dir` field was dropped (this is a Worker). The
  legacy `litepsm` Worker still serves the same frozen release and should be
  retired.
- **Rebranded to LiteSPM.** The product, CLI (`cmd/litespm`), Go module
  (`github.com/sarv-projects/litespm`), npm package (`litespm`), and host bridge
  key were renamed from the former identifiers. Upgrades adopt the previous data
  root, configuration, environment variables (with a legacy `LITEPSM_*`
  fallback), and host bridge entries non-destructively, so existing installs
  migrate without data loss or duplicate bridge registration.
- **Connectors removed.** The unreachable `internal/connector` package and its
  seeds were deleted (delete rather than ship dead wiring); documentation and
  module counts were corrected.

- Host config removal restores TOML configs and multi-line JSON objects byte for
  byte. A single-line JSON object can retain one line break, because inserting an
  entry into it necessarily added a line; content and validity are preserved.

- **The HTTPS artifact fetcher no longer inherits an environment proxy.**
  `http.ProxyFromEnvironment` made the SSRF-checked dialer validate the *proxy's* address instead of
  the artifact host, so a proxy could carry the request to any destination and bypass the whole
  address policy. The fetcher's transport now leaves `Proxy` nil, matching the catalog client's
  `egress.ConfigureTransport` for the same reason.
- **SBOM output is reproducible and its SPDX relationships are explicit.** The CycloneDX timestamp
  honours `SOURCE_DATE_EPOCH` (the repo-wide reproducible-build convention) and the SPDX
  `documentNamespace` derives from the lock digest, so the same lock emits byte-identical SBOMs;
  SPDX packages are now linked to the document with explicit `DESCRIBES` relationships, which the
  spec requires.
- **One destination predicate for the egress guard.** `IsAllowedAddr` and the resolve/dial path each
  decided allowed destinations, so the two could disagree; the allow decision now lives in a single
  `allowsDestination` both share, with the configured-host and loopback qualifications applied once.
- **The archive/package install path now loads the user's deny rules.** The daemon built its install
  policy engine with `nil` rules, so `policy-deny.json` was silently ignored on `install.execute`; it now builds the engine through
  `newPolicyEngine` — the same user-deny tier the skills/MCP paths use — and `runDaemonServe` halts
  with a fatal error if a present deny-rules file cannot be read rather than serving an empty
  blacklist.
- **The owned-entry locator is derived from the host registry, at the install's scope.** `hostLocatorFor`
  hard-coded a container-per-host map that could disagree with where `InstallServerEntry` actually wrote the
  entry; the locator now reads `host.EntryLayoutForScope` from the adapter registry at the scope the install
  used — the same key path the writer used, including the hosts whose project container differs from their
  user one — and refuses a host with no registered layout instead of guessing a plausible node.
- **A deny rule matches a capability by its listing id *or* the name it installs under.** The MCP path
  passed the catalog listing id as the rule's `targetRef` while the skills path passed the installed name,
  so one vocabulary silently stopped enforcing on the other path. `PolicyInput` now carries the canonical
  `TargetRef` (the listing id on the MCP path, the skill name on the skills path, which has no listing id)
  plus `TargetAliases` (the host server-entry name), and `DenyRule.matches` accepts either — a rule keyed on
  the id the user types on the command line and a rule keyed on the config entry name both refuse the
  install.
- **Usage errors exit 2, not 1.** The dispatch and subcommand guards for `catalog`, `daemon`,
  `host`, `skills`, `agent`, `restore` and the skills subcommands printed usage and exited `1`,
  colliding with internal errors; they now exit `2` as `ARCH/20` §2 documents.
- **`LPSM-ARTIFACT-UNAVAILABLE` maps to `-32602` (invalid params) over IPC.** The Bridge's
  `request_install` surfaced a listing with no artifact locator as an internal error; it is a
  caller-visible request problem, so `installRPCError` now classifies it with the other
  invalid-params codes.

### Fixed

- **OpenCode follows the v2-documented `mcp.servers.<name>` layout again, and a project-scope
  install lands in the project's `opencode.json`.** The v2 docs (`https://opencode.ai/v2/docs/mcp-servers`,
  "Config") place servers at `mcp.servers.<name>` and state that flat names directly under `mcp` are
  not the v2 layout; a live v2.0.26 run still loads flat entries, so the adapter now **writes** the
  nested container (bridge setup, server entries, the manual snippet, `EntryLayoutForScope`) while
  **reading** both shapes everywhere — setup verify, pre-existing-tool detection, listing, collision
  detection and fingerprinting span `mcp.servers`, `mcp` and `mcpServers` through `readKeyPaths`, the
  same candidate list removal has always tried — so legacy flat installs keep listing with their env
  and endpoint intact instead of degrading into a command-only shadow. Setup migrates LiteSPM's own
  flat bridge member into the documented container (foreign flat members untouched), a forced
  re-install MOVES an existing entry to `mcp.servers` rather than leaving two members of one name in
  one file, and `pruneEmptyLegacyServersObject` — which deleted an empty `mcp.servers` as "invented
  residue" — is gone: that container is the documented home of servers. Project scope
  (`ProjectConfigPath`, per `https://opencode.ai/v2/docs/config` "Locations": `opencode.json(c)` /
  `.opencode/` walked upward from the working directory) makes `SupportsProjectScope(opencode)` true
  and binds install/list/remove/fingerprint to `<root>/opencode.json`. JSONC tolerance is unchanged.
  Pinned by the `opencode_project_scope_test.go` suite (user-scope nested landing, legacy-flat
  removal, project round-trip, both-shape reads, flat-bridge migration).

- **The Pi Agent adapter now works against Pi's real API: the companion extension runs, and a
  project-scope install lands in `<project>/.pi/mcp.json`.** The generated `litespm.ts` registered
  `async execute` — `RegisteredCommand` takes `handler: (args: string, ctx: ExtensionCommandContext)
  => Promise<void>` — and called `pi.mcp.callTool`, a member no `ExtensionAPI` has, so the `/litespm`
  command could never run. The rewrite enumerates the bridge's connected `mcp__litespm__*` tools with
  `pi.getAllTools()` and shows them through `ctx.ui.notify`, because a command handler has no
  tool-invocation API (`ctx.executeTool` exists only on `ExtensionToolContext` — the context a tool's
  own `execute()` receives — and is absent from the installed 0.80.10 types entirely); every symbol
  is cited against the bundled 0.80.10 `types.d.ts` and upstream main, and the generated source
  type-checks offline with `tsc --strict`. Project scope is implemented through `ProjectConfigPath`
  per Pi's mcp.md ("project servers from `.pi/mcp.json`"; a project entry replaces a user entry of
  the same name), which the adapter previously refused with `install it with --scope user`. Pinned by
  `TestPiExtensionGeneratedUsesRealExtensionAPI` and `TestPiProjectScopeInstallWritesDotPiMcpJSON`.

- **A project-scope MCP install now writes into the project it names, and refuses the hosts that
  document no project file.** The workspace the plan seals was previously used only to stamp state:
  the host-config write still resolved its target from the process's working directory (a
  data-driven target) or ignored the scope argument entirely (the six bespoke adapters), so
  `litespm install --workspace <dir>` run from elsewhere recorded one project and wrote another's
  config, a project install over IPC (`install.execute`) wrote relative to the daemon's launch
  directory, and a project-scoped row for Claude Code/Codex/OpenCode/etc. described a file it had
  never touched. The project root is now part of `host.EntryInstallOptions` and of every
  scope-aware reader (`ListServerEntries`, `ListServerEntriesWithValues`, `ReadServerEntryState`,
  `EntryFingerprintNow`, `RemoveServerEntry`), so install, reconcile, remove, restore and copy all
  open the same file. `host.SupportsProjectScope` refuses — at plan time, before an approval is
  spent, and again at write time — for a host with no documented project-scope path, with the fix
  in the message (`install it with --scope user, or choose a host that documents a project file`)
  rather than writing the user config under a project label. Pinned by
  `TestProjectScopeWriteBindsToTheNamedProject` and
  `TestProjectScopeRefusesHostsWithoutAProjectPath`.

- **Removing or restoring a project-scope install no longer leaves its host registration behind.**
  Host registrations are deleted by the exact tuple (host, scope, workspace, key), and both teardown
  paths passed a hard-coded empty workspace — which silently matched nothing once project rows
  carried a real id, so the registration row (with its stale config path and fingerprint) outlived
  the install it described. Removal now lists the rows for that entry and deletes each with the
  workspace it was written under. The three-way reconcile also reads a project node's fingerprint
  from the project's own config instead of the caller's working directory: it used to observe "the
  node is gone" and classify the install as missing, which skipped the strip that removes both the
  entry and its row. Pinned by `TestRemoveProjectInstallDropsItsHostRegistration`.

- **Receipt chain verification checks the real link order, not just any issued hash.**
  `receipts.Store.VerifyChain` re-hashed every receipt but accepted a `PrevReceiptHash` that named
  *any* hash the store had once issued, so a receipt deleted from the store, reordered, or relinked
  to a non-predecessor still passed. The store now records the per-provider issue order and verifies
  the true chain: each receipt's `PrevReceiptHash` must equal its immediate predecessor's
  `ReceiptHash`, and the first receipt must carry no link.

- **The schema validator's release-tree check skips on a clean checkout instead of failing it.**
  `web/public/v1/releases/` is generated by `litespm catalog build` and gitignored (the committed artifact
  is the pointer `web/public/v1/current.json`), so a fresh clone had no tree to validate and the new contract
  test failed before reaching anything it could check. It now skips with that reason; the freshly compiled
  release in the same file still covers the contract, verified by running the package in a tree without the
  generated directory.

- **`runtime.env` in a version record must map to strings.** Schema validation accepted an object of any
  values there, but `domain.RuntimeDescriptor.Env` is `map[string]string`, so a release declaring
  `"env": {"TOKEN": 42}` passed the contract and then failed to unmarshal in the catalog client. The
  property now constrains its values, closing the gap between what the schema accepts and what the client
  can read.

- **The skills.sh feed can no longer be called incomplete by our own crawl policy.** The producer treated
  every `<loc>` its parser could not accept as evidence of an incomplete source. skills.sh's own
  sub-sitemaps list `/api/git/…` paths, which `robots.txt` disallows: the producer correctly refuses to
  fetch them, then counted that refusal as incompleteness — so `CATALOG_INGESTION_STATUS` could never read
  `complete` for a feed that had in fact delivered all 19,792 of its rows (reproduced: 2 sub-sitemaps,
  20,000 locs, exactly 36 refusals, all robots-disallowed). A loc refused **by our policy** (only an
  allowed host on a robots-disallowed or traversal path) is now counted in `refusedLocs` and printed on
  the source's summary line, and does not affect `completeness`; a loc refused for any other reason — a
  foreign host, a cleartext URL, a path the feed does not define — still marks the source incomplete,
  because that is an upstream defect and silence would be a lie.

- **The release `contentDigest` is re-verified from the bytes, not only the per-file digests.**
  `manifest.contentDigest` pins `listings.json || versions.json` as one unit, but neither the deploy
  verifier nor the catalog client recomputed it, so a rewrite that fixed every per-file size and
  digest in the manifest would still have been accepted. `catalogbuild.ContentDigestOf` is now the
  single implementation, and `VerifyMaterializedTree` plus `catalog.sync`/`LoadFromCache` recompute
  it and refuse a mismatch.

- **Four JSON Schemas now describe the artifacts the code actually emits, and a dependency-free validator keeps them honest.** `schemas/catalog-release.schema.json`
  demanded `rel_` + 26 base32 characters for `releaseId` — a grammar no release id has ever had (real ids are `rel-2026-10-07-01`); `source.schema.json` forbade
  `sourceId` inside the `snapshot` object the store always writes and typed `upstreamRevision` non-null although its absence is recorded as `null`;
  `listing.schema.json` required `source.sourceType`/`manifestFormat`, which `domain.SourceReference` does not carry, and described publisher, verification,
  compatibility and provenance objects that never matched the emitted shape; and `version.schema.json`/`install-plan.schema.json` had drifted from
  `domain.VersionRecord` (dependency `constraint`, requirement `version`, permission `type`, effect objects, signature `algorithm`, and `version` `minLength: 1` versus
  the empty version version-less listings publish) and from `domain.InstallPlan` (`effects` are strings not objects, `preconditions` is an object, `approval` carries
  channel/decision, `requestedAccess`/`providerLaunches` differ, and the phantom top-level `collisions`/`warnings` are gone). The new `internal/schemacheck` package
  implements only the draft 2020-12 keywords these six files use and **rejects any keyword it does not implement** rather than ignoring it; its tests validate the
  committed release tree, a fresh `CompileRelease` output, a real snapshot record, an `LPSMError` envelope and a marshalled `InstallPlan`, and pin the schemas that
  duplicate a domain identifier grammar to `domain.Regex*`. The same tests reproduce the pre-fix failure: each old subschema rejects the real artifact it was supposed
  to describe.

- **Reading an installed MCP server back from a TOML host config returned no arguments at all.** The parser tried to unquote a whole array (`["-y", "demo"]`) as if it were a
  single string literal, which can never succeed, so `args` silently came back empty and every server installed for Codex or Grok Build would have been probed with
  no arguments — a failure that looks like a broken server rather than a broken reader. Arrays are now split quote-aware (an argument may legitimately contain a
  comma), the same reader now also recovers `env` tables and `env_vars` name lists, and the behaviour is pinned by `TestTOMLArgsAndEnvReadBack`.

- **CI now judges the deploy bundle with the deploy's own checks.** `scripts/deploy-pages.sh` was referenced by no workflow, so its packaging — and
  the leak audit and digest verification inside it — only ever ran on the machine doing the deploying. Both judgements moved into
  `scripts/audit-pages-dist.sh`, which the deploy script and CI now call, so a source map in the export or a release tree that no longer matches its
  pointer fails CI instead of shipping. `build-web` gained the Go toolchain the packaging step needs.
- **CI proves the committed dataset still reproduces the published release.** Nothing in CI touched `web/data/catalog.json`, so an edit that made it
  un-compilable (duplicate or unsafe listing ids), or that drifted from the released tree, surfaced only at deploy time. CI now runs
  `catalog build --materialize` against the committed pointer — a hermetic reproducibility check, no network — and verifies the result.
- **A stale local build can no longer shadow the pinned release.** The postinstall preferred `dist/<binary>` over the published release and stamped the
  install `"local"`, so a checkout with an old build reinstalled it forever and never fetched the version the package pins. `dist/` is now ignored
  unless `LITESPM_ALLOW_LOCAL_DIST=1` is set, and that path says plainly that its checksum is unverified.

- **Installer executes only verified bytes.** `npm/scripts/install-binary.js` verified checksums best-effort: a missing manifest entry, an unreadable
  manifest or a fetch failure each printed a warning and installed the binary anyway, and a digest mismatch aborted while still exiting 0, so npm
  reported success with no binary present. Verification is now fail-closed — anything unproven is deleted rather than installed — and a refusal is
  reported as an integrity failure rather than a network notice. Redirects are also HTTPS-only now: an `http://` Location previously downgraded both
  the binary and its checksum manifest to cleartext, which combined with the fail-open path to mean arbitrary code execution.
- **The npm wrapper no longer runs whatever `litespm` is on `PATH`.** `resolveBinary()` fell back to `which litespm` with no version or checksum check,
  so `npm i -g litespm` could silently execute an older release, a local build, or anything earlier on `PATH`. A package that pins a version now runs
  that version or exits non-zero.
- **Deploy leak audit missed source maps.** `scripts/deploy-pages.sh` forbade `*.go`, `*.env*`, keys and databases but not `*.map`, so a `.js.map` —
  which embeds the original module source — would have shipped to the CDN. Its `*.ts` rule also carried a chain of `-not` exceptions that could never
  apply (a `.ts` file never matches `*.js`), reading like an allowlist while forbidding every `.ts` file; both are fixed. `npm ci || npm install` is
  now a strict `npm ci`, so a release cannot ship a dependency tree no lockfile describes.
- **Packaging now verifies the release tree against its own pointer.** `/v1/releases/*` is CDN-cached immutably, so a tree that disagrees with
  `current.json` is unrecoverable once uploaded, and nothing checked it: `scripts/deploy-pages.sh` only asserted the files existed. `litespm catalog
  build --verify <dir>` re-runs the client digest chain (`pointer.manifestDigest` → `manifest.files[].digest`/`size`) over the written bundle and the
  deploy script calls it. Verified against a materialized tree and against a one-byte `listings.json` edit and a truncated `versions.json`, both of
  which now fail the deploy.

- **JSON canonicalization numbers.** `CanonicalizeJSON` formatted numbers with
  Go's `'g'` float style, turning every file size ≥ 10⁶ into scientific
  notation (`4.900491e06`) — valid JSON, but not the integer a release
  manifest declares, so the builder's own manifest could not be decoded back
  into its `int64` size fields. It now follows RFC 8785 (ECMAScript
  `Number::toString`) exactly, with range-boundary tests.
- **Catalog dataset ids.** `scripts/build_full_catalog.py` normalizes listing
  ids through fail-closed `canonical_id()` (query junk, apostrophes, and
  characters outside the domain grammar map to `-`); the committed dataset
  shipped six ids the domain grammar rejects and now has none.

Verified remediation phases 0–3:

- **CI gates.** Workflow-scoped URL checks, guards, and the 0/1/2 exit contract
  for the repository CI checker.
- **Fail-closed paths.** Vault open, the `skills.read_resource` handler, and the
  standalone bridge handler now fail closed; `doctor` returns category-based
  non-zero exit codes instead of reporting success on failure; the IPC
  accept/stop race was fixed and verified under `-race`.
- **Install pipeline.** A real resolver→plan path with a persisted plan hash;
  install validates the plan, expiry, and digest inside a transaction with
  `rolling_back` and per-operation staging; startup recovery of incomplete
  operations halts the daemon (exit **1**, `Fatal: startup recovery failed`) when
  an operation cannot be recovered.
- **Skills.** Installer and update support atomic swap, rollback, and dry-run;
  the ledger records provenance (digest, ref, inventory); source pin parsing,
  the policy hook, and scope-checked removal were fixed.
- **Self-update.** Real HTTPS release-manifest fetch with fail-closed SHA-256
  verification, a downgrade guard, atomic `O_EXCL` replacement in a private
  directory (with a Windows backup/swap path), self-boot verification, and
  rollback.
- **Release contract.** The release asset file-name contract was corrected so
  the self-update path and the published artifacts agree.

- **Multi-level container paths in the surgical merge.** The container-chain
  builder hardcoded the `litespm` member name at the leaf and dropped
  intermediate key names, so a two-level path such as OpenCode's `mcp.servers`
  produced a spurious extra `mcp` level (`mcp.mcp.litespm`). Every data-driven
  target uses a one-level path, so the defect was latent until the bespoke
  adapters were routed through the shared helper; it is now pinned by
  `TestMergeJSONEntrySurgicalTwoLevelKeyPath`.

### Removed

- **Deleted `config.RedactConfig`.** It claimed to return a copy of the config with sensitive values
  scrubbed, but nothing called it and its field list did not cover the config's actual secrets — it
  offered false reassurance. The real redaction paths (`doctor`, logging) do the work.
- **Deleted the dead `state.newAuditEventID`.** It minted collision-resistant audit-event ids, but no
  caller used it; the live audit write path was already the one in use.
- **Deleted `secrets.NewFileEncryptedSecretStore`.** It derived the vault key from the vault path and
  the local username — obfuscation presented as encryption, and it was test-only. The platform store
  is now the sole path: `OpenSecretStore` → `NewFileEncryptedSecretStoreWithKey` with an
  OS-keyring-protected master key.

### Known limitations

- The install path cannot execute end-to-end until the daemon supplies an
  artifact source; `invoke_capability` and related tools return JSON-RPC
  `-32601`. See `STATUS.md` and `REMEDIATION-PLAN.md` (finding M3).
- The catalog release tree and pointer are published, and `catalog sync`
  succeeds against the live origin (2026-10-05); artifact signing is implemented
  (keyless cosign bundles plus a CycloneDX SBOM in `release.yml`, verified by
  `self-update` and on catalog sync), but no `v*` tag has shipped a signed
  release yet.
- Invocation-receipt chain verification detects a reordered, interior-deleted or
  relinked receipt; a truncated tail leaves a self-consistent prefix and is not
  detectable from inside the store, which would need an expected head anchored
  outside the receipt file.
