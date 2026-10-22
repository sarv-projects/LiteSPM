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

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);

function fail(message) {
  console.error(`FAIL contrast — ${message}`);
  process.exit(1);
}

/** Every TypeScript source the site renders from, relative to `webRoot`. */
function sourceFiles() {
  const out = [];
  const walk = (rel, dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(childRel, path.join(dir, entry.name));
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(childRel);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) {
    const abs = path.join(webRoot, dir);
    if (existsSync(abs)) walk(dir, abs);
  }
  return out;
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
    // The logo plate: a vendor mark's ground stays light in both themes, so
    // the ink drawn on it is what has to hold in dark mode — it does not
    // follow `--ink-2`, which flips. Two components hard-coded `bg-white`
    // before this existed and read an ink that flipped with the theme, which
    // is 1.57:1.
    "logo-plate",
    "logo-plate-ink",
    // The two grounds white is printed on — measured below rather than
    // assumed, because a literal has no gate of its own.
    "accent",
    "pop",
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

    // The logo plate's own ink, on the plate. This is the pair that was
    // invisible in dark mode: the plate is always light and the ink followed
    // the theme, so a fallback initial rendered at 1.57:1 on a white tile.
    const plate = ratio(p("logo-plate-ink"), p("logo-plate"));
    report.push(`${theme} logo-plate-ink on logo-plate: ${plate.toFixed(2)}:1`);
    if (plate < TEXT_FLOOR) {
      failures.push(
        `${theme} --logo-plate-ink on --logo-plate is ${plate.toFixed(2)}:1, under the ${TEXT_FLOOR}:1 floor`
      );
    }

    // White is the one colour this site prints as a literal, on exactly two
    // grounds: the brand mark inside `bg-accent`, and the error toast inside
    // `bg-pop`. Both are measured here in every theme, because neither value
    // is in the palette the reader can check by eye — if either ground is ever
    // lightened past 4.5:1, the white on it stops being readable and this is
    // what says so.
    for (const ground of ["accent", "pop"]) {
      const measured = ratio("#ffffff", p(ground));
      report.push(`${theme} white on ${ground}: ${measured.toFixed(2)}:1`);
      if (measured < TEXT_FLOOR) {
        failures.push(
          `${theme} white on --${ground} is ${measured.toFixed(2)}:1, under the ${TEXT_FLOOR}:1 floor`
        );
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

  // A colour written straight into a className is invisible to this gate: it
  // reads the palette, and a literal is not in the palette. `bg-white` on a
  // dark surface is the failure that shipped — a tile that stayed white while
  // its ink flipped — so any raw light/dark literal is a failure unless the
  // combination it prints is documented here with a measured floor.
  // A ground (a plate, a fill) that ignores the theme is the failure that
  // shipped: `bg-white` stayed white on the dark surface while its ink
  // followed the theme, which is 1.57:1 — so a ground is never a literal.
  //
  // White INK is the exception, named file by file with the ground it sits on
  // (measured above in every theme): a new literal is never grandfathered by
  // being near an old one.
  const WHITE_INK = new Map([
    ["components/navigation/Header.tsx", "white on --accent, the brand mark"],
    ["components/ui/Toast.tsx", "white on --pop, the error toast"],
  ]);
  for (const file of sourceFiles()) {
    const text = readFileSync(path.join(webRoot, file), "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (/\b(bg|border)-(white|black)([^a-z-]|$)/.test(line)) {
        failures.push(
          `${file}:${i + 1} hard-codes a background literal — read a token instead (the palette gate cannot see it)`
        );
        return;
      }
      if (/\btext-(white|black)([^a-z-]|$)/.test(line) && !WHITE_INK.has(file)) {
        failures.push(
          `${file}:${i + 1} hard-codes ink; white ink is documented only where ` +
            `--accent or --pop is the ground (the measured pair above)`
        );
      }
    });
  }

  if (failures.length > 0) {
    console.error(`FAIL contrast — ${failures.length} finding(s):`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }

  console.log(
    `OK contrast — ${report.length} palette pair(s) from app/globals.css clear their floors:\n` +
      report.map((line) => `  ${line}`).join("\n")
  );
}

main();
