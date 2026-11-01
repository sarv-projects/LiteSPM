/** The display-projection summary cap (`SUMMARY_CAP` in the upstream
 *  `lib/searchFormat.mjs`): 200 characters, cut on the last whole word. */
export const SUMMARY_CAP = 200;

export function capSummary(summary: unknown): string {
  const text = String(summary ?? "");
  if (text.length <= SUMMARY_CAP) return text;
  const slice = text.slice(0, SUMMARY_CAP);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > SUMMARY_CAP * 0.6 ? slice.slice(0, cut) : slice).trimEnd()}…`;
}
