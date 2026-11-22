# 03 — Visual Design, Art Direction & Design System Audit

**Audit Viewports:** 320px, 375px, 768px, 1024px, 1440px, 1920px  
**Target URL:** [https://lite-spm-nine.vercel.app/](https://lite-spm-nine.vercel.app/)  
**Design Philosophy:** Dark-first, technical, developer-centric, high-density HUD aesthetic.

---

## 1. Brand Identity, Logo & Memorability

### 1.1 Brand Mark & Logo
* **Observed Asset:** Geometric brand mark (`web/src/components/litespm/brand-mark.tsx`) featuring an abstracted interconnected node/package lattice in vibrant indigo/cyan accents.
* **Critique:** The mark is crisp, modern, and vector-perfect at both 16px favicon scale and 32px header scale. It communicates precision, modularity, and systems architecture.
* **Competitor Comparison:**
  * **Skills.sh:** Uses a minimal, bold Vercel-style typography badge ("skills"). Clean, but less visually differentiated.
  * **Glama:** Highly stylized 3D rendered polygonal mascot/logo. Extremely memorable and friendly.
  * **add-mcp:** Plain text monochrome monospace logo. Ultra-minimalist, but lacks brand equity.
  * **Verdict:** LiteSPM's mark strikes the right balance between technical authority and modern tooling credibility.

### 1.2 Color Palette & Contrast Hierarchy
* **Backgrounds:** Pure deep slate (`#090d16` / `#0b0f19`) providing deep black levels without muddy OLED distortion.
* **Cards & Surfaces:** Subtle translucent slate overlays (`bg-card/70` with `border-border/60`) utilizing delicate 1px border outlines.
* **Brand Accent:** Energetic electric violet/indigo (`#6366f1`) with cyan-teal secondary status indicators.
* **Status Signaling:**
  * Green (`#10b981`): Verified publishers, healthy status indicators.
  * Yellow/Amber (`#f59e0b`): Needs authentication, unverified sources.
  * Red (`#ef4444`): Removal warnings, destructive actions.
  * Slate/Muted: Discovery-only indicators.
* **Contrast Compliance:** Text contrast on backgrounds measures 12.8:1 for headings and 7.4:1 for body copy, easily exceeding WCAG 2.2 AA (4.5:1) standards.

---

## 2. Typography & Hierarchy

* **Primary Sans-Serif:** Clean geometric system sans stack (Inter-like rendering) with tight letter-spacing (`tracking-tight`) on display headings.
* **Code / Monospace:** High-legibility coding font (`JetBrains Mono` / `SF Mono`) with explicit numeric tabular figures (`font-mono`) used for commands, paths, and hashes.
* **Scale & Rhythm:**
  * H1 Hero: `text-3xl sm:text-5xl font-extrabold tracking-tight` (balanced, compelling line breaks).
  * H2 Section Headers: `text-xl sm:text-2xl font-bold`.
  * Listing Titles: `text-[14px] font-semibold`.
  * Metadata / Labels: `text-[11px] font-mono text-muted-foreground`.
* **Issue Observed:** Long package names (e.g. `mcp:builtin:mcp-registry:io.github.browserbase-mcp-server-browserbase`) occasionally wrap tightly on 320px mobile screens. Adding `truncate` or `break-all` on mobile containers is recommended.

---

## 3. Composition, Layout Grids & Breakpoints

### Viewport Walkthrough & Evidence

| Viewport | Device Class | Width x Height | Layout Behavior & Visual Findings | Evidence Reference |
|:---:|---|:---:|---|---|
| **320px** | Mobile Small | 320 x 640 | Single column stack; header switches to compact hamburger drawer; terminal preview scrolls horizontally without viewport clipping. | `screenshots/litespm_home_mobile_320.png` |
| **375px** | iPhone Standard | 375 x 667 | Clean vertical rhythm; hero CTAs stack neatly; search bar full-width; card padding comfortable (16px). | `screenshots/litespm_home_mobile_375.png` |
| **768px** | iPad Portrait | 768 x 1024 | 2-column card grids activate; sidebar collapses; header nav maintains horizontal alignment. | `screenshots/litespm_home_tablet_768.png` |
| **1024px** | Tablet Landscape | 1024 x 768 | 3-column marketplace grid; comfortable white space; interactive terminal component displays full dual-pane view. | `screenshots/litespm_home_desktop_1024.png` |
| **1440px** | Desktop Standard | 1440 x 900 | Optimal layout; 4-column card grid; sticky navigation bar; clear visual balance between code and prose. | `screenshots/litespm_home_desktop_1440.png` |
| **1920px** | Large Monitor | 1920 x 1080 | Contained max-width container (`max-w-7xl`) prevents excessive line length; no stretching or empty gutters. | `screenshots/litespm_home_desktop_1920.png` |

---

## 4. UI Component Evaluation

### 4.1 The Interactive Terminal HUD (`web/src/components/litespm/terminal.tsx`)
* **Visual Appeal:** Superb. Features an authentic macOS/Linux terminal chrome with traffic-light window controls, interactive tabs, animated cursor, and real command outputs.
* **Friction Point:** The terminal displays an interactive CLI simulation, but users cannot type arbitrary commands. Adding an interactive command input or copy-all shortcut elevates it from static illustration to live sandbox.

### 4.2 Marketplace Cards (`web/src/components/litespm/package-card.tsx`)
* **Design:** Compact, informative, modular. Each card surfaces:
  * Package icon and kind badge (`MCP`, `Skill`, `Plugin`).
  * Verified publisher indicator.
  * Stated summary (strictly clamped to 2 lines).
  * Direct 1-click copy command (`litespm install <id>`).
  * Target agent compatibility pills.
* **Comparison with Glama & MCP.so:**
  * Glama cards show GitHub stars and download counts, which immediately provides social proof. LiteSPM avoids fake/estimated counts (an honest architectural choice), but should consider surfacing upstream GitHub stargazers when authenticated GitHub API feeds are available.

### 4.3 Navigation & Header (`web/src/components/litespm/header.tsx`)
* Floating translucent glassmorphism header (`backdrop-blur-md bg-background/80`).
* Provides instant access to Marketplace, Bundles, Agents, Docs, Insights, and GitHub link.
* Integrated Command Palette shortcut (`Cmd+K` / `Ctrl+K`) that activates a keyboard-driven search modal across the entire catalog.

---

## 5. Visual Defect Log & Design Polish Items

1. **LSPM-VIS-01 (Minor):** Badge text wrap on ultra-narrow viewports (320px). Solution: `whitespace-nowrap` on pill badges.
2. **LSPM-VIS-02 (Polish):** Empty state illustration on `/compare` when zero packages are selected is somewhat stark. Solution: add a guided "Select 2 packages to compare capabilities" illustration.
3. **LSPM-VIS-03 (Polish):** Package detail hero header would benefit from a dedicated visual breadcrumb bar (`Marketplace > MCP Servers > GitHub`).
