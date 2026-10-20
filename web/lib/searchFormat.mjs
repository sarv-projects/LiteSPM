// The catalog search format: one tokenizer, one matcher, one index, and one
// display projection, shared by every side that touches search.
//
// Who imports this file:
//
//   * `lib/query.ts` — the build-time Server Components count topic links with
//     `matchesQuery`, which is defined in terms of `tokenizeText` and
//     `matchesTokenPrefixes` from here.
//   * `scripts/emit-catalog-shards.mjs` — the build step that turns
//     `data/catalog.json` into the served index and rows artifacts with
//     `buildSearchIndex` / `buildDisplayRows`.
//   * `lib/search.worker.ts` — the worker that fetches the index and answers
//     queries with `querySearchIndex`.
//   * `lib/useCatalogSearch.ts` — the in-thread fallback and the hydration of
//     worker results through `decodeDisplayRows`.
//   * `scripts/check-search-index.mjs` — the gate that proves the index
//     reproduces `matchesQuery` over the real dataset, byte for byte stable.
//
// Plain `.mjs` rather than `.ts` on purpose: the Node build scripts cannot
// import TypeScript, and duplicating the format in two languages is exactly the
// drift this file exists to prevent. `allowJs` is on in `tsconfig.json`, so the
// TypeScript callers still get types from the JSDoc above each export.
//
// No dependencies, no `node:` imports, no DOM-only APIs: `TextEncoder` /
// `TextDecoder` are global in Node and in browsers, so this module runs
// unchanged in the emitter, the worker, the page and the gate.
//
// **Format v2 — where a match happened is part of the index.** v1 stored one
// bit per posting: "did this token appear in name+slug+id". That bit could not
// tell an entry *named* GitHub from one that merely mentioned it, and the
// catalog id's registry namespace (`io.github.<publisher>`) made every one of
// those rows score as a title match, so a query for `github` led with rows
// whose only connection to GitHub was their id. v2 stores a 3-bit **match
// class** per posting — name (exact / first token / later token), publisher,
// slug, body, id — and the ranking sums those classes. The class is the
// ranking; it is also what `explainMatch` renders beside a result.
//
// The per-row tie-break signals (installable, publisher-manifest verified,
// upstream Official Skills classification) are a 3-bit table appended to the
// payload. No stars, downloads or install counts exist in the dataset, so no
// popularity term exists here either.
//
// **Format v3 — the display projection carries the row's origin.** v2's ROWS
// record omitted `source` (the `domain.SourceID` the row was ingested from),
// so every row hydrated from the projection — which is every row the browser
// shows after a filter or a search — lost the one field `rowProvenance`
// renders for a non-manifest row, and the card printed "Origin not stated"
// where the dataset holds e.g. `feed:mcpservers-org`. The server-rendered
// rows carried it; the hydrated ones could not. v3 interns `source` as an
// eleventh dictionary and appends a 2-byte index to the fixed block (11 → 13
// bytes), so both paths render the same origin for the same row.
//
// **Format v4 — the address's host is not searchable.** Every id the MCP
// registry publishes reads `<kind>:<source>:<host>.<account>-<repo>`, and the
// host is where the entry is *served from*, not what it *is*: 25,903 of the
// 69,376 rows sit under the single namespace `io.github`. v3 tokenized that
// host, so the query `github` matched 26,864 rows — 38.7% of the catalog —
// 16,044 of them on the address alone, with nothing about the row itself
// saying "GitHub". v4 excludes the address's host segment from the token set
// (`addressHost` / `searchableId` below), which drops the `github` match set
// to 10,820 rows (15.6%): every remaining row names GitHub in its name, its
// publisher, its summary or its web address. The byte layout of the index is
// unchanged — only the vocabulary is — but the vocabulary is the artifact, so
// the version moves and a stale index is refused rather than silently
// answering the old question.

/** Bumped when the byte layout changes; every reader refuses a mismatch. */
export const SEARCH_FORMAT_VERSION = 4;

/** ASCII magic at the head of both artifacts. */
const MAGIC = "LSPMSRCH";

/** Section kinds in the section table. */
export const SECTION_INDEX = 1;
export const SECTION_ROWS = 2;

/* ------------------------------------------------------------------ *
 * Tokenizer and matcher — the one semantics every caller agrees on
 * ------------------------------------------------------------------ */

/**
 * A token is a maximal run of Unicode letters and digits, lowercased.
 *
 * Splitting on punctuation is what makes `sequential-thinking` two tokens, and
 * `playwright-mcp` match the query `playwright`. Unicode properties rather
 * than `[a-z0-9]` because the catalog is not ASCII: CJK text has no spaces, so
 * an ASCII tokenizer would tokenize `数据库` to nothing and a CJK query would
 * match nothing at all.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeText(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * The tokens a query is made of. Same tokenizer as the documents, so the two
 * sides can never disagree about where a word begins.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function queryTokens(query) {
  return tokenizeText(query ?? "");
}

/**
 * The host segment of a row's catalog address — the part of the id that says
 * *where the entry is served from* rather than *what the entry is*.
 *
 * An id the MCP registry publishes reads `<kind>:<source>:<host>.<account>-<repo>`.
 * The host is the reverse-DNS namespace the registry files the server under
 * (`io.github` for a server hosted in a GitHub repository, `com.notion` for
 * one hosted on Notion's own domain), and the account that follows it is the
 * publisher's own name.
 *
 * The host is found by locating the publisher's account inside the id's last
 * segment — the account is the one thing both the id and the publisher field
 * agree on. Two cases are deliberately NOT treated as a host:
 *
 *   * the account is the whole leading part of the segment (`ai.thetickeris-
 *     agent-rail`): the publisher's own name *is* the address's host, and the
 *     publisher field already carries it at a stronger match class, so nothing
 *     is lost by leaving the id alone;
 *   * the account cannot be located in the segment (a spelling the id does
 *     not use — the registry's punycode form, for one): the rule never
 *     guesses, and the row keeps its whole id.
 *
 * @param {string} id the row's catalog id
 * @param {string | null | undefined} publisherName the row's publisher name
 * @returns {string} the host labels, or "" when there is none to exclude
 */
export function addressHost(id, publisherName) {
  const text = String(id ?? "");
  const last = text.slice(text.lastIndexOf(":") + 1);
  const account = String(publisherName ?? "").trim();
  if (!account) return "";
  const at = last.indexOf(account);
  if (at <= 0) return "";
  // The account must start a label: `io.github.nirholas-…` puts it after a
  // dot, so the labels before it are the host.
  if (last[at - 1] !== ".") return "";
  return last.slice(0, at - 1);
}

/**
 * The part of a row's id that search may match: the id without its host.
 *
 * The id itself stays the unambiguous key everywhere else — the install
 * command, the entry page, the ledger. This is only about what the *token
 * set* of a row contains, and it is the one place the address's host is
 * dropped.
 *
 * @param {string} id the row's catalog id
 * @param {string | null | undefined} publisherName the row's publisher name
 * @returns {string}
 */
export function searchableId(id, publisherName) {
  const text = String(id ?? "");
  const host = addressHost(text, publisherName);
  if (!host) return text;
  const last = text.slice(text.lastIndexOf(":") + 1);
  const at = last.indexOf(host) + host.length + 1; // past "host."
  return text.slice(0, text.length - last.length) + last.slice(at);
}

