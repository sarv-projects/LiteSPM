#!/usr/bin/env node
// Gate: the site's published claims match the registry data it publishes.
//
// The old static site had eight truth gates. The rewrite dropped them, and
// several claims drifted immediately: remote MCP rows were offered to all 50
// hosts, a non-existent relay bridge was described, plugin targets were
// display names instead of CLI ids, and unpinned plugins were advertised as
// installable with --allow-partial. This gate pins the facts that can be
// checked without a browser, so the same regressions fail CI.
//
// Usage: node scripts/check-web-truth.mjs

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const repoRoot = path.dirname(webRoot);

const failures = [];
const read = (rel) => readFileSync(path.join(webRoot, rel), "utf8");
const readRepo = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

// 1. The registry is the source of truth for remote capability.
const hosts = JSON.parse(read("data/hosts.json"));
if (!Array.isArray(hosts) || hosts.length !== 50) {
  failures.push(`hosts.json: expected 50 hosts, got ${hosts?.length ?? "non-array"}`);
} else {
  const remote = hosts.filter((h) => h.remote === true).length;
  const localOnly = hosts.filter((h) => h.remote !== true).map((h) => h.id).sort();
  if (remote !== 46) failures.push(`hosts.json: expected 46 remote-capable hosts, got ${remote}`);
  const expectedLocal = ["codestudio", "iflow-cli", "mux", "zcode"];
  if (JSON.stringify(localOnly) !== JSON.stringify(expectedLocal)) {
    failures.push(`hosts.json: local-only hosts changed: ${localOnly.join(", ")}`);
  }
}

// 2. No invented relay. There is no stdio-to-remote relay in the Go code; the
// site must not tell users there is one.
const sourceFiles = [
  "src/server/litespm/hosts.ts",
  "src/server/litespm/type-specs.ts",
  "src/server/litespm/package-detail.ts",
  "src/server/litespm/search.ts",
  "src/server/litespm/insights.ts",
  "src/server/litespm/agents.ts",
  "src/components/litespm/views/home.tsx",
  "src/components/litespm/views/docs.tsx",
  "src/components/litespm/views/package-detail.tsx",
  "src/components/litespm/views/compare.tsx",
  "src/app/api/litespm/assistant/route.ts",
  "src/app/api/litespm/compare/route.ts",
  "src/app/layout.tsx",
];
for (const rel of sourceFiles) {
  const text = read(rel);
  for (const forbidden of ["stdio-to-remote relay", "relay bridge", "stdio relay bridge"]) {
    if (text.toLowerCase().includes(forbidden)) {
      failures.push(`${rel}: describes a relay bridge that does not exist`);
    }
  }
}

// 3. Remote capability must be consulted, not assumed.
const hostsSource = read("src/server/litespm/hosts.ts");
if (!hostsSource.includes("remoteTransports") || !hostsSource.includes("h.remote")) {
  failures.push("hosts.ts: hostsFor no longer filters remote rows through the registry");
}

// 4. Plugin targets are host ids, not publisher display names.
const detailSource = read("src/server/litespm/package-detail.ts");
if (detailSource.includes("for (const name of targetNames) installTargets.push({ id: name, name })")) {
  failures.push("package-detail.ts: plugin install targets still use display names as ids");
}

// 5. No fabricated launch line / security posture / manifest.
const typeSpecs = read("src/server/litespm/type-specs.ts");
for (const forbidden of [
  'row.command || "npx"',
  "Standard portable agent skill",
  "litespm install ${row.id} --allow-partial",
]) {
  if (typeSpecs.includes(forbidden)) {
    failures.push(`type-specs.ts: fabricated value still present: ${forbidden}`);
  }
}

// 6. --allow-partial is not a pinning bypass.
const compareRoute = read("src/app/api/litespm/compare/route.ts");
if (compareRoute.includes("supports --allow-partial")) {
  failures.push("compare/route.ts: --allow-partial still advertised as a pinning bypass");
}

// 7. Sources are measured, not hardcoded empty.
const searchSource = read("src/server/litespm/search.ts");
if (searchSource.includes("sources: []")) {
  failures.push("search.ts: sources facet is hardcoded empty");
}
const insightsSource = read("src/server/litespm/insights.ts");
if (insightsSource.includes("bySource: []") || insightsSource.includes("sources: 0")) {
  failures.push("insights.ts: source analytics are hardcoded empty");
}

// 8. The release workflow must package the app the build actually produces.
if (existsSync(path.join(repoRoot, ".github/workflows/release.yml"))) {
  const release = readRepo(".github/workflows/release.yml");
  if (release.includes("-C web/out")) {
    failures.push("release.yml: packages web/out, but next build writes .next/standalone");
  }
  if (
    release.includes("litespm-web-standalone") &&
    !release.includes("test ! -e web/.next/standalone/.env")
  ) {
    failures.push("release.yml: standalone archive no longer asserts that .env was removed");
  }
}

// 9. Local stdio rows are classified as local, and a transport string alone
// does not make a row installable. This is the rule the CLI applies: a
// command or a URL is the launch line, not the label "stdio".
const availabilitySource = read("src/server/litespm/availability.ts");
if (!availabilitySource.includes('"local"') || !availabilitySource.includes("LOCAL")) {
  failures.push("availability.ts: no local-process availability class");
}
if (!availabilitySource.includes('transport === "stdio"') ||
    !availabilitySource.includes("command ? LOCAL : DISCOVERY")) {
  failures.push("availability.ts: stdio rows no longer require a published command");
}
if (availabilitySource.includes("Publisher setup details needed")) {
  failures.push("availability.ts: discovery-only rows still blame the publisher");
}
if (!searchSource.includes("availabilityOf(row).installable")) {
  failures.push("search.ts: installable filter drifted from availabilityOf");
}

if (failures.length > 0) {
  console.error("Web truth check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Web truth check passed.");
