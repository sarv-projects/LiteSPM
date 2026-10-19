# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.5.0] - 2026-10-19

The release where the invocation registry stopped being a design, the site stopped
overstating what it can install, and the release process stopped being able to
publish to GitHub while quietly skipping npm.

### Added

- **An invocation registry, an invocation engine, and tamper-evident receipts**
  (`ARCH/34` §2–§3, §5–§6). `litespm install` and the agent-driven install path
  already invoked a tool; what was missing was the record of the call. Now:
  - `internal/receipts` is one durable registry — one JSON line per invocation,
    one hash chain per provider instance, verifiable with `VerifyChain`.
  - `internal/invocation` is the engine around it: a clamped **deadline**, a
    **per-provider concurrency limit**, **queue backpressure** that fails fast
    with `LPSM-PROVIDER-BUSY` instead of growing, **cooperative cancellation**,
    **redaction** of provider stdout/stderr and result payloads, and **bounded
    output** that truncates with an explicit marker and the original digest.
  - `invocation.get` and `invocation.cancel` (and the Bridge's
    `get_invocation` / `cancel_invocation`) answer from it. An id that was never
    issued is a typed `LPSM-INVOCATION-NOT-FOUND` — not a `-32601` stub, which
    is what they returned before.
  - `provider.invoke` keeps its synchronous contract and its `{"output",
    "isError"}` response, and now also returns the `invocationId` and the
    receipt. `async: true` returns `{"invocationId", "state"}` and the call
    outlives the request.
  - **Still `DESIGNED`, and now written down as such:** provider health states
    and the circuit breaker (`ARCH/34` §4), provider restart (§3), and
    cross-provider fallback (§7).
- **`litespm doctor --repair` stays unprompted-proof**: it previews every action
  and applies none without a confirmation.
- **`litespm audit` checks the catalogue for content that must not ship.** The
  catalogue is 69,376 rows of third-party metadata in a public file, and several
  promises are made about it that nothing checked. `internal/scan` now checks
  them row by row — a discovery-only row that carries a launch line (a claim the
  installer cannot honour), a plugin with no fetchable source, an internal skill
  published publicly, a credential in a public URL, a version with no traceable
  source — and `litespm audit` runs the scan over the catalogue **as published**
  (the cached shards the origin served, digest-verified), verifies the receipt
  chain when the machine has one, and writes SARIF 2.1.0 with stable rule ids
  and every rule declared, so a CI consumer can tell "checked and clean" from
  "not checked". Run against `rel-2026-10-17-01` it reports one error and 248
  warnings: one published URL carries a demo token, and 248 plugins publish a
  source LiteSPM cannot fetch — which the site already says, so those are
  warnings rather than contradictions.
- **A plugin now installs when its publisher ships a pinned source.** LiteSPM
  fetches that exact commit, reads the plugin's own manifest (both the
  `plugin.json` and the Claude Code `$schema` shapes, including an
  `mcpServers: "./mcp.json"` reference resolved inside the pinned tree), and
  registers the MCP servers it declares in each target host. A plugin that
  publishes only a local directory, or an unpinned ref, is refused with the
  reason rather than half-installed; the site says the same thing about the same
  rows.
- **A diagnostic says how long it took.** `litespm doctor` now reports the
  duration of each check and of the whole run (`CheckResult.DurationMs`,
  `DoctorReport.DurationMs`, shown in the human output): a check that takes four
  seconds is a different finding from one that takes four milliseconds, and
  without a measurement the operator cannot tell which is which.

### Fixed

- **The 100:1 compression-ratio bound `ARCH/05` §2.1 requires now exists.**
  `internal/artifact` enforced size, file-count, path and single-file limits,
  but a zip bomb was bounded only by those: 8 MiB of zeroes is a few KiB on the
  wire and an unremarkable 8 MiB on disk. The ratio is now checked *during*
  extraction, against the bytes actually streamed (so a file that lies about its
  own length is caught too), on both the zip and the tar.gz path.
- **A release can no longer publish to GitHub and silently skip npm.** The
  npm-publish step was skipped when `NPM_TOKEN` was absent and the job went
  green — which is exactly how the `v0.4.0` incident shipped to GitHub while
  every npm-installed user stayed on a binary that could not sync the published
  catalog. The step now **fails loudly**, and a release that is deliberately
  GitHub-only must say so with the repository variable `ALLOW_NPM_SKIP=true`.