/**
 * The text a listing exposes to search, in one fixed order.
 *
 * This is the definition of "what search covers". `matchesQuery` and the index
 * emitter both call this function, so a field added here is added to both — and
 * the agreement gate fails if the emitter is ever changed to tokenize something
 * else.
 *
 * The id contributes everything except its host segment (see `searchableId`):
 * the host says where the entry lives, and a query for it says nothing about
 * the entry.
 *
 * @param {any} item
 * @returns {string}
 */
export function listingText(item) {
  const parts = [
    item.name,
    item.summary,
    item.category,
    item.publisher?.name,
    searchableId(item.id, item.publisher?.name),
    item.slug,
    item.runtime,
    item.transport,
  ];
  for (const tool of item.tools ?? []) {
    if (tool?.name) parts.push(tool.name);
    if (tool?.description) parts.push(tool.description);
  }
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ *
 * Match classes — where a query token was found, and how well
 * ------------------------------------------------------------------ *
 *
 * Every posting carries one 3-bit class. The order below is the ranking
 * order, strongest first, and it is the whole explanation of why a result
 * ranks where it does:
 *
 *   name, exactly the query        an entry *named* GitHub
 *   name, first token starts with  GitHub MCP Server
 *   name, a later token starts with  Awesome GitHub Tools
 *   publisher                      published by `github`
 *   slug                           the URL key names it
 *   body                           summary, category, runtime, transport,
 *                                  tool names and descriptions
 *   catalog id                     the registry identifier, outside its host
 *                                  segment. Last on purpose: `io.github.
 *                                  <publisher>` is a namespace, not content,
 *                                  and the host part of it is not searchable
 *                                  at all (see `searchableId`).
 *
 * A later token that starts with the query token counts as a name match even
 * when it is a prefix (`github30`), because token-prefix is the matcher's
 * semantics everywhere else too.
 */

/** Query token found in the body: summary, category, runtime, transport, tools. */
export const MATCH_BODY = 0;
/** Query token found only in the catalog id. Lowest class. */
export const MATCH_ID = 1;/** Query token found in the slug. */
export const MATCH_SLUG = 2;
/** Query token found in the publisher name. */
export const MATCH_PUBLISHER = 3;
/** Query token found in a name token other than the first. */
export const MATCH_NAME_TOKEN = 4;
/** Query token is a prefix of the first name token. */
export const MATCH_NAME_PREFIX = 5;
/** The name is exactly one token and the query token is that token. */
export const MATCH_NAME_EXACT = 6;

/**
 * Score of each class, indexed by class. Body (1) beats id (0): a summary that
 * mentions GitHub is a claim about the row, while an id that contains
 * `io.github.` is a registry namespace shared by tens of thousands of rows.
 */
export const MATCH_SCORES = [1, 0, 2, 3, 4, 5, 6];

/**
 * The fields a row exposes to search, tokenized, in ranking order.
 *
 * The token sets are what `buildSearchIndex` classifies each document token
 * against. `body` is the same field set `listingText` covers beyond
 * name/publisher/slug/id, so every token `listingText` produces has a class
 * and the index still matches exactly the rows `matchesQuery` matches.
 *
 * @param {any} item
 * @returns {{ name: string[], publisher: string[], slug: string[], body: string[], id: string[] }}
 */
export function matchFieldTokens(item) {
  const bodyParts = [item.summary, item.category, item.runtime, item.transport];
  for (const tool of item.tools ?? []) {
    if (tool?.name) bodyParts.push(tool.name);
    if (tool?.description) bodyParts.push(tool.description);
  }
  return {
    name: tokenizeText(item.name ?? ""),
    publisher: tokenizeText(item.publisher?.name ?? ""),
    slug: tokenizeText(item.slug ?? ""),
    body: [...new Set(tokenizeText(bodyParts.filter(Boolean).join(" ")))],
    // The id without its host segment: the host says where the entry is
    // served from, and a query for it says nothing about the entry.
    id: [...new Set(tokenizeText(searchableId(item.id, item.publisher?.name)))],
  };
}

/**
 * The strongest class at which `token` matches the row's fields.
 *
 * This is the one classifier: `buildSearchIndex` calls it per document token,
 * and `explainMatch` re-derives the same answer from a hydrated row. A field
 * added here is added to both, and the class the index ranks by is the class
 * the page explains.
 *
 * @param {string} token
 * @param {ReturnType<typeof matchFieldTokens>} fields
 * @returns {number} a MATCH_* class, or -1 when nothing matches
 */
export function matchClassOfToken(token, fields) {
  const name = fields.name;
  if (name.length === 1 && name[0] === token) return MATCH_NAME_EXACT;
  if (name.length > 0 && name[0].startsWith(token)) return MATCH_NAME_PREFIX;
  for (let i = 1; i < name.length; i += 1) {
    if (name[i].startsWith(token)) return MATCH_NAME_TOKEN;
  }
  if (fields.publisher.some((t) => t.startsWith(token))) return MATCH_PUBLISHER;
  if (fields.slug.some((t) => t.startsWith(token))) return MATCH_SLUG;
  if (fields.body.some((t) => t.startsWith(token))) return MATCH_BODY;
  if (fields.id.some((t) => t.startsWith(token))) return MATCH_ID;
  return -1;
}

/* ------------------------------------------------------------------ *
 * Tie-break signals — the only quality facts the dataset carries
 * ------------------------------------------------------------------ *
 *
 * Equal match classes are common on a large result set, so ties break on the
 * three facts a reader can check on any row. There is deliberately no
 * popularity term: the catalog publishes no stars, downloads or install
 * counts, so none is invented. `verified` is exactly
 * `publisher.provenance === "vendor-manifest"` over this dataset (40,724 of
 * 69,376 rows; the other 28,652 are `awesome-list-claim`), which is why
 * provenance is not a separate bit. The third signal is the upstream
 * directory's own "Official Skills by …" classification.
 */

const SIGNAL_INSTALLABLE = 4;
const SIGNAL_VERIFIED = 2;
const SIGNAL_OFFICIAL = 1;

/**
 * The installability predicate, mirroring `lib/availability.ts` `availabilityOf`
 * (which mirrors `domain.Listing.IsInstallable()` + the launch-line rule):
 * pinned plugin sources install in principle; other kinds require established installability, and an
 * MCP row additionally needs a transport. Duplicated in plain JS because the
 * index is built by Node scripts that cannot import TypeScript; if
 * `availability.ts` changes its rule, this must change with it.
 *
 * @param {any} item
 * @returns {boolean}
 */
function rowInstalls(item) {
  // Keep in sync with availabilityOf in lib/availability.ts. A plugin with
  // a fetchable, commit-pinned Git tree has a wired install path, subject to
  // per-host and manifest validation at install time.
  if (item.kind === "plugin") {
    const artifact = item.artifact;
    return Boolean(artifact && artifact.type === "git-tree" && artifact.pinned && artifact.sha);
  }
  const established =
    item.installability === "metadata_verified" ||
    item.installability === "runtime_verified" ||
    item.installability === "litespm_tested";
  if (!established) return false;
  if (item.kind === "mcp" && !item.transport) return false;
  return true;
}

/**
 * The 3-bit tie-break signal for one row: installable (4) > verified
 * publisher (2) > upstream Official Skills classification (1). Higher sorts
 * first among equal match scores.
 *
 * @param {any} item
 * @returns {number} 0..7
 */
export function rankSignalOf(item) {
  let signal = 0;
  if (item.category === "Official Skills by") signal |= SIGNAL_OFFICIAL;
  if (item.publisher?.verified) signal |= SIGNAL_VERIFIED;
  if (rowInstalls(item)) signal |= SIGNAL_INSTALLABLE;
  return signal;
}

/**
 * Does a document token set satisfy every query token as a *prefix*?
 *
 * Token-prefix, not substring: `play` matches `playwright`, but `sign` does
 * not match `design` and `codesign` does not match `design` — a substring
 * matcher answers yes to both, which is worse for the reader. It is also the
 * only semantics a 2.9 MiB exact index can reproduce; a substring matcher
 * would need an n-gram or suffix index many times larger.
 *
 * @param {string[]} tokens query tokens, already lowercased
 * @param {readonly string[]} docTokens
 * @returns {boolean}
 */
export function matchesTokenPrefixes(tokens, docTokens) {
  if (tokens.length === 0) return true;
  for (const token of tokens) {
    let hit = false;
    for (const docToken of docTokens) {
      if (docToken.startsWith(token)) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}

/**
 * The runtime form of `matchesQuery` over an already-tokenized document.
 *
 * @param {readonly string[]} docTokens
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQueryTokens(docTokens, query) {
  return matchesTokenPrefixes(queryTokens(query), docTokens);
}

/* ------------------------------------------------------------------ *
 * Small binary primitives
 * ------------------------------------------------------------------ */

/**
 * LEB128 varint. Postings are row indices and deltas, so almost all of them
 * are one byte; a fixed u32 would more than double the postings blob.
 *
 * @param {number} value non-negative integer
 * @param {number[]} out
 */
function writeVarint(value, out) {
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/** @param {Uint8Array} bytes @param {number} at @returns {[number, number]} value, next offset */
function readVarint(bytes, at) {
  let value = 0;
  let shift = 0;
  let pos = at;
  for (;;) {
    const byte = bytes[pos];
    pos += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7;
    if (shift > 42) throw new Error("varint overflow");
  }
}

/** @param {number} value @returns {number} encoded byte length */
function varintLength(value) {
  let v = value >>> 0;
  let length = 1;
  while (v >= 0x80) {
    v >>>= 7;
    length += 1;
  }
  return length;
}

/**
 * Compare two Uint8Arrays lexicographically. This is the order tokens are
 * stored in, and the order a byte-level prefix range is contiguous in.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {number}
 */
function compareBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** @param {string} s @returns {Uint8Array} */
function utf8(s) {
  return encoder.encode(s);
}

/* ------------------------------------------------------------------ *
 * Search index: vocabulary + delta-varint postings
 * ------------------------------------------------------------------ */

/**
 * Build the postings of every token across the whole row set.
 *
 * Postings are **row indices, not ids**: 69,376 fits in 17 bits, while string
 * ids are ~30 characters each — at 1.9M postings the difference is the whole
 * artifact. Indices are also what the browser needs to hydrate a result from
 * the display projection, so the two artifacts share one coordinate system.
 *
 * Each posting carries its **match class** (see the MATCH_* block above): the
 * strongest field in which this token was found in this row. That class is the
 * ranking, and it is what `explainMatch` renders. The per-row tie-break signals
 * are computed in the same pass.
 *
 * @param {any[]} rows
 * @returns {{ tokens: string[], tokenBytes: Uint8Array[], postings: number[][], postingClasses: number[][], signals: Uint8Array, rowCount: number, postingsCount: number }}
 */
export function buildSearchIndex(rows) {
  /** @type {Map<string, number[]>} */
  const all = new Map();
  /** @type {Map<string, number[]>} */
  const classes = new Map();
  const signals = new Uint8Array(rows.length);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    signals[i] = rankSignalOf(row);
    const fields = matchFieldTokens(row);
    const docTokens = new Set(tokenizeText(listingText(row)));
    for (const token of docTokens) {
      let list = all.get(token);
      if (!list) all.set(token, (list = []));
      list.push(i);
      let classList = classes.get(token);
      if (!classList) classes.set(token, (classList = []));
      // `matchClassOfToken` returns -1 only if `listingText` grows a field that
      // `matchFieldTokens` does not classify — a drift the agreement gate would
      // catch on the next build. Clamp to the lowest class so a hypothetical
      // drift cannot promote a row, and never write an unscoreable class.
      const matchClass = matchClassOfToken(token, fields);
      classList.push(matchClass === -1 ? MATCH_ID : matchClass);
    }
  }

  // Sort by UTF-8 byte order: the order in which a prefix is a contiguous
  // range, and the order the decoder binary-searches in.
  const tokenBytes = [...all.keys()].map(utf8);
  const tokens = [...all.keys()];
  const order = tokens.map((_, i) => i).sort((a, b) => compareBytes(tokenBytes[a], tokenBytes[b]));
  const sortedTokens = order.map((i) => tokens[i]);
  const sortedBytes = order.map((i) => tokenBytes[i]);
  const sortedPostings = order.map((i) => all.get(tokens[i]));
  const sortedClasses = order.map((i) => classes.get(tokens[i]));

  let postingsCount = 0;
  for (const list of sortedPostings) postingsCount += list.length;

  return {
    tokens: sortedTokens,
    tokenBytes: sortedBytes,
    postings: /** @type {number[][]} */ (sortedPostings),
    postingClasses: /** @type {number[][]} */ (sortedClasses),
    signals,
    rowCount: rows.length,
    postingsCount,
  };
}

/**
 * Encode a built index into the INDEX section payload (format v2).
 *
 * Layout, little-endian:
 *
 *   u32 rowCount, u32 tokenCount, u32 postingsCount, u32 reserved
 *   varint vocabLength[tokenCount]     byte length of each vocabulary token
 *   varint blockLength[tokenCount]     byte length of each token's block
 *   vocab bytes                        the tokens, in byte order
 *   blocks                             per token:
 *                                        varint classBytes length
 *                                        class bits, 3 per non-body posting
 *                                        delta-varint postings, `delta << 1 |
 *                                        (class !== body)`
 *   signals                            3 bits per row, rowCount*3 bits total
 *
 * Length tables rather than absolute u32 offsets: two u32 tables cost 8 bytes
 * per token (0.76 MiB at 99,483 tokens), while the lengths are one varint each
 * and the decoder accumulates them into offsets in one linear pass. The class
 * bits ride in a separate stream per token instead of widening every delta to
 * three low bits, which keeps the common one-byte delta (and its compression)
 * intact — measured 3.94 MiB raw / 2.41 MiB gzip against v1's 4.19 / 2.68.
 *
 * Deterministic: every byte is a pure function of the row order and the
 * tokenizer, and no map iteration order leaks in (the vocabulary is sorted by
 * its own bytes).
 *
 * @param {ReturnType<typeof buildSearchIndex>} index
 * @returns {Uint8Array}
 */
export function encodeSearchIndex(index) {
  const T = index.tokens.length;
  const header = 16;

  // Pass 1: measure. Class bytes per token, then the block length that holds
  // the class-length varint, the class bits and the postings.
  const vocabLengths = new Uint32Array(T);
  const blockLengths = new Uint32Array(T);
  for (let i = 0; i < T; i += 1) {
    vocabLengths[i] = index.tokenBytes[i].length;
    const list = index.postings[i];
    const classes = index.postingClasses[i];
    let specials = 0;
    let postingBytes = 0;
    let previous = 0;
    for (let k = 0; k < list.length; k += 1) {
      const delta = list[k] - previous;
      previous = list[k];
      postingBytes += varintLength((delta << 1) | (classes[k] === MATCH_BODY ? 0 : 1));
      if (classes[k] !== MATCH_BODY) specials += 1;
    }
    const classBytes = Math.ceil((specials * 3) / 8);
    blockLengths[i] = varintLength(classBytes) + classBytes + postingBytes;
  }

  let vocabLength = 0;
  for (let i = 0; i < T; i += 1) vocabLength += vocabLengths[i];
  let tableLength = 0;
  for (let i = 0; i < T; i += 1) tableLength += varintLength(vocabLengths[i]);
  for (let i = 0; i < T; i += 1) tableLength += varintLength(blockLengths[i]);
  let blocksLength = 0;
  for (let i = 0; i < T; i += 1) blocksLength += blockLengths[i];
  const signalBytes = Math.ceil((index.rowCount * 3) / 8);

  const vocabStart = header + tableLength;
  const blocksStart = vocabStart + vocabLength;
  const signalsStart = blocksStart + blocksLength;
  const out = new Uint8Array(signalsStart + signalBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, index.rowCount, true);
  view.setUint32(4, T, true);
  view.setUint32(8, index.postingsCount, true);
  view.setUint32(12, 0, true);

  // Pass 2: write.
  const table = [];
  for (let i = 0; i < T; i += 1) writeVarint(vocabLengths[i], table);
  for (let i = 0; i < T; i += 1) writeVarint(blockLengths[i], table);
  out.set(table, header);

  let at = vocabStart;
  for (let i = 0; i < T; i += 1) {
    out.set(index.tokenBytes[i], at);
    at += vocabLengths[i];
  }

  at = blocksStart;
  for (let i = 0; i < T; i += 1) {
    const list = index.postings[i];
    const classes = index.postingClasses[i];
    let specials = 0;
    for (let k = 0; k < list.length; k += 1) if (classes[k] !== MATCH_BODY) specials += 1;
    const classBytes = Math.ceil((specials * 3) / 8);
    const classStart = at + varintLength(classBytes);
    const postingStart = classStart + classBytes;

    const lengthBytes = [];
    writeVarint(classBytes, lengthBytes);
    out.set(lengthBytes, at);

    let bitBuffer = 0;
    let bitCount = 0;
    let classAt = classStart;
    let postAt = postingStart;
    let previous = 0;
    for (let k = 0; k < list.length; k += 1) {
      const delta = list[k] - previous;
      previous = list[k];
      const special = classes[k] !== MATCH_BODY;
      const postingBytes = [];
      writeVarint((delta << 1) | (special ? 1 : 0), postingBytes);
      out.set(postingBytes, postAt);
      postAt += postingBytes.length;
      if (special) {
        bitBuffer |= classes[k] << bitCount;
        bitCount += 3;
        while (bitCount >= 8) {
          out[classAt] = bitBuffer & 0xff;
          classAt += 1;
          bitBuffer >>>= 8;
          bitCount -= 8;
        }
      }
    }
    if (bitCount > 0) out[classAt] = bitBuffer & 0xff;
    at += blockLengths[i];
  }

  let signalBuffer = 0;
  let signalCount = 0;
  let signalAt = signalsStart;
  for (let i = 0; i < index.rowCount; i += 1) {
    signalBuffer |= index.signals[i] << signalCount;
    signalCount += 3;
    while (signalCount >= 8) {
      out[signalAt] = signalBuffer & 0xff;
      signalAt += 1;
      signalBuffer >>>= 8;
      signalCount -= 8;
    }
  }
  if (signalCount > 0) out[signalAt] = signalBuffer & 0xff;
  return out;
}

/**
 * Decode an INDEX section payload into the query-ready form.
 *
 * The vocabulary stays as bytes plus offsets: prefix search is a byte-range
 * binary search, and decoding 100k strings up front would allocate more memory
 * than the artifact itself. The length tables are accumulated into absolute
 * offsets here, once, so the hot path is unchanged.
 *
 * @param {Uint8Array} payload
 * @returns {{ rowCount: number, tokenCount: number, postingsCount: number, vocabOffsets: Uint32Array, blockOffsets: Uint32Array, vocab: Uint8Array, blocks: Uint8Array, signals: Uint8Array }}
 */
export function decodeSearchIndex(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const rowCount = view.getUint32(0, true);
  const tokenCount = view.getUint32(4, true);
  const postingsCount = view.getUint32(8, true);

  let at = 16;
  const vocabLengths = new Uint32Array(tokenCount);
  const blockLengths = new Uint32Array(tokenCount);
  for (let i = 0; i < tokenCount; i += 1) {
    const [length, next] = readVarint(payload, at);
    at = next;
    vocabLengths[i] = length;
  }
  for (let i = 0; i < tokenCount; i += 1) {
    const [length, next] = readVarint(payload, at);
    at = next;
    blockLengths[i] = length;
  }

  const vocabOffsets = new Uint32Array(tokenCount + 1);
  const blockOffsets = new Uint32Array(tokenCount + 1);
  let vocabLength = 0;
  let blocksLength = 0;
  for (let i = 0; i < tokenCount; i += 1) {
    vocabOffsets[i] = vocabLength;
    vocabLength += vocabLengths[i];
    blockOffsets[i] = blocksLength;
    blocksLength += blockLengths[i];
  }
  vocabOffsets[tokenCount] = vocabLength;
  blockOffsets[tokenCount] = blocksLength;

  const vocabStart = at;
  const vocab = payload.subarray(vocabStart, vocabStart + vocabLength);
  const blocks = payload.subarray(vocabStart + vocabLength, vocabStart + vocabLength + blocksLength);

  // Unpack the 3-bit per-row signals once; queries read them per candidate row.
  const signalsStart = vocabStart + vocabLength + blocksLength;
  const signals = new Uint8Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    const bit = i * 3;
    const byteAt = signalsStart + (bit >> 3);
    const shift = bit & 7;
    let value = payload[byteAt] >> shift;
    if (shift > 5) value |= payload[byteAt + 1] << (8 - shift);
    signals[i] = value & 7;
  }

  return {
    rowCount,
    tokenCount,
    postingsCount,
    vocabOffsets,
    blockOffsets,
    vocab,
    blocks,
    signals,
  };
}

/**
 * First token index whose bytes are >= `prefix`, by byte binary search.
 *
 * @param {ReturnType<typeof decodeSearchIndex>} index
 * @param {Uint8Array} prefix
 * @returns {number}
 */
function lowerBoundToken(index, prefix) {
  let lo = 0;
  let hi = index.tokenCount;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const start = index.vocabOffsets[mid];
    const end = index.vocabOffsets[mid + 1];
    const token = index.vocab.subarray(start, end);
    if (compareBytes(token, prefix) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The contiguous token range whose tokens start with `prefix`.
 *
 * @param {ReturnType<typeof decodeSearchIndex>} index
 * @param {Uint8Array} prefix
 * @returns {[number, number]} [start, end) token indices
 */
function prefixRange(index, prefix) {
  const start = lowerBoundToken(index, prefix);
  let end = start;
  while (end < index.tokenCount) {
    const from = index.vocabOffsets[end];
    const to = index.vocabOffsets[end + 1];
    if (to - from < prefix.length) break;
    let matches = true;
    for (let i = 0; i < prefix.length; i += 1) {
      if (index.vocab[from + i] !== prefix[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) break;
    end += 1;
  }
  return [start, end];
}

/**
 * Read one token's postings, deltas decoded, into `out`, with each posting's
 * match class in `classes`.
 *
 * The block layout is [varint classBytes][class bits][postings]; the class bit
 * stream is read in the same order the special postings appear, so one cursor
 * per token is enough.
 *
 * @param {ReturnType<typeof decodeSearchIndex>} index
 * @param {number} tokenIndex
 * @param {number[]} out
 * @param {number[]} classes
 */
function readPostings(index, tokenIndex, out, classes) {
  const start = index.blockOffsets[tokenIndex];
  const end = index.blockOffsets[tokenIndex + 1];
  const [classBytes, afterLength] = readVarint(index.blocks, start);
  const classStart = afterLength;
  let classBit = 0;
  let at = afterLength + classBytes;
  let previous = 0;
  while (at < end) {
    const [value, next] = readVarint(index.blocks, at);
    at = next;
    const special = value & 1;
    previous += value >>> 1;
    out.push(previous);
    let code = MATCH_BODY;
    if (special) {
      const byteAt = classStart + (classBit >> 3);
      const shift = classBit & 7;
      let packed = index.blocks[byteAt] >> shift;
      if (shift > 5) packed |= index.blocks[byteAt + 1] << (8 - shift);
      code = packed & 7;
      classBit += 3;
    }
    classes.push(code);
  }
}

/**
 * Query the index: every row matching every query token as a prefix, ranked.
 *
 * Ranking is deterministic and explainable, and it is the sum of the per-token
 * match classes (see the MATCH_* block): a row named exactly `GitHub` scores 6
 * for that token, `GitHub MCP Server` 5, `Awesome GitHub Tools` 4, a row
 * published by `github` 3, one that only says GitHub in its summary 1, and one
 * whose registry id contains `io.github.` 0. Every query token must match and
 * the scores accumulate, so a multi-token query rewards the row that names
 * more of it. Equal scores break on the row's tie-break signal (installable,
 * verified publisher, upstream Official Skills classification) and finally on
 * row index, the dataset's own order. Nothing here can consult popularity —
 * the dataset carries none.
 *
 * One adjustment is query-aware: the index's MATCH_NAME_EXACT means "the
 * document token is the whole name", but for a query token that is a *prefix*
 * of a longer name (`postgres` against a row named `PostgreSQL`) the same
 * posting is a name-prefix match, not an exact one. Postings read from a
 * vocabulary token longer than the query token are downgraded accordingly.
 *
 * @param {ReturnType<typeof decodeSearchIndex>} index
 * @param {string} query
 * @returns {number[]} row indices, most relevant first
 */
export function querySearchIndex(index, query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    const all = new Array(index.rowCount);
    for (let i = 0; i < index.rowCount; i += 1) all[i] = i;
    return all;
  }

  /** @type {Map<number, number> | null} */
  let result = null;
  for (const token of tokens) {
    const bytes = utf8(token);
    const [start, end] = prefixRange(index, bytes);
    if (start === end) return []; // this token matches nothing: so does the query

    /** @type {Map<number, number>} */
    const tokenScores = new Map();
    for (let t = start; t < end; t += 1) {
      const exactToken = index.vocabOffsets[t + 1] - index.vocabOffsets[t] === bytes.length;
      /** @type {number[]} */
      const rows = [];
      /** @type {number[]} */
      const classes = [];
      readPostings(index, t, rows, classes);
      for (let i = 0; i < rows.length; i += 1) {
        let code = classes[i];
        if (!exactToken && code === MATCH_NAME_EXACT) code = MATCH_NAME_PREFIX;
        const score = MATCH_SCORES[code] ?? 0;
        const current = tokenScores.get(rows[i]);
        if (current === undefined || score > current) tokenScores.set(rows[i], score);
      }
    }

    // Every query token must match: this is an intersection with score
    // accumulation, not a union. A union here would return rows that contain
    // only one of the words — the exact disagreement this module exists to
    // prevent, caught by `scripts/check-search-index.mjs`.
    if (result === null) {
      result = tokenScores;
      continue;
    }
    for (const [row, score] of result) {
      const tokenScore = tokenScores.get(row);
      if (tokenScore === undefined) result.delete(row);
      else result.set(row, score + tokenScore);
    }
    if (result.size === 0) return [];
  }

  const signals = index.signals;
  return [...(result ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1] || signals[b[0]] - signals[a[0]] || a[0] - b[0])
    .map(([row]) => row);
}

/* ------------------------------------------------------------------ *
 * Match explanation — why a row is in the result set, and where
 * ------------------------------------------------------------------ */

/**
 * One query token's match in one row, with a fragment around the matched text.
 *
 * `field` names the field the match was found in; `fragment` is a window of
 * that field's text around the match, or null when the match can only be in
 * text this projection does not carry (a tool description, or a summary past
 * the display cap).
 *
 * @typedef {{
 *   token: string,
 *   className: number,
 *   score: number,
 *   field: string,
 *   fragment: { text: string, start: number, end: number } | null,
 * }} MatchExplanation
 */

/** The first token-boundary occurrence of `token` in `text`, with offsets. */
function tokenAt(text, token) {
  const source = String(text ?? "");
  const lower = source.toLowerCase();
  const re = /[\p{L}\p{N}]+/gu;
  let match;
  while ((match = re.exec(lower))) {
    if (match[0].startsWith(token)) return { start: match.index, end: match.index + token.length };
  }
  return null;
}

/** The same scan as `tokenAt`, but for the name, where position decides class. */
function nameAt(text, token) {
  const source = String(text ?? "");
  const lower = source.toLowerCase();
  const re = /[\p{L}\p{N}]+/gu;
  /** @type {RegExpExecArray[]} */
  const matches = [];
  let match;
  while ((match = re.exec(lower))) matches.push(match);
  for (let i = 0; i < matches.length; i += 1) {
    if (!matches[i][0].startsWith(token)) continue;
    const className =
      matches.length === 1 && matches[i][0] === token
        ? MATCH_NAME_EXACT
        : i === 0
          ? MATCH_NAME_PREFIX
          : MATCH_NAME_TOKEN;
    return { className, start: matches[i].index, end: matches[i].index + token.length };
  }
  return null;
}

/** A window of `text` around [start, end), with ellipses where it was cut. */
function fragmentAround(text, start, end) {
  const source = String(text);
  const radius = 42;
  const from = Math.max(0, start - radius);
  const to = Math.min(source.length, end + radius);
  const lead = from > 0 ? "…" : "";
  const trail = to < source.length ? "…" : "";
  return {
    text: `${lead}${source.slice(from, to)}${trail}`,
    start: lead.length + (start - from),
    end: lead.length + (end - from),
  };
}

/** @param {string} token @param {any} item @returns {MatchExplanation} */
function explainToken(item, token) {
  const name = nameAt(item.name, token);
  if (name) {
    return {
      token,
      className: name.className,
      score: MATCH_SCORES[name.className],
      field: "name",
      fragment: fragmentAround(item.name, name.start, name.end),
    };
  }

  /** @type {Array<[string, string, number]>} field id, text, class */
  const candidates = [
    ["publisher", item.publisher?.name ?? "", MATCH_PUBLISHER],
    ["slug", item.slug ?? "", MATCH_SLUG],
    ["summary", item.summary ?? "", MATCH_BODY],
    ["category", item.category ?? "", MATCH_BODY],
    ["runtime", item.runtime ?? "", MATCH_BODY],
    ["transport", item.transport ?? "", MATCH_BODY],
    // The id without its host segment, exactly as the matcher tokenized it:
    // an explanation must not name a field the match did not come from.
    ["id", searchableId(item.id, item.publisher?.name), MATCH_ID],
  ];
  for (const [field, text, className] of candidates) {
    if (!text) continue;
    const at = tokenAt(text, token);
    if (at) {
      return {
        token,
        className,
        score: MATCH_SCORES[className],
        field,
        fragment: fragmentAround(text, at.start, at.end),
      };
    }
  }

  // The row is a result, so the token is in `listingText` somewhere — but the
  // display projection carries no tool names or descriptions, and summaries
  // are capped. The honest answer is the field family, not a guessed fragment.
  return { token, className: MATCH_BODY, score: MATCH_SCORES[MATCH_BODY], field: "tool", fragment: null };
}

/**
 * Explain why `item` matched `query`: one entry per query token, plus the
 * strongest of them. Computed from the hydrated row with the same classifier
 * the index was built from, so a row's explanation and its rank cannot
 * disagree.
 *
 * @param {any} item a row hydrated from the display projection
 * @param {string} query
 * @returns {{ tokens: MatchExplanation[], best: MatchExplanation } | null}
 */
export function explainMatch(item, query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  const parts = tokens.map((token) => explainToken(item, token));
  let best = parts[0];
  for (const part of parts) if (part.score > best.score) best = part;
  return { tokens: parts, best };
}

/* ------------------------------------------------------------------ *
 * Display projection: everything a result card renders, nothing else
 * ------------------------------------------------------------------ */

/** Summary cap. The row card clamps to two lines at 82ch and the card to
 *  three at ~45ch, so 200 characters covers every pixel both densities can
 *  show; the full text stays on the product page, which fetches its own
 *  bucket. Measured on the real dataset this is 7.55 MiB of the projection's
 *  ~13.5 MiB — the single dominant cost, and the cap is what keeps it there. */
export const SUMMARY_CAP = 200;

/**
 * Rows per search shard.
 *
 * The display projection is also emitted as a sharded set, one self-contained
 * ROWS container per `SEARCH_SHARD_ROWS` rows, so a search can fetch only the
 * shards that hold the results it is about to render instead of the whole
 * 4.98 MiB gzipped projection. Measured over a 25-query corpus on the real
 * dataset (69,376 rows): 68 rows per shard puts the first 48 results at
 * 120 KiB / 22 requests for `postgres` and at most 223 KiB / 41 requests for
 * any query in the corpus — against 4.98 MiB for the whole projection.
 *
 * This constant is the layout: the emitter writes shard files under a path
 * that names it, and the browser derives shard indices from it, so the two
 * cannot disagree. The value is a wire-cost trade-off, not a byte-layout
 * change: smaller shards cut bytes per fetch and add per-shard dictionary
 * overhead and requests.
 */
export const SEARCH_SHARD_ROWS = 68;

/**
 * How many matched rows a windowed search hydrates up front.
 *
 * The landing page renders 24 result cards and pages them 24 at a time, so a
 * 48-row window covers the first two pages with one shard fetch; `requestMore`
 * grows it. The gate pins the wire cost of this window over its query corpus.
 */
export const SEARCH_RESULT_WINDOW = 48;

/** How many shards cover `rowCount` rows. */
export function searchShardCount(rowCount) {
  return Math.ceil(rowCount / SEARCH_SHARD_ROWS);
}

/**
 * The global row range `[start, end)` of one shard.
 *
 * @param {number} rowCount
 * @param {number} shardIndex
 * @returns {[number, number]}
 */
export function searchShardRange(rowCount, shardIndex) {
  const start = shardIndex * SEARCH_SHARD_ROWS;
  return [start, Math.min(rowCount, start + SEARCH_SHARD_ROWS)];
}

/** Dictionary slot order inside the ROWS section. */
const DICT_CATEGORIES = 0;
const DICT_PUBLISHERS = 1;
const DICT_RUNTIMES = 2;
const DICT_TRANSPORTS = 3;
const DICT_VERSIONS = 4;
const DICT_INSTALLABILITY = 5;
const DICT_KINDS = 6;
const DICT_HOSTS = 7;
const DICT_ID_PREFIXES = 8;
const DICT_PROVENANCE = 9;
const DICT_SOURCE = 10;
const DICT_COUNT = 11;

/**
 * Cap a summary at a word boundary and mark it as truncated.
 *
 * A cap in the middle of a word reads as a typo; the ellipsis is what tells
 * the reader the rest exists on the product page.
 *
 * @param {string} summary
 * @returns {string}
 */
export function capSummary(summary) {
  const text = String(summary ?? "");
  if (text.length <= SUMMARY_CAP) return text;
  const slice = text.slice(0, SUMMARY_CAP);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > SUMMARY_CAP * 0.6 ? slice.slice(0, cut) : slice).trimEnd()}…`;
}

/** @param {any} item @returns {string} */
function idPrefixOf(id) {
  const at = id.lastIndexOf(":");
  return at === -1 ? "" : id.slice(0, at + 1);
}

/** @param {any} item @returns {string} */
function idSuffixOf(id) {
  const at = id.lastIndexOf(":");
  return at === -1 ? id : id.slice(at + 1);
}

/**
 * Build the display projection for every row.
 *
 * The projection exists because search results must be renderable without the
 * ordered shards: the old path pulled all 42.78 MiB of rows to show 24 cards.
 * Everything here is what `CapabilityCard`, `ExtensionCard`, `availabilityOf`
 * and `hostsFor` actually read, plus the fields `matchesQuery` reads so the
 * hydrated row is a faithful `Listing` for the matcher.
 *
 * `options.linkKeyIsId` exists for the sharded emission: a shard only sees its
 * own slice, but slug ambiguity is a fact about the *whole* dataset, so the
 * shard builder resolves it once globally and hands the answer in. Omitting it
 * resolves the link key from `rows` itself, which is what the full projection
 * wants.
 *
 * @param {any[]} rows
 * @param {{ linkKeyIsId?: (row: any, index: number) => boolean }} [options]
 * @returns {{ rowCount: number, dicts: string[][], records: (string | number)[][] }}
 */
export function buildDisplayRows(rows, options = {}) {
  /** @type {Map<string, number>[]} */
  const dictIndex = Array.from({ length: DICT_COUNT }, () => new Map());
  /** @type {string[][]} */
  const dicts = Array.from({ length: DICT_COUNT }, () => []);

  /**
   * @param {number} which
   * @param {string} value
   * @returns {number}
   */
  const intern = (which, value) => {
    const map = dictIndex[which];
    const hit = map.get(value);
    if (hit !== undefined) return hit;
    const index = dicts[which].length;
    map.set(value, index);
    dicts[which].push(value);
    return index;
  };

  // Ambiguous slugs fall back to the id for the link key, exactly as
  // `withLinkKeys` does at runtime — resolved once here, over the whole set,
  // where the counts are actually global. A shard builder passes the global
  // answer in because its own slice cannot see it.
  const linkKeyIsId = options.linkKeyIsId;
  /** @type {Map<string, number> | null} */
  let slugCounts = null;
  if (!linkKeyIsId) {
    slugCounts = new Map();
    for (const row of rows) slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
  }

  const records = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const id = String(row.id ?? "");
    const slug = String(row.slug ?? "");
    records.push([
      intern(DICT_ID_PREFIXES, idPrefixOf(id)),
      idSuffixOf(id),
      String(row.name ?? ""),
      capSummary(row.summary),
      slug,
      intern(DICT_CATEGORIES, String(row.category ?? "")),
      intern(DICT_PUBLISHERS, String(row.publisher?.name ?? "")),
      row.publisher?.verified ? 1 : 0,
      linkKeyIsId
        ? linkKeyIsId(row, i)
          ? 1
          : 0
        : slugCounts.get(row.slug) === 1
          ? 0
          : 1,
      intern(DICT_KINDS, String(row.kind ?? "")),
      intern(DICT_PROVENANCE, row.publisher?.provenance == null ? "" : String(row.publisher.provenance)),
      intern(DICT_RUNTIMES, row.runtime == null ? "" : String(row.runtime)),
      intern(DICT_TRANSPORTS, row.transport == null ? "" : String(row.transport)),
      intern(DICT_VERSIONS, row.version == null ? "" : String(row.version)),
      intern(DICT_INSTALLABILITY, row.installability == null ? "" : String(row.installability)),
      intern(DICT_SOURCE, row.source == null ? "" : String(row.source)),
      (row.compatibleHosts ?? []).map((host) => intern(DICT_HOSTS, String(host))),
    ]);
  }
  return { rowCount: rows.length, dicts, records };
}

/**
 * Build the sharded display projection: one self-contained ROWS container per
 * `SEARCH_SHARD_ROWS` rows, in row order.
 *
 * Each shard carries its own dictionaries, so a shard fetch is a complete
 * answer — no shared dictionary block to fetch first, no cross-file state to
 * keep coherent. The duplicated publisher names cost a few KiB per shard and
 * only on the shards actually fetched; the alternative (a global dictionary)
 * would make every window pay for a 30,269-entry table it mostly does not
 * need.
 *
 * Deterministic by construction: shard boundaries are a pure function of the
 * row count, and the link-key decision is resolved over the whole set first.
 *
 * @param {any[]} rows
 * @returns {Uint8Array[]} one encoded container per shard, in order
 */
export function buildDisplayShards(rows) {
  const slugCounts = new Map();
  for (const row of rows) slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
  const shardCount = searchShardCount(rows.length);
  const shards = [];
  for (let shard = 0; shard < shardCount; shard += 1) {
    const [start, end] = searchShardRange(rows.length, shard);
    const display = buildDisplayRows(rows.slice(start, end), {
      linkKeyIsId: (row) => slugCounts.get(row.slug) !== 1,
    });
    shards.push(
      encodeContainer([{ kind: SECTION_ROWS, payload: encodeDisplayRows(display) }])
    );
  }
  return shards;
}

/**
 * Encode a built projection into the ROWS section payload.
 *
 * Record shape (little-endian, varint lengths):
 *
 *   u16 idPrefixIdx, varint idSuffixLen + bytes,
 *   varint nameLen + bytes, varint summaryLen + bytes, varint slugLen + bytes,
 *   u8 categoryIdx, u16 publisherIdx, u8 flags (bit0 verified, bit1 linkKey=id),
 *   u8 kindIdx, u8 provenanceIdx, u8 runtimeIdx, u8 transportIdx,
 *   u16 versionIdx, u8 installabilityIdx, u16 sourceIdx,
 *   varint hostCount + u8 hostIdx[hostCount]
 *
 * Absent runtime / transport / version / installability / source are dictionary
 * slot 0, so a null never needs a separate presence bit.
 *
 * @param {ReturnType<typeof buildDisplayRows>} display
 * @returns {Uint8Array}
 */
export function encodeDisplayRows(display) {
  /** @type {number[]} */
  const recordBytes = [];
  const recordOffsets = new Uint32Array(display.rowCount + 1);

  for (let i = 0; i < display.rowCount; i += 1) {
    recordOffsets[i] = recordBytes.length;
    const [
      idPrefixIdx,
      idSuffix,
      name,
      summary,
      slug,
      categoryIdx,
      publisherIdx,
      verified,
      linkKeyIsId,
      kindIdx,
      provenanceIdx,
      runtimeIdx,
      transportIdx,
      versionIdx,
      installabilityIdx,
      sourceIdx,
      hosts,
    ] = display.records[i];

    recordBytes.push(idPrefixIdx & 0xff, (idPrefixIdx >> 8) & 0xff);
    const idSuffixBytes = utf8(String(idSuffix));
    writeVarint(idSuffixBytes.length, recordBytes);
    for (const byte of idSuffixBytes) recordBytes.push(byte);
    for (const text of [String(name), String(summary), String(slug)]) {
      const bytes = utf8(text);
      writeVarint(bytes.length, recordBytes);
      for (const byte of bytes) recordBytes.push(byte);
    }
    recordBytes.push(categoryIdx & 0xff);
    recordBytes.push(publisherIdx & 0xff, (publisherIdx >> 8) & 0xff);
    recordBytes.push((verified ? 1 : 0) | (linkKeyIsId ? 2 : 0));
    recordBytes.push(kindIdx & 0xff, provenanceIdx & 0xff, runtimeIdx & 0xff, transportIdx & 0xff);
    recordBytes.push(versionIdx & 0xff, (versionIdx >> 8) & 0xff);
    recordBytes.push(installabilityIdx & 0xff);
    recordBytes.push(sourceIdx & 0xff, (sourceIdx >> 8) & 0xff);
    const hostList = /** @type {number[]} */ (hosts);
    writeVarint(hostList.length, recordBytes);
    for (const host of hostList) recordBytes.push(host & 0xff);
  }
  recordOffsets[display.rowCount] = recordBytes.length;

  // Dictionary block: u32 entryCount, then varint len + bytes per entry.
  /** @type {number[]} */
  const dictBytes = [];
  for (let d = 0; d < DICT_COUNT; d += 1) {
    const entries = display.dicts[d];
    for (let i = 0; i < 4; i += 1) dictBytes.push((entries.length >>> (8 * i)) & 0xff);
    for (const entry of entries) {
      const bytes = utf8(entry);
      writeVarint(bytes.length, dictBytes);
      for (const byte of bytes) dictBytes.push(byte);
    }
  }

  const header = 32;
  const dictStart = header;
  const recordsStart = dictStart + dictBytes.length;
  const rowDirStart = recordsStart + recordBytes.length;
  const out = new Uint8Array(rowDirStart + 4 * (display.rowCount + 1));
  const view = new DataView(out.buffer);
  view.setUint32(0, display.rowCount, true);
  view.setUint32(4, DICT_COUNT, true);
  view.setUint32(8, rowDirStart, true);
  view.setUint32(12, dictStart, true);
  view.setUint32(16, recordsStart, true);
  view.setUint32(20, dictBytes.length, true);
  view.setUint32(24, recordBytes.length, true);
  view.setUint32(28, 0, true);
  out.set(dictBytes, dictStart);
  out.set(recordBytes, recordsStart);
  for (let i = 0; i <= display.rowCount; i += 1) {
    view.setUint32(rowDirStart + 4 * i, recordOffsets[i], true);
  }
  return out;
}

/**
 * Decode a ROWS section payload into random-access row decoding.
 *
 * Nothing is materialized here: dictionaries are decoded (they are small and
 * every row reads them), but names, summaries, ids and slugs stay as bytes
 * until `rowAt` is called for the row that is actually rendered.
 *
 * @param {Uint8Array} payload
 * @returns {{ rowCount: number, dicts: string[][], rowAt: (index: number) => any }}
 */
export function decodeDisplayRows(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const rowCount = view.getUint32(0, true);
  const dictCount = view.getUint32(4, true);
  const rowDirStart = view.getUint32(8, true);
  const dictStart = view.getUint32(12, true);
  const recordsStart = view.getUint32(16, true);
  const dictLength = view.getUint32(20, true);
  const recordsLength = view.getUint32(24, true);

  const dicts = [];
  let at = dictStart;
  const dictEnd = dictStart + dictLength;
  for (let d = 0; d < dictCount; d += 1) {
    let count = 0;
    for (let i = 0; i < 4; i += 1) count += payload[at + i] * 2 ** (8 * i);
    at += 4;
    const entries = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const [length, next] = readVarint(payload, at);
      at = next;
      entries[i] = decoder.decode(payload.subarray(at, at + length));
      at += length;
    }
    dicts.push(entries);
    if (at > dictEnd) throw new Error("display dictionaries overran their section");
  }

  const rowDir = new Uint32Array(rowCount + 1);
  for (let i = 0; i <= rowCount; i += 1) rowDir[i] = view.getUint32(rowDirStart + 4 * i, true);
  const recordsEnd = recordsStart + recordsLength;

  /**
   * Decode row `index` into a `Listing`-shaped object. Absent optional fields
   * are `undefined`, matching the TypeScript type; `stars` is always null in
   * this dataset and stays null.
   *
   * @param {number} index
   */
  const rowAt = (index) => {
    let cursor = recordsStart + rowDir[index];
    const end = recordsStart + rowDir[index + 1];
    if (cursor < recordsStart || end > recordsEnd) throw new Error(`row ${index} outside records section`);

    const idPrefixIdx = payload[cursor] | (payload[cursor + 1] << 8);
    cursor += 2;
    let length;
    [length, cursor] = readVarint(payload, cursor);
    const idSuffix = decoder.decode(payload.subarray(cursor, cursor + length));
    cursor += length;
    [length, cursor] = readVarint(payload, cursor);
    const name = decoder.decode(payload.subarray(cursor, cursor + length));
    cursor += length;
    [length, cursor] = readVarint(payload, cursor);
    const summary = decoder.decode(payload.subarray(cursor, cursor + length));
    cursor += length;
    [length, cursor] = readVarint(payload, cursor);
    const slug = decoder.decode(payload.subarray(cursor, cursor + length));
    cursor += length;

    const categoryIdx = payload[cursor];
    const publisherIdx = payload[cursor + 1] | (payload[cursor + 2] << 8);
    const flags = payload[cursor + 3];
    const kindIdx = payload[cursor + 4];
    const provenanceIdx = payload[cursor + 5];
    const runtimeIdx = payload[cursor + 6];
    const transportIdx = payload[cursor + 7];
    const versionIdx = payload[cursor + 8] | (payload[cursor + 9] << 8);
    const installabilityIdx = payload[cursor + 10];
    const sourceIdx = payload[cursor + 11] | (payload[cursor + 12] << 8);
    cursor += 13;

    const id = `${dicts[DICT_ID_PREFIXES][idPrefixIdx]}${idSuffix}`;
    const hosts = [];
    let hostCount;
    [hostCount, cursor] = readVarint(payload, cursor);
    for (let i = 0; i < hostCount; i += 1) {
      hosts.push(dicts[DICT_HOSTS][payload[cursor + i]]);
    }

    /** @type {any} */
    const listing = {
      id,
      name,
      slug,
      kind: dicts[DICT_KINDS][kindIdx],
      summary,
      category: dicts[DICT_CATEGORIES][categoryIdx],
      publisher: {
        name: dicts[DICT_PUBLISHERS][publisherIdx],
        verified: (flags & 1) === 1,
      },
      stars: null,
      version: dicts[DICT_VERSIONS][versionIdx] || null,
      linkKey: flags & 2 ? id : slug,
    };
    const provenance = dicts[DICT_PROVENANCE][provenanceIdx];
    if (provenance) listing.publisher.provenance = provenance;
    const runtime = dicts[DICT_RUNTIMES][runtimeIdx];
    if (runtime) listing.runtime = runtime;
    const transport = dicts[DICT_TRANSPORTS][transportIdx];
    if (transport) listing.transport = transport;
    const installability = dicts[DICT_INSTALLABILITY][installabilityIdx];
    if (installability) listing.installability = installability;
    const source = dicts[DICT_SOURCE][sourceIdx];
    if (source) listing.source = source;
    if (hosts.length > 0) listing.compatibleHosts = hosts;
    return listing;
  };

  return { rowCount, dicts, rowAt };
}

/* ------------------------------------------------------------------ *
 * Container: magic + section table, shared by both artifacts
 * ------------------------------------------------------------------ */

/**
 * Wrap section payloads in the container. Both artifacts use it so one parser
 * serves both, and a truncated or foreign file is refused by name.
 *
 * @param {Array<{ kind: number, payload: Uint8Array }>} sections
 * @returns {Uint8Array}
 */
export function encodeContainer(sections) {
  const header = 8 + 4 + 4 + sections.length * 16;
  let total = header;
  for (const section of sections) total += section.payload.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) out[i] = MAGIC.charCodeAt(i);
  view.setUint32(8, SEARCH_FORMAT_VERSION, true);
  view.setUint32(12, sections.length, true);
  let at = header;
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    view.setUint32(16 + 16 * i, section.kind, true);
    view.setUint32(20 + 16 * i, at, true);
    view.setUint32(24 + 16 * i, section.payload.length, true);
    view.setUint32(28 + 16 * i, 0, true);
    out.set(section.payload, at);
    at += section.payload.length;
  }
  return out;
}

/**
 * Find a section payload in a container, refusing anything malformed.
 *
 * @param {ArrayBuffer | Uint8Array} buffer
 * @param {number} kind
 * @returns {Uint8Array}
 */
export function decodeContainer(buffer, kind) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 16) throw new Error("search artifact is truncated");
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error("not a LiteSPM search artifact");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(8, true);
  if (version !== SEARCH_FORMAT_VERSION) {
    throw new Error(`search artifact version ${version} is not supported`);
  }
  const count = view.getUint32(12, true);
  for (let i = 0; i < count; i += 1) {
    const sectionKind = view.getUint32(16 + 16 * i, true);
    const offset = view.getUint32(20 + 16 * i, true);
    const length = view.getUint32(24 + 16 * i, true);
    if (sectionKind === kind) {
      if (offset + length > bytes.length) throw new Error("search artifact section runs past the file");
      return bytes.subarray(offset, offset + length);
    }
  }
  throw new Error(`search artifact has no section ${kind}`);
}
