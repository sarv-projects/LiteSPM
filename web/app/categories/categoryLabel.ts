import { OFFICIAL_SKILLS_CATEGORY } from "../../lib/landing";

/**
 * The words a reader sees for a catalog category.
 *
 * `lib/landing.ts` exports `OFFICIAL_SKILLS_CATEGORY = "Official Skills by"`.
 * That trailing preposition is the upstream string, and it is the exact value
 * Explore filters on — it must stay untouched in every URL and comparison.
 * It is only wrong on screen, where it reads as a cut-off sentence.
 *
 * So: normalise at render, never in the data. Every place this site prints a
 * category name goes through here; every place it links or filters uses the
 * raw value.
 */
export function categoryLabel(name: string): string {
  return name === OFFICIAL_SKILLS_CATEGORY || name === "Official publisher skills" ? "Publisher skills" : name;
}
