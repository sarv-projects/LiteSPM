// One-off check: the decorated sort must produce exactly the order the
// comparator form produced.
//
// Both forms are inlined here — the availability rule, the curated score, the
// name key — so the comparison is against the real rules, not a paraphrase.
// Run: node scripts/check-sort-order.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(readFileSync(join(here, "..", "data", "catalog.json"), "utf8"));

const OFFICIAL_SKILLS_CATEGORY = "Official Skills by";

function availabilityOf(item) {
  if (item.kind === "plugin") {
    const artifact = item.artifact;
    if (!artifact) return { id: "unsupported", installable: false };
    if (artifact.type !== "git-tree") return { id: "unsupported", installable: false };
    if (!artifact.pinned || !artifact.sha) return { id: "unsupported", installable: false };
    return { id: "plugin", installable: true };
  }
  const established = ["metadata_verified", "runtime_verified", "litespm_tested"];
  if (!established.includes(item.installability)) return { id: "discovery", installable: false };
  if (item.kind === "mcp" && !item.transport) return { id: "discovery", installable: false };
  return item.kind === "skill" ? { id: "source", installable: true } : { id: "remote", installable: true };
}

function curatedScore(item) {
  let score = 0;
  if (item.category === OFFICIAL_SKILLS_CATEGORY) score += 4;
  if (item.publisher?.verified) score += 2;
  if (availabilityOf(item).installable) score += 1;
  return score;
}

function nameKey(name) {
  const stripped = name.replace(/^[^0-9A-Za-z]+/, "");
  return (stripped || name).toLowerCase();
}

const nameCollator = new Intl.Collator();

function oldSort(items, mode) {
  const copy = [...items];
  if (mode === "name") {
    return copy.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  }
  if (mode === "publisher") {
    return copy.sort(
      (a, b) =>
        (a.publisher?.name || "").localeCompare(b.publisher?.name || "") ||
        nameKey(a.name).localeCompare(nameKey(b.name))
    );
  }
  if (mode === "installable") {
    return copy.sort(
      (a, b) =>
        Number(availabilityOf(b).installable) - Number(availabilityOf(a).installable) ||
        Number(Boolean(b.publisher?.verified)) - Number(Boolean(a.publisher?.verified)) ||
        nameKey(a.name).localeCompare(nameKey(b.name))
    );
  }
  return copy.sort(
    (a, b) => curatedScore(b) - curatedScore(a) || nameKey(a.name).localeCompare(nameKey(b.name))
  );
}

function newSort(items, mode) {
  const copy = [...items];
  if (mode === "name") {
    const decorated = copy.map((item) => ({ item, name: nameKey(item.name) }));
    decorated.sort((a, b) => nameCollator.compare(a.name, b.name));
    return decorated.map((entry) => entry.item);
  }
  if (mode === "publisher") {
    const decorated = copy.map((item) => ({
      item,
      publisher: item.publisher?.name || "",
      name: nameKey(item.name),
    }));
    decorated.sort(
      (a, b) => nameCollator.compare(a.publisher, b.publisher) || nameCollator.compare(a.name, b.name)
    );
    return decorated.map((entry) => entry.item);
  }
  if (mode === "installable") {
    const decorated = copy.map((item) => ({
      item,
      installable: availabilityOf(item).installable ? 1 : 0,
      verified: item.publisher?.verified ? 1 : 0,
      name: nameKey(item.name),
    }));
    decorated.sort(
      (a, b) =>
        b.installable - a.installable || b.verified - a.verified || nameCollator.compare(a.name, b.name)
    );
    return decorated.map((entry) => entry.item);
  }
  const decorated = copy.map((item) => ({ item, score: curatedScore(item), name: nameKey(item.name) }));
  decorated.sort((a, b) => b.score - a.score || nameCollator.compare(a.name, b.name));
  return decorated.map((entry) => entry.item);
}

let failed = false;
for (const mode of ["name", "publisher", "installable", "curated"]) {
  const before = oldSort(rows, mode).map((r) => r.id);
  const after = newSort(rows, mode).map((r) => r.id);
  let firstDiff = -1;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff === -1) {
    console.log(`  ok  ${mode}: identical order over ${before.length} rows`);
  } else {
    failed = true;
    console.log(
      `  XX  ${mode}: first difference at ${firstDiff}: ${before[firstDiff]} vs ${after[firstDiff]}`
    );
  }
}

// The timing that matters: the sort the reader waits for.
for (const mode of ["curated", "name"]) {
  const t0 = Date.now();
  oldSort(rows, mode);
  const oldMs = Date.now() - t0;
  const t1 = Date.now();
  newSort(rows, mode);
  const newMs = Date.now() - t1;
  console.log(`  ${mode}: old ${oldMs} ms -> new ${newMs} ms`);
}

process.exit(failed ? 1 : 0);
