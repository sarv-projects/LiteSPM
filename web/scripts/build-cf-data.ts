import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getDataset } from "../src/server/litespm/dataset";
import { catalogStats, searchCatalog } from "../src/server/litespm/search";
import { getBundles } from "../src/server/litespm/bundles";
import { getInsights } from "../src/server/litespm/insights";
import { agentStats, buildAgentDetail, buildAgentRows } from "../src/server/litespm/agents";
import { HOSTS } from "../src/server/litespm/hosts";
import { availabilityOf } from "../src/server/litespm/availability";
import { classifyListing } from "../src/server/litespm/taxonomy";
import { dedupeKey } from "../src/server/litespm/ranking";
import { hostIdsFor } from "../src/server/litespm/identity";
import { resolveOriginalSource } from "../src/server/litespm/source-resolver";

const outDir = path.join(process.cwd(), "public", "data", "precomputed");
const d1Dir = path.join(process.cwd(), "tmp-d1");
mkdirSync(outDir, { recursive: true });
mkdirSync(d1Dir, { recursive: true });

console.log("Loading dataset...");
const dataset = await getDataset();

console.log("Generating precomputed JSONs...");
const [stats, bundles, insights, agentRows, agentSummary, defaultFacets] = await Promise.all([
  catalogStats(),
  getBundles(),
  getInsights(),
  buildAgentRows(),
  agentStats(),
  searchCatalog({ pageSize: 1, facets: "only", compact: true }),
]);

const agentDetails: Record<string, unknown> = {};
for (const host of HOSTS) {
  const detail = await buildAgentDetail(host.id);
  if (detail) agentDetails[host.id] = detail;
}
for (const row of agentRows) {
  if (!agentDetails[row.slug]) {
    const detail = await buildAgentDetail(row.slug);
    if (detail) agentDetails[row.slug] = detail;
  }
}

writeFileSync(path.join(outDir, "stats.json"), JSON.stringify(stats));
writeFileSync(path.join(outDir, "bundles.json"), JSON.stringify(bundles));
writeFileSync(path.join(outDir, "insights.json"), JSON.stringify(insights));
writeFileSync(path.join(outDir, "agents.json"), JSON.stringify({ agents: agentRows, stats: agentSummary }));
writeFileSync(path.join(outDir, "agent-details.json"), JSON.stringify(agentDetails));
writeFileSync(path.join(outDir, "facets.json"), JSON.stringify(defaultFacets.facets));
console.log("Wrote precomputed JSONs to", outDir);

// Generate D1 schema + seed files
const schemaSql = `
CREATE TABLE IF NOT EXISTS "PackageView" (
  "linkKey" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "firstViewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "FeedbackEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "listing" TEXT,
  "message" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DROP TABLE IF EXISTS "CatalogFts";
DROP TABLE IF EXISTS "CatalogListing";
CREATE TABLE "CatalogListing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "linkKey" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "publisherName" TEXT NOT NULL,
  "publisherVerified" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "transport" TEXT,
  "installability" TEXT,
  "installable" INTEGER NOT NULL,
  "rankScore" REAL NOT NULL,
  "dk" TEXT NOT NULL,
  "hostsCsv" TEXT NOT NULL,
  "hitJson" TEXT NOT NULL,
  "rowJson" TEXT NOT NULL
);
CREATE INDEX "idx_catalog_linkKey" ON "CatalogListing"("linkKey");
CREATE INDEX "idx_catalog_slug" ON "CatalogListing"("slug");
CREATE INDEX "idx_catalog_dk" ON "CatalogListing"("dk");
CREATE INDEX "idx_catalog_inst_rank" ON "CatalogListing"("installable", "rankScore" DESC);
CREATE INDEX "idx_catalog_kind_inst_rank" ON "CatalogListing"("kind", "installable", "rankScore" DESC);
CREATE INDEX "idx_catalog_goal_inst_rank" ON "CatalogListing"("goal", "installable", "rankScore" DESC);
CREATE VIRTUAL TABLE "CatalogFts" USING fts5(
  id UNINDEXED,
  name,
  slug,
  publisher,
  category,
  summary,
  meta
);
`;
writeFileSync(path.join(d1Dir, "schema.sql"), schemaSql.trim() + "\n");

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

