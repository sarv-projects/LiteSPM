# The blueprint, rechecked against the tree

> **Status:** 2026-10-19. The third-party blueprint (`LiteSPM_Website_Product_UX_Blueprint.md`,
> inspected 18 Oct 2026) was re-verified by four independent auditors against the current
> tree. This is what survived, what did not, and what is now being built.

## 0. The headline

**The blueprint is roughly half stale.** It was written against the tree as it stood on
18 October; since then the repo fixed several of the exact things it lists as open — and
some of them were fixed *by the same audits*. Re-implementing its list verbatim would
re-open closed defects and duplicate shipped work.

| Verdict | Share of its actionable claims |
|---|---|
| Already satisfied — do not re-implement | ~40% |
| Genuinely open | ~45% |
| Wrong premise / already handled differently | ~15% |

## 1. Already satisfied — do not re-implement

| Blueprint claim | Reality |
|---|---|
| "The current static routes do not include dedicated Privacy, Terms … pages" | **Privacy, Terms and Contact exist** (commit `3490730`, 18 Oct), are linked in the footer, are in the sitemap, and are asserted by `routes.spec.ts` and `a11y.spec.ts`. |
| "the skip link … a live audit observed focus staying on BODY" | **Fixed** (`fdcf8fd`): every `main` carries `tabIndex={-1}`, and `a11y.spec.ts:184-199` asserts focus lands inside `<main>` after Enter. |
| "a clipped horizontal nav with hidden scrollbar" | **Fixed** (`fdcf8fd`): the rail gets its own row below `lg` and a measured edge fade at ≤412 px, asserted at 320/360/390 px by `a11y.spec.ts:201-237`. |
| "no horizontal overflow at 390 px" | Extended to **320 px** as well (`budgets.spec.ts`, 12 routes). |
| "Rename /trending/ to Catalog statistics" | The route is already labelled **"Coverage"** in the nav, footer, `<title>` and `<h1>`; only the URL slug is still `/trending/`. |
| "The README still contains the Supported agents section … differing catalog release references" | Reconciled on 2026-10-19: README, STATUS, ARCH and `web/data/release.json` all name `rel-2026-10-17-01` (seq 149), verified against the live origin. |
| "Do not print 49,000 MCPs work with every agent" | **Fixed** (`d05bc49`, `b86adae`): the host filter is gated on installability; the agents index prints **25,401 MCP · 764 skills** for a capable host and **0 MCP** for one of the 42 that take no remote server. |
| "the site may claim 48,418 installable" | **Fixed** (2026-10-19, commit `90b3796`): `/compare/` now quotes the installable counts (25,401 / 764) computed with the same predicate as every other surface, with a build-time assertion. |
| "ManageInstall: 'Installed' must never be inferred from localStorage alone" | **Already honest**: the copy says "LiteSPM's own ledger, on your machine, is the source of truth — this page can't read it." |
| "FAQ: put novice questions first" | **Done** (`3b6de1f`): "What is LiteSPM?" leads, "What about plugins?" is last. |
| "the placeholder overpromises semantic understanding" | **Done**: the placeholder is now `Search 69,376 capabilities — postgres, github, playwright…`. |
| "web/package.json's 0.1.0 must not be displayed as the CLI version" | It is displayed nowhere; the site shows the *catalog* release stamp instead. |
| "stars / tools / effects / readme are unavailable" | Confirmed by measurement: **0 of 69,376 rows** carry `stars`, `tools`, `effects` or `readme`. The site's copy already says so. |
| "/compare/ shows raw JSON/TOML fields and implementation source" | Those columns are **gone** (the docs swap in `compareRows.ts`); what remains top-level is the config path, which is a legitimate column. |
| "Unknown `/package/<key>/` must 404" | **True today** (worker `index.js:352`), asserted by `entry-pages.spec.ts:114-121`. |

## 2. Genuinely open — and now in flight

**Information architecture and trust** — six routes do not exist: `/how-it-works/`,
`/get-started/`, `/docs/`, `/status/`, `/support/`, `/security/`. The nav has no "Use
cases", no "How it works", and no "Get LiteSPM" item; the footer has two groups
("Browse", "Site") rather than Product/Resources/Trust; and there is **no mobile menu** —
below ~412 px the primary rail is a horizontal scroller with a fade.
→ *Workstream dispatched: new routes.*

**Homepage** — the hero still carries the rotating `KindCycle` counts, the release chip
and the `BridgeDiagram`; there is **no product recording** anywhere on the site, and the
`BridgeDiagram`'s figcaption still says "every agent connects to all three kinds", which
contradicts the plugin shelf's own "plugin installs are not supported yet"; the five
repetitive shelves are 42 % of the scroll; the goal tiles sit at #4 instead of #2; "How it
works" is five steps, not three; the agent teaser prints config paths; and the advanced
command grid sits on the homepage with no `/get-started/` to move to.
→ *Workstream dispatched: homepage.*

**Truthfulness** — the site still has ONE listing-level predicate and no per-target
feasibility: a page can say "Works with Claude Code" for an entry the CLI would refuse
(only **8 of 50** hosts can take a remote URL entry), and the same fact is printed in
3–4 places per entry with no shared source. Three separate taxonomy maps exist
(`taxonomy.ts` 11 goals, `landing.ts` 11 topics, `categoryLabel.ts`) and they disagree.
→ *Workstream dispatched: `web/lib/installFeasibility.ts`.*