- **The two catalog ingest paths agree on what is installable.** The Go path
  classified a remote-only record as `discovery_only` while the published
  catalog marked the same rows `metadata_verified` — so a record was installable
  from the published release and not installable from the Go one. A published
  **endpoint** is a launch line (the runtime descriptor comes from a version's
  command *or* a version-less component's endpoint), and it now counts. The
  anti-fabrication half is unchanged: a remote-only row still claims no version,
  no version string and no artifact.
- **A shard download no longer has to fit a 30-second metadata budget.** The
  release tree is split at 20 MiB because Cloudflare refuses a larger asset, so
  one shard is up to 20 MiB of JSON; on a slow or contended link the sync failed
  with `context deadline exceeded` and left the cache untouched. Shards now
  carry their own budget, and an explicitly configured timeout
  (`LITESPM_NETWORK_TIMEOUT_SEC`) still governs every exchange.
- **The site stopped claiming more than it can do** — the one blocker in an
  adversarial evaluation of the live site:
  - `/compare/` said every MCP server in the catalog (48,418) and every skill
    (20,320) could be installed into any agent on the page, while the site's own
    `/explore` and `/agents` filters report 25,401 and 764 — 42 of the 50
    configurable hosts take no remote server at all. The page now quotes the
    installable counts, computed with the same predicate as every other surface,
    and a build-time assertion fails if an installable count ever exceeds its
    catalog total.
  - The home page scrolled sideways by 34 px at 320 px (a grid track with no
    column count takes its floor from the card's min-content width). The
    overflow suite now asserts 320 px as well as 390 px.
  - The publisher filter was case-sensitive, so `?publisher=anthropic` was a
    silent zero while `?publisher=Anthropic` found one row.
  - A search matching more than 200 rows now reads "N matched — showing the most
    relevant" instead of a count that reads as a broken filter, and the empty
    state states the prefix rule instead of failing a misspelling silently.
- **`mcpservers.org` is fetched or its refusal is recorded.** The source had a
  code path and zero snapshots since it was wired. The directory's robots.txt
  permits `/servers/*`, so the origin is a permitted request path — it answers
  automation with a bot challenge, which the run records and does not try to
  defeat, then falls back to the public capture index that carries the same
  pages.
- **A binary built from the source tree no longer claims to be a release.** The
  compiled-in default was `0.3.0` while npm published `0.4.1`; it is now
  `dev`, and the release build stamps the real version.

### Changed

- **CI runs the producer's own test suites.** The six Python suites (513 checks,
  all offline) were manual-only, so a regression in the ingestion safety rules,
  the snapshot lifecycle, skill promotion or the crawl logic reached a release
  with no signal.
- **The vendored `ui-ux-pro-max` test modules skip instead of erroring.** Four of
  them anchored to the upstream repository layout, which is not vendored here;
  they now skip with a reason rather than failing at import (141 tests, 0
  failures, 4 skips).

### Fixed in the repository itself

- **`main` was red.** `gofmt -l .` reported `internal/host/remove.go`, so CI's
  formatting gate failed on every push — the "CI has been green since
  2026-10-15" note was not true.
- **The Pi fixture tested a container Pi does not read.** It used `mcp.servers`
  while the adapter writes only `mcpServers`, and the test parsed the JSON by
  hand instead of driving the adapter. Both now exercise the real container.
- **The npm dependency inventory was wrong.** `npm/NOTICE` and the license
  inventory said the launcher "has no runtime dependencies"; it declares three
  `@sigstore/*` packages, and the default install path needs them to verify the
  release's bundle.
- **The site's browser suite ran for the first time, and 32 of its 201 assertions
  failed.** The export prerenders 4,101 pages and the default build worker count
  was killed mid-run on an 8 GB machine with no error message, which looked like
  a code failure and was not one; one worker completes the build, so the suite
  could finally execute. What it found, now fixed:
  - every page that lists entries filled the console with 404s: Next prefetches
    an entry's RSC payload (`index.txt`), which exists only for the prerendered
    entries, so ~65,000 answered 404 — and the prefetches spent the page's
    request budget. Entry links no longer prefetch.
  - the Coverage board said a publisher published 249 entries and the link beside
    it opened 250: the board grouped publisher names case-sensitively and the
    filter case-folded, and the dataset spells one vendor both `nvidia` (249
    rows) and `NVIDIA` (1 row). The board, the emitted facet list and the filter
    now share one rule — a publisher's identity is its name case-folded — and the
    gate that holds the two sides together (`check-publisher-counts.mjs`), which
    had been written but never run, is wired into `npm run lint`.
  - the two Explore checkboxes were 20 px across, under the WCAG 2.2 SC 2.5.8
    floor of 24 px; a scrollable code block had no keyboard access; and a grid
    without an explicit base column kept an `auto` track whose floor is the
    content's min-content width, which pushed `/explore/` 32 px sideways at
    320 px. 41 grids now name their base column.
  - three places still said plugins cannot be installed, and the hero's figure
    did not say it was a snapshot. Both now state what is true.
- **The policy engine's grant tier failed open.** The tier that binds a call
  to the schema, the code and the endpoint an operator approved once read the
  grant table and, when the database could not answer it, returned "no
  decision" — and the next tier allowed the call. A database that could not
  read its own grants turned every drift check off, silently. A query that
  fails, a row that cannot be read and an iteration that dies part way through
  now deny, naming the evidence the engine could not read.
- **A CAS promotion staged its copy inside the tree store.** A promotion that
  had to copy wrote the partial tree beside its destination, as
  `<digest>.tmp-<nanos>`, inside `trees/<algo>/` — so a crash between the copy
  and the rename left a half-populated directory where every reader of that
  directory had to know to ignore it, and nothing swept it. The scratch is now
  a dedicated directory under the CAS root, one unique entry per promotion.
- **The browser suite measured the runner, not the site.** Chromium keeps its
  shared memory in `/dev/shm`, which is 64 MB in most containers: the renderer
  died part way through a long run with nothing wrong with the page it was on.
  The suite now asks Chromium to use `/tmp` instead (its own advice for a
  small `/dev/shm`), and the host walk gives each chunk of hosts its own
  browser context.
- **Twenty-one catalog rows published corrupted text.** Nineteen carried an
  em dash as the three characters `â€”` — UTF-8 bytes that were decoded as
  cp1252 on the way in — and two carried a replacement character for a byte an
  upstream producer had destroyed before publishing. The producer now repairs
  the decoding when it writes the dataset, and the two rows whose byte was
  lost carry the intended character in an explicit table rather than a guess.
- **The home page's navigation is a menu on a phone.** Below 768 px the
  primary rail was a horizontal scroller with a faded edge and two chevrons:
  it worked, and it hid the shape of the site behind a swipe. It is now a
  native `<details>` — a menu that opens without scripting, so the no-JS
  contract still holds, with every destination one tap away at 320, 360, 390
  and 430 px. From 768 px up the rail is unchanged.
- **The hero says what the product is.** The eyebrow reads "one local bridge,
  multiple agents", the description names the four agents a reader is most
  likely to own and the three things LiteSPM does with a change, the search
  field's placeholder names the catalog instead of repeating a count, the
  field's frame is a one-pixel rule rather than a two-pixel black one, and
  the heading is fluid between the sizes the page already used.
- **The bridge figure names the six tailored adapters.** Claude Code, Codex,
  OpenCode, Cline, Pi Agent and Grok Build — the hosts LiteSPM configures by
  hand — with the bridge's four operations under it: discover, preview,
  install, manage.
- **An Explore result row is not one giant link.** The row's link is its
  title, with the whole row still clickable; a link whose accessible name
  was a summary while its visible text was the publisher, the transport, the
  version and the provenance broke WCAG 2.5.3.
- **Sorting the catalog stopped recomputing its keys.** The comparator built
  a row's sort key inside every comparison, so sorting 69,376 rows computed
  two million keys; the keys are computed once per row now, with one collator
  for every name comparison. The order is unchanged — a check over the real
  dataset asserts it.

## [0.4.1] - 2026-10-15

### Added

- **`litespm skills` now does everything the reference skills CLI does, plus the parts it does not.**
  Five gaps in the source format and the discovery walk meant a user could not simply swap one tool for
  the other, and the fix is the point of this section:

  **Sources.** `git@host:owner/repo.git` and `ssh://host/path` — the reference's documented private-repo
  path — were refused by `ParseSkillSource`. They now parse. This required a second change to be worth
  anything: git routes *both* spellings to its **ssh** transport, so with `GIT_ALLOW_PROTOCOL=https:git`
  the clone died with `fatal: transport 'ssh' not allowed` before any network I/O. That list is now
  `https:ssh:git` while `http`, `file:` and `ftp` stay refused, and a test asserts the allow-list can
  never get wider than the parser. Azure Repos URLs are recognised, and the
  `?path=/skills/x&version=GBmain` form is parsed rather than mangled: `GB`/`GT` prefixes were being
  taken as a literal branch name (`--branch GBmain`, which is not a ref). Tree URLs with a `/` in the
  ref are addressable via `?ref=` or a percent-escaped slash.

  **Direct downloads.** A URL that is not a git repo — a bare `SKILL.md`, or `.zip`/`.tar`/`.tar.gz`/`.tgz`
  — is now a source, and **the extension is not required**: the format is sniffed from the bytes. Caps are
  10 MiB fetched / 25 MiB extracted / 1000 entries, overridable with the reference's exact env vars
  (`SKILLS_DOWNLOAD_MAX_BYTES`, `SKILLS_EXTRACT_MAX_BYTES`, `SKILLS_EXTRACT_MAX_FILES`). Enforced *while
  reading*, so a `Content-Length` is a hint and a decompression bomb is stopped by the extracted-byte
  counter rather than by the archive's own advertised size. Entries with an absolute path, a `..`
  component, a symlink or a non-regular file are rejected, and downloads are https-only.

  **Discovery.** The walk stopped at depth 2, so a repo laying skills out as
  `skills/<category>/<name>/SKILL.md` — the real `google/skills` layout — installed **zero** skills with a
  generic "No installable skills found". Depth is now 3, `node_modules`/`dist`/`build`/`__pycache__` join
  `.git` as skipped, a source that *is* a skill (root `SKILL.md`) works, a recursive search runs when the
  bounded walk finds nothing, and `--full-depth` drops both bounds. `DiscoverSkillsIncludingRoot` is the
  one exported entry point, so `add`, `use`, `update` and the browse-URL branch can no longer disagree.

  **New commands.** `litespm skills use <source>[@<skill>]` resolves a source exactly like `add` and
  installs **nothing**: it writes the one skill to a temp dir, prints the instruction body (frontmatter
  stripped — that is discovery metadata, not instructions) to stdout for piping, and removes the scratch
  dir. `litespm skills find [<query>] [--owner <org>]` searches the catalog for skills; `--owner` derives
  the owner from the source URL path and is documented as inapplicable to rows whose source is not a repo
  URL (measured against the compiled release tree: `--owner vercel-labs` → 59 rows, `--owner anthropics` →
  416). `ls` and `rm` are aliases for `list` and `remove`.

  **Bulk selection and filters**, matching the reference's documented invocations:
  `--skill '*'`, `--agent '*'` (expands to all 81 ids with shared destinations de-duplicated: one skill
  becomes 54 copies, not 81), `--all` implemented as *exactly* `--skill '*' --agent '*' --yes` so the
  shorthand cannot drift, `-l` for `--list`, `update` with no arguments updating everything from each
  ledger row's recorded source, `update -p`, `remove -a`/`-s`/`-y` and removal by exact source, and
  `list -g`/`-a` filters. `list` previously **silently ignored** every argument but `--json`, so `ls -g`
  listed everything without complaint; unrecognised arguments are now an error.

  **`metadata.internal`.** The frontmatter `metadata` key was dropped entirely, so a skill marked
  `internal: true` was always visible. It is now parsed (block and inline forms) and gated on
  `INSTALL_INTERNAL_SKILLS=1` across `add`, `use` and `update` — an update that quietly installed what a
  fresh install would refuse would have made the gate decorative. Hidden skills are *reported*, not
  dropped, so asking for one by name explains itself.

  **Agent ids.** `universal` and `warp` added; `grok` and `pi` added as ids alongside the existing
  `grok-build` / `pi-agent` rows, so the reference's documented `--agent grok` works.

- **`litespm init` scaffolds a `SKILL.md` that parses under the real loader.** `init` used to be a second
  alias of the setup wizard; it is now the authoring entry point, and the wizard keeps `setup` and the
  bare `litespm` invocation. `litespm init [name] [--dir <path>] [--force]` writes a skill with a real
  `name`, a real one-sentence `description` (not `TODO`), and `## When to use` / `## How to run` sections
  — valid as written, not a skeleton to fill in — then prints next steps using `skills add`'s actual flags.
  A test feeds the generated file to `ParseSkillMD` and asserts it round-trips; another asserts
  `skills.DiscoverSkills` finds it, so "the scaffolder produces an installable skill" is checked rather than
  claimed. `skills add`'s own documentation is what caught a real subtlety here: `DiscoverSkills` skips a
  source root's own `SKILL.md`, so the printed command names the *containing* directory — which is exactly
  the bug fixed in the same release, and the reason `init`'s instructions are now correct in both
  directions.

### Fixed

- **Remote MCP servers could not be discovered or invoked at all — the modern streamable-http
  client sent a request every strict server rejected.** This is the most consequential bug found
  this session, and it was invisible to the test suite. Two mistakes in the same request body:
  `_meta` was emitted at the **top level** of the JSON-RPC request object, but JSON-RPC 2.0 defines
  that object as exactly `jsonrpc`/`id`/`method`/`params`, so a strict server refused the whole body
  with `-32600 "Bad Request: the request body is not a valid JSON-RPC message"`; and the envelope
  was sent under plain keys where the `2026-07-28` revision LiteSPM declares requires the namespaced
  `io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities`
  (`-32602`). Both were confirmed against a live endpoint rather than reasoned about —
  `https://mcp.context7.com/mcp` returns 400 for each wrong shape and 200 for each corrected one.
  `withMeta` now merges `_meta` **inside `params`** with the namespaced keys, and `JSONRPCRequest`
  no longer carries a `Meta` field, so the invalid shape cannot be expressed again.
  **Why nothing caught it:** the modern client's own test used a fake server that decoded a
  top-level `_meta` without complaint — the mock was more permissive than any real server, so the
  suite stayed green while `litespm capabilities refresh` discovered **0 tools across 0 servers**
  against every real endpoint. The fake server now rejects a top-level `_meta` with `-32600` and
  refuses `_meta` missing either namespaced key; an opt-in live check
  (`LITESPM_LIVE_MCP=1`, skipped in CI) guards against the mock drifting from reality again.
  Verified end to end in a sandbox: `capabilities refresh` against context7 now reports
  **`Discovered 2 tools across 1 servers`**, and `capabilities search` / `describe` return real
  schemas and fingerprints. The legacy (`2025-11-25`) and stdio profiles never sent `_meta` and were
  unaffected — which is precisely why `ConnectLegacy` worked against the same endpoint while
  `ConnectStreamableHTTP` did not.

- **One MCP install produced two provider rows.** The install-time row I added for `m4` keyed itself
  on the bare install id, but `capabilities refresh` derives `prov_<install>_<component>` via the
  exported `discover.ProviderIDFor` — added exactly "so re-probing updates rows instead of
  accumulating duplicates". Installing and then refreshing therefore wrote a second row, with the
  discovered capabilities attached to discover's and the install's copy left as an orphaned
  duplicate that autostart and any provider listing would have seen twice. The install path now
  uses `discover.ProviderIDFor`, and `TestRemoteInstallEndToEndJSONAndTOMLHosts` asserts the exact
  provider id *and* that exactly one row exists. Verified in a sandbox: install → refresh leaves one
  row, two capability rows, zero orphans.

- **`litespm search` printed a `NAME / ID` header and never printed the id.** The id is the only
  string `litespm install` accepts — lookup is an exact map match with no prefix, alias or fuzzy
  fallback — so the discover step could not feed the install step unless the user knew to add
  `--json` or open the website. Each result now prints its id whole and untruncated on the line
  below its name (a shortened id would be something the user cannot paste). Closing the loop
  end to end in a sandbox: the id taken straight from `search` output installs.

- **Every install attempt and every invocation is now written to the audit log.**
  `state.RecordAuditEvent` had exactly one caller and it was a test, so the `audit_events` table was
  never written in production — no install, refusal or invocation left a trace. `cmd/litespm/main.go`
  now records one row per install attempt on **both** paths (`install.execute` for agents,
  `auditCLIInstall` for `litespm install`) and one per `provider.invoke`, with `decision` = `allow` or
  `deny` and the authorizing `approval_id` when an approval was consumed. The agent path registers its
  `defer` *before* `authorizeInstallExecute`, so a refusal by the gate is recorded too — a log that
  records only successes cannot answer "was this asked for?" Writes are deliberately best-effort: a
  failed audit write goes to stderr and never changes the outcome of the operation being logged.
  Pinned by `TestInstallExecuteWritesAuditEvent`, `TestInstallExecuteRefusalIsAuditedAsDeny` and the
  discovery-only assertion in `TestInstallExecuteRefusesDiscoveryOnly`.

- **An installed MCP server now writes its own `providers` row (finding `m4`).** The only writer was
  `internal/discover` during `capabilities refresh`, so a machine that had just installed an MCP server
  had no provider row: autostart had nothing to start, and `litespm capabilities` could not reach the
  server without a manual refresh. `state.SaveProviderExec` (a new `Execer` seam over `SaveProvider`)
  writes the row inside the *same* transaction that writes the install, component, registration and
  ledger rows — the row cannot outlive an install that rolled back. `component_id` resolves to a real
  component row, never to the install id. `autostart` deliberately stays `0`: starting a process at boot
  is an ARCH/34 §4 product decision, not an install side effect. Pinned by the provider assertions in
  `TestRemoteInstallEndToEndJSONAndTOMLHosts`.

- **`internal/host/remove.go` is formatted.** It had been committed unformatted since `454de4a`, which
  made the `gofmt` gate in `ci.yml` red on `origin/main`.

- **The search field no longer claims to search fields it does not, and no longer prints a count it has
  not measured.** `matchesQuery` also reads `tools[].name` and `tools[].description`, but the field's
  accessible name listed six other fields — which is why a query for `context7` returned 4,809 rows
  (most of them servers that merely *bundle* a context7 tool) under a label that did not mention tools
  at all; the `/explore/` meta description repeated the claim and added "agent host", which no matcher
  reads. Separately, `SearchBar` printed `{count} found` unconditionally, so a cold load showed a flat
  **`0 found`** while the rows were still arriving and MiniSearch was still indexing — resolving to
  `4,809 found` seconds later for the same query. `useCatalogSearch` already exposed `settled` for
  exactly this, and its own doc comment warned that "a UI that trusted those two rendered a confident
  'No matches' before any search had happened", but neither caller passed it. `SearchBar` now takes
  `settled?: boolean` and reads "searching…" while it is `false`, and a new
  `web/scripts/check-search-settled.mjs` (wired into `npm run lint`) fails naming the file and line if
  a caller passes `totalMatches` without `settled`.

- **The Pages budget gate now fails *before* the budget is spent, not only after.**
  `scripts/check_pages_limits.py` checked only the hard ceilings, so the last safe build and the first
  rejected one were the same build: `wrangler deploy` refuses an over-limit upload and reports a CDN
  problem, which is precisely the misdiagnosis the script exists to prevent. The largest catalog shard
  now sits at **80% of Cloudflare's 25 MiB per-asset limit**, and the catalog grew ~12x in one
  release, so "next release will probably fit" was not a plan. `--headroom` (default `0.90`) fails once
  a limit is that close, naming the asset, the percentage and how many MiB remain, and says plainly
  that nothing is over yet and `wrangler deploy` would still accept the bundle — a near miss must not
  read like a breach. `--headroom 1.0` restores over-the-line-only; `1.5` is a usage error (exit 2).
  `scripts/test_pages_limits.py` pins all four outcomes (22 checks), including the one CI cannot reach
  — the real bundle passes the default headroom today, so an over-limit fixture is the only way to
  cover that branch.

- **The tree is gofmt/vet clean and `go test ./...` is 43/43** (also under `-race`).

- **The published site told users to install skills with the competitor's CLI.** Three catalog rows
  (`skill:anthropics:academy-guide`, `:claude-api`, `:discernment-nudge`) carried
  `installHint: "npx skills add https://github.com/anthropics/skills --skill …"`, and the site renders
  that field as a **copyable command** — so a live page offered a one-click copy of someone else's
  installer. The generator had already been fixed to emit `litespm skills add <repo> --skill <name>`,
  and the leak survived anyway, because `web/data/catalog.json` is a tracked generated artifact that
  **no CI gate diff-checks**: the producer changed, the artifact did not, and nothing compared them.
  Corrected by applying the generator's own output for those rows (verified by calling the generator's
  `github_repo_facts` on the same input rather than hand-writing a replacement string), recomputing
  `web/data/release.json`'s `datasetDigest` so the recorded digest does not become the next false
  claim, and adding the missing gate: `scripts/check_catalog_coherence.py` now fails when any
  `installHint` names another tool's installer. The gate is proven non-vacuous — reintroducing the
  leak in a scratch copy makes it exit 1 with the row id. **Scoped to `installHint` only**: the twelve
  upstream `summary` values that also mention `npx skills` are publisher-authored text, and rewriting
  those would falsify the record rather than fix it. The site's labels followed the value: for a skill
  the field is now *our* command, so "Upstream source repository" / "Host command" — which named the
  wrong tool — became "Install it straight from the source repo" / "Install from source", while a
  plugin's `/plugin install` keeps the host-command wording because that genuinely is the host's own
  command, the one thing we cannot run. A full regeneration is still outstanding (upstream content has
  moved on since the 2026-10-11 snapshot); that is a release action.

