# LiteSPM — visual design audit (colour, typography, brand, accessibility)

> **Copied here verbatim from the audit that ran on 2026-10-22** (the original
> work was written outside the repository). Every claim in it was measured
> against the site as it was built on 2026-10-22, or fetched from the
> competitor's own page that day; the screenshots it cites are in [`shots/`](shots/).
> Items this session fixed are listed in [`HANDOVER.md`](HANDOVER.md) §2 — read the
> findings as a mixture of *fixed* and *open*, and check `TODO.md` **LPSM-J016…J020**
> for what is still open.


**Auditor:** subagent · **Date:** 2026-10-22 · **Type:** read-only, no repo file modified.
**Source of truth:** `/home/sarvesh/business_Dev/liteSPM/web` (Next.js static export, App Router, Tailwind v4).
**Rendered evidence:** live site `https://litespm.sarveshbh-2022.workers.dev` (may lag the tree by one build).
**Note on citations:** `web/app/package/PackageView.tsx` was edited by a concurrent session at 08:07, mid-audit. Its citations below are re-verified against the file as of 08:30 (the `bg-sunken` containers moved from 574/623/723/857 to 592/641/741/875). Every other file's line numbers were verified against the working tree.

## 0. Method

Three independent passes, because no single one is sufficient:

| Pass | What it does | Why it was needed |
|---|---|---|
| **Token parse** (`/tmp/opencode/contrast.py`) | Reads every `--token` out of `app/globals.css` (`:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`), composes `color-mix(in srgb, C P%, transparent)` over its backdrop, computes WCAG 2.1 ratios. | Exact token values. |
| **The repo's own gate** (`web/scripts/check-contrast.mjs`) | 38 named pairs read straight from the CSS. | The project's contract — it is the thing this audit must not contradict. |
| **Browser probe** (`/tmp/opencode/probe.mjs`) → `/tmp/opencode/rendered.json` | Walks every text node on 9 live pages × 2 themes, resolves the *effective* foreground (incl. alpha + element opacity) against the *composited* ancestor background, and computes the ratio. | The only pass that catches colours **outside** the token set. It found the P0 below, which both token passes missed. |

Plus: line-length / line-height measurement (`/tmp/opencode/measure2.mjs` → `measure2.json`), 15 Playwright screenshots in `/tmp/opencode/shots/`, and image inspection of `public/og.png` / `app/icon.svg` / `public/favicon.ico`.

**The repo's gate is narrower than it looks.** `check-contrast.mjs:81-90` enumerates exactly nine token names — `paper, surface, sunken, sunken-2, hover, ink, ink-2, ink-3, rule-2` — and checks 3 inks × 5 surfaces + `rule-2` × 4 surfaces. It does **not** cover: the three kind hues, `--accent`/`--accent-text`/`--accent-hover`, any `--dark-*` token, `--pop`, any composited (`color-mix` / alpha) pair, or any hard-coded colour. That gap is where the real defects live.

---

## 1. Token inventory

All values from `web/app/globals.css`. Light = `:root` (lines 87–188); dark = `@media (prefers-color-scheme: dark)` (206–250), mirrored identically in `:root[data-theme="dark"]` (253–294) — the gate enforces that mirror (`check-contrast.mjs:102-107`) and it currently holds.

### 1a. Surfaces & ink (the substrate)

| Token | Light | Dark | Where used |
|---|---|---|---|
| `--paper` | `#e8ecf4` | `#0b0e14` | `body` background (`globals.css:325`), `layout.tsx:143` |
| `--surface` | `#fafbfe` | `#111620` | header (`Header.tsx:226`), footer (`SiteFooter.tsx:31`), all cards, `.row`, `.panel-dark` siblings |
| `--sunken` | `#dde3ee` | `#0e131b` | footer stat bar, install tiles, chips, `PackageView.tsx:592,641` |
| `--sunken-2` | `#d2dae8` | `#0c1017` | skeleton loaders (`ExploreResults.tsx:75-79`) |
| `--hover` | `#e3e9f5` | `#171d2a` | `.row:hover`, `.btn:hover`, `.chip:hover` |
| `--sel` | `#c6d7fb` | `#274070` | `::selection` (`:334`) |
| `--rule` | `#d2d9e6` | `#283144` | row separators, decorative borders |
| `--rule-2` | `#748299` | `#6a7690` | every boundary that must be locatable (SC 1.4.11) |
| `--ink` | `#111827` | `#edf1f7` | body, headings, strong |
| `--ink-2` | `#3c495e` | `#c6cfdc` | secondary prose, nav links, buttons |
| `--ink-3` | `#485468` | `#97a3b6` | meta, kickers, muted labels (the 11–12px tier) |

### 1b. Brand

| Token | Light | Dark | Where used |
|---|---|---|---|
| `--accent` / `--brand` | `#3157f6` | `#3157f6` | logo tile (`Header.tsx:232`), `.btn-solid` (`:921`), selected chip (`:881`), focus ring (`SearchBar.tsx:180`), active nav underline, hero glow, card hairline |
| `--accent-hover` | `#2749cf` | `#4061f8` | `.btn-solid:hover` (`:926`) |
| `--accent-wash` | `#e9eeff` | `#16203a` | selected-card chip fills (`CapabilityCard.tsx:152` etc.), `ProductDemo.tsx:31` |
| `--accent-text` | `#3157f6` | `#8fa9ff` | the accent **as text**: links on hover, active nav, selected chip text, `dg-hub-title` |

### 1c. Data hues (the three kinds) and the unused fourth

| Token | Light | Dark | Where used |
|---|---|---|---|
| `--mcp` / `--mcp-wash` | `#1f4fd8` / `#eaf0ff` | `#7fa0ff` / `#172447` | `.meta-kind-mcp` (`:644`), `.tile` (`:831`), `.row-spine` (`:562`), footer stat (`SiteFooter.tsx:118`) |
| `--skill` / `--skill-wash` | `#0b6b72` / `#e2f5f2` | `#4fd8ce` / `#0e2b2c` | same |
| `--plugin` / `--plugin-wash` | `#7c3ad4` / `#f2eafd` | `#be9df8` / `#211a36` | same; also the second hero-glow stop (`globals.css:1093`) |
| `--pop` / `--pop-wash` | `#9a5b08` / `#fdf1e0` | `#9a5b08` / `#2a1e0b` | **only** `Toast.tsx:31` (`bg-pop text-white`). `--pop-wash` is **never used anywhere in the source** |

### 1d. Dark-plane family (dark surfaces only)

