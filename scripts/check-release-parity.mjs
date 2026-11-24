#!/usr/bin/env node
// CI release-parity guard: fails if web/src/lib/litespm/site-facts.json npmVersion
// disagrees with the live published npm dist-tags.latest for `litespm`.
import fs from "node:fs";
import path from "node:path";

const factsPath = path.resolve(process.cwd(), "web/src/lib/litespm/site-facts.json");
const facts = JSON.parse(fs.readFileSync(factsPath, "utf8"));
const siteVersion = facts.npmVersion;

const res = await fetch("https://registry.npmjs.org/litespm/latest");
if (!res.ok) {
  console.error(`Failed to query npm registry: HTTP ${res.status}`);
  process.exit(1);
}
const npmPkg = await res.json();
const npmVersion = npmPkg.version;

if (siteVersion !== npmVersion) {
  console.error(
    `Release parity mismatch: site-facts.json advertises npmVersion=${siteVersion}, but npm serves ${npmVersion}.`
  );
  process.exit(1);
}
console.log(`Release parity verified: site-facts.json (${siteVersion}) === npm (${npmVersion}).`);
