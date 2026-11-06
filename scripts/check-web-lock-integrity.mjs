#!/usr/bin/env node
// F11: every entry web/package-lock.json will *download* must carry an
// `integrity` hash.
//
// A lockfile entry without `integrity` still pins a name and a version, so
// `npm ci` installs it — but it installs whatever bytes the registry serves
// for that name and version, with no verification against the lockfile. That
// is the difference between a pinned artifact and a pinned label, and it is
// the hole this check closes: the release workflow and the scheduled
// catalog-sync workflow both install web/ with `npm ci`, and a lockfile edit
// that drops a hash would otherwise only show up as a supply-chain incident.
//
// Usage:
//   node scripts/check-web-lock-integrity.mjs [path/to/package-lock.json]
//   (default: web/package-lock.json relative to this repository)
//
// Passes when every `packages["node_modules/*"]` entry has a non-empty
// `integrity` string. Deliberately ignored:
//   - the root entry (""), which describes this repository, not a download;
//   - `"link": true` entries, which are symlinks (workspaces, file: deps)
//     and have no tarball to hash.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(repoRoot, "web", "package-lock.json");

let lock;
try {
  lock = JSON.parse(readFileSync(lockPath, "utf8"));
} catch (err) {
  console.error(`lock-integrity: cannot read ${lockPath}: ${err.message}`);
  process.exit(1);
}

if (lock.lockfileVersion !== 3) {
  console.error(
    `lock-integrity: ${lockPath} is lockfileVersion ${lock.lockfileVersion}, expected 3; ` +
      "this check reads the `packages` map that only v2/v3 lockfiles have.",
  );
  process.exit(1);
}

const packages = lock.packages ?? {};
const missing = [];
let checked = 0;

for (const [key, entry] of Object.entries(packages)) {
  if (!key.startsWith("node_modules/")) continue; // the root entry describes this repository
  if (entry.link === true) continue; // a symlink has no tarball to hash
  checked += 1;
  if (typeof entry.integrity !== "string" || entry.integrity.trim() === "") {
    missing.push(`${key}@${entry.version ?? "(no version)"}`);
  }
}

if (missing.length > 0) {
  console.error(
    `lock-integrity: ${missing.length} of ${checked} node_modules entries in ${lockPath} have no "integrity" hash.`,
  );
  console.error(
    "An entry without integrity is installed from the registry without any check that the bytes match the lockfile.",
  );
  for (const entry of missing.slice(0, 20)) console.error(`  - ${entry}`);
  if (missing.length > 20) console.error(`  ... and ${missing.length - 20} more`);
  console.error(
    "Fix: regenerate web/package-lock.json with npm >= 9 so npm writes integrity for every entry " +
      "(npm only writes it for entries it resolves, so removing the lockfile is the reliable way), " +
      "review the version moves that implies, and commit the result.",
  );
  process.exit(1);
}

console.log(
  `lock-integrity: OK - all ${checked} node_modules entries in ${lockPath} carry an integrity hash.`,
);
