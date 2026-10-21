// Shared formatting helpers for the LiteSPM UI.

const NUMBER = new Intl.NumberFormat("en-US");

/** Grouped integer: 5814 -> "5,814". Counts in this UI are always exact. */
export function formatCount(n: number): string {
  return NUMBER.format(Number.isFinite(n) ? n : 0);
}

/** Clamp long text with an ellipsis for card summaries. */
export function clamp(text: string, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}