**Product and agent pages** — the entry page has no per-agent install status ("Can
configure for [agent]" vs "Install path unavailable for [agent]"), the disabled
"Install unavailable" button is still the *only* response for a discovery-only row or a
plugin, the "Will it work with what I use?" block sits below the fold, the agent page
repeats a count that mixes installable rows with publisher-declared plugins without
saying which is which, the related rail has no task-based signal, "Publishers by entries
shipped" is still a board heading, and the Explore view is 973 un-decomposed lines.
→ *Workstream in flight (page surface).*

**One Worker behaviour worth a decision, not a patch** — an unknown entry returns **200 +
noindex** for the query and no-slash forms, and a real **404** only for the
trailing-slash form. The query form is the client-side resolver, so 200 is a deliberate
design, documented in `worker/index.js`, `public/robots.txt` and `PackageView.tsx`. Making
it 404 needs a decision (canonical URLs for real entries, 404 for everything else) and a
redirect for the query form, not a patch.

## 2a. Measured, new, and not in the blueprint either

The fourth audit (data truthfulness) transpiled the site's own modules and ran them
against the real dataset. Two findings are new:

**1. A second transport axis the site does not model — 3,660 overstated claims.**
The site knows which hosts can take a *remote* entry (8 of 50, and it now gets that
right — the 50-host over-claim was fixed on 18 Oct). But the CLI gates on the
**transport** as well: only **claude-code, cline and cursor** of those 8 accept `sse`;
codex, grok-build, opencode, pi-agent and zed are `streamable-http` only
(`RemoteEntrySpec.Supports`, `internal/host/target.go:139`). The generated
`web/data/hosts.json` carries a boolean `remote` and no transport capability, so:

- **732** published rows carry `transport: "sse"`. The site claims all 8 remote hosts
  for each; the CLI would accept 3 and refuse 5 with `LPSM-HOST-REMOTE-UNSUPPORTED`.
- **732 × 5 = 3,660** host claims are overstated today. The 24,669 `streamable-http`
  rows are exact.

A concrete row: `mcp:builtin:mcp-registry:io.github.jghiglia2380-0latency` (sse,
`https://mcp.0latency.ai/mcp?key={api_key}`) — the site says "works with 8 agents";
the CLI accepts 3.

**2. The "Agent skills" shelf serves the wrong rows of the right names.** The shelves
are driven by `web/lib/landing.ts::SHELVES[].preferred`, a list of **display names**;
`deriveShelves` takes the **first** name match in dataset order. "Figma" matches 14
rows, "Linear" 24, "Supabase" 13 — and the match chosen is often a `discovery_only` row
while an installable row of the same name sits later in the dataset. Measured: the
"Agent skills" shelf shows **5 of 6** discovery-only rows, and the shelf "Official
agent skills" shows 1 of 6. The first shelf ("Installable right now") is clean (0 of 6),
because it filters on installability.

This is the "discovery-only rows should not dominate first-time recommendations"
complaint, in its sharpest form: the editorial shelf *is* the mechanism, and it picks
by name without asking whether the row can be installed. The replacement curated set
(`featured.json`, ids rather than names) fixes it by construction.

**3. Where the site and the CLI disagree today, in full.** The audit enumerated fifteen
CLI gates; the site encodes **one** of them at listing level (the kind gate). The rest,
each of which the site must either mirror or explicitly not claim:

| gate | owner | site mirror? |
|---|---|---|
| kind (plugin refused) | `internal/domain/models.go` | yes |
| provenance (`discovery_only` refused) | `internal/domain/models.go` | yes |
| launch line: command XOR endpoint | `cmd/litespm/install_mcp.go` | partially (listing's `transport`, never the resolved descriptor) |
| skill source parses to a git repo | `internal/skills/install.go` | no |
| transport normalisation (`sse` vs `streamable-http`) | `internal/host/target.go` | **no** |
| host remote capability (8 of 50) | `internal/host/entry_install.go` | yes |
| per-transport host capability | `internal/host/target.go` | **no** |
| target-set semantics (default set filtered, explicit host fails by name) | `cmd/litespm/main.go` | no |
| scope (project scope needs a documented path) | `internal/host/entry_install.go` | no |
| env forwarding (a remote entry refuses `--env`) | `internal/host/entry_install.go` | no |
| egress on the endpoint | `cmd/litespm/install_mcp.go` | no (and the site must never claim approval) |
| entry-name validity, `litespm` reserved | `internal/host/entry_install.go` | no |
| name collision unless `--force` | `cmd/litespm/install_mcp.go` | no |
| plan/approval binding | `cmd/litespm/install_authz.go` | no |
| plugin artifact source (not wired) | `cmd/litespm/install_kind.go` | yes |

The last row is the one the plugin workstream is closing.

## 3. What the recheck changes about the plan

1. **The truthfulness contract lands first.** Half the copy in the blueprint is a claim
   about what can be installed; if the pages are rewritten before there is one shared
   feasibility function, the new copy re-introduces the same overstatement the current
   copy had.
2. **The product recording is the one item that cannot be parallelised and must not be
   skipped.** It needs a real machine, a real agent, a real install and a real removal.
   Every other item is code.
3. **The build cannot be verified in this container** — `npm run build` is SIGTERM'd
   during the type-check phase (reproduced with and without these changes). `npm run
   type-check` and the four lint gates pass, and CI runs the Playwright suite the
   workstreams are writing for.
4. **The "already satisfied" table is a stop-list.** Several items on the blueprint look
   like work and are not; re-implementing them would undo fixes that are pinned by tests.
