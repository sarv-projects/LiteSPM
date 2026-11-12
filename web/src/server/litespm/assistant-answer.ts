/**
 * Presentation helpers for catalog answers: exact install commands, in-app
 * links, follow-up chips and friendly provider-failure text. Kept apart from
 * assistant-grounding.ts, which scripts/check-assistant-product.mjs loads as a
 * dependency-free module.
 */

import { displayPackageName } from "../../lib/litespm/format";
import type { CatalogHit } from "./search";

type HitLike = Pick<CatalogHit, "id" | "linkKey" | "name" | "installable">;

/** Exact CLI command for a hit, or null when LiteSPM cannot install it. */
export function installCommandFor(hit: HitLike, hostId?: string): string | null {
  if (!hit.installable) return null;
  const id = hit.id.replace(/[^\w.:@/+-]/g, "");
  if (!id) return null;
  return `litespm install ${id}${hostId ? ` --agent ${hostId.replace(/[^\w-]/g, "")}` : ""}`;
}

/** In-app link the chat renderer opens (the site routes packages by hash). */
export function packageLinkFor(hit: Pick<CatalogHit, "linkKey">): string {
  return `#/package/${encodeURIComponent(hit.linkKey)}`;
}

function mentions(answer: string, hit: HitLike): boolean {
  const lower = answer.toLowerCase();
  const display = displayPackageName(hit.name).toLowerCase();
  return (display.length >= 3 && lower.includes(display)) || lower.includes(hit.linkKey.toLowerCase());
}

/**
 * Guarantee that every package the answer talks about carries its in-app link
 * and, when installable, its exact install command. The model is told to
 * include both; this is the deterministic backstop for when it forgets or
 * paraphrases.
 */
export function ensureInstallCommands(answer: string, hits: HitLike[], hostId?: string, max = 4): string {
  const missing: string[] = [];
  for (const hit of hits.slice(0, 8)) {
    if (missing.length >= max) break;
    if (!mentions(answer, hit)) continue;
    const command = installCommandFor(hit, hostId);
    const needsCommand = Boolean(command) && !answer.includes(command!) && !answer.includes(`litespm install ${hit.id}`);
    const link = packageLinkFor(hit);
    const needsLink = !answer.includes(link) && !answer.includes(`/package/${hit.linkKey}`);
    if (!needsCommand && !needsLink) continue;
    const parts = [`- **${displayPackageName(hit.name)}**`];
    if (needsLink) parts.push(`([details](${link}))`);
    if (needsCommand) parts.push(`: \`${command}\``);
    else if (!command && needsLink) parts.push(" (discovery-only: LiteSPM cannot install it)");
    missing.push(parts.join(" ").replace(" :", ":"));
  }
  return missing.length ? `${answer.trimEnd()}\n\n**Details and install commands**\n${missing.join("\n")}` : answer;
}
/**
 * Two or three short follow-up questions, derived from what was actually
 * retrieved. Deterministic, so there is no extra model call and no invention.
 */
export function followUpSuggestions(
  mode: "conversation" | "knowledge" | "catalog",
  hits: HitLike[],
  hostName?: string,
): string[] {
  if (mode === "catalog" && hits.length > 0) {
    const names = hits.slice(0, 2).map((hit) => displayPackageName(hit.name));
    const out: string[] = [];
    if (names.length === 2) out.push(`Compare ${names[0]} and ${names[1]}`);
    out.push(`Is ${names[0]} installable${hostName ? ` in ${hostName}` : ""}?`);
    out.push("What does installable vs discovery-only mean?");
    return out.slice(0, 3);
  }
  if (mode === "knowledge") {
    return ["How do I undo an install?", "Which agent hosts does LiteSPM support?", "How are listings ranked?"];
  }
  return [];
}

/** Friendly, actionable text for an exhausted provider pool. */
export function llmFailureMessage(result: {
  retryInMs: number;
  attempts?: Array<{ outcome: string }>;
}): { message: string; retryable: boolean } {
  const rateLimited = (result.attempts ?? []).some((attempt) => attempt.outcome === "rate_limited");
  if (result.retryInMs > 0 || rateLimited) {
    const seconds = Math.max(5, Math.round((result.retryInMs || 30_000) / 1000));
    return {
      message: `The AI model is busy right now (rate limited). Please try again in about ${seconds}s.`,
      retryable: true,
    };
  }
  return { message: "The assistant could not reach an AI model. Please try again shortly.", retryable: true };
}