- **`litespm uninstall` no longer lets you believe LiteSPM is gone when it is not.** It strips the
  bridge entry and said "Still on disk", naming skill directories and backups — but never the MCP
  servers `litespm install` had registered into every agent config. It now enumerates what remains
  per kind, with the exact command for each (`litespm install remove <installId>`,
  `litespm skills remove --all [--global]`), and says nothing when there is nothing. The removal
  scope is deliberately unchanged: the per-install path restores a user entry the install replaced
  and keeps user-edited nodes, semantics a bulk strip does not have.

- **`litespm setup` accepts arguments, and `--help` means help.** It discarded them entirely, so
  `litespm setup --help` launched the wizard and died with `Setup error: EOF`. Now: `--help` prints
  the page, an unexpected argument is a usage error naming the accepted form, a no-TTY invocation
  refuses with the alternatives instead of an EOF error, and `setup --agent <host-id>` is a
  non-interactive form sharing `host setup`'s exact write path (a test asserts the two produce
  byte-identical results, so they cannot drift). Several `help.go` claims were false and are
  corrected, including setup "showing what will change before it changes it" — which is now true —
  and `install`'s description of `--host`, which does not apply to skill listings.

### Changed

- **The interactive wizard is now the non-developer surface for setup *and* management, and it was
  writing to the wrong file.** An audit of the wizard against the requirement that a non-developer
  should be able to install, remove and manage from it found the flow was setup-only — no catalog, no
  ledger, no install, no remove, no list — plus two verified bugs and several claims the code did not
  support. The worst was a silent redirect: answering "no" to the detected path and typing your own
  wrote to the adapter's derived default instead, printing only the path it actually wrote. The
  invariant is now *the path written is the path the user agreed to, or nothing is written*: a new
  optional `host.PathPlanner` / `host.PlanSetupAt` plans the merge against exactly the given path and
  refuses, naming the file it would use instead, when an adapter cannot express one. The second bug
  was an unbounded loop on end-of-input — `ReadString`'s error was ignored, so exhausted stdin
  produced **32,081,826 lines of "Invalid option." in 120 seconds** (Ctrl-D did the same to a real
  user); every prompt now checks its read and stops once with guidance, pinned by a test that asserts
  an output-line bound so it cannot return. Beyond the fixes: the agent menu is derived from
  `host.ListAdapters()` instead of a hand-written list of six that had already drifted (its Pi row
  advertised a `config.json` no Pi release reads); "✓ Detected configuration file" no longer appears
  for a file that does not exist, so the wizard and `host detect` stop disagreeing; the "use 'Adopt'
  in /marketplace" line is gone, because `Adopt` has no handler and the repo forbids text claiming a
  state the code lacks; and setup now shows the change it is about to make and asks before writing.
  The gap itself is closed with a "what next" menu reachable after a fresh setup **and** on every
  later bare `litespm` run (which previously just re-applied setup with no already-configured state):
  update the catalog (the one explicit, opt-in network step, which fails loudly rather than printing
  a success line), find and install, remove what LiteSPM installed, see what is installed, or repair
  another agent. Every action calls the **same shared implementation** the CLI uses —
  `authorizeHumanInstall` → `installSkillFromListing` / `installMCPFromListing`,
  `removeInstalledPackage`, `executeSkillsRemove`, `runListTo` — because a wizard-only installer
  would be a second copy of the riskiest code in the product. A non-developer can now remove what
  they installed, which they could not before.