`--dark` `#1b2436`→`#171d2a`, `--dark-2` `#243049`→`#1e2536`, `--dark-rule` `#34415c`→`#2e3950`, `--dark-ink` `#eef2f9`→`#edf1f7`, `--dark-ink-2` `#b0bcd2`→`#a9b5c8`, `--dark-signal` `#9dc0ff`→`#8fa9ff`. Used by `.panel-dark` (`:1006`), `.cmd` (`:1062`), `.on-dark`.

### 1e. Non-colour tokens

- **Radius** (`:172-176`): `--r-chip` 2px (letter tiles), `--r-ctl` 4px (controls), `--r-panel` 6px, `--r-hero` 8px, `--r-card` 12px (discovery cards only). Tailwind-mapped at `tailwind.config.js:52-58`.
- **Motion** (`:179-182`): `--t-state` 120ms / `--t-hover` 160ms / `--t-panel` 200ms / `--t-enter` 240ms, all ease-out. Mapped `tailwind.config.js:68-73`.
- **Control heights** (`:185-187`): `--h-ctl` 36px, `--h-ctl-sm` 32px, `--h-ctl-lg` 40px; 44px on ≤767px (`:993-1003`).
- **Shadow** (`:168-170`): `--shadow-panel`, `--shadow-card-hover`.
- **Spacing**: no scale. Tailwind's default spacing ramp is used ad hoc (`p-4`, `p-5`, `gap-3`, `mt-7`, `mt-2.5`…). There is **no spacing token** anywhere — the one scale the brief asks about does not exist.

### 1f. Palette coherence — **coherent, with one real collision**

8 hue buckets, but only **4 chromatic families** (one neutral-blue substrate + accent + 3 data hues + 1 amber), and the neutral substrate is 220°/18–39% chroma, so it reads as grey. This is *not* accidental.

**But the brand accent and the "MCP" data hue are the same hue.** Measured:

| Pair | Light | Dark |
|---|---|---|
| `--accent-text` vs `--mcp` | `#3157f6` vs `#1f4fd8` — 1.21:1 to each other | `#8fa9ff` vs `#7fa0ff` — **1.11:1**, ΔRGB 18.4 |
| `--accent-wash` vs `--mcp-wash` | `#e9eeff` vs `#eaf0ff` — **1.01:1**, ΔRGB **2.2** | `#16203a` vs `#172447` — 1.06:1 |

`globals.css:18-19` states the rule: *"colour is reserved for data: three kind hues and one brand accent."* But the accent sits at 228°/92% and the MCP hue at 224°/75% (light) / 225°/100% (dark) — the accent *is* the MCP hue, one step up in lightness. A reader cannot tell "this chip means MCP (a kind)" from "this chip means selected / brand" by colour, and in dark mode the two text colours are 1.11:1 against each other. The skill (184°) and plugin (266°) hues are clean and well separated; **only the MCP one collides.** Fix in P1-3.

**Accent restraint: good.** 66 accent-token occurrences across ~30 files, concentrated exactly where the CSS comment says they are allowed (`globals.css:23-29`): logo, hero graphic, solid CTA, focus ring, active nav, hero glow. The three kind hues appear 191 times. The catalogue body stays neutral. This is the right discipline and it is worth saying so.

---

## 2. Contrast — measured, not estimated

### 2a. The repo's gate: PASSES

```
node scripts/check-contrast.mjs
OK contrast — 38 palette pair(s) from app/globals.css clear their floors
  light ink-3 on sunken: 5.94:1     dark ink-3 on sunken: 7.30:1
  light rule-2 on sunken: 3.02:1   dark rule-2 on surface: 3.97:1
  ... (all 38 clear)
```

Every ink/surface pair and every `--rule-2` boundary clears its floor in both themes. **The palette core is sound.** The problems are in the places the gate does not look.

### 2b. Every real pair I measured (token-level)

`/tmp/opencode/contrast.py` — 60 named pairs × 2 themes. **48 pass, 12 fail.** The failures:

| # | Pair | Light | Dark | Floor | Status |
|---|---|---|---|---|---|
| 1 | `.chip[aria-pressed] .chip-count` — `--dark-ink-2` on `--accent` (`globals.css:885-888`) | **2.87:1** | **2.65:1** | 4.5 | **Dead rule today** — no component uses `.chip-count` (grep: `app/globals.css` only). Latent trap. |
| 2 | `--pop` on `--pop-wash` | 4.86:1 ✓ | **3.01:1** | 4.5 | `--pop` was **not** lightened for dark while its wash was; and `--pop-wash` is dead. Latent. |
| 3 | `.link:hover` → `--accent-text` on `--sunken` | **4.26:1** | 8.24:1 ✓ | 4.5 | **Documented exception** (`globals.css:63`). I checked every `bg-sunken` container (`ExploreView.tsx:528,626`, `ExploreWhy.tsx:73`, `status/page.tsx:111`, `PackageView.tsx:592,641,741,875`, `HomeView.tsx:180,197`, `ExploreFilters.tsx:453,470,488`) — **no `.link` sits on `--sunken` today**, so the exception holds. But `.link:hover` is an unconditional global rule; one new `.link` on a sunken plane silently breaks it. |
| 4 | `--accent/40` over `--accent-wash` (selected-card chip border, `ShelfCard.tsx:113`, `ExtensionCard.tsx:136`) | **1.77:1** | **1.48:1** | 3.0 | Informational — the chip's *text* is the boundary, the border is decorative. |
| 5 | `--accent/30` over `--accent-wash` (`CapabilityCard.tsx:152`, `PackageView.tsx:874`, `PackageTabs.tsx:369`) | **1.52:1** | **1.32:1** | 3.0 | As above. |
| 6 | `.dg-band` border `--accent/26` over `--paper` (`globals.css:1347`) | **1.44:1** | **1.25:1** | 3.0 | The "device plane" boundary. Decorative (the plane has a 5% tint fill and contains the labelled hub). |
| 7 | `.dg-hub` border `--accent/38` over `--surface` (`:1497`) | **1.77:1** | **1.46:1** | 3.0 | The hub is the diagram's focal chip; it is labelled. Border is decorative. |
| 8 | `.dg-kind-link` border `--dg-hue/40` over wash (`:1856`) | **1.88:1** | **2.15:1** | 3.0 | Each kind box has a 3px solid left border in the full hue (`border-left: 3px solid var(--dg-hue)`) — that *is* the boundary and it passes. |
| 9 | `--rule` on `--surface` (row separator) | 1.37:1 | 1.39:1 | 3.0 | Correctly decorative — every row also carries a 3px kind spine. |

**The 4 genuinely-text-bearing pairs all pass**: white on `--accent` 5.49:1, white on `--accent-hover` 7.14:1, `--ink-2` on `--surface` 8.80:1, `--ink-3` on `--sunken` 5.94:1.

