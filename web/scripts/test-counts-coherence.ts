import assert from "node:assert/strict";
import { getCatalogCounts } from "../src/server/litespm/counts";
import { getInsights } from "../src/server/litespm/insights";
import { catalogStats } from "../src/server/litespm/search";

// Regression: the hero/marketplace counts (compact dataset) and the insights
// page counts (full filtered dataset) used to disagree by exactly the 378
// parse-artifact rows still present in the compact search file. A transparency
// product cannot show two totals for one release.
const counts = await getCatalogCounts();
const insights = await getInsights();
const banner = await catalogStats();

assert.equal(counts.uniqueListings, insights.totals.unique, "unique listings must match across surfaces");
assert.equal(banner.uniqueTotal, insights.totals.unique, "banner must match insights");
assert.equal(counts.installable, insights.totals.installable, "installable count must match across surfaces");
assert.equal(banner.counts?.installable ?? banner.installable, insights.totals.installable, "banner installable must match insights");
assert.equal(counts.discoveryOnly, insights.totals.discoveryOnly, "discovery-only count must match across surfaces");
assert.ok(insights.totals.unique < counts.catalogRows, "unique listings must be lower than raw catalog rows");

console.log(`counts-coherence: ${counts.uniqueListings} unique / ${counts.installable} installable — all surfaces agree`);