### Security

- **Skill frontmatter was printed to the terminal unescaped.** A skill's `name`, `description`,
  `triggers` and required-tool list are read out of a stranger's cloned repository, and every one of
  them is printed to the user's screen at the moment they are deciding whether to trust the skill —
  in the progressive index, the `skills add` summary, the ledger and `litespm skills list`. Nothing
  stripped them, so a skill named `\x1b[2K\rLegit Looking Skill` would clear the victim's line and
  overwrite it with text of the attacker's choosing. That is the terminal-escape class, CWE-150,
  and it applied to every skill install. `internal/skills/sanitize.go` now strips OSC, DCS, PM, APC
  and CSI sequences, raw C1 controls and the remaining C0 controls, and collapses the result to one
  printable line. It runs **at the parse boundary** — a sink added later cannot forget to do it —
  and the table renderer is sanitized again for its own formatting needs. Pinned by
  `internal/skills/sanitize_test.go`, which covers each sequence class, an unterminated CSI, a
  trailing lone ESC, and the trap that makes this easy to get wrong: a continuation byte *inside* a
  valid multi-byte character also falls in `0x80–0x9F`, so a byte-wise C1 strip would corrupt every
  non-Latin description on the page. Decoding, not byte masking, is what keeps those apart.
- **`RenderProgressiveIndex` corrupted descriptions in two more ways while it was being fixed.**
  A `|` in any value split the markdown row and destroyed the table (now escaped as `\|`), and the
  truncation sliced **bytes** — `desc[:77]` — cutting a multi-byte character in half and printing
  invalid UTF-8 for any description not written in a Latin script (now rune-counted).
  `TestTruncateRunesDoesNotCorruptUTF8` asserts the old behaviour really was invalid UTF-8 rather
  than taking that on trust.

