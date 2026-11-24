#!/usr/bin/env node
// Regenerate both search projections directly from the production loaders.
// No development server or HTTP exporters required. Requires Bun locally
// (already used by the existing web test scripts).
import { execFileSync } from "node:child_process";
const check = process.argv.includes("--check");
execFileSync("bun", ["scripts/build-search-artifacts.ts", check ? "--check" : "--refresh-catalog"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/check-search-artifacts.mjs", ...(check ? [] : ["--write"])], { stdio: "inherit" });
