#!/usr/bin/env node
// Gate: every ink/surface pair this palette prints clears WCAG AA.
//
// The axe run in the browser suite (`tests/a11y.spec.ts`) checks the contrast
// of the pages it visits. It cannot check the *palette*: it only sees the
// combinations that happen to occur on those pages, and it says nothing about
// a token that is darkened or a surface that is added.
//
// This gate reads the token values straight out of `app/globals.css` — so the
// numbers it checks are the numbers the browser uses — and holds every ink on
// every surface at 4.5:1 (WCAG 2.2 SC 1.4.3), and every boundary at 3:1
// (SC 1.4.11) on the surfaces it bounds.
//
// The pairs are named, not inferred: a palette is allowed to have a
// documented exception, and an exception that is not written down is a
// violation nobody is looking at.
//
// Usage: node scripts/check-contrast.mjs [--root <dir>]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);

function fail(message) {
  console.error(`FAIL contrast — ${message}`);
  process.exit(1);
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The palette, read out of the stylesheet.
 *
 * The light theme is the `:root` block; the dark theme is the `prefers-color-
 * scheme: dark` block that follows it. Both declare the same token names, so
 * the first declaration of each name in each block is the one that applies.
 */
function readPalette(css) {
  const rootStart = css.indexOf(":root {");
  if (rootStart === -1) fail("app/globals.css has no :root block");
  const rootEnd = css.indexOf("\n  }", rootStart);
  const light = css.slice(rootStart, rootEnd);

  const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
  if (darkStart === -1) fail("app/globals.css has no dark-theme block");
  const dark = css.slice(darkStart, css.indexOf("\n    }", darkStart));

  // The EXPLICIT dark theme: `:root[data-theme="dark"]`. A reader who uses
  // the manual toggle gets these tokens, not the media-query ones — so this
  // block has to satisfy the same floors. The gate used to read only the
  // media-query block, so a divergence between the two dark themes passed
  // here and reached the reader as unreadable text.
  const explicitStart = css.indexOf(':root[data-theme="dark"]');
  if (explicitStart === -1) fail("app/globals.css has no explicit dark-theme block");
  const explicit = css.slice(explicitStart, css.indexOf("\n  }", explicitStart));

  const pick = (block, name) => {
    const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    return match ? match[1] : null;
  };

  const names = [
    "paper",
    "surface",
    "sunken",
    "sunken-2",
    "hover",
    "ink",
    "ink-2",
    "ink-3",
    "rule-2",
  ];
  const out = {};
  for (const name of names) {
    out[name] = { light: pick(light, name), dark: pick(dark, name), explicit: pick(explicit, name) };
    if (!out[name].light) fail(`the light palette has no --${name}`);
    if (!out[name].dark) fail(`the dark palette has no --${name}`);
    if (!out[name].explicit) fail(`the explicit dark theme has no --${name}`);
    // The two dark themes are supposed to declare the same values, and
    // globals.css says so in a comment. When they drift, the reader who
    // toggles the theme by hand gets a different palette from the reader
    // whose system is dark — so a divergence is a defect, not a style choice.
    if (out[name].dark.toLowerCase() !== out[name].explicit.toLowerCase()) {
      fail(
        `--${name} is ${out[name].dark} in the prefers-color-scheme block and ` +
          `${out[name].explicit} in the :root[data-theme="dark"] block; the two dark themes must agree`
      );
    }
  }
  return out;
}

/**
 * The pairs that must hold, and the floor each one has.
 *
 *   text   SC 1.4.3 — 4.5:1 for body text.
 *   border SC 1.4.11 — 3:1 for a boundary that has to be locatable.
 *
 * Every ink token is checked against every surface it is printed on. The
 * muted ink (`--ink-3`) is the one that was close to the floor: it measured
 * 4.77:1 on `--sunken` and 4.37:1 on `--sunken-2`, so the muted text had
 * 0.27 of a point of headroom on one surface and none on another.
 */
const TEXT_FLOOR = 4.5;
const BORDER_FLOOR = 3;

/** Surfaces the muted text is printed on. */
const TEXT_SURFACES = ["paper", "surface", "sunken", "sunken-2", "hover"];

function main() {
  const css = readFileSync(path.join(webRoot, "app", "globals.css"), "utf8");
  const palette = readPalette(css);

  const failures = [];
  const report = [];

  for (const theme of ["light", "dark"]) {
    const p = (name) => palette[name][theme];

    for (const ink of ["ink", "ink-2", "ink-3"]) {
      for (const surface of TEXT_SURFACES) {
        const measured = ratio(p(ink), p(surface));
        report.push(
          `${theme} ${ink} on ${surface}: ${measured.toFixed(2)}:1`
        );
        if (measured < TEXT_FLOOR) {
          failures.push(
            `${theme} --${ink} on --${surface} is ${measured.toFixed(2)}:1, under the ${TEXT_FLOOR}:1 floor`
          );
        }
      }
    }

    // The boundary colour has to be locatable where it bounds something that
    // has to be found — 3:1 (SC 1.4.11). `--rule-2` used to measure 2.99:1 on
    // `--hover`, a hair under the floor, and 2.83:1 on `--sunken`; it is
    // darkened to clear 3:1 on every surface the site prints it on.
    for (const surface of ["paper", "surface", "hover", "sunken"]) {
      const measured = ratio(p("rule-2"), p(surface));
      report.push(`${theme} rule-2 on ${surface}: ${measured.toFixed(2)}:1`);
      if (measured < BORDER_FLOOR) {
        failures.push(
          `${theme} --rule-2 on --${surface} is ${measured.toFixed(2)}:1, under the ${BORDER_FLOOR}:1 floor`
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(`FAIL contrast — ${failures.length} pair(s) under the floor:`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }

  console.log(
    `OK contrast — ${report.length} palette pair(s) from app/globals.css clear their floors:\n` +
      report.map((line) => `  ${line}`).join("\n")
  );
}

main();
