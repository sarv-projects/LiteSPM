# Homepage — product proposal, from the brief mockup to a top-company product

> **Status:** proposal, 2026-10-19. Companion to the third-party blueprint
> (`LiteSPM_Website_Product_UX_Blueprint.md`, 18 Oct 2026) and to the
> adversarial evaluation of the live site
> (`docs/superpowers/evaluations/2026-10-19-site-evaluation.md`).
> **The brief mockup is the input; this document is the argument about it.**

## 0. What the mockup gets right, and where it stops

The mockup is a good *skeleton* and a poor *page*. Concretely:

**Right, and keep it:**
- Outcome-led H1 — "Give your coding agents the tools they're missing." — with a calm two-line
  sub-paragraph that says what the product does and does not do.
- The **search field with intent shortcuts** ("Popular starting points: GitHub · PDFs · Figma ·
  Browser automation"). This is the honest substitute for semantic search, and it is the single
  best idea in the mockup: it gives a casual visitor a way in without knowing the vocabulary.
- The **goal tiles** ("What do you want your AI to do?"), because goal-first entry is how
  non-technical users search and the catalog's taxonomy is a poor proxy for it.
- The **three-step product story** (Find a tool → Preview changes → Install locally). That is
  the actual differentiator, in three words a casual user can follow.

**Where it stops being a top-company product:**

| # | Problem | Why it matters to a top-company buyer, and to a casual user |
|---|---|---|
| 1 | **The first screen promises a product and then shows a catalogue search.** | The proof of the product ("Watch LiteSPM work") sits *below* the search, so the first viewport never shows what the product is. A casual visitor reads "search 69,376 tools" and concludes this is a directory, not a tool. A company page states the outcome and shows the product in the first screen. |
| 2 | **No "Get LiteSPM" anywhere.** | The nav has four links and no action; the hero has "Explore tools" and "See the project". A visitor who is convinced has nowhere to go. The site cannot install anything (it is a static export), so the CTA must lead to *the local tool* — that is the whole funnel, and the mockup omits it. |
| 3 | **"See the project" is a hedge, not a benefit.** | It tells you what the button is not. It should be "See how it works" (a real 40-second recording) or a benefit-led second action. |
| 4 | **The demo is a placeholder note.** | "Replace this illustration with a genuine recorded product walkthrough" is the credibility hole of the whole page. A top-company product's first proof is real: a real agent, a real diff, a real approval, a real removal. Everything else on the page is secondary to that. |
| 5 | **No trust, no proof, no logos, no scope statement.** | No "works with Claude Code, Cursor, Codex, OpenCode", no "free, no account, nothing leaves your machine", no "the website installs nothing". A casual user needs the safety line; a company buyer needs the scope line. |
| 6 | **It reads like a documentation site.** | Monochrome, one accent, 12–13 px body, a ~570 px column in a ~780 px canvas. A top-company landing page uses the canvas (1200–1440 px), a 2-column hero (60/40), a real type scale (H1 48–56 desktop, body 15–16), and imagery of the product. |
| 7 | **Four goal tiles in a 2-wide grid.** | The blueprint asks for six to eight; four in a narrow column leaves the section looking thin and arbitrary. |
| 8 | **The H1 makes a claim LiteSPM cannot check.** | "the tools they're missing" — the site cannot know what an agent is missing (it is a static export with no machine access). The differentiator LiteSPM *can* prove is **safety and cross-agent control**: preview, approve, back up, undo. |

## 1. The product position, in one line

**"Add tools to your coding agents — with a preview before anything changes, and a way back."**

Everything on the page should serve that sentence:

- **The pain is real and shared:** configuring MCP/skills by hand, per agent, with no preview and no
  undo. Casual users feel it as "my agent can't do PDFs"; power users feel it as "I have four
  config files and no idea what I changed".
- **The differentiator is not the catalogue** (competitors have catalogues; ours is bigger but that
  is a number, not a reason) — it is the **lifecycle**: detect → preview the diff → approve →
  install → record → remove/restore, across many agents.
- **The catalogue is the funnel, not the product.** It should appear as proof and as a way in, never
  as the headline. (The current homepage leads with five shelves — 42 % of scroll — and that is the
  single biggest structural error on the site today.)
- **Honesty is the brand.** The site's edge against a big incumbent is that it never fabricates:
  no stars, no "verified", no fake popularity, and every impossible action says why. That is a
  *product feature* for a company buyer, and it should be said out loud, not just practised.

## 2. The homepage, section by section (the proposal)

Desktop first, 1440 px canvas, ~1200 px content, 2-column hero at 60/40. Mobile is one column,
32–36 px H1, 44 px touch targets, and a real menu (not a clipped rail).

**0. Nav** — wordmark · Explore · Use cases · Agents · How it works · [search icon] · **[Get
LiteSPM]**. The CTA is a filled button, the only filled element in the nav. Mobile: wordmark +
search + a menu button that opens a real overlay listing every route, with a focus trap, Escape to
close, and focus returned. (The current clipped rail is a defect, not a style: "Coverage" is
entirely off-screen at 320 px with no affordance.)

**1. Hero (two columns)**
- *Left*: eyebrow "TOOLS & SKILLS FOR AI CODING AGENTS"; **H1: "Give your coding agents the
  tools they're missing — safely."** (keeps the mockup's sentence, adds the one word that is
  provable); two lines of support copy naming the agents, the preview and the undo; **[Get
  LiteSPM]** + [See how it works]; a "works with" strip of five agent logos.
