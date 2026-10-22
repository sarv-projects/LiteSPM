#!/usr/bin/env node
// Draw the social card and the touch icon from the site's own brand source.
//
//     node scripts/gen_og_image.mjs        (or: npm run gen:og)
//
// Why this is a script rather than a file someone exports once: `public/og.png`
// is the image every link preview shows, and it said "LiteSPM Market" — a
// product name this project has not used in months — while the page beside it
// said "LiteSPM". Two reasons, both structural:
//
//   1. the card was drawn by hand against a palette and a name, and nothing
//      checks a PNG's pixels, so nothing noticed when the two drifted;
//   2. there was no `apple-icon` at all, so iOS used a page screenshot as the
//      home-screen icon.
//
// So the card is generated from `lib/site.ts` — the same constants the page
// title, the Open Graph title and the JSON-LD name read — using the fonts and
// palette that are actually in the stylesheet. And the generated PNG carries
// the title it was drawn from as a `tEXt` chunk, which
// `scripts/check-og-image.mjs` (part of `npm run lint`) compares back against
// those constants, so a card that no longer matches the page fails the build
// instead of reaching a link preview.
//
// It is deliberately NOT part of `prebuild`: generating an image needs a
// browser, and the static export must keep running on a runner with no
// Chromium. The gate only reads bytes.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");

/** `lib/site.ts`, transpiled — the one place the product's name is written. */
async function siteConstants() {
  const modulePath = path.join(webRoot, "lib", "site.ts");
  const transpiled = ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: modulePath,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

/** The palette, read out of the stylesheet the page ships. */
function palette() {
  const css = readFileSync(path.join(webRoot, "app", "globals.css"), "utf8");
  const pick = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    return m ? m[1] : null;
  };
  const out = {};
  for (const name of ["paper", "ink", "ink-2", "ink-3", "accent", "rule", "sunken"]) {
    out[name] = pick(name);
    if (!out[name]) throw new Error(`app/globals.css has no --${name}`);
  }
  return out;
}

function font(name) {
  const file = path.join(webRoot, "fonts", name);
  if (!existsSync(file)) throw new Error(`the brand font ${name} is missing from web/fonts`);
  return path.relative(webRoot, file);
}

function cardHtml({ siteName, siteTagline, siteUrl, colors }) {
  const face = (family, file, weight) => `
@font-face{font-family:"${family}";src:url("${file}") format("woff2");font-weight:${weight};font-style:normal;font-display:block;}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
${face("Plex", font("IBMPlexSans-latin.woff2"), "400 700")}
${face("PlexCond", font("IBMPlexSansCondensed-600-latin.woff2"), "600")}
${face("PlexMono", font("IBMPlexMono-500-latin.woff2"), "500")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:${colors.paper};color:${colors.ink};font-family:"Plex",system-ui,sans-serif;
  position:relative;padding:74px 84px;display:flex;flex-direction:column;justify-content:space-between}
/* the accent rail: the same 4px brand bar the site's cards use */
body::before{content:"";position:absolute;left:0;top:0;bottom:0;width:10px;background:${colors.accent}}
.mark{display:flex;align-items:center;gap:22px}
.mark svg{width:64px;height:64px;display:block}
.brand{font-size:52px;font-weight:600;letter-spacing:-0.02em;line-height:1}
.kicker{font-family:"PlexMono",monospace;font-size:22px;letter-spacing:.14em;
  text-transform:uppercase;color:${colors.ink-2};margin-top:18px}
.line{font-family:"PlexCond","Plex",sans-serif;font-weight:600;font-size:78px;line-height:1.05;
  letter-spacing:-0.015em;max-width:18ch}
.foot{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;
  font-family:"PlexMono",monospace;font-size:24px;color:${colors.ink-3};
  border-top:2px solid ${colors.rule};padding-top:26px}
.rule{display:flex;gap:10px;align-items:center}
.dot{width:14px;height:14px;border-radius:4px;background:${colors.accent}}
</style></head><body>
  <div class="mark">
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="5" fill="${colors.accent}"/>
      <path d="M9 11l5 5-5 5" fill="none" stroke="#ffffff" stroke-width="2.75" stroke-linecap="square"/>
      <rect x="17" y="19" width="7" height="2.5" fill="#ffffff" fill-opacity="0.7"/>
    </svg>
    <div>
      <div class="brand">${siteName}</div>
      <div class="kicker">MCP servers · agent skills · plugins</div>
    </div>
  </div>
  <div class="line">${siteTagline}</div>
  <div class="foot">
    <span class="rule"><span class="dot"></span>${siteUrl.replace(/^https?:\/\//, "")}</span>
    <span>one CLI · 50 agent hosts</span>
  </div>
</body></html>`;
}