- **A skill named like a filesystem path can never become one.** `SaveProviderExec`-style trusting of a
  third-party name is refused earlier than it needs to be: `validSkillName` rejects `__proto__`, `..`,
  traversal, absolute paths, control characters and newlines *before* anything could create a directory,
  write a ledger row or print the name. `internal/skills/namesafety_test.go` pins the whole set, so a future
  relaxation of the regex cannot quietly reintroduce what the boundary refuses. `constructor` and
  `prototype` are deliberately allowed — the JS prototype-pollution hazard that makes them interesting
  elsewhere does not exist in a slice-of-records ledger, and refusing a legal name would break a user who
  genuinely chose it. The test says so, so nobody re-adds them.

### Known issue

- **`litespm@0.4.0` as published cannot read the published catalog.** The `v0.4.0` tag was cut at
  21:24:01 on 2026-10-11 (`791da17`), 2h29m before the shard-aware catalog client (`547d230`, 23:53:34)
  landed — `git merge-base --is-ancestor 547d230 v0.4.0` is false. The installed binary therefore looks
  for a single `listings.json` that `rel-2026-10-11-02` does not contain (it was sharded precisely
  because the whole file was 62 MiB, over Cloudflare's 25 MiB per-asset limit) and fails with
  `manifest missing listings.json entry`, which takes `search`, `install` and `/marketplace` with it.
  A binary built from current `main` syncs the same tree and reports `69376 capabilities indexed`, so
  this is release ordering and not a source defect. **The fix is a re-tag, not a code change** — see
  `CURRENT_RUN.md` for the exact procedure.

### The sharding fix (carried from the release that never shipped)

- **The release tree and the site's catalog are sharded, because Cloudflare rejects any static asset
  over 25 MiB.** The 69,376-row catalog produced a 62 MiB `listings.json`, a 32 MB `versions.json` and
  a 52 MB `/data/catalog.json`; `wrangler deploy` refused all three with *"Asset too large"* and the
  site could not be redeployed at all (the previously live site stayed on the 5,825-row release).
  `internal/catalogbuild` now splits a kind's rows across `listings-0000.json`, `listings-0001.json`, …
  each under 20 MiB and each a complete canonical array, recorded in the manifest like any other file;
  the site emits `catalog-NNNN.json` shards plus a small index at the same `/data/catalog.json` URL, so
  the loader's contract is unchanged. A release that fits in one shard keeps the historical name and
  bytes, so small releases are unaffected and their digests do not move.
  `manifest.contentDigest` still covers the release's **content** — the ordered concatenation of the
  shard files — and every byte is covered twice, by its own shard digest and by that one. The client
  gathers a kind's shards from the manifest, verifies each, decodes them in order, and persists the
  cache verbatim so a cached release mirrors the origin file for file. The deploy verifier sorts shard
  names before accumulating, because a Go map would otherwise order the digest domain differently on
  every run. Recorded in `ARCH/18` §2.1, including why this is a transport split and not the logical
  shard format §2 designs.

  **This is the change the published `v0.4.0` binary predates**, and it is why that binary cannot
  sync: the shards exist, the client that reads them does not ship in that tag.


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
