# LiteSPM visual identity audit — current-site follow-up

- **Date:** 2026-10-22
- **Source reviewed:** repository at `eaa44f7`
- **Rendered site:** `https://litespm.sarveshbh-2022.workers.dev/` (current routes checked; deployment commit itself is not exposed)
**Scope:** identity, color semantics, typography, contrast, and responsive layout on `/`, `/explore/`, `/how-it-works/`, `/agents/`, `/submit/`, and a package page. Screenshots are in [`shots/`](shots/) with the `visual-current-` prefix.

## Verdict

LiteSPM has a coherent, technical visual language: locally hosted IBM Plex, restrained indigo, neutral ruled catalog rows, legible light/dark surfaces, and no generic mascot/gradient treatment. The homepage cleanup makes the primary task easier to find. The old audit's P0s around the dark logo plates and stale social card are resolved.

**No current P0 visual defect found.** The strongest remaining issue is that the mobile masthead hides the product name. The desktop home hero also retains a visibly empty grid track after its demo was removed. Explore is notably dense on mobile, and the source facet exposes named directory feeds despite the earlier request not to name them on the site.

## System inventory

| Role | Current tokens / values | Assessment |
|---|---|---|
| Surfaces | Light `--paper #e8ecf4`, `--surface #fafbfe`, `--sunken #dde3ee`; dark `#0b0e14`, `#111620`, `#0e131b` | Clear plane separation in both themes; the screenshots read as a product index, not a generic card feed. |
| Brand | Indigo `--accent #3157f6` in both themes; dark text accent `--accent-text #8fa9ff` | Restrained and consistent in the header, primary CTA, and focus treatment. |
| Kind/status hues | MCP `#1f4fd8` / dark `#7fa0ff`; skill `#0b6b72` / `#4fd8ce`; plugin `#7c3ad4` / `#be9df8`; amber toast `#9a5b08` | Five semantic chromatic roles are declared, but brand and MCP collapse into nearly the same blue family (finding below). |
| Type | IBM Plex Sans 400/500/600; Plex Sans Condensed 600; Plex Mono 400/500, self-hosted | Strong technical voice and useful role separation for prose, dense names, and machine-readable values. |
| Motion | Reduced-motion rules present in `globals.css:1194-1261` and `2143-2157` | Good: animation is not forced on readers who request reduced motion. |

`node web/scripts/check-contrast.mjs` passed **44 token pairs**. Text pairs clear 4.5:1 and tested boundaries clear 3:1 in light and dark. At 1440×900 and 390×844, all six audited routes had no horizontal overflow. Mobile controls inspected were generally 44px high. The current browser-regression CI run for `eaa44f7` is green.

## Findings

### P1 — mobile masthead hides the product name

`web/components/navigation/Header.tsx:235-237` — `LiteSPM` is `hidden` below the `sm` breakpoint. At 390px the visible identity is only a 28px terminal tile; the browser measurement confirms the wordmark's computed display is `none`. The CTA says “Install LiteSPM”, but that is not a persistent masthead identity.

**Evidence:** [`visual-current-home-390.png`](shots/visual-current-home-390.png).
**Recommendation:** keep the wordmark visible at narrow widths; the measured header has room between the 44px mark and the search/theme/install controls. Recheck at 320px.

### P1 — Explore exposes named source feeds in the public UI

`web/app/explore/ExploreFilters.tsx:353-368` renders each source's public label directly in the Source select. The live menu includes names of other directories/catalogs. This conflicts with the user's standing instruction not to name the feeds the catalog uses in website copy.

**Recommendation:** use neutral source-family labels in the public facet, or remove the facet if its only useful labels identify those feeds. Preserve required provenance in the internal data/entry record only where the product's trust contract requires it; do not imply that LiteSPM authored third-party entries.

### P2 — the hero allocates an unused desktop column

`web/components/home/LandingHero.tsx:89-201` still declares a 3fr/2fr two-column grid, but it has one child after `ProductDemo` was removed. On the live 1440px page the measured tracks are 791px + 527px while the grid has one child; the right-hand 38.5% track is blank. The composition looks accidental rather than intentionally editorial.

**Evidence:** [`visual-current-home-1440.png`](shots/visual-current-home-1440.png), [`visual-current-home-dark-1440.png`](shots/visual-current-home-dark-1440.png).
**Recommendation:** remove the unused track and deliberately size the remaining content/search, or introduce only real product evidence if the page needs a second column. Do not add a decorative illustration just to fill space.

