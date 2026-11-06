/**
 * Package-claim detection for the catalog assistant's grounding guard.
 *
 * The model is instructed to write "litespm install <id>" with the placeholder
 * inline, and the product answers document "litespm install remove
 * <installId>". Only an id-shaped token (at least one separator, never
 * angle-bracket placeholder syntax or a subcommand) counts as a package claim,
 * so instructions and prose that merely follow the verb cannot fail the guard.
 */

/** Every token that follows "litespm install" in the answer, trailing punctuation stripped. */
export function installClaims(answer: string): string[] {
  return [...answer.matchAll(/litespm install\s+([^\s`]+)/g)].map((match) =>
    match[1].replace(/[.,;:)]+$/, ""),
  );
}

/** True when the token could name a catalog package rather than documented syntax. */
export function looksLikePackageId(token: string): boolean {
  if (token.length < 3) return false;
  if (token.includes("<") || token.includes(">")) return false; // documented placeholder
  if (token === "remove" || token === "uninstall") return false; // subcommands
  return /^[a-z0-9][a-z0-9._:@/-]*$/i.test(token) && /[._:@/-]/.test(token);
}

/** The install ids in the answer that look like real packages, retrieved or not. */
export function claimedPackageIds(answer: string): string[] {
  return installClaims(answer).filter(looksLikePackageId);
}
