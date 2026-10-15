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

/** Bumped when the byte layout changes; every reader refuses a mismatch. */
export const SEARCH_FORMAT_VERSION = 1;

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
 * The text a listing exposes to search, in one fixed order.
 *
 * This is the definition of "what search covers". `matchesQuery` and the index
 * emitter both call this function, so a field added here is added to both — and
 * the agreement gate fails if the emitter is ever changed to tokenize something
 * else.
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
    item.id,
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

/**
 * The text that names a listing, for ranking only: a hit here means the query
 * names the thing itself rather than mentioning it. Never part of the match
 * set — only of its order.
 *
 * @param {any} item
 * @returns {string}
 */
export function listingTitleText(item) {
  return [item.name, item.slug, item.id].filter(Boolean).join(" ");
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
 * Each posting carries one flag bit: did this token appear in the row's
 * *title* (`name`, `slug`, `id`)? That is the whole ranking signal, and it
 * rides inside the delta so it costs nothing extra for small deltas.
 *
 * @param {any[]} rows
 * @returns {{ tokens: string[], tokenBytes: Uint8Array[], postings: number[][], titleFlags: Uint8Array[], rowCount: number, postingsCount: number }}
 */
export function buildSearchIndex(rows) {
  /** @type {Map<string, number[]>} */
  const all = new Map();
  /** @type {Map<string, Set<number>>} */
  const title = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const docTokens = new Set(tokenizeText(listingText(row)));
    for (const token of docTokens) {
      let list = all.get(token);
      if (!list) all.set(token, (list = []));
      list.push(i);
    }
    const titleTokens = new Set(tokenizeText(listingTitleText(row)));
    for (const token of titleTokens) {
      let flags = title.get(token);
      if (!flags) title.set(token, (flags = new Set()));
      flags.add(i);
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
  const sortedFlags = order.map((i) => title.get(tokens[i]) ?? new Set());

  let postingsCount = 0;
  for (const list of sortedPostings) postingsCount += list.length;

  return {
    tokens: sortedTokens,
    tokenBytes: sortedBytes,
    postings: /** @type {number[][]} */ (sortedPostings),
    titleFlags: /** @type {Set<number>[]} */ (sortedFlags),
    rowCount: rows.length,
    postingsCount,
  };
}

/**
 * Encode a built index into the INDEX section payload.
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
  const vocabOffsets = new Uint32Array(T + 1);
  const postingsOffsets = new Uint32Array(T + 1);

  let vocabLength = 0;
  for (let i = 0; i < T; i += 1) {
    vocabOffsets[i] = vocabLength;
    vocabLength += index.tokenBytes[i].length;
  }
  vocabOffsets[T] = vocabLength;

  /** @type {number[]} */
  const postingBytes = [];
  for (let i = 0; i < T; i += 1) {
    postingsOffsets[i] = postingBytes.length;
    const list = index.postings[i];
    const flags = index.titleFlags[i];
    let previous = 0;
    for (const row of list) {
      const delta = row - previous;
      previous = row;
      writeVarint((delta << 1) | (flags && flags.has(row) ? 1 : 0), postingBytes);
    }
  }
  postingsOffsets[T] = postingBytes.length;

  const vocabStart = header + 4 * (T + 1) + 4 * (T + 1);
  const postingsStart = vocabStart + vocabLength;
  const out = new Uint8Array(postingsStart + postingBytes.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, index.rowCount, true);
  view.setUint32(4, T, true);
  view.setUint32(8, index.postingsCount, true);
  view.setUint32(12, 0, true);
  for (let i = 0; i <= T; i += 1) {
    view.setUint32(header + 4 * i, vocabOffsets[i], true);
    view.setUint32(header + 4 * (T + 1) + 4 * i, postingsOffsets[i], true);
  }
  let at = vocabStart;
  for (let i = 0; i < T; i += 1) {
    out.set(index.tokenBytes[i], at);
    at += index.tokenBytes[i].length;
  }
  out.set(postingBytes, postingsStart);
  return out;
}

/**
 * Decode an INDEX section payload into the query-ready form.
 *
 * The vocabulary stays as bytes plus offsets: prefix search is a byte-range
 * binary search, and decoding 100k strings up front would allocate more memory
 * than the artifact itself.
 *
 * @param {Uint8Array} payload
 * @returns {{ rowCount: number, tokenCount: number, postingsCount: number, vocabOffsets: Uint32Array, postingsOffsets: Uint32Array, vocab: Uint8Array, postings: Uint8Array }}
 */
export function decodeSearchIndex(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const rowCount = view.getUint32(0, true);
  const tokenCount = view.getUint32(4, true);
  const postingsCount = view.getUint32(8, true);
  const header = 16;
  const vocabOffsets = new Uint32Array(tokenCount + 1);
  const postingsOffsets = new Uint32Array(tokenCount + 1);
  for (let i = 0; i <= tokenCount; i += 1) {
    vocabOffsets[i] = view.getUint32(header + 4 * i, true);
    postingsOffsets[i] = view.getUint32(header + 4 * (tokenCount + 1) + 4 * i, true);
  }
  const vocabStart = header + 8 * (tokenCount + 1);
  const vocabLength = vocabOffsets[tokenCount];
  return {
    rowCount,
    tokenCount,
    postingsCount,
    vocabOffsets,
    postingsOffsets,
    vocab: payload.subarray(vocabStart, vocabStart + vocabLength),
    postings: payload.subarray(vocabStart + vocabLength),
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
 * Read one token's postings, deltas decoded, into `out`.
 *
 * @param {ReturnType<typeof decodeSearchIndex>} index
 * @param {number} tokenIndex
 * @param {number[]} out
 * @param {Uint8Array | null} [titleFlags] receives a 0/1 flag per posting
 */
function readPostings(index, tokenIndex, out, titleFlags) {
  let at = index.postingsOffsets[tokenIndex];
  const end = index.postingsOffsets[tokenIndex + 1];
  let previous = 0;
  while (at < end) {
    const [value, next] = readVarint(index.postings, at);
    at = next;
    const delta = value >>> 1;
    previous += delta;
    out.push(previous);
    if (titleFlags) titleFlags.push(value & 1);
  }
}

/**
 * Query the index: every row matching every query token as a prefix, ranked.
 *
 * Ranking is deterministic and explainable: a token that appears in the row's
 * title scores 4 when the query token is the whole token and 3 when it is only
 * a prefix; a token elsewhere scores 2 or 1. Ties break by row index, which is
 * the dataset's own order. Nothing here can consult popularity — the dataset
 * carries none.
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

    /** @type {number[]} */
    const exact = [];
    /** @type {number[]} */
    const exactFlags = [];
    const exactIndex = lowerBoundToken(index, bytes);
    const exactExists =
      exactIndex < index.tokenCount &&
      index.vocabOffsets[exactIndex + 1] - index.vocabOffsets[exactIndex] === bytes.length &&
      compareBytes(index.vocab.subarray(index.vocabOffsets[exactIndex], index.vocabOffsets[exactIndex + 1]), bytes) === 0;
    if (exactExists) readPostings(index, exactIndex, exact, exactFlags);

    /** @type {Map<number, number>} */
    const tokenScores = new Map();
    for (let i = 0; i < exact.length; i += 1) {
      tokenScores.set(exact[i], exactFlags[i] ? 4 : 2);
    }
    for (let t = start; t < end; t += 1) {
      if (exactExists && t === exactIndex) continue;
      /** @type {number[]} */
      const rows = [];
      /** @type {number[]} */
      const flags = [];
      readPostings(index, t, rows, flags);
      for (let i = 0; i < rows.length; i += 1) {
        const current = tokenScores.get(rows[i]);
        const score = flags[i] ? 3 : 1;
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

  return [...(result ?? new Map()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([row]) => row);
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
const DICT_COUNT = 10;

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
 *   u16 versionIdx, u8 installabilityIdx, varint hostCount + u8 hostIdx[hostCount]
 *
 * Absent runtime / transport / version / installability are dictionary slot 0,
 * so a null never needs a separate presence bit.
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
    cursor += 11;

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
