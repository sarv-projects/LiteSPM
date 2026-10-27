import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const generatedBody = resolve(".next/server/app/package/entries/sitemap.xml.body");
const entriesDir = resolve("out/package/entries");
const exportedFile = resolve(entriesDir, "sitemap.xml");
const catalogFile = resolve("data/catalog.json");
const releaseFile = resolve("data/release.json");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://litespm.sarveshbh-2022.workers.dev").replace(/\/+$/, "");
const maxUrlsPerShard = 45_000;
const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";

const xmlEscape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

if (!existsSync(exportedFile)) {
  if (!existsSync(generatedBody)) {
    throw new Error(`Next did not generate the package sitemap body at ${generatedBody}`);
  }
  mkdirSync(dirname(exportedFile), { recursive: true });
  copyFileSync(generatedBody, exportedFile);
}

const { size } = statSync(exportedFile);
const xml = readFileSync(exportedFile, "utf8");
if (size === 0 || !xml.startsWith('<?xml version="1.0"') || !xml.includes("<urlset")) {
  throw new Error(`The exported package sitemap is empty or invalid: ${exportedFile}`);
}

// The Worker emits each catalog row's own page metadata, including rows that
// did not fit in the static export. The sitemap above only lists those
// pre-rendered pages; publish the remaining known rows in bounded URL shards
// so search engines can discover the full catalog without adding product HTML
// files to the Cloudflare Pages export.
const staticKeys = new Set();
for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(match[1]);
  const entryPath = /^\/package\/([^/]+)\/$/.exec(url.pathname);
  if (url.origin !== new URL(siteUrl).origin || !entryPath) {
    throw new Error(`Unexpected URL in the pre-rendered package sitemap: ${match[1]}`);
  }
  staticKeys.add(decodeURIComponent(entryPath[1]));
}

const rows = JSON.parse(readFileSync(catalogFile, "utf8"));
if (!Array.isArray(rows)) throw new Error(`${catalogFile} is not a JSON array`);
const slugCounts = new Map();
for (const row of rows) slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
const keys = rows.map((row) => (slugCounts.get(row.slug) === 1 ? row.slug : row.id));
const allKeys = new Set(keys);
if (allKeys.size !== rows.length) throw new Error("Catalog entry keys are not unique");
for (const key of staticKeys) {
  if (!allKeys.has(key)) throw new Error(`Pre-rendered sitemap key is missing from ${catalogFile}: ${key}`);
}

const release = JSON.parse(readFileSync(releaseFile, "utf8"));
const lastmod = new Date(release.createdAt);
if (Number.isNaN(lastmod.getTime())) throw new Error(`${releaseFile} has an invalid createdAt`);
const lastmodText = lastmod.toISOString();
const remaining = keys.filter((key) => !staticKeys.has(key));
if (remaining.length === 0) throw new Error("Expected edge-served catalog entries for the supplemental sitemap");

for (const name of readdirSync(entriesDir)) {
  if (/^remaining-\d{3,}\.xml$/.test(name)) {
    rmSync(resolve(entriesDir, name));
  }
}

const shardNames = [];
for (let offset = 0, index = 0; offset < remaining.length; offset += maxUrlsPerShard, index += 1) {
  const name = `remaining-${String(index).padStart(3, "0")}.xml`;
  const shardRows = remaining.slice(offset, offset + maxUrlsPerShard);
  const urls = shardRows.map((key) => {
    const loc = `${siteUrl}/package/${encodeURIComponent(key)}/`;
    return `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${lastmodText}</lastmod></url>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${sitemapNamespace}">\n${urls.join("\n")}\n</urlset>\n`;
  writeFileSync(resolve(entriesDir, name), body);
  shardNames.push(name);
}

const sitemapRows = shardNames.map((name) => {
  const loc = `${siteUrl}/package/entries/${name}`;
  return `  <sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${lastmodText}</lastmod></sitemap>`;
});
const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${sitemapNamespace}">\n${sitemapRows.join("\n")}\n</sitemapindex>\n`;
writeFileSync(resolve(entriesDir, "remaining-sitemap.xml"), indexXml);

console.log(`✔ package sitemap: ${staticKeys.size.toLocaleString()} pre-rendered URLs (${size.toLocaleString()} bytes)`);
console.log(`✔ supplemental catalog sitemap: ${remaining.length.toLocaleString()} edge-served URLs in ${shardNames.length} shard(s) → out/package/entries/remaining-sitemap.xml`);
