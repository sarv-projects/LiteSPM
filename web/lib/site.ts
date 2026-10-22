// Canonical origin for absolute URLs: metadataBase, Open Graph, Twitter cards,
// and the JSON-LD emitted on package pages.
//
// Canonical and social URLs must name the origin that actually serves this
// site, so the default is the live deployment origin rather than a domain that
// does not resolve yet. Override it at build time — and flip the default once
// the custom domain is registered:
//
//     NEXT_PUBLIC_SITE_URL=https://litespm.market npm run build
//
// Trailing slashes are stripped so callers can append paths directly.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://litespm.sarveshbh-2022.workers.dev"
).replace(/\/+$/, "");

/**
 * Repository links for the "read more" affordances on the landing page. There
 * is no docs site and no `/docs` route yet (`LPSM-J008`), so "Read the docs"
 * points at the repository README and "View architecture" at the ARCH index —
 * the same origin the footer's GitHub button already names. They are real,
 * resolvable URLs rather than a placeholder route that would 404.
 */
export const REPO_URL = "https://github.com/sarv-projects/LiteSPM";
export const DOCS_URL = `${REPO_URL}/blob/main/README.md`;
export const ARCHITECTURE_URL = `${REPO_URL}/blob/main/ARCH/00-INDEX.md`;

/**
 * The product's name as it is written, and the one line that says what it is.
 *
 * Every surface that names the project reads it here rather than repeating a
 * string: `<title>`, the Open Graph and Twitter titles, the OG image's
 * accessible text and the image the generator draws from it, the JSON-LD
 * `WebSite` name, the footer. It existed in five spellings at once once — the
 * title said "The package manager for AI agents" while the social card's
 * alt text said "the lightweight skill & package manager for AI agents" and
 * the drawn card itself read "LiteSPM Market", a product name the project has
 * not used for months. One constant, one name.
 */
export const SITE_NAME = "LiteSPM";
export const SITE_TAGLINE = "The package manager for AI agents";
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;