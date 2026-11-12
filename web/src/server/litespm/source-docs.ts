/**
 * Live upstream documentation for a listing.
 *
 * The catalog carries no README / SKILL.md text and no repository statistics
 * (see try-prompts.ts), so this module fetches them from the source repository
 * on demand: the document from raw.githubusercontent.com, and - only when the
 * server has a GITHUB_TOKEN, because the unauthenticated API allows 60 calls an
 * hour per IP - the repository metadata from api.github.com. Nothing here is
 * cached into, or invented for, the catalog.
 */

import { getDataset } from "./dataset";
import { resolveOriginalSource } from "./source-resolver";
import type { Listing } from "./types";
import type {
  SourceDocsLocation,
  SourceDocsRepoMeta,
  SourceDocsResponse,
} from "@/lib/litespm/source-docs-types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 5 * 60 * 1000;

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._\-/]{1,200}$/;
const SEGMENT_RE = /^[A-Za-z0-9._@+~ -]{1,150}$/;

// ---------------------------------------------------------------------------
// Resolution: listing -> { owner, repo, ref, path }
// ---------------------------------------------------------------------------

function validRef(ref: string): boolean {
  return (
    REF_RE.test(ref) &&
    !ref.includes("..") &&
    !ref.includes("//") &&
    !ref.startsWith("/") &&
    !ref.startsWith("-") &&
    !ref.endsWith("/")
  );
}

function cleanPath(path: string): string | null {
  const segments = path.split("/").filter((s) => s.length > 0);
  for (const s of segments) {
    if (s === "." || s === ".." || !SEGMENT_RE.test(s)) return null;
  }
  return segments.join("/");
}

/** Parses a https github.com URL (repo root, /tree/<ref>/<path> or /blob/...). */
export function parseGithubUrl(raw: string | null | undefined): SourceDocsLocation | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  let segments: string[];
  try {
    segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") return null;

  let ref = "HEAD";
  let path = "";
  if ((segments[2] === "tree" || segments[2] === "blob") && segments[3]) {
    ref = segments[3];
    path = segments.slice(4).join("/");
  }
  if (!validRef(ref)) return null;
  const safePath = cleanPath(path);
  if (safePath === null) return null;
  return { owner, repo, ref, path: safePath };
}