const ROWS_PER_FILE = 4000;
const BATCH_SIZE = 20;
let fileIdx = 0;
let lines: string[] = [];

function flushFile() {
  if (lines.length === 0) return;
  const filePath = path.join(d1Dir, `seed-${String(fileIdx).padStart(2, "0")}.sql`);
  writeFileSync(filePath, lines.join("\n") + "\n");
  fileIdx += 1;
  lines = [];
}

for (let i = 0; i < dataset.rows.length; i += BATCH_SIZE) {
  const batch = dataset.rows.slice(i, i + BATCH_SIZE);
  const listingValues: string[] = [];
  const ftsValues: string[] = [];

  for (const row of batch) {
    const av = availabilityOf(row);
    const goal = classifyListing(row);
    const dk = dedupeKey(row);
    const hostIds = hostIdsFor(row);
    const src = resolveOriginalSource(row);
    const summaryClipped = (row.summary ?? "").length > 320
      ? `${(row.summary ?? "").slice(0, 319).trimEnd()}…`
      : (row.summary ?? "");

    const hit = {
      id: row.id,
      linkKey: row.linkKey ?? row.slug,
      name: row.name,
      slug: row.slug,
      kind: row.kind,
      summary: summaryClipped,
      category: row.category ?? "",
      goal,
      publisher: {
        name: row.publisher?.name ?? "",
        verified: Boolean(row.publisher?.verified),
        provenance: row.publisher?.provenance,
        url: src.cleanPublisherUrl || undefined,
      },
      source: row.source,
      transport: row.transport ?? null,
      runtime: row.runtime ?? null,
      url: row.url ?? null,
      version: row.version ?? null,
      stars: row.stars ?? null,
      installability: row.installability,
      installable: av.installable,
      rankScore: row.rankScore ?? 0,
      command: row.command ?? null,
      args: row.args ?? null,
      installHint: row.installHint,
      repoUrl: src.repoUrl,
      sourceType: src.sourceType,
    };

    // Keep rowJson compact enough for D1 while preserving all fields needed by package-detail and compare
    const compactRow = {
      ...row,
      readme: row.readme ? row.readme.slice(0, 4000) : undefined,
      summary: (row.summary ?? "").slice(0, 1200),
    };

    const meta = [
      row.transport ?? "",
      row.runtime ?? "",
      row.command ?? "",
      ...(row.args ?? []),
      row.installHint ?? "",
    ].join(" ").slice(0, 300);

    listingValues.push(
      `(${sqlStr(row.id)},${sqlStr(row.linkKey ?? row.slug)},${sqlStr(row.slug)},${sqlStr(row.name)},${sqlStr(row.kind)},${sqlStr(row.category ?? "")},${sqlStr(goal)},${sqlStr(row.publisher?.name ?? "")},${row.publisher?.verified ? 1 : 0},${sqlStr(row.source ?? "")},${sqlStr(row.transport)},${sqlStr(row.installability)},${av.installable ? 1 : 0},${Number(row.rankScore ?? 0)},${sqlStr(dk)},${sqlStr("," + hostIds.join(",") + ",")},${sqlStr(JSON.stringify(hit))},${sqlStr(JSON.stringify(compactRow))})`,
    );

    ftsValues.push(
      `(${sqlStr(row.id)},${sqlStr(row.name)},${sqlStr(row.slug)},${sqlStr(row.publisher?.name ?? "")},${sqlStr(row.category ?? "")},${sqlStr(summaryClipped)},${sqlStr(meta)})`,
    );
  }

  lines.push(
    `INSERT INTO "CatalogListing" ("id","linkKey","slug","name","kind","category","goal","publisherName","publisherVerified","source","transport","installability","installable","rankScore","dk","hostsCsv","hitJson","rowJson") VALUES ${listingValues.join(",")};`,
  );
  lines.push(
    `INSERT INTO "CatalogFts" ("id","name","slug","publisher","category","summary","meta") VALUES ${ftsValues.join(",")};`,
  );

  if ((i + BATCH_SIZE) % ROWS_PER_FILE === 0) {
    flushFile();
  }
}
flushFile();
console.log(`Generated ${fileIdx} D1 seed files in ${d1Dir}`);
