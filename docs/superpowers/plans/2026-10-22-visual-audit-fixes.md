# Visual Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every finding in `docs/audits/2026-10-22/visual-identity-followup.md` without exposing competitor feed names or adding decorative hero content.

**Architecture:** Keep the current site structure and address the findings at their existing seams: public source labels, the shared header and home hero, design tokens, long-form copy, and the submit route. Preserve source IDs and filter behavior internally while rendering neutral source-family names publicly; submit new listings through a GitHub issue form that only requests review of a published artifact.

**Tech Stack:** Next.js 15 static export, React 19, Tailwind CSS 4, Playwright, GitHub issue-form YAML.

**Spec:** `docs/audits/2026-10-22/visual-identity-followup.md`

## Global Constraints

- Do not name competitor catalog feeds in public site copy.
- Keep source IDs and source-filter URL behavior intact; neutralize displayed labels rather than inventing provenance.
- Do not add decorative filler to the home hero; remove its unused desktop track and constrain the real content.
- Keep explicit MCP labels; color must not be the only way to identify an entry kind.
- Raise explanatory long-form copy to at least 14px where space permits; keep metadata compact.
- New listing submissions open a prefilled GitHub issue form; no backend or paid-placement promise is added.

## Review Focus

- A newly added or unknown source ID must not reveal its raw feed name publicly; test known feed IDs and unknown-ID fallback in Task 1.
- The visible wordmark and complete install CTA must fit at 320px without horizontal page overflow; test the narrowest navigation viewport in Task 2.
- MCP and brand colors must be measurably distinct in both themes while text/wash contrast remains accessible; test computed token separation in Task 3 and run the contrast gate.
- The neutral hero glow must not reuse the plugin hue, and the removed grid track must not return; test computed hero styles in Tasks 2–3.
- Issue-form CTA, requested listing details, and no-purchase/no-endorsement language must agree; test the rendered page and the committed YAML in Task 5.

---

### Task 1: Neutral public source labels

**Files:**
- Modify: `web/lib/catalog.ts`
- Test: `web/tests/catalog-source-labels.spec.ts`
- Test: `web/tests/filters.spec.ts`

**Interfaces:**
- Consumes: `sourceLabel(id: string | null | undefined): string` and `sourceFacets(items)`.
- Produces: the same public helper and source filter values, with family-level display labels and a generic fallback for unknown IDs.

- [ ] **Step 1: Write failing tests**
  - Assert known directory/list IDs render neutral family labels rather than named feeds.
  - Assert an unknown source ID renders `Catalog source`, not its raw ID.
  - Assert the Source control still offers options and selecting one continues to filter and round-trip its source ID through the URL.
- [ ] **Step 2: Run the tests and verify they fail for exposed labels/raw fallback.**
- [ ] **Step 3: Update `SOURCE_LABELS` and `sourceLabel` in `web/lib/catalog.ts`; preserve source IDs and filter logic.**
- [ ] **Step 4: Run the focused browser tests and confirm labels are neutral while source filtering still works.**
- [ ] **Step 5: Commit as `fix(web): neutralize public source labels`.**

### Task 2: Mobile wordmark and single-column hero

**Files:**
- Modify: `web/components/navigation/Header.tsx`
- Modify: `web/components/home/LandingHero.tsx`
- Test: `web/tests/navigation.spec.ts`
- Test: `web/tests/home-conversion.spec.ts`

**Interfaces:**
- Consumes: the existing shared `Header` and `LandingHero` markup.
- Produces: an always-visible compact `LiteSPM` wordmark and a single-column hero content block capped at a readable measure.

- [ ] **Step 1: Add failing browser assertions** for the wordmark at 320px, no horizontal overflow with the full CTA, and a one-column/max-width hero content block at desktop width.
- [ ] **Step 2: Run those assertions against the current built site and confirm the wordmark/hero checks fail.**
- [ ] **Step 3: Keep the product name visible at narrow widths and remove the unused 3fr/2fr hero grid, using a deliberate max-width for the actual content.**
- [ ] **Step 4: Rebuild and run the focused tests at 320px and desktop width.**
- [ ] **Step 5: Commit as `fix(web): restore mobile wordmark and reclaim hero width`.**

### Task 3: Separate brand and MCP color roles

**Files:**
- Modify: `web/app/globals.css`
- Test: `web/tests/visual-identity.spec.ts`

**Interfaces:**
- Consumes: the existing light, media-dark, and explicit-dark token blocks and `.hero-glow` pseudo-element.
- Produces: a distinct blue-cyan MCP family with accessible washes, and a brand-only hero glow.

- [ ] **Step 1: Add failing browser assertions** for brand/MCP separation in light and explicit dark themes, and for a single accent-only hero radial gradient.
- [ ] **Step 2: Run the tests and confirm the current dark MCP/accent pair and plugin-colored glow fail.**
- [ ] **Step 3: Update the MCP hues/washes consistently in both dark token blocks and remove the plugin hue from `.hero-glow`. Keep MCP text labels unchanged.**
- [ ] **Step 4: Run the focused browser test and `npm --prefix web run lint` (including the contrast gate).**
- [ ] **Step 5: Commit as `fix(web): separate MCP and brand color roles`.**

### Task 4: Improve long-form reading size

**Files:**
- Modify: `web/components/layout/InfoPage.tsx`
- Modify: `web/app/submit/page.tsx`
- Modify: `web/app/how-it-works/page.tsx`
- Modify: `web/app/how-it-works/WalkthroughFrame.tsx`
- Test: `web/tests/visual-identity.spec.ts`

**Interfaces:**
- Consumes: existing information-page prose, walkthrough descriptions, captions, and transcript.
- Produces: 14px explanatory paragraphs on `/submit/` and `/how-it-works/`, without enlarging metadata, controls, or code.

- [ ] **Step 1: Add failing browser assertions** for representative long-form paragraphs on both routes to compute to at least 14px.
- [ ] **Step 2: Run the tests and confirm the existing 13px/13.5px prose fails.**
- [ ] **Step 3: Raise prose classes to 14px in the named files; leave metadata and command text at their current sizes.**
- [ ] **Step 4: Rebuild and run the focused typography tests at desktop and mobile widths.**
- [ ] **Step 5: Commit as `fix(web): improve long-form reading size`.**

### Task 5: Add a new-listing GitHub issue form

**Files:**
- Create: `.github/ISSUE_TEMPLATE/new-listing.yml`
- Modify: `web/app/submit/page.tsx`
- Test: `web/tests/submit-listing.spec.ts`

**Interfaces:**
- Consumes: `REPO_URL`, `/submit/`, and GitHub's `.github/ISSUE_TEMPLATE/<name>.yml` issue-form convention.
- Produces: a `New listing` CTA to `REPO_URL/issues/new?template=new-listing.yml`; a form requesting type, name, source URL, and type-specific verification/install details.

- [ ] **Step 1: Add failing tests** for the `/submit/` CTA and copy, plus the issue-form fields and the no-paid-placement/no-endorsement statement.
- [ ] **Step 2: Run the tests and confirm the CTA and template are missing.**
- [ ] **Step 3: Add the GitHub issue form and update `/submit/` to explain what to prepare and that an issue requests review but does not itself add a listing.**
- [ ] **Step 4: Rebuild, run the focused tests, and run the full web browser suite, type-check, lint/contrast gate, and build.**
- [ ] **Step 5: Commit as `feat(web): add new listing submission form`.**