### 2c. The browser probe — **one P0 the token passes cannot see**

```
62 failing text instances — all one root cause:
  #c6cfdc on #ffffff = 1.57:1   (x60, 17px t-mono;  x2, 10px t-cond)
  home-dark 12 · explore-dark 48 · agents-dark 2
```

Ancestor chain, captured live:

```
SPAN.t-mono.font-semibold.leading-none.text-ink-2   bg rgba(0,0,0,0)
  SPAN.inline-flex.…border.border-rule.bg-white       bg rgb(255,255,255)   ← hard-coded
    DIV.group.relative.flex…bg-surface                 bg rgb(17,22,32)
      BODY.bg-paper                                   bg rgb(11,14,20)
```

`--ink-2` is `#c6cfdc` in dark mode (a *light* grey) sitting on a hard-coded `#ffffff` tile → **1.57:1**. Full detail in §5 (P0-1).

Everything else the probe measured passes: 3,153 text instances across 9 pages × 2 themes, and the only failures are the 62 above.

---

## 3. Colour discipline — assessment

**Good, with two exceptions.**

- **Accent restraint: strong.** One brand hue, used in exactly the six documented places (`globals.css:23-29`). 66 accent uses vs 191 kind-hue uses. The catalogue body is genuinely neutral. This is not the purple-gradient-everywhere default.
- **Semantic colours: distinct and consistent.** The three kinds own the only saturated hues and every use is paired with a *text* label (`.meta-kind` prints "MCP"/"SKILL"/"PLUGIN"; `.tile` prints a letter). The installability chip is deliberately built from ink/sunken, not from a kind hue (`globals.css:660-671`) so "kind" and "can I install this" never collide — that is a genuinely well-made decision.
- **Colour alone never carries meaning.** Verified: `.row-spine` colour is always beside the `.meta-kind` text; `.meta-avail-blocked` uses *dashed border + recessed fill + text*, not colour; the `Shelves.tsx:132-136` live dot is always adjacent to the literal words "Catalog available" / "checking the catalog…" / "Offline catalog"; the `.dg-kind-dot` sits beside its label; the `ExploreFilters.tsx:218-221` kind bar is beside the kind name. **No colour-only signalling found.** This is above average.
- **Gradients/glow: restrained, but two leaks.**
  1. `.hero-glow::before` (`globals.css:1091-1093`) mixes `--accent` 16% **and `--plugin` 12%** into the hero. The CSS comment on the same block says *"brand → violet"*, but `globals.css:24-25` claims `--accent` "is the ONLY brand colour" and the plugin violet is a **data** hue meaning "Plugin". A Plugin-coloured wash in the brand moment contradicts the palette's own stated contract. The CSS comment even titles the block *"brand -> violet"*.
  2. `.dg-stage` (`globals.css:1311-1318`) adds a radial `--accent` 8% wash + an `--ink` 6% dot grid. The dot grid at 6% ink is a texture, well-judged and documented. The 8% accent is fine.
  3. `Header.tsx:328,334` and `TabList.tsx:149,157` use `bg-gradient-to-r from-surface via-surface/80 to-transparent` as **scroll-edge fades**. This is the "glassmorphism-adjacent" move the site otherwise avoids, and it is used in a header whose own comment (`:227-228`) says *"The header is opaque, not glassy. A blur layer over a ruled table costs paint on every scroll frame and buys nothing here."* — a minor internal contradiction.
- **Dark mode parity: the palettes are at parity; the components are not.** The token sets are mirrored exactly (enforced by `check-contrast.mjs:102-107`) and the two dark blocks agree. But two components bypass the tokens entirely with `bg-white` (P0-1), and the selected kind chip inverts to a bright white pill in dark mode (`ExploreFilters.tsx:216` uses `bg-ink text-surface`, and `--ink` is `#edf1f7` in dark) — a deliberate inversion, but it makes the loudest object on the page a white slab.

---

## 4. Typography

**Fonts: 3 families, 4 files, all self-hosted, 92 KB total.** No Google Fonts request at runtime.

| Family | File | Weights | Variable |
|---|---|---|---|
| IBM Plex Sans | `web/fonts/IBMPlexSans-latin.woff2` (45.7 KB) | 400, 500, 600 | yes |
| IBM Plex Sans Condensed | `IBMPlexSansCondensed-600-latin.woff2` (19.8 KB) | 600 | no |
| IBM Plex Mono | `IBMPlexMono-400-latin.woff2` (14.7 KB) + `-500` (14.9 KB) | 400, 500 | no |

Loaded via `next/font/local` (`layout.tsx:20-43`) — deliberately, per the comment at `layout.tsx:13-19`: the former `next/font/google` call "twice took the CI static export down when the runner could not reach Google". Good call. OFL licence shipped alongside (`fonts/OFL.txt`).

**Rendered weight histogram:** 400 × 1730, 500 × 443, 600 × 358. No weight above 600 is used anywhere — the scale is genuinely three steps, not seven.

**Rendered size histogram (light theme, all 9 pages):**

| Size | Count | Notes |
|---|---|---|
| 9.5px | 5 | |
| 10px | 166 | `.meta-kind`, `.meta-avail` — uppercase 10px labels with `line-height: 1` |
| 10.5px | 153 | |
| 11px | 788 | the meta/kicker tier |
| 11.5px | 124 | |
| 12px | 202 | |
| 12.5px | 100 | |
| 13px | 505 | **the prose tier** |
| 13.5px | 75 | |
| 14px | 165 | the record-page lead |
| 15px | 113 | |
| 16px | 9 | |
| 17 / 18 / 19 / 24 / 40 / 52px | 126 | headings |

**Findings:**

