import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const generatedBody = resolve(".next/server/app/package/entries/sitemap.xml.body");
const exportedFile = resolve("out/package/entries/sitemap.xml");

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

console.log(`✔ package sitemap: ${size.toLocaleString()} bytes → out/package/entries/sitemap.xml`);
