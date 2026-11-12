import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const output = path.resolve(webRoot, "src/server/litespm/generated/assistant-knowledge.json");
const candidates = [
  "README.md",
  "SECURITY.md",
  "STATUS.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "npm/README.md",
  ...fs.existsSync(path.join(repoRoot, "ARCH"))
    ? fs.readdirSync(path.join(repoRoot, "ARCH"))
        .filter((name) => name.endsWith(".md") && name !== "31-COMPETITIVE-LANDSCAPE-AND-ROADMAP.md")
        .map((name) => path.join("ARCH", name))
    : [],
];
function tokenize(text) {
  return text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,}/gu) ?? [];
}
function vector(tokens, dimensions = 384) {
  const values = new Array(dimensions).fill(0);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    values[(hash >>> 0) % dimensions] += 1;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => Number((value / norm).toFixed(6)));
}
function splitSections(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const sections = [];
  let title = "LiteSPM documentation";
  let section = title;
  let buffer = [];
  let startLine = 1;
  const flush = (endLine) => {
    const body = buffer.join("\n").trim();
    if (body.length > 80) sections.push({ title, section, body, startLine, endLine });
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flush(i);
      section = heading[1].trim();
      if (lines[i].match(/^#\s/)) title = section;
      startLine = i + 2;
    } else if (buffer.length === 0 && lines[i].trim()) {
      startLine = i + 1;
      buffer.push(lines[i]);
    } else {
      buffer.push(lines[i]);
    }
  }
  flush(lines.length);
  return sections;
}
function chunksFor(source, markdown) {
  const result = [];
  for (const section of splitSections(markdown)) {
    const paragraphs = section.body.split(/\n\s*\n/);
    let current = "";
    let start = section.startLine;
    let lineCursor = section.startLine;
    for (const paragraph of paragraphs) {
      const clean = paragraph.trim();
      if (!clean) continue;
      if (current.length && current.length + clean.length > 1050) {
        const text = current.trim();
        const tokens = tokenize(text);
        const id = crypto.createHash("sha1").update(source + "|" + section.section + "|" + start + "|" + text).digest("hex").slice(0, 16);
        result.push({ id, title: section.title, source, section: section.section, startLine: start, endLine: lineCursor, text, tokens, vector: vector(tokens) });
        const overlap = text.slice(-180);
        current = overlap + "\n\n" + clean;
        start = Math.max(section.startLine, lineCursor - 3);
      } else {
        current += (current ? "\n\n" : "") + clean;
      }
      lineCursor += paragraph.split("\n").length + 1;
    }
    if (current.trim().length > 80) {
      const text = current.trim();
      const tokens = tokenize(text);
      const id = crypto.createHash("sha1").update(source + "|" + section.section + "|" + start + "|" + text).digest("hex").slice(0, 16);
      result.push({ id, title: section.title, source, section: section.section, startLine: start, endLine: Math.max(start, lineCursor - 1), text, tokens, vector: vector(tokens) });
    }
  }
  return result;
}
const all = [];
for (const relative of [...new Set(candidates)]) {
  const file = path.join(repoRoot, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  let markdown = fs.readFileSync(file, "utf8");
  if (relative === "CHANGELOG.md") {
    // Only the [Unreleased] section: it records what the next release adds
    // (and so what npm does not have yet). Released sections are history, ~1,000
    // lines of it, and would crowd out the current product docs.
    const start = markdown.search(/^## \[Unreleased\]/m);
    if (start < 0) continue;
    const rest = markdown.slice(start + 1);
    const next = rest.search(/^## \[/m);
    markdown = "# Changelog: unreleased changes (next release, not yet on npm)\n\n" +
      markdown.slice(start, next < 0 ? undefined : start + 1 + next);
  }
  all.push(...chunksFor(relative.replace(/\\/g, "/"), markdown));
}
const embeddingKey = process.env.EMBEDDING_API_KEY;
if (embeddingKey) {
  const baseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  let embeddedCount = 0;
  for (let offset = 0; offset < all.length; offset += 48) {
    const batch = all.slice(offset, offset + 48);
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${embeddingKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: batch.map((chunk) => chunk.text) }),
    });
    if (!response.ok) throw new Error(`Embedding build failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.data.length !== batch.length) throw new Error("Embedding provider returned an incomplete batch");
    for (const item of payload.data) {
      if (!Array.isArray(item.embedding) || item.embedding.some((value) => !Number.isFinite(value))) throw new Error("Embedding provider returned an invalid vector");
      batch[item.index].embedding = item.embedding;
      embeddedCount++;
    }
    console.log(`Embedded ${Math.min(offset + batch.length, all.length)}/${all.length} documentation chunks`);
  }
  console.log(`Dense embeddings generated for ${embeddedCount} chunks using ${model}`);
} else {
  console.log("EMBEDDING_API_KEY is not configured; using local dense feature vectors with lexical retrieval.");
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(all));
console.log(`Assistant knowledge corpus: ${all.length} chunks from ${new Set(all.map((item) => item.source)).size} sources -> ${path.relative(process.cwd(), output)}`);