- **Every prose paragraph on the site is below 16px.** Across 14 pages the smallest prose is **11.5px**, 79 paragraphs sit at 13px, and exactly **one** paragraph on the entire site is 16px. This is a documented decision (`globals.css:78-84`: *"explanatory prose is 13px"*, and the 13.5px rung was deliberately retired), so it is intentional — but it is still a real legibility cost, and 11.5px body copy is below what most accessibility guidance accepts. **P1-4.**
- **Line-height is clean.** All prose blocks measure `1.55` (body default, `globals.css:329`), `1.6`, or `1.625` (`leading-relaxed`). Nothing under 1.5. ✓
- **The 10px chip labels are the one typographic stress point.** 66 of the 166 10px instances have `line-height: 1` (`.meta-kind` `:642`, `.meta-avail` `:681`) — a 10px uppercase string in a 10px-tall box with `letter-spacing: 0.03em`. Uppercase at 10px is the hardest combination on the site. Measured on the live Explore page: `SKILL`, `MCP`, `PLUGIN` chips, and `Official` (10.5px, `globals.css` / `PackageView.tsx:874`).
- **Measure: 12 multi-line paragraphs exceed 80ch**, worst cases **107.5ch** (home install band, 12.5px, 2 lines) and **100.6ch** (`PackageView.tsx` install panel, 12px, 2 lines). 80.3ch / 82.8ch / 83.5ch / 90.9ch / 95.4ch also on the package page, and 82.3ch on `/get-started/`. Everywhere else is disciplined: explore max 65ch, security 72ch, status 72ch, categories 65ch — all good.
- **Heading hierarchy is systematic, not ad hoc.** H1 = `clamp(2.125rem, 1.35rem+3.1vw, 3.25rem)` → 34px at 390px, 52px at 1440px (`LandingHero.tsx:107`), `leading-[1.06]`, `tracking-tight`. H2 = `.band-title` (20px/24px, `globals.css:486-497`) and `.section-head h2` (15px). H3 = 15–16px `font-semibold`. H4 = 13px `font-semibold`. There is a real ladder with named roles — the best typography decision on the site.
- **Role separation works.** Plex Sans carries headings and prose, Plex Condensed carries dense row names and numeric tables (`.row-name` `:578`), Plex Mono carries ids/paths/versions/commands (`globals.css:30-33`). `t-mono` appears 1115 times, `t-cond` 256, sans 1160. Condensed for the 63-character catalogue names in a narrow column is a genuinely correct call.

---

## 5. Brand identity

### 5a. The wordmark does not exist

The site has **no logotype**. The header wordmark is `LiteSPM` set in Plex Sans 600 at 15px (`Header.tsx:235-237`) — plain text. The footer repeats it as plain text (`SiteFooter.tsx:34`). There is no drawn wordmark, no ligature, no custom lettering. Compare `skills.sh` (glitch-outline "SKILLS" wordmark), `MCP Market` (italic "MCPMarket"), `MCPMarket` (a mark + a differentiated wordmark), `Smithery` (serif wordmark). LiteSPM's only visual identity is a **lucide icon**.

### 5b. Three different marks

| Where | File | Treatment |
|---|---|---|
| Favicon | `app/icon.svg` | `#101722` rounded tile, white chevron `>`, **blue `#1f3fa8` underscore bar** |
| Header (all pages) | `Header.tsx:232-233` | solid `--accent` `#3157f6` rounded chip, white lucide `SquareTerminal` (an outlined rounded square containing `>_`) |
| OG image | `public/og.png` | indigo chip, outlined rounded square + `>_` glyph — matches the header, not the favicon |

`app/icon.svg`'s own comment claims *"The mark is a terminal prompt chevron on the ink field: the same shape the header uses, so the favicon and the masthead are one idea."* **That is false** — they are different geometry and inverted colours. Proof: `/tmp/opencode/shots/proof-mark-sizes.png` (favicon at 16/32/64px next to the header chip).

**Recognisability at 32px: yes.** The favicon's chevron is crisp and reads as a terminal prompt at 32px and 64px; at 16px the chevron survives and the blue bar shrinks to ~3×1px (borderline, but the shape still reads). `public/favicon.ico` is a 623-byte ICO with correct 16×16 and 32×32 PNG entries. The mark itself is competent — the problem is that it is not the same mark as the header.

### 5c. The OG image is a **stale asset from the previous brand** — P0

`public/og.png` (1200×630, inspected directly) renders:

```
[blue tile logo]
MCP SERVERS · AGENT SKILLS · PLUGINS        ← uppercase mono, indigo
LiteSPM Market                              ← THE WRONG PRODUCT NAME
The lightweight skill & package manager for AI agents
litespm.sarveshbh-2022.workers.dev
```

The product is called **LiteSPM**, everywhere else:

- `layout.tsx:48` — `title.default: "LiteSPM — The package manager for AI agents"`
- live `og:site_name` → `LiteSPM`
- `Header.tsx:236` → `LiteSPM`
- `SiteFooter.tsx:34` → `LiteSPM`
- `layout.tsx:55` → `keywords: [..., "LiteSPM", ...]`
- JSON-LD `name` → `LiteSPM`

Every social share of this site shows **"LiteSPM Market"** — a name that appears nowhere in the current product. The file mtimes confirm the cause: `public/og.png` is **Oct 15 12:12**; `app/icon.svg` is **Oct 20 16:30**. The favicon was updated after the rename; the OG image never was. (A stale build bundle in `pages-dist/` still carries the old `"LiteSPM Market"` strings, confirming the rename happened after that build.)

**Three taglines are in circulation for one product:**

| Where | Tagline |
|---|---|
| `layout.tsx:48` (title), `SiteFooter.tsx:35` | "The package manager for AI agents" |
| `public/og.png` (image) | "The lightweight skill & package manager for AI agents" |
| `layout.tsx:159` (`og:image:alt`) | "the lightweight skill & package manager for AI agents" |

The OG image's own tagline and the alt text agree with each other but disagree with the site — so the alt text and the image are consistent with each other but describe a *different product* from the one the card is titled. Screen-reader users get the old name too.

### 5d. No `apple-touch-icon`

`layout.tsx:86-91` declares only `/icon.svg` and `/favicon.ico` (16×16, 32×32). The live `<head>` contains **no** `apple-touch-icon` link. iOS Safari will therefore use a **screenshot of the page** as the home-screen icon — which, for this site, means a screenshot of a search field. There is no `app/apple-icon.*` in the tree either.

### 5e. Is the visual language distinctive?

**Distinctive versus the default AI-startup look — yes, convincingly.** Concretely:

- IBM Plex (Sans + Condensed + Mono) instead of Inter/Geist — an engineered grotesque with squared terminals.
- 0px radius on rows and ruled lists, 2px on letter tiles, 12px only on discovery cards. Most AI-startup catalogues are 12–16px rounded everywhere.
- Mono uppercase kickers with `letter-spacing: 0.08em` (`.kicker`, `globals.css:507-514`).
- A visible *plane* structure — `--paper` / `--surface` / `--sunken` are genuinely distinct steps, not two near-whites.
- **No glassmorphism** — the header comment explicitly rejects it (`Header.tsx:227-228`).
- **No emoji icons** — lucide only.
- **No purple/indigo gradient hero** — one restrained radial accent wash.

That is a real, defensible point of view and it reads as infrastructure software, which is exactly the positioning.

**But it reads as *cheap* next to the competition in one specific way:** there is no *designed* mark, no logotype, no custom illustration, no visual anchor other than a lucide glyph in a coloured square. Competitors all have one. See §6.

