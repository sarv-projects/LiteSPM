#!/usr/bin/env node
// Gate: no plaintext provider credential is checked into the web source.
//
// The hosted demo intentionally keeps an encoded free-tier Groq fallback in
// the gateway. Environment keys take precedence, and the fallback is stored as
// character codes so a plaintext `gsk_...` string is not published in source
// or copied by a naive scanner. This gate still fails on a plaintext key; it
// does not try to decode the intentional demo fallback.
//
// Usage: node scripts/check-no-embedded-secrets.mjs

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);

const files = execFileSync(
  "git",
  ["ls-files", "--", "src", "scripts", "prisma", "next.config.ts", "package.json"],
  { cwd: webRoot, encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter(Boolean);

const failures = [];

// Real key material has a distinctive prefix and enough length to avoid
// matching prose or examples. The encoded demo fallback is allowed.
const keyPattern = /\bgsk_[A-Za-z0-9]{20,}\b/;

for (const rel of files) {
  const abs = path.join(webRoot, rel);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  if (keyPattern.test(text)) failures.push(`${rel}: plaintext gsk_ credential`);
}

if (failures.length > 0) {
  console.error("Embedded credential check failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    "Remove the plaintext credential and use the deployment environment or the encoded demo fallback.",
  );
  process.exit(1);
}

console.log(`Embedded credential check passed (${files.length} tracked files).`);