// The same two elements as `app/icon.svg` and the header's 28px tile:
// a white terminal chevron and its cursor on the brand indigo plate. Three
// files draw the mark, so they draw the same one — that was the finding this
// generator exists to make un-repeatable.
const iconSvg = (colors) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="180" height="180">
  <rect width="32" height="32" rx="5" fill="${colors.accent}"/>
  <path d="M9 11l5 5-5 5" fill="none" stroke="#ffffff" stroke-width="2.75" stroke-linecap="square"/>
  <rect x="17" y="19" width="7" height="2.5" fill="#ffffff" fill-opacity="0.7"/>
</svg>`;

/**
 * Insert a standard `iTXt` chunk after IHDR.
 *
 * This is the link between a picture and the text it is supposed to show: the
 * PNG format carries text natively, so the gate can read what the card claims
 * to say without an OCR dependency and without guessing at pixels.
 *
 * `iTXt`, not `tEXt`: the text field of `tEXt` is latin-1, and this title
 * contains an em dash — which latin-1 cannot hold, so writing it there
 * silently stored U+0014 in its place and the gate correctly reported that
 * the card did not match the page. `iTXt` is the UTF-8 field (keyword,
 * compression flag, compression method, language, translated keyword, text).
 */
function writeTextChunks(pngBuffer, pairs) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!pngBuffer.subarray(0, 8).equals(signature)) throw new Error("not a PNG");
  const crcTable = (() => {
    const t = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const out = [signature, pngBuffer.subarray(8, 33)]; // signature + IHDR
  for (const [keyword, value] of pairs) {
    const body = Buffer.concat([
      Buffer.from(keyword, "latin1"),
      Buffer.from([0]), // end of keyword
      Buffer.from([0]), // compression flag: stored, not compressed
      Buffer.from([0]), // compression method: deflate (unused when flag is 0)
      Buffer.from([0]), // language tag: none
      Buffer.from([0]), // translated keyword: none
      Buffer.from(value, "utf8"),
    ]);
    out.push(chunk("iTXt", body));
  }
  out.push(pngBuffer.subarray(33));
  return Buffer.concat(out);
}

async function main() {
  const site = await siteConstants();
  const colors = palette();
  const siteUrl = site.SITE_URL;

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const tempHtml = path.join(webRoot, `.og-card-${process.pid}.html`);
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

    // The card. It is loaded from a file URL rather than built with
    // `setContent`, because the fonts are referenced relatively and an
    // `about:blank` document has no base to resolve them against — the card
    // would silently render in a fallback face.
    writeFileSync(tempHtml, cardHtml({ siteName: site.SITE_NAME, siteTagline: site.SITE_TAGLINE, siteUrl, colors }));
    await page.goto(`file://${tempHtml}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const og = await page.screenshot({ type: "png" });
    const tagged = writeTextChunks(og, [
      ["Title", site.SITE_TITLE],
      ["Software", site.SITE_NAME],
      ["Description", site.SITE_TAGLINE],
      ["Source", "web/scripts/gen_og_image.mjs"],
    ]);
    writeFileSync(path.join(webRoot, "public", "og.png"), tagged);
    console.log(`  public/og.png — 1200x630, ${tagged.length} bytes, title "${site.SITE_TITLE}"`);

    // The touch icon: the same mark, so the home screen and the tab match.
    const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    await iconPage.setContent(iconSvg(colors));
    await iconPage.waitForTimeout(120);
    const icon = await iconPage.screenshot({ type: "png" });
    writeFileSync(path.join(webRoot, "app", "apple-icon.png"), icon);
    console.log(`  app/apple-icon.png — 180x180, ${icon.length} bytes`);
    await iconPage.close();
  } finally {
    await browser.close();
    try {
      const { rmSync } = await import("node:fs");
      rmSync(tempHtml, { force: true });
    } catch {
      /* the scratch file is not worth failing a build for */
    }
  }
}

main().catch((error) => {
  console.error("FAIL gen og —", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