export function resolveSourceLocation(row: Listing): SourceDocsLocation | null {
  const artifact = row.artifact;
  const fromSkill = row.kind === "skill" ? parseGithubUrl(row.skillSource) : null;
  const fromArtifact = parseGithubUrl(artifact?.repo);
  const resolved = resolveOriginalSource(row);
  const fromRepo = parseGithubUrl(resolved.repoUrl);

  let loc: SourceDocsLocation | null = null;
  if (fromSkill) {
    loc = { ...fromSkill };
  } else if (fromArtifact) {
    loc = { ...fromArtifact };
  } else if (fromRepo) {
    loc = { ...fromRepo };
  }
  if (!loc) return null;

  // The artifact's own path/ref refine the location when it is the same repo.
  const sameRepo =
    fromArtifact &&
    fromArtifact.owner.toLowerCase() === loc.owner.toLowerCase() &&
    fromArtifact.repo.toLowerCase() === loc.repo.toLowerCase();
  if (artifact && sameRepo) {
    if (!loc.path && artifact.path) {
      const p = cleanPath(artifact.path);
      if (p !== null) loc.path = p;
    }
    if (loc.ref === "HEAD" && artifact.ref && validRef(artifact.ref)) loc.ref = artifact.ref;
    // A pinned commit is the exact tree LiteSPM would install.
    if (artifact.pinned && artifact.sha && /^[0-9a-f]{7,64}$/i.test(artifact.sha)) {
      loc.ref = artifact.sha;
    }
  }
  return loc;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function rawUrlFor(loc: SourceDocsLocation, file: string): string {
  const full = [loc.path, file].filter(Boolean).join("/");
  return `https://raw.githubusercontent.com/${loc.owner}/${loc.repo}/${encodePath(loc.ref)}/${encodePath(full)}`;
}

export function githubPageUrl(loc: SourceDocsLocation, file?: string): string {
  const base = `https://github.com/${loc.owner}/${loc.repo}`;
  const full = [loc.path, file].filter(Boolean).join("/");
  if (!full && loc.ref === "HEAD") return base;
  const kind = file ? "blob" : "tree";
  return `${base}/${kind}/${encodePath(loc.ref)}/${encodePath(full)}`.replace(/\/$/, "");
}

async function fetchLimited(
  url: string,
  init: RequestInit,
  textOnly: boolean,
): Promise<{ status: number; text: string; truncated: boolean } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: "error", cache: "no-store" });
    if (!res.ok) return { status: res.status, text: "", truncated: false };
    if (textOnly) {
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (type && !type.startsWith("text/") && !type.includes("json")) return null;
    }
    if (!res.body) return { status: res.status, text: "", truncated: false };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > MAX_BYTES) {
        chunks.push(value.subarray(0, MAX_BYTES - total));
        total = MAX_BYTES;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    // A binary body decodes with replacement characters and NULs.
    if (textOnly && text.includes("\u0000")) return null;
    return { status: res.status, text, truncated };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SKILL_NAMES = ["SKILL.md", "skill.md", "Skill.md"];
const README_NAMES = ["README.md", "readme.md", "Readme.md"];

async function fetchDocument(
  loc: SourceDocsLocation,
  kind: "skill-md" | "readme",
): Promise<{ file: string; text: string; truncated: boolean; rawUrl: string } | null> {
  // The location may already name the file (a /blob/ URL).
  if (/\.md$/i.test(loc.path)) {
    const dir = loc.path.split("/").slice(0, -1).join("/");
    const file = loc.path.split("/").pop()!;
    const direct = { ...loc, path: dir };
    const res = await fetchLimited(rawUrlFor(direct, file), {}, true);
    if (res && res.status === 200 && res.text.trim()) {
      return { file, text: res.text, truncated: res.truncated, rawUrl: rawUrlFor(direct, file) };
    }
    return null;
  }
  const names = kind === "skill-md" ? SKILL_NAMES : README_NAMES;
  for (const name of names) {
    const url = rawUrlFor(loc, name);
    const res = await fetchLimited(url, {}, true);
    if (res && res.status === 200 && res.text.trim()) {
      return { file: name, text: res.text, truncated: res.truncated, rawUrl: url };
    }
  }
  return null;
}

async function fetchRepoMeta(
  loc: SourceDocsLocation,
  token: string,
): Promise<{ repo?: SourceDocsRepoMeta; lastCommitAt?: string }> {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "litespm-web",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const base = `https://api.github.com/repos/${loc.owner}/${loc.repo}`;
  const query = new URLSearchParams({ per_page: "1" });
  if (loc.path) query.set("path", loc.path);
  if (loc.ref !== "HEAD") query.set("sha", loc.ref);

  const [repoRes, commitRes] = await Promise.all([
    fetchLimited(base, { headers }, false),
    fetchLimited(`${base}/commits?${query.toString()}`, { headers }, false),
  ]);

  const out: { repo?: SourceDocsRepoMeta; lastCommitAt?: string } = {};
  if (repoRes && repoRes.status === 200) {
    try {
      const j = JSON.parse(repoRes.text) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const str = (v: unknown) => (typeof v === "string" && v ? v : null);
      const licenseObj = j.license as { spdx_id?: unknown } | null | undefined;
      const spdx = str(licenseObj?.spdx_id);
      out.repo = {
        stars: num(j.stargazers_count),
        forks: num(j.forks_count),
        license: spdx && spdx !== "NOASSERTION" ? spdx : null,
        language: str(j.language),
        pushedAt: str(j.pushed_at),
        openIssues: num(j.open_issues_count),
      };
    } catch {
      /* ignore malformed metadata */
    }
  }
  if (commitRes && commitRes.status === 200) {
    try {
      const j = JSON.parse(commitRes.text) as Array<{
        commit?: { committer?: { date?: string }; author?: { date?: string } };
      }>;
      const date = j[0]?.commit?.committer?.date ?? j[0]?.commit?.author?.date;
      if (typeof date === "string" && !Number.isNaN(Date.parse(date))) out.lastCommitAt = date;
    } catch {
      /* ignore */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

export function splitFrontmatter(text: string): {
  body: string;
  frontmatter?: { name?: string; description?: string };
} {
  const src = text.replace(/^\uFEFF/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { body: src };
  const lines = m[1].split(/\r?\n/);
  const fm: { name?: string; description?: string } = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^(name|description):[ \t]*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let value = kv[2];
    if (/^[>|][+-]?$/.test(value.trim()) || value.trim() === "") {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
        parts.push(lines[++i].trim());
      }
      value = parts.join(" ");
    } else {
      value = unquote(value);
      while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
        value += " " + lines[++i].trim();
      }
    }
    if (value) fm[kv[1] as "name" | "description"] = value.slice(0, 2000);
  }
  return { body: src.slice(m[0].length), frontmatter: Object.keys(fm).length ? fm : undefined };
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; ttl: number; value: SourceDocsResponse }>();

function cacheGet(key: string): SourceDocsResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return null;
  }
  cache.delete(key); // refresh recency
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: SourceDocsResponse): void {
  cache.set(key, { at: Date.now(), ttl: value.found ? CACHE_TTL_MS : MISS_TTL_MS, value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function getSourceDocs(key: string): Promise<SourceDocsResponse> {
  const fetchedAt = new Date().toISOString();
  try {
    let decoded: string;
    try {
      decoded = decodeURIComponent(key).trim();
    } catch {
      decoded = key.trim();
    }
    const dataset = await getDataset();
    const row = dataset.byKey.get(decoded) ?? dataset.byId.get(decoded);
    if (!row) return { found: false, reason: "No catalog listing resolves to this key.", fetchedAt };

    const cached = cacheGet(row.id);
    if (cached) return cached;

    const loc = resolveSourceLocation(row);
    if (!loc) {
      const miss: SourceDocsResponse = {
        found: false,
        reason: "This listing does not name a GitHub repository, so there is no document to fetch.",
        fetchedAt,
      };
      cacheSet(row.id, miss);
      return miss;
    }

    const kind = row.kind === "skill" ? "skill-md" : "readme";
    const token = process.env.GITHUB_TOKEN?.trim();
    const [doc, meta] = await Promise.all([
      fetchDocument(loc, kind),
      token ? fetchRepoMeta(loc, token) : Promise.resolve({} as { repo?: SourceDocsRepoMeta; lastCommitAt?: string }),
    ]);

    const sourceUrl = githubPageUrl(loc, doc?.file);
    if (!doc) {
      const miss: SourceDocsResponse = {
        found: false,
        reason: `No ${kind === "skill-md" ? "SKILL.md" : "README.md"} could be fetched from the source repository.`,
        kind,
        sourceUrl,
        source: loc,
        repo: meta.repo,
        lastCommitAt: meta.lastCommitAt,
        fetchedAt,
      };
      cacheSet(row.id, miss);
      return miss;
    }

    const { body, frontmatter } = kind === "skill-md" ? splitFrontmatter(doc.text) : { body: doc.text, frontmatter: undefined };
    const hit: SourceDocsResponse = {
      found: true,
      kind,
      sourceUrl,
      rawUrl: doc.rawUrl,
      source: loc,
      markdown: body,
      truncated: doc.truncated || undefined,
      frontmatter,
      repo: meta.repo,
      lastCommitAt: meta.lastCommitAt,
      fetchedAt,
    };
    cacheSet(row.id, hit);
    return hit;
  } catch (error) {
    console.error("litespm source-docs failed", error);
    return { found: false, reason: "The source repository could not be reached.", fetchedAt };
  }
}
