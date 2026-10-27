const LOW_INFORMATION_SUMMARIES = new Set([
  "description of my mcp server",
  "small public utility for autonomous clients.",
  ">",
]);

/**
 * A human-facing version of the publisher's short description.
 *
 * The source record remains untouched. This display helper only removes a
 * small set of audited placeholders and turns common skill-routing language
 * into a sentence a person scanning a catalog can read. Search still indexes
 * the original publisher text.
 *
 * @param {{ kind: string, summary?: string | null }} item
 */
export function listingSummary(item) {
  const summary = (item.summary ?? "").replace(/\s+/g, " ").trim();
  if (!summary || LOW_INFORMATION_SUMMARIES.has(summary.toLowerCase())) return "";
  if (item.kind !== "skill") return summary;

  const withoutTriggers = summary
    .replace(/\s+(?:Triggers include|Trigger phrases include|Trigger on)\s*:?\s*[\s\S]*$/i, "")
    .trim();

  return withoutTriggers
    .replace(/^Use(?: this skill)? (?:when|whenever) (?:the )?user (?:wants?|needs?) to\s+/i, "Use when you want to ")
    .replace(/^Use(?: this skill)? (?:when|whenever) (?:the )?user (?:wants?|needs?)\s+/i, "Use when you want ")
    .replace(/^Use(?: this skill)? (?:when|whenever) (?:the )?user (?:asks?|requests?) to\s+/i, "Use when you want to ")
    .replace(/^Use(?: this skill)? (?:when|whenever) (?:the )?user is working with\s+/i, "For working with ")
    .replace(/^Use(?: this skill)? (?:when|whenever) (?:the )?user mentions\s+/i, "For mentions of ")
    .replace(/^Use(?: this skill)? (?:when|whenever) (?:the )?user asks (?:anything )?about\s+/i, "For questions about ")
    .replace(/^Use this skill when the user wants to\s+/i, "Use when you want to ")
    .replace(/^Use this skill when the user needs to\s+/i, "Use when you need to ")
    .replace(/^Use when the user wants to\s+/i, "Use when you want to ")
    .replace(/^Use when the user needs to\s+/i, "Use when you need to ")
    .replace(/^Use this skill when a user asks to\s+/i, "Use when you want to ")
    .replace(/^Use when reviewing\s+/i, "For reviewing ")
    .replace(/^Use when editing\s+/i, "For editing ")
    .replace(/^Use when creating\s+/i, "For creating ")
    .replace(/^Use when building\s+/i, "For building ")
    .replace(/^Use when writing\s+/i, "For writing ")
    .replace(/^Use when analyzing\s+/i, "For analyzing ")
    .replace(/^Use when\s+(?!you (?:want|need) to\b)/i, "For ")
    .replace(/^Use this skill when\s+/i, "For ")
    .replace(/^Invoke this skill when\s+/i, "For ")
    .replace(/^This skill should be used when\s+/i, "For ");
}