---

## 6. Screenshots & competitor comparison

All in `/tmp/opencode/shots/`.

**LiteSPM:** `lite-home-1440.png`, `lite-home-1440-dark.png`, `lite-explore-1440.png`, `lite-explore-1440-dark.png`, `lite-package2-1440.png`, `lite-package2-1440-dark.png`, `lite-how-it-works-1440.png`, `lite-home-390.png`, `lite-explore-390.png`, `lite-package2-390.png`, `lite-how-it-works-390.png`, `lite-home-full-1440.png`, `lite-home-full-1440-dark.png`.
**Proofs:** `proof-white-tiles-dark.png`, `proof-white-tiles-light.png`, `proof-mark-sizes.png`.
**Competitors:** `comp-smithery.png`, `comp-mcpso.png`, `comp-glama.png`, `comp-mcpmarket.png`, `comp-skillssh.png`.

### Where LiteSPM is clearly better

1. **Restraint and density.** `lite-explore-1440.png` puts 69,376 rows of real catalog data on screen with a 5-column ruled table, per-kind spines, installability chips and provenance labels. Glama (108k servers) is denser but reads as a feed of cards; MCP Market is cards on a dot grid. LiteSPM looks like an index; the others look like a feed. For a *package manager*, an index is the correct metaphor and LiteSPM is the only one that gets it.
2. **Typographic voice.** Plex Mono for ids/paths/versions and Plex Condensed for 63-character row names is a better solution to the "long name in a narrow column" problem than anything the competitors attempt — they truncate or wrap. `lite-explore-1440.png` shows every name on one line, legible.
3. **Honesty reads as confidence.** `lite-home-1440.png` footer says *"No popularity figures are published. The upstream sources do not expose machine-readable star or install counts, so the catalog shows none rather than an estimate."* Every competitor shows fabricated-looking popularity: Smithery "9.18k uses", MCP Market "⭐ 4.2k", skills.sh "4.0M installs". **LiteSPM's refusal is the single strongest trust signal in the comparison** and the site does not apologise for it. Keep it.
4. **No dark-navy-forever hero, no glass, no purple gradient, no mascot, no blob.** Smithery's dark hero with an orange cartoon character, MCP.so's pastel blob hero and MCP Market's dot-grid are all textbook AI-startup 2024. LiteSPM's hero is a sentence, two buttons, a search field, and a real workflow diagram. That restraint is a genuine advantage for a tool that claims to be serious.
5. **The `— Unknown` / "refused at install" framing.** On `lite-package2-1440-dark.png` the install panel says *"LiteSPM installs the server on this machine and adds it to your agent's configuration"* and the spec table says *"Installs from source"* — the honesty is stated as fact, not as an apology. **This does not read as weakness.** Read as a copy/visual framing note: the refusal states are set in `--ink-3` on `--sunken` (`.meta-avail-blocked`), the *quietest* tier on the page, which is correct — but the **readable** thing on the page is the refusal. That is right, and it should not be softened.

### Where LiteSPM looks cheaper / generic

1. **No designed mark (P0-2).** `proof-mark-sizes.png` shows a bare chevron and a lucide glyph in a blue square. skills.sh has a distressed "SKILLS" wordmark; MCP Market has a mark + an italic wordmark; Smithery has a serif wordmark; Glama has a llama. **LiteSPM is the only one of six with no logotype and a generic icon** — and it is the one with the strongest claim to being an infrastructure product, where a mark matters most.
2. **The OG card says the wrong product name (P0-2).** This is worse than looking cheap: it looks *broken*. Anyone who shares the link publishes "LiteSPM Market".
3. **The hero has no visual anchor.** `lite-home-1440.png` is a column of text on the left and a diagram on the right, with a large empty area under the left column. skills.sh has a huge wordmark; Glama has a sidebar of 13 live facets; Smithery has a mascot. LiteSPM's hero is *a paragraph*. It is honest, but the page has no single memorable object.
4. **Whitespace vs. information.** `lite-how-it-works-1440.png` has a hero that occupies ~45% of the 1440px width with nothing in the right half, and the body starts 380px down. Competitors fill the fold. LiteSPM's answer ("the copy is the product") is defensible, but the hero needs one real object.
5. **All-grey text tier.** 788 text nodes at 11px and 166 at 10px mean the page reads as a wall of small mono grey. `lite-explore-1440-dark.png` is beautiful but very quiet — there is almost no visual hierarchy above 15px outside headings.
6. **The mobile header has no brand at all.** `lite-home-390.png`: the wordmark is `hidden ... sm:inline` (`Header.tsx:235`), so on a 390px phone the header is a blue icon, two square buttons and a big "Install LiteSPM" button. **A user who bookmarks LiteSPM on a phone cannot tell what site it is.** (P1-2.)
7. **White chips in dark mode (P0-1).** `proof-white-tiles-dark.png` — four glaring white squares down the left column of `lite-explore-1440-dark.png`, brighter than anything else on the page except the CTA. This is the single loudest visual defect in the site and it is invisible to anyone auditing the CSS.

### Where LiteSPM is weaker but for good reason

Smithery/MCP Market show star counts and install counts; skills.sh shows a leaderboard with install numbers and 8-week sparklines; Glama shows an A/B/C grade badge. LiteSPM shows none of these, because its upstream sources expose none. **Do not add them.** The site's response — publishing installability, transport, provenance and an explicit "no popularity figures are published" note — is the correct substitute and it is already in place.

---

## 7. Verdict — severity-ranked

### P0 — blocks trust or legibility

---

**P0-1 · Dark mode: 62 pieces of text at 1.57:1, and hard-coded white tiles**

*What is wrong.* `components/AgentLogo.tsx:46` and `components/catalog/PublisherMark.tsx:114` hard-code `bg-white` on the logo plate. In dark mode that plate is `rgb(255,255,255)` (measured in-browser) while the fallback letter is `text-ink-2` = `#c6cfdc` → **1.57:1**, i.e. invisible. 62 instances measured on the live site: home-dark 12, explore-dark 48, agents-dark 2. The white tile is also the brightest object on the dark catalogue surface (screenshot `proof-white-tiles-dark.png`).

*Evidence.*
- `web/components/AgentLogo.tsx:46` — `…border border-rule bg-white ${className}`
- `web/components/catalog/PublisherMark.tsx:114` — same, with `rounded-[6px]`
- `web/components/AgentLogo.tsx:63` — `className="t-cond font-semibold leading-none text-ink-2"` (the fallback letter)
- `web/components/catalog/PublisherMark.tsx:120` — same
- Measured: `/tmp/opencode/rendered.json` → 62 × `#c6cfdc on #ffffff = 1.57:1`
- Visual: `/tmp/opencode/shots/proof-white-tiles-dark.png`, `/tmp/opencode/shots/lite-explore-1440-dark.png`