### P2 — brand and MCP are perceptually too close

`web/app/globals.css:145-154,241-248` — current contrast math gives dark `--accent-text #8fa9ff` vs `--mcp #7fa0ff` **1.11:1**; the light accent/MCP washes are **1.01:1** apart, dark washes **1.06:1**. This is not a WCAG text-contrast failure, and the interface also uses labels; it is a semantic color-separation weakness. A selected/brand state and an MCP-kind state can look like the same blue cue.

**Recommendation:** move the MCP family farther from indigo, or strengthen its non-color distinction. Re-run the contrast gate and retain explicit “MCP” labels; never rely on hue alone.

### P2 — the hero's secondary glow uses the plugin data hue

`web/app/globals.css:1102-1117` — the brand hero glow's second stop is `var(--plugin)` at 12%, even though the palette contract at `globals.css:18-29` reserves that hue for plugin-kind data and calls indigo the only brand color. It is subtle in the screenshot, but the semantic contract is inconsistent.

**Recommendation:** use a second accent tint or remove the second stop; keep plugin violet exclusive to plugin meaning.

### P2 — explanatory copy remains compact on reading pages

The rendered body default is 14px (`web/app/globals.css:347-354`), while `band-sub` is 14px (`:522-527`) and most sampled copy on `/how-it-works/` and `/submit/` is 13px. The home hero lead is 16px desktop and 15px mobile (`LandingHero.tsx:108-110`). Contrast is strong and line-height is comfortable, so this is not a contrast defect; it is a legibility tradeoff in long-form instructions.

**Recommendation:** keep 10–12px metadata compact, but raise long-form explanatory paragraphs to 14–16px where space permits, especially on `/submit/` and `/how-it-works/`.

### P2 — the submit page explains constraints but gives no new-listing action

`web/app/submit/page.tsx:55-79,104-113` — the only issue link is framed for correcting an existing listing; the PR link is framed for changing a source already in the catalog. A publisher arriving with a new server, skill, or plugin has no concrete next step from the page.

**Recommendation:** add a specific new-listing path (for example, a prefilled issue template or documented PR template) and state what information to include. Keep the no-paid-placement/no-endorsement promise.

## Responsive measurements

| Route | 1440×900 | 390×844 | Notes |
|---|---:|---:|---|
| Home | 1430px document width, 3849px page height | 380px width, 7817px page height | No horizontal overflow; 34px mobile / 52px desktop H1. Mobile brand issue above. |
| Explore | 1430px width | 380px width, 9205px page height | Five filters stack above results; the first result row begins just below the initial viewport. Dense, but no clipping. |
| How it works | 1430px width | 380px width, 6591px page height | Two-column step cards become a readable single column. |
| Agent hosts | 1430px width | 380px width, 8632px page height | Table becomes stacked records; counts remain visible and no sideways scroll occurs. |
| Submit | 1430px width | 380px width, 3084px page height | Article measure is comfortable; prose is small (13px). |
| Package | 1430px width | 380px width, 5768px page height | Install command wraps within its panel and copy control remains visible. |

## Resolved from the original audit

- Dark logo fallback plates now use explicit plate/ink tokens; the contrast gate checks them in all themes.
- The social card now says “LiteSPM — The package manager for AI agents”; the favicon, Apple touch icon, header, and OG art use the same terminal mark/palette.
- The home page is shorter and coherent with its three-step workflow; `ProductDemo` is gone rather than duplicating the steps.
- Dark theme explicitly sets `color-scheme: dark`; `theme-color` matches the surface, and both dark token blocks agree.

## Evidence files

- Desktop/mobile screenshots: [`shots/visual-current-home-1440.png`](shots/visual-current-home-1440.png), [`shots/visual-current-home-390.png`](shots/visual-current-home-390.png), [`shots/visual-current-home-dark-1440.png`](shots/visual-current-home-dark-1440.png), plus the current Explore, agents, how-it-works, submit, and package screenshots in the same folder.
- Source token gate: `web/scripts/check-contrast.mjs` — 44 pairs passed on the reviewed tree.
- Browser measurements: Playwright on the live site at 1440×900 and 390×844; checks included font loading, document width, header height, visible wordmark, and page headings.
