// Regenerate `data/brand-logos.json` from whatever is vendored in
// `public/brands/`.
//
// The manifest exists so the UI never requests a logo that isn't there: with
// `output: "export"` every missing file is a guaranteed 404 on first paint,
// and there are fifty hosts while logos arrive (and go) one at a time. The
// component looks the id up here and renders its letter mark when the id is
// absent, so "no logo yet" is a real, quiet state rather than a broken image.
//
// It also records each asset's aspect ratio, which decides placement. An
// app-icon mark (1:1) fills a tile; a wordmark (`antigravity.svg` is
// 1687×217) forced into one becomes an unreadable sliver, so the component
// falls back to the letter instead of shipping something that looks broken.
//
// Run with: npm run gen:brands   (also chained from `prebuild`)

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brandsDir = join(root, "public", "brands");
const outFile = join(root, "data", "brand-logos.json");

/** Only formats a browser renders inline; anything else is ignored rather
 *  than shipped and silently broken. */
const ALLOWED = new Set(["svg", "png", "webp"]);

/** width ÷ height outside this band counts as a wordmark, not a mark. */
const SQUARE_MIN = 0.6;
const SQUARE_MAX = 1.75;

function pngSize(buf) {
  // PNG stores width/height big-endian in the IHDR chunk at offset 16.
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function svgSize(text) {
  // width/height are often percentages or absent entirely, so neither is a
  // reliable signal on its own; try them, then fall back to viewBox.
  const width = /\bwidth="([\d.]+)"\s*/.exec(text)?.[1];
  const height = /\bheight="([\d.]+)"\s*/.exec(text)?.[1];
  if (width && height) return { width: Number(width), height: Number(height) };

  // viewBox="minX minY width height" — the last two are the dimensions. The
  // attribute is matched as a whole unit; anchoring to the end of the file
  // (the obvious regex) silently fails on every multi-line SVG, which is how
  // a 1024×1024 mark gets misread as a wordmark.
  const viewBox = /\bviewBox="\s*[-\d.]+(?:[,\s]+[-\d.]+){2,3}\s*"/.exec(text)?.[0];
  if (!viewBox) return null;
  const nums = viewBox.match(/[-\d.]+/g) ?? [];
  if (nums.length !== 4) return null;
  const w = Number(nums[2]);
  const h = Number(nums[3]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { width: w, height: h };
}

function measure(file, buffer) {
  if (file.endsWith(".png")) return pngSize(buffer);
  if (file.endsWith(".svg")) return svgSize(buffer.toString("utf8"));
  // webp dimensions aren't worth a parser here: treat as unknown and let the
  // component fall back to the letter mark rather than guess a shape.
  return null;
}

const logos = {};
if (existsSync(brandsDir)) {
  for (const file of readdirSync(brandsDir).sort()) {
    // `<host-id>.<ext>` — host ids are the registry's lowercase kebab ids, so
    // this pattern is the same one the registry uses. A stray file is skipped
    // with a warning instead of becoming a URL the site would 404 on.
    const match = /^([a-z0-9][a-z0-9-]*)\.([a-z0-9]+)$/i.exec(file);
    if (!match) {
      console.warn(`gen_brand_logos: skipping unexpected filename "${file}"`);
      continue;
    }
    const [, id, ext] = match;
    if (!ALLOWED.has(ext.toLowerCase())) {
      console.warn(`gen_brand_logos: skipping unsupported format "${file}"`);
      continue;
    }

    const buffer = readFileSync(join(brandsDir, file));
    const size = measure(file, buffer);
    const aspect = size && size.height > 0 ? Number((size.width / size.height).toFixed(3)) : null;

    logos[id] = {
      src: `/brands/${file}`,
      // null aspect = we could not read the dimensions; the component treats
      // that as "do not assume a shape" and shows the letter.
      aspect,
      square: aspect !== null && aspect >= SQUARE_MIN && aspect <= SQUARE_MAX,
    };
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(logos, null, 2)}\n`);

const entries = Object.entries(logos);
const words = entries.filter(([, v]) => !v.square).map(([k]) => k);
console.log(`brand logos: ${entries.length} (${words.length} wordmark/not-square)`);
if (words.length) console.log(`  not square: ${words.join(", ")}`);
