/**
 * Shapes returned by /api/litespm/source/[key]: the upstream README / SKILL.md
 * of a listing, fetched live from its GitHub repository (never from the
 * catalog, which carries no document text), plus repository stats when the
 * server has a GitHub token.
 */

export interface SourceDocsLocation {
  owner: string;
  repo: string;
  ref: string;
  /** Directory (or file) inside the repo; empty for the repo root. */
  path: string;
}

export interface SourceDocsRepoMeta {
  stars: number | null;
  forks: number | null;
  license: string | null;
  language: string | null;
  pushedAt: string | null;
  openIssues: number | null;
}

export interface SourceDocsResponse {
  found: boolean;
  /** Why nothing resolved; present when found is false. */
  reason?: string;
  kind?: "skill-md" | "readme";
  /** Human page on github.com for the document or directory. */
  sourceUrl?: string;
  rawUrl?: string;
  source?: SourceDocsLocation;
  markdown?: string;
  /** True when the document was cut at the size cap. */
  truncated?: boolean;
  frontmatter?: { name?: string; description?: string };
  repo?: SourceDocsRepoMeta;
  lastCommitAt?: string;
  fetchedAt: string;
}
