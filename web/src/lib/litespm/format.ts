export function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}k`;
  }
  return String(n);
}

export function formatFull(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function installabilityLabel(value: string | undefined): string {
  switch (value) {
    case "metadata_verified":
      return "Metadata verified";
    case "runtime_verified":
      return "Runtime verified";
    case "litespm_tested":
      return "LiteSPM tested";
    case "discovery_only":
      return "Discovery only";
    default:
      return "Unverified";
  }
}

export function kindLabel(kind: string): string {
  if (kind === "mcp") return "MCP server";
  if (kind === "skill") return "Skill";
  if (kind === "plugin") return "Plugin";
  return kind;
}

export function kindColor(kind: string): string {
  if (kind === "mcp") return "amber";
  if (kind === "skill") return "emerald";
  if (kind === "plugin") return "violet";
  return "slate";
}

/** Strip the io.github.account/ prefix the MCP registry puts in names. */
export function displayPackageName(name: string): string {
  return name.replace(/^io\.github\.[^/]+\//i, "");
}

export type RankTier = "top" | "strong" | "solid";

/** Tier for the rank badge: top ≥ 70, strong ≥ 50, solid ≥ 32. */
export function rankTierOf(score: number | undefined): RankTier | null {
  if (score === undefined) return null;
  if (score >= 70) return "top";
  if (score >= 50) return "strong";
  if (score >= 32) return "solid";
  return null;
}

export const RANK_TIER_META: Record<RankTier, { label: string; className: string }> = {
  top: {
    label: "Top rated",
    className: "border-brand/50 bg-brand-soft text-brand",
  },
  strong: {
    label: "Strong record",
    className: "border-brand/30 bg-brand-soft/60 text-brand/90",
  },
  solid: {
    label: "Solid record",
    className: "border-border/60 bg-muted/40 text-muted-foreground",
  },
};

/** The transparent scoring explanation, shown as a tooltip. */
export const RANK_EXPLAINER =
  "LiteSPM Score (0–100) — an editorial reputation model: recognition of the tool in the agent ecosystem (0–35 — official MCP references, top-vendor servers, Anthropic's official skills), vendor authority — first-party publishers like Microsoft, Anthropic or Supabase (0–18), proven installability — tested beats verified beats claimed (0–15), record completeness (0–12), description substance (0–5), and GitHub stars when a source publishes them (0–15, log scale). Exactly sums to 100. Spam and parse-artifact records are penalized.";