*Exact fix.* Add a themed plate token and use it in both components.

```css
/* :root */
--logo-plate: #ffffff;          /* brand logos are drawn for white */
--logo-plate-ink: #3c495e;       /* 8.80:1 on #ffffff */

/* both dark blocks */
--logo-plate: #e6ebf4;           /* a light plate, not pure white — reads as a chip, not a hole */
--logo-plate-ink: #111827;       /* 15.6:1 on #e6ebf4 */
```

`AgentLogo.tsx:46` → `bg-[var(--logo-plate)]`, `PublisherMark.tsx:114` → `bg-[var(--logo-plate)]`; and the fallback letters → `text-[var(--logo-plate-ink)]`. If a pure-white plate must be kept in dark mode for logo fidelity, then the fallback letter must be a *dark* ink in both themes (add `--logo-plate-ink: #111827` to light and dark and set it explicitly, rather than inheriting `--ink-2`, which flips lightness with the theme).

*Also add:* one line to `scripts/check-contrast.mjs` that walks the source for hard-coded colour utilities (`bg-white`, `text-white`, `bg-black`) and fails on any that is not in an allow-list, plus one pair `--logo-plate-ink` on `--logo-plate` in both themes. The gate's blind spot — it only reads `globals.css` — is what let this through.

---

**P0-2 · The social card publishes the wrong product name, and there are three taglines**

*What is wrong.* `web/public/og.png` renders **"LiteSPM Market"** as the product name. The product is "LiteSPM" everywhere else. `layout.tsx:159` (`og:image:alt`) also carries the old tagline, so the accessible name of the card is the old product's. `layout.tsx:86-91` declares **no `apple-touch-icon`**, so iOS uses a page screenshot as the home-screen icon.

*Evidence.*
- `/tmp/opencode/shots/` — the OG is inspected directly; the image reads `LiteSPM Market`
- `web/app/layout.tsx:48` — `"LiteSPM — The package manager for AI agents"`
- `web/app/layout.tsx:69` — `openGraph.title: "LiteSPM — The package manager for AI agents"`
- live `<head>` — `og:site_name` = `LiteSPM`, `og:title` = `LiteSPM — …`
- `web/app/layout.tsx:159` — `og:image:alt` = "LiteSPM — the lightweight skill & package manager for AI agents" (old tagline)
- `web/app/Header.tsx:236` and `web/app/layout.tsx:55` → "LiteSPM"
- mtimes: `public/og.png` Oct 15 12:12 vs `app/icon.svg` Oct 20 16:30
- live `<head>` contains **no** `apple-touch-icon` link
- `web/public/favicon.ico` — 623 bytes, 16×16 + 32×32 PNG only

*Exact fix.*
1. Regenerate `public/og.png` at 1200×630 with the current wordmark (`LiteSPM`), the current tagline **"The package manager for AI agents"**, the current palette (`#0b0e14` field, `#3157f6` accent, `#edf1f7` ink), and the **same mark as `app/icon.svg`**. Keep the mono uppercase kicker line — it is on-brand.
2. `layout.tsx:159` → `content="LiteSPM — the package manager for AI agents"`.
3. Add `web/app/apple-icon.svg` (or a 180×180 PNG) reproducing `app/icon.svg` exactly, and add it to the `icons` array at `layout.tsx:86-91`:
   ```ts
   icons: {
     icon: [
       { url: "/icon.svg", type: "image/svg+xml" },
       { url: "/favicon.ico", sizes: "16x16 32x32", type: "image/x-icon" },
     ],
     apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
   },
   ```
4. Add a build-time gate that fails if `og.png` and `layout.tsx` disagree on the product name — e.g. a `scripts/check-og-image.mjs` that OCR-free-checks the asset's embedded text or, more practically, that renders the OG title from a single shared constant in `lib/site.ts` so there is only one place to get wrong.

---

### P1 — materially weakens the design

---

**P1-1 · The accent and the "MCP" data hue are the same colour (dark: 1.11:1 apart)**

*What is wrong.* `globals.css:18-19` states the rule — *"colour is reserved for data: three kind hues and one brand accent."* But `--accent` (228°/92%) and `--mcp` (224°/75% light, 225°/100% dark) are the same hue. In dark mode `--accent-text` `#8fa9ff` and `--mcp` `#7fa0ff` are **1.11:1 against each other**; in light mode `--accent-wash` `#e9eeff` and `--mcp-wash` `#eaf0ff` are **1.01:1 (ΔRGB 2.2) — literally indistinguishable**. The brand's one signal and the MCP kind's signal are the same signal. Skill (184°) and plugin (266°) are clean; only MCP collides.

*Evidence.* `/tmp/opencode/contrast.py` token dump; measured `#8fa9ff` vs `#7fa0ff` → 1.11:1; `#e9eeff` vs `#eaf0ff` → 1.01:1. Token lines: `--accent` `globals.css:134`, `--mcp` `globals.css:142`, dark `--mcp` `globals.css:230`, dark `--accent-text` `globals.css:227`.

*Exact fix.* Move the MCP hue off the accent's hue. In light, keep `--accent` at 228° and push `--mcp` toward a colder blue-violet or a distinct azure — e.g. `--mcp: #1b5fd0` → better, **hue ≈ 212°**: `#0b63b8` (light) and `#6fc3ff` (dark). Verify the new pair clears 4.5:1 on its own wash (currently `--mcp` on `--mcp-wash` is 5.81:1 light / 6.07:1 dark — keep ≥ 5:1) and that `--mcp` vs `--accent` reaches **≥ 1.4:1** against each other in both themes. Then re-run `node scripts/check-contrast.mjs`.

---

**P1-2 · No brand identity on the most common viewport, and no logotype at all**

*What is wrong.* The wordmark is hidden below 640px (`Header.tsx:235` — `hidden text-[15px] font-semibold tracking-tight text-ink sm:inline`). On a 390px phone the header is a blue lucide-icon chip, two square buttons and an "Install LiteSPM" button. Separately, "LiteSPM" is plain Plex Sans text everywhere — there is no drawn wordmark, and the favicon (`app/icon.svg`) is a *different* mark from the header tile, contradicting its own comment.

