/**
 * Resolves the genuine upstream source repository (GitHub, GitLab, Bitbucket)
 * or official endpoint URL for catalog items, and cleanses any traces of
 * intermediate curation feeds or scrapers (e.g. skills.sh, mcpservers.org).
 */

import type { Listing } from "./types";

export interface ResolvedSource {
  repoUrl: string | null;
  cleanPublisherUrl: string | null;
  sourceType: "github" | "gitlab" | "bitbucket" | "git" | "endpoint" | "website";
  owner: string | null;
  repoName: string | null;
}

function isAggregator(u?: string | null): boolean {
  if (!u) return false;
  return (
    u.includes("skills.sh") ||
    u.includes("officialskills.sh") ||
    u.includes("mcpservers.org") ||
    u.includes("mcpmarket.com") ||
    u.includes("punkpeye") ||
    u.includes("voltagent") ||
    u.includes("awesome-mcp-servers")
  );
}

export function resolveOriginalSource(row: Listing): ResolvedSource {
  let repoUrl: string | null = null;
  let cleanPublisherUrl: string | null = row.publisher?.url || null;
  let owner: string | null = null;
  let repoName: string | null = null;

  // 1. Direct artifact repo
  if (
    row.artifact?.repo &&
    (row.artifact.repo.includes("github.com") ||
      row.artifact.repo.includes("gitlab.com") ||
      row.artifact.repo.includes("bitbucket.org"))
  ) {
    repoUrl = row.artifact.repo.replace(/\.git$/, "");
    const m = repoUrl.match(/(?:github|gitlab|bitbucket)\.(?:com|org)\/([^\/]+)(?:\/([^\/#?]+))?/);
    if (m) {
      owner = m[1];
      repoName = m[2];
    }
  }

  // 2. skillSource with git host
  if (
    !repoUrl &&
    row.skillSource &&
    (row.skillSource.includes("github.com") || row.skillSource.includes("gitlab.com"))
  ) {
    repoUrl = row.skillSource;
    const m = repoUrl.match(/github\.com\/([^\/]+)(?:\/([^\/#?]+))?/);
    if (m) {
      owner = m[1];
      repoName = m[2];
    }
  }

  // 3. skills.sh pattern: https://www.skills.sh/<owner>/<repo>/<skill>
  const skillsShMatch = (row.skillSource || row.publisher?.url || "").match(
    /(?:https?:\/\/)?(?:www\.)?skills\.sh\/([^\/\s]+)\/([^\/\s]+)(?:\/([^\/\s]+))?/,
  );
  if (skillsShMatch) {
    owner = skillsShMatch[1];
    repoName = skillsShMatch[2];
    if (!repoUrl) {
      repoUrl = `https://github.com/${owner}/${repoName}`;
    }
    if (isAggregator(cleanPublisherUrl)) {
      cleanPublisherUrl = `https://github.com/${owner}`;
    }
  }

  // 4. officialskills.sh pattern: https://officialskills.sh/<owner>/(skills|plugins)/<skill>
  const officialSkillsMatch = (row.skillSource || row.publisher?.url || "").match(
    /(?:https?:\/\/)?(?:www\.)?officialskills\.sh\/([^\/\s]+)\/(?:skills|plugins)(?:\/([^\/\s]+))?/,
  );
  if (officialSkillsMatch) {
    owner = officialSkillsMatch[1];
    if (!repoUrl && row.skillSource && row.skillSource.includes("github.com")) {
      repoUrl = row.skillSource;
    } else if (!repoUrl) {
      repoUrl = `https://github.com/${owner}/skills`;
    }
    if (isAggregator(cleanPublisherUrl)) {
      cleanPublisherUrl = `https://github.com/${owner}`;
    }
  }

  // 5. mcpservers.org pattern: github-com-<owner>-<repo>
  const mcpServersMatch = (row.publisher?.url || row.id || "").match(
    /github-com-([a-zA-Z0-9_\-]+?)-([a-zA-Z0-9_\-]+)/,
  );
  if (mcpServersMatch) {
    if (!owner) owner = mcpServersMatch[1];
    if (!repoUrl) {
      repoUrl = `https://github.com/${mcpServersMatch[1]}/${mcpServersMatch[2]}`;
    }
    if (isAggregator(cleanPublisherUrl)) {
      cleanPublisherUrl = `https://github.com/${mcpServersMatch[1]}`;
    }
  }

  // 6. io.github.<owner>-<repo> in id
  const ioGithubMatch = (row.id || "").match(/io\.github\.([a-zA-Z0-9_\-]+?)-([a-zA-Z0-9_\-]+)/);
  if (ioGithubMatch) {
    if (!owner) owner = ioGithubMatch[1];
    if (!repoUrl) {
      repoUrl = `https://github.com/${ioGithubMatch[1]}/${ioGithubMatch[2]}`;
    }
    if (!cleanPublisherUrl || isAggregator(cleanPublisherUrl)) {
      cleanPublisherUrl = `https://github.com/${ioGithubMatch[1]}`;
    }
  }

  // 7. Check if publisher.url or url is a github repo
  if (!repoUrl) {
    if (row.publisher?.url && row.publisher.url.includes("github.com")) {
      repoUrl = row.publisher.url;
    } else if (row.url && row.url.includes("github.com")) {
      repoUrl = row.url;
    }
  }

  // 8. General gitlab / bitbucket check
  if (!repoUrl) {
    for (const f of [row.artifact?.repo, row.skillSource, row.publisher?.url, row.url]) {
      if (f && (f.includes("gitlab.com") || f.includes("bitbucket.org"))) {
        repoUrl = f;
        break;
      }
    }
  }

  // Clean publisher URL if still pointing to aggregator
  if (isAggregator(cleanPublisherUrl)) {
    if (owner) {
      cleanPublisherUrl = `https://github.com/${owner}`;
    } else if (repoUrl && repoUrl.includes("github.com")) {
      const m = repoUrl.match(/github\.com\/([^\/]+)/);
      cleanPublisherUrl = m ? `https://github.com/${m[1]}` : null;
    } else {
      cleanPublisherUrl = null;
    }
  }

  // Determine source type
  let sourceType: ResolvedSource["sourceType"] = "website";
  if (repoUrl) {
    if (repoUrl.includes("github.com")) sourceType = "github";
    else if (repoUrl.includes("gitlab.com")) sourceType = "gitlab";
    else if (repoUrl.includes("bitbucket.org")) sourceType = "bitbucket";
    else sourceType = "git";
  } else if (row.url) {
    sourceType = "endpoint";
  }

  return {
    repoUrl,
    cleanPublisherUrl,
    sourceType,
    owner,
    repoName,
  };
}