- *Right*: the **real product recording** — pick an agent, see the config diff, approve, see the
  local install record, remove it. 40–60 s, with a poster frame, captions, a text transcript, and
  a reduced-motion static fallback. Real output, redacted; no fake terminal.
- *Below the hero, in the left column only*: the search field ("Search tools, skills or apps…")
  with the intent shortcuts. Search is the catalogue's door; it is not the product's headline.

**2. "What do you want your AI to do?"** — eight goal tiles, each opening a **real filtered
result set** (one taxonomy, one mapping, no contradictory groupings): work with code · handle PDFs
and documents · work with designs · automate the browser · research and summarise · connect
databases · ship and deploy · work with tasks. Each tile: icon, a plain benefit, a chevron. No raw
counts.

**3. "Start here"** — six to eight **curated, installable, source-backed** entries with their
publisher, category and real availability. Editorially chosen from the dataset (a new
`featured.json`, validated at build time so an id that disappears fails the build). This replaces
the five repetitive shelves and the auto-rotating stat line.

**4. "What LiteSPM changes" (before/after)** — the lifecycle, visually: find → preview the exact
config diff → approve → install → remove/restore. Two panels, real content, no animation required.

**5. "How it works"** — three steps with the *substance* (the command, the diff, the undo), linking
to `/how-it-works/`.

**6. "Choose your agent"** — the five or six best-known logos plus a searchable selector over all
generated identities, with the honest sentence: a browser preference is not machine detection.

**7. "Why LiteSPM"** — four benefits, each with a real screenshot or exact command: multi-agent
control · previewed, backed-up config edits · local-first (no account, no telemetry) · the CLI and
`/marketplace` where the agent supports it.

**8. FAQ** — novice questions first: Can I install from this site? What is an MCP server vs a
skill? Which agents work? How are publishers checked? What can go wrong? Do I need an account?
What about plugins? (with the honest answer: not yet).

**9. Get started strip** — the quick path (`npm install -g litespm`) as an option, and the primary
CTA to `/get-started/` (OS + agent, read-only, no fake install state).

**10. Footer** — Product / Resources / Trust, with the trust routes real: Privacy, Terms,
Security, Support, Status, Changelog, CLI releases, GitHub.

## 3. The design system, adjusted for "top company"

- **Type**: IBM Plex stays (it is good and already there). H1 48–56 desktop / 32–36 mobile, max
  ~11 words; body 15–16 (not 12–13); meta 11–13; line length 55–75ch for prose; code in mono.
- **Colour**: keep the paper/ink/sunken surfaces and the three kind hues. The accent (indigo) is
  reserved for **one** primary action per view. Kind hue means kind — never security confidence.
  Fix `--ink-3` on `--sunken` (4.77:1, under the 4.5:1 floor) while the redesign is in the file.
- **Layout**: 1200–1440 px content, a 60/40 hero, 8 px spacing scale, cards with one job each.
- **Motion**: 120–240 ms, ease-out, and every ambient animation respects `prefers-reduced-motion`.
  No auto-playing video with sound; the demo is a poster + click.
- **Dark mode** is a first-class citizen, not an inversion: it is already in the token system.
- **Reuse, don't add libraries**: the repo already has `DiscoveryCard`, `TabList`, `Toast`, `CopyButton`,
  theme tokens and an axe-clean palette. New primitives needed: `CommandCopy`, `StatusNotice`,
  `EmptyState`, `InstallabilityBadge`, `FiltersDrawer`, `ProductDemo` (poster/video/transcript).

## 4. What "finished" means (the acceptance bar)

1. In five seconds a first-time visitor can say what LiteSPM does and why it exists — **and can
   name an agent it works with**.
2. The first viewport shows a **real** product recording, not a placeholder.
3. A visitor can find an actually installable PDF/skills example **without learning the word
   "MCP"**.
4. A visitor can tell whether *their* agent supports a specific entry, and why not if it does not.
5. The visitor reaches "get it" in one click from anywhere on the page, and understands that the
   website itself installs nothing.
6. An expert can still reach exact package ids, commands, config paths and provenance immediately
   (the same page, one disclosure deeper) — the beginner and expert journeys must not be two
   products.
7. No dead-end "Install" button, no unproven rating, no implication that a discovery-only row or a
   plugin can be installed, and no count on the page that the site's own filters do not produce.
8. Mobile, keyboard, zoom, dark mode, reduced motion, and the existing budgets (CLS < 0.01, First
   Load JS ≤ 108 KiB, ≤ 36 requests, zero axe A/AA violations, no horizontal overflow at 320 px)
   all hold.

## 5. The order of work (and why it is not a week of polish)

The blueprint's parallelisation is right, with one correction: **the truthfulness workstream
gates the copy**, because half of this proposal is words that must not overstate. So:

1. **One shared feasibility contract** (`web/lib/installFeasibility.ts`, pure and tested) — the
   site's projection of the CLI's own install gates. Every page then says the same thing about
   the same entry. *Nothing else should be merged before this exists.*
2. **Foundation** (nav, mobile menu, footer, tokens, type scale) — parallel, unblocks everything.
3. **Homepage, Explore, product/agent pages** — parallel, each consuming the feasibility contract.
4. **New routes** (`/how-it-works/`, `/get-started/`, trust pages, `/status/`) — parallel, authored
   content only.
5. **Integration**: release truth across README/STATUS/manifests/site, then the full gate run.

**The one thing that cannot be parallelised and must not be skipped:** the real product recording.
It needs a real machine, a real agent, a real install and a real removal. It is a half-day of
recording and editing, and the page does not ship without it.