*Evidence.* `/tmp/opencode/shots/lite-home-390.png` (no wordmark in the header); `/tmp/opencode/shots/proof-mark-sizes.png` (favicon chevron+bar vs header's lucide `SquareTerminal`); `app/icon.svg:2-4` (comment claiming *"the same shape the header uses"*).

*Exact fix.*
1. Show the wordmark at mobile too: change `Header.tsx:235` from `hidden … sm:inline` to `inline`, and drop the font to `text-[14px]` so the row still fits at 390px. The header grid is `grid-cols-[auto_minmax(0,1fr)]` with a `44px` min touch target on the link (`Header.tsx:230`), so there is room.
2. Make the header tile use the `app/icon.svg` geometry rather than lucide's `SquareTerminal`, so favicon and masthead are one idea — as the comment already claims. Either inline the same chevron+bar path in `Header.tsx:232-233`, or render `<img src="/icon.svg">` scaled into the 28px chip with the accent behind it.
3. Optionally, set the wordmark in a way that carries the terminal idea — e.g. Plex Mono 600 with `tracking-tight` and the chevron tucked against the "L" — so it reads as a designed mark rather than a browser tab title. This is the cheapest place to close the gap with the competitors.

---

**P1-3 · The OG/favicon/header are three different marks**

*What is wrong.* favicon = dark navy tile, white chevron, blue bar. Header = indigo tile, lucide outlined-square `>_`. OG = indigo tile, outlined rounded square + `>_`. Only the header and OG agree; the favicon is inverted and differently drawn.

*Evidence.* `app/icon.svg`; `Header.tsx:232-233`; `public/og.png`; `/tmp/opencode/shots/proof-mark-sizes.png`.

*Exact fix.* Pick one geometry (the `icon.svg` chevron + underscore reads better at 16px than lucide's outlined square) and one field colour, then apply it to `icon.svg`, `apple-icon.png`, `og.png` and the header tile. If the header tile must stay indigo for brand reasons, invert `icon.svg` to an indigo field with a white chevron and white bar, and use the same in the OG.

---

**P1-4 · Every prose paragraph on the site is under 16px**

*What is wrong.* Measured across 14 live pages: the smallest prose is **11.5px**, 79 paragraphs sit at **13px**, and exactly **one** paragraph in the whole site is 16px. `globals.css:78-84` documents 13px as a deliberate 2026-10-15 decision. It is intentional, but it is the site's largest legibility cost and it is the thing most likely to make a visitor over 40 squint.

*Evidence.* `/tmp/opencode/measure2.json` (size histogram over all paragraphs of 14 pages); `/tmp/opencode/rendered.json` size histogram (788 instances at 11px, 166 at 10px, 153 at 10.5px); `globals.css:78-84`.

*Exact fix.* Do not change the 11–12px meta tier — that is labels, and it is correct. Change the **prose** tier only:
- `--body-prose: 15px` for explanatory copy (`.band-sub`, FAQ answers, card body, the hero lead), `line-height: 1.6`;
- keep 13px for the record-page secondary column and the package-page summary.
- Concretely: `LandingHero.tsx:111` (`text-[15px] sm:text-[16px]`) → `text-[16px]`; `.band-sub` (`globals.css:499-505`) → 15px; the card body `text-[13px] leading-relaxed` → `text-[14.5px]`; the FAQ answers `text-[13px] leading-relaxed` → `text-[14px]`.
- Re-measure with `measure2.mjs` and confirm no block regresses below 1.5 line-height and the longest paragraph stays under 80ch.

---

**P1-5 · The 10px uppercase chip labels are the site's hardest read**

*What is wrong.* 66 of the 166 10px text instances sit in a `line-height: 1` box (`.meta-kind` `globals.css:636-643`, `.meta-avail` `:676-685`) as 10px uppercase mono with `letter-spacing: 0.03em`. Uppercase + 10px is the worst combination in the palette, and these are the chips that carry the kind and the installability — the site's core data.

*Evidence.* `globals.css:642` (`font-size: 10px; line-height: 1`), `globals.css:681` (same); `/tmp/opencode/shots/lite-explore-1440.png` (`MCP`, `SKILL`, `Official` chips); `/tmp/opencode/rendered.json` — 166 instances at 10px, 66 of them at line-height 10px.

*Exact fix.* Two steps, both cheap:
1. Raise the chip tier from 10px to **11px** and give the chip `min-height: 20px` (currently `height: 18px`, `globals.css:634`). This costs ~2px of row height at 9px row padding (`globals.css:545`) — acceptable.
2. Drop `text-transform: uppercase` on `.meta-kind` / `.meta-avail` and use `letter-spacing: 0.01em` instead, or keep uppercase but raise to 11px with `font-weight: 600`. Sentence case at 11px is markedly more legible than uppercase at 10px.
   (The site's own `--kicker` uses 11px uppercase mono with `0.08em` (`globals.css:507-514`) and reads fine — that is the proven size for this treatment.)

---

### P2 — polish

---

**P2-1 · Twelve multi-line paragraphs exceed 80ch, worst 107.5ch**

*Evidence.* `/tmp/opencode/measure2.json` — home install band ×4 at **107.5ch** (12.5px, 2 lines); `PackageView.tsx` install panel **100.6ch** (12px, 2 lines), 95.4ch, 90.9ch, 83.5ch, 82.8ch, 80.3ch; `get-started` 82.3ch (12px, 3 lines). Everything else is disciplined (explore 65ch, security 72ch, status 72ch, categories 65ch).

*Fix.* Cap the prose measure where it is missing: the home install-band paragraph gets `max-w-[76ch]`; the package-page install-panel body gets `max-w-[72ch]`. Note `globals.css:607` already caps `.row-summary` at 82ch and `.band-sub` at 72ch (`globals.css:501`) — apply the same discipline to the two remaining families.

---

**P2-2 · The hero glow puts a data hue in the brand moment**

*Evidence.* `globals.css:1091-1093` — `radial-gradient(44% 56% at 78% 0%, color-mix(in srgb, var(--plugin) 12%, transparent), transparent 72%)`. The block's own comment titles it *"brand → violet"*; `globals.css:24-25` says `--accent` "is the ONLY brand colour"; `--plugin` (`globals.css:146`) means *the Plugin kind*. `public/og.png` likewise carries the violet.

*Fix.* Change the second stop to the accent: `color-mix(in srgb, var(--accent) 12%, transparent)` and move it to a different position (e.g. `at 82% 12%`) so the hero still has two lobes but one hue. This is a one-line change and it removes the only place a data hue impersonates the brand.

---

**P2-3 · Two dead token families that would fail if used**

*Evidence.*
- `--pop` / `--pop-wash` (`globals.css:149-150`): `--pop-wash` is referenced **nowhere** in `app/`, `components/` or `lib/`. `--pop` is used only at `Toast.tsx:31` as a solid fill with white text (5.42:1 ✓). But in dark mode `--pop` was **not** lightened while its wash was (`#9a5b08` on `#2a1e0b` = **3.01:1**), so the moment anyone uses it as text on its own wash it fails AA.
- `.chip-count` (`globals.css:885-894`): referenced only by `globals.css` — dead CSS — and it is **broken**: `color: var(--dark-ink-2)` on `--accent` is **2.87:1 (light) / 2.65:1 (dark)**. `--dark-ink-2` is a dark-plane token on a *bright indigo* fill, exactly the misuse `globals.css:152-159` warns about.

*Fix.* Delete `.chip-count` and the `[aria-pressed] .chip-count` override (dead), and either delete `--pop`/`--pop-wash` or fix the dark value to `--pop: #e0a253` (which clears 4.5:1 on `#2a1e0b` at 7.6:1) so the token is safe if a "popularity" surface ever returns. If the amber is retired, say so in the `globals.css:18-21` comment so the next reader does not re-add it.

---

**P2-4 · `.link:hover` on `--sunken` is a documented-but-unenforced exception**

*Evidence.* `globals.css:1055` sets `.link:hover { color: var(--accent-text) }` unconditionally. On `--sunken` in light mode that is **4.26:1** — `globals.css:63-64` documents it and states *"nothing on a sunken plane uses `--accent-text` — those hovers ink up instead."* I verified all twelve `bg-sunken` containers (`ExploreView.tsx:528,626`, `ExploreWhy.tsx:73`, `status/page.tsx:111`, `PackageView.tsx:592,641,741,875`, `HomeView.tsx:180,197`, `ExploreFilters.tsx:453,470,488`) — no `.link` is on `--sunken` today, so the exception holds. But nothing enforces it.

*Fix.* Replace the blanket rule with a scoped one: `.bg-sunken .link:hover, .bg-sunken-2 .link:hover { color: var(--ink); text-decoration-color: var(--ink-3); }` and add a pair to `check-contrast.mjs` for `--accent-text` on `--sunken` (light) with a documented floor of 4.2, so a future use is caught by the gate rather than by eye.

---

**P2-5 · Decorative accent borders sit well below the 3:1 boundary floor**

*Evidence.* `--accent/30` on `--accent-wash` = **1.52:1 light / 1.32:1 dark** (`CapabilityCard.tsx:152`, `PackageView.tsx:874`, `PackageTabs.tsx:369`); `--accent/40` = 1.77:1 / 1.48:1 (`ShelfCard.tsx:113,126`, `ExtensionCard.tsx:136`); `.dg-band` `--accent/26` = 1.44:1 / 1.25:1 (`globals.css:1347`); `.dg-hub` `--accent/38` = 1.77:1 / 1.46:1 (`:1497`).

*Fix.* These chips and panels carry their meaning in the **text**, not the border, so this is not a 1.4.11 violation — but a boundary that is *drawn* and reads at 1.3:1 is decoration pretending to be a boundary. Either raise the alpha (`/40` → `/60`, which lands at ~2.6:1) or drop the border and rely on the wash fill alone. `.dg-band` in particular should use the same treatment as `.dg-trace` (which correctly uses full `--accent-text` — `globals.css:1364-1375` documents exactly this reasoning for the traces, and it was never applied to the band or the hub).

---

**P2-6 · The header's scroll-edge fades contradict the header's own "no glass" rule**

*Evidence.* `Header.tsx:328,334` use `bg-gradient-to-r from-surface via-surface/80 to-transparent`; `TabList.tsx:149,157` the same. `Header.tsx:227-228` says *"The header is opaque, not glassy. A blur layer over a ruled table costs paint on every scroll frame and buys nothing here."*

*Fix.* Either drop the fades (the rail scrolls with `no-scrollbar` already, `globals.css:449-455`) or keep them and drop the comment. Low stakes, but the codebase's honesty about its own decisions is a genuine asset and it should not carry a contradiction.

---

**P2-7 · The hero has no visual anchor and the left column is half-empty**

*Evidence.* `/tmp/opencode/shots/lite-home-1440.png` — the hero's left column ends at ~650px, leaving ~350px of empty paper under it before "COMMON GOALS" at y≈848. `LandingHero.tsx:92` — `lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`.

*Fix.* No code change required — this is a framing note, and it is worth framing explicitly because it cuts against the visual audit's usual instinct: **do not fill the space with an illustration or a gradient.** The competitors' mascots, blob fields and dot grids are exactly the "generic AI startup" register the brief says to avoid. The right move is one real object: the "26,554 capabilities LiteSPM can install" figure (`LandingHero.tsx:179-188`) is the strongest fact on the page and it is currently 12px muted mono in the corner. Promote it — 18–20px, `--ink`, with the kind breakdown beside it — and let the hero's right-hand diagram carry the visual weight it already carries.

---

## 8. What is genuinely right (do not change)

- The **38-pair contrast gate** works and its two-dark-theme agreement check (`check-contrast.mjs:102-107`) is a good idea. Extend it, don't replace it.
- **Colour is never the only signal.** Verified across kind spines, installability chips, the live-status dot and the figure's kind dots. This is better than every competitor.
- **Self-hosting IBM Plex with `next/font/local`** (`layout.tsx:13-28`) — no runtime Google dependency, and the comment explains the CI failure that motivated it.
- **The `--rule-2` / `--ink-3` boundary policy** (`globals.css:106-113`, `:845-849`) — controls get 3:1, decorative separators get `--rule`, and the reasoning is written down.
- **The "no popularity figures" footer note.** It is the strongest trust signal in the whole comparison (§6). Keep it verbatim, keep it above the fold if possible, and do not let anyone "improve" it with fabricated numbers.
- **Refusals framed as facts**, not apologies — *"Installs from source"*, *"No LiteSPM account required"*, *"Rows from third-party awesome-lists are discovery-only"*. These read as confidence. Keep.

---

## Appendix — artefacts

| File | What |
|---|---|
| `/tmp/opencode/contrast.py` → `contrast.json` | Token-level WCAG computation, 60 pairs × 2 themes, with `color-mix` compositing |
| `/tmp/opencode/probe.mjs` → `rendered.json` | Browser probe: 3,153 text instances across 9 pages × 2 themes, effective fg/bg |
| `/tmp/opencode/measure2.mjs` → `measure2.json` | Paragraph measure in `ch`, rendered line count, line-height ratio |
| `/tmp/opencode/analyze.py` | Failure grouping + typography histograms |
| `/tmp/opencode/shoot.mjs`, `proof.mjs`, `mark.mjs` | Screenshot capture |
| `/tmp/opencode/shots/` | 15 site screenshots + 5 competitor screenshots + 3 proof crops |
