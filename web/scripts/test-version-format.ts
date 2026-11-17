import assert from "node:assert/strict";

import { buildSkillSpec } from "../src/server/litespm/type-specs";
import { formatVersion } from "../src/lib/litespm/format";
import type { Listing } from "../src/server/litespm/types";

/** Minimal row: only the fields buildSkillSpec reads for the fallback. */
function rowWithVersion(version: string): Listing {
  return {
    id: "skill:test:fixture",
    kind: "skill",
    name: "fixture",
    summary: "A fixture skill.",
    version,
  } as Listing;
}

// The server-side spec must not double the prefix a publisher already gave.
assert.equal(buildSkillSpec(rowWithVersion("2.1.3")).versionFallback, "v2.1.3");
// Regression: the Grafana row publishes "v2.0.1"; the page rendered "vv2.0.1".
assert.equal(buildSkillSpec(rowWithVersion("v2.0.1")).versionFallback, "v2.0.1");

// One shared answer for cards, detail pages and spec fallbacks.
assert.equal(formatVersion("2.1.3"), "v2.1.3");
assert.equal(formatVersion("v2.0.1"), "v2.0.1");
assert.equal(formatVersion(undefined), "");
assert.equal(formatVersion(""), "");

console.log("version-format: 6 assertions passed");
