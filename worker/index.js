import { normalizeListing } from "../web/lib/discovery.mjs";
// The edge half of `/package/`: every entry's identity in the served HTML.
//
// Why this exists
// ---------------
//
// `/package/` is a static export (`web/next.config.ts`: `output: "export"`),
// so the one shell the build writes is the same document for all 69,376
// entries until a browser resolves `?slug=` (or the path segment) against the
// catalog and re-renders. A crawler, a link preview, a no-JS reader and the
// first frame of a cold load all used to get the generic document — the
// flagship entry included.
//
// The static export cannot fix that by itself: a page per entry is two files
// (`index.html` + `index.txt` RSC payload), 69,376 entries is 138,752 files
// against Cloudflare's 20,000-file free-plan limit, and the same build is
// ~2 GB of HTML inside a 20-minute build budget. The export therefore ships a
// bounded set of real pre-rendered pages (`web/lib/packageEntries.ts`) and
// this Worker carries the identity of every other entry into the one shell it
// ships — the "server-rendered shell" the design notes call the honest floor
// when the file cap binds.
//
// What it does
// ------------
//
// For an HTML request under `/package/`:
//
//   * a real pre-rendered page (`/package/<key>/` with its own file) is
//     returned byte-for-byte as built — the 4,000 URLs already in the sitemap
//     and in search indexes are untouched by construction;
//   * every other entry URL — `/package/<key>`, `/package/<key>/` and
//     `/package/?slug=<key>` — gets the shell with the entry's own `<title>`,
//     description, canonical, Open Graph tags and JSON-LD, plus a no-JS block
//     naming the entry, its summary, publisher and kind;
//   * an unknown key keeps today's answers: `200` with a server-side `noindex`
//     on the query/no-slash forms, and the export's own `404` page on the
//     trailing-slash form.
//
// Everything else under `/package/` (the entries sitemap, RSC payloads) and
// every path outside it is passed straight to the asset server — `wrangler.toml`
// routes only `/package/*` to this Worker, so nothing else pays an invocation.
//
// The row comes from the same `/data/pkg/<bucket>.json` files the browser
// resolves an entry from; the bucket hash, the link-key rule and the metadata
// formulas mirror `web/lib/catalogData.ts`, `web/lib/catalog.ts` and
// `web/lib/packageEntries.ts` byte for byte (the emitter states the same
// rule). Nothing here runs at build time, so the pages that exist and the
// sitemap cannot disagree: this Worker adds no page and changes no URL shape.

const BUCKETS = 256;

/**
 * FNV-1a 32-bit over the lookup key, mirrored from `bucketForSlug` in
 * `web/lib/catalogData.ts` and `bucketFor` in
 * `web/scripts/emit-catalog-shards.mjs`. The three must agree byte for byte or
 * a request would ask one bucket for a row filed in another.
 */
function bucketForSlug(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % BUCKETS;
}

/** Decode one path segment, tolerating malformed input (a lone `%` must not throw). */
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The lookup key this request names: `?slug=` when present (the legacy form),
 * otherwise the single path segment (`/package/<key>` and `/package/<key>/`).
 * `null` means "not an entry request" — the bare route, the sitemap, a nested
 * asset — and is passed through untouched.
 */
function entryKeyFrom(url) {
  const fromQuery = url.searchParams.get("slug");
  if (fromQuery) return fromQuery;
  const match = /^\/package\/([^/]+)\/?$/.exec(url.pathname);
  return match ? safeDecode(match[1]) : null;
}

/** The key `/package/<key>/` is served under — `linkKey` when the row carries
 *  one, else the id (the id always resolves). Mirrors `staticEntryKey`. */
function canonicalKey(item) {
  return item.linkKey ?? item.id;
}

/** Resolve a key against one bucket's rows, exactly as the view's
 *  `buildLookup` does: ids always resolve; a slug resolves only when the
 *  emitter stamped it as the row's whole-dataset `linkKey`, never by a
 *  bucket-local first-wins. */
function resolveKey(rows, key) {
  const byKey = new Map();
  for (const row of rows) byKey.set(row.id, row);
  for (const row of rows) {
    if (row.linkKey && row.linkKey !== row.id) byKey.set(row.linkKey, row);
  }
  return byKey.get(key) ?? null;
}

/* ------------------------------------------------------------------ *
 * Metadata formulas — mirrored from web/lib/packageEntries.ts and
 * web/lib/catalog.ts. Keep them in step; the pre-rendered pages and this
 * shell must describe one entry in the same words.
 * ------------------------------------------------------------------ */

function kindLabel(kind) {
  switch (kind) {
    case "mcp":
      return "MCP Server";
    case "skill":
      return "Agent Skill";
    case "plugin":
      return "Plugin";
    default:
      return kind;
  }
}

/** The screen form of a category name (`web/app/categories/categoryLabel.ts`). */
function categoryLabel(name) {
  return name === "Official Skills by" ? "Official publisher skills" : name;
}

/** Cut at a word boundary around 155 characters (`clampMeta`). */
function clampMeta(text, max = 155) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 60 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, "")}…`;
}

/** The description every surface uses for one entry (`entryMetaDescription`). */
function metaDescription(item) {
  const summary = item.summary?.trim();
  if (summary) return clampMeta(summary);
  return clampMeta(
    `${item.name} — one entry from the LiteSPM catalog: what it is, who publishes it, and how to add it.`
  );
}

/** `SoftwareApplication` structured data (`entryJsonLd`). */
function entryJsonLd(item, url, categoryText) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: item.name,
    ...(item.summary?.trim() ? { description: item.summary.trim() } : {}),
    url,
    applicationCategory: categoryText,
    applicationSubCategory: kindLabel(item.kind),
    ...(item.version ? { softwareVersion: item.version } : {}),
    ...(item.publisher?.provenance !== "source-owner" ? { author: { "@type": "Organization", name: item.publisher?.name || "Unknown" } } : {}),
    ...(item.publisher?.url ? { sameAs: item.publisher.url } : {}),
  };
}

/** The breadcrumb trail as structured data (`entryBreadcrumbJsonLd`). */
function entryBreadcrumbJsonLd(item, siteUrl, categoryText) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Index", item: `${siteUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: `${kindLabel(item.kind)}s`,
        item: `${siteUrl}/explore/?kind=${item.kind}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryText,
        item: `${siteUrl}/explore/?category=${encodeURIComponent(item.category)}`,
      },
      { "@type": "ListItem", position: 4, name: item.name },
    ],
  };
}

/** Escape text for an HTML text node. */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A JSON-LD document, safe to inline in HTML. The `data-litespm-entry`
 *  marker is what lets the client view replace this block with its own once
 *  the entry resolves, so one entry never ships two SoftwareApplication
 *  blocks (see `app/package/PackageView.tsx`). */
function jsonLdScript(doc) {
  return `<script type="application/ld+json" data-litespm-entry="">${JSON.stringify(doc).replace(/</g, "\\u003c")}</script>`;
}

/**
 * The no-JS block. It lives inside the layout's existing `<noscript>`, so a
 * browser with scripting enabled parses it as inert text (no DOM node, nothing
 * for React to hydrate) and a browser without scripting parses it as markup
 * and shows the entry's identity in the served HTML. Class names are reused
 * from `web/app/layout.tsx` so Tailwind has already compiled them.
 */
function noScriptBlock(item, key, categoryText) {
  const publisher = item.publisher?.name ? ` · ${esc(item.publisher.name)}` : "";
  return (
    `<div class="border-b border-rule bg-sunken px-4 py-2.5 text-center text-[12.5px] leading-relaxed text-ink-2">` +
    `<p><strong>${esc(item.name)}</strong>${publisher}</p>` +
    (item.summary ? `<p>${esc(item.summary)}</p>` : "") +
    `<p>${esc(kindLabel(item.kind))} · ${esc(categoryText)} · <a class="link" href="/package/${encodeURIComponent(key)}/">Open this entry</a></p>` +
    `</div>`
  );
}

/* ------------------------------------------------------------------ *
 * The row source
 * ------------------------------------------------------------------ */

/**
 * Per-isolate bucket cache. The bucket files are digest-versioned by the
 * dataset pointer but requested here by path alone, so a redeploy that changes
 * the rows leaves a warm isolate answering from the previous snapshot until it
 * is recycled — the same window the browser's own per-session cache has, and
 * the not-found state recovers from it on the next request. A failed fetch is
 * not cached, so one transient error does not poison the isolate.
 */
const bucketCache = new Map();

async function bucketRows(index, origin, env) {
  const cached = bucketCache.get(index);
  if (cached) return cached;
  const file = `${String(index).padStart(3, "0")}.json`;
  const promise = env.ASSETS.fetch(new URL(`/data/pkg/${file}`, origin))
    .then((res) => {
      if (!res.ok) throw new Error(`bucket ${file} answered ${res.status}`);
      return res.json();
    })
    .then((doc) => doc.rows ?? [])
    .catch(() => {
      // A missing or malformed bucket is a failed lookup, not an empty
      // catalog: drop the cache entry so the next request retries.
      bucketCache.delete(index);
      return [];
    });
  bucketCache.set(index, promise);
  return promise;
}

/* ------------------------------------------------------------------ *
 * The response
 * ------------------------------------------------------------------ */

function isHtml(res) {
  return (res.headers.get("content-type") || "").includes("text/html");
}

/** The one prerendered shell this route ships (`/package/index.html`). */
function shellResponse(url, env) {
  return env.ASSETS.fetch(new URL("/package/", url.origin));
}

/**
 * Rewrite the shell so the served HTML carries the entry. The head tags are
 * edited in place (one title, one description, one canonical — never a second
 * copy), the structured data is appended once, and the no-JS block is
 * prepended inside the existing `<noscript>`.
 */
function rewrite(response, { item, key, origin }) {
  item = normalizeListing(item);
  const canonical = `${origin}/package/${encodeURIComponent(key)}/`;
  const description = metaDescription(item);
  const title = `${item.name} · LiteSPM`;
  const categoryText = categoryLabel(item.category);
  const structured = [
    entryJsonLd(item, canonical, categoryText),
    entryBreadcrumbJsonLd(item, origin, categoryText),
  ];

  return new HTMLRewriter()
    .on("[data-entry-name]", { element: el => el.setInnerContent(item.name) })
    .on("[data-entry-summary]", { element: el => el.setInnerContent((item.summary || "") + " Enable JavaScript to choose an agent and view installation instructions.") })
    .on("head", { element: el => el.append("<style>[data-package-index] [data-index-browse]{display:none}</style>", { html: true }) })
    .on("title", { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', { element: (el) => el.setAttribute("content", description) })
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonical) })
    .on('meta[property="og:title"]', { element: (el) => el.setAttribute("content", title) })
    .on('meta[property="og:description"]', { element: (el) => el.setAttribute("content", description) })
    .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonical) })
    .on("head", { element: (el) => el.append(jsonLdScript(structured) + entryPayloadScript(item), { html: true }) })
    .on("noscript", { element: (el) => el.prepend(noScriptBlock(item, key, categoryText), { html: true }) })
    .transform(response);
}

/**
 * The resolved row, handed to the client in the page it serves.
 *
 * The Worker has already fetched the bucket and resolved the entry — the
 * shell it returns is rewritten with that entry's title, canonical and
 * JSON-LD. The CLIENT then had to fetch the same bucket again (~170-450 KB)
 * before it could render the entry, so a reader who clicked a product link
 * saw the generic "Find a package" view for the length of that round trip.
 * That is the flash the live-browser audit reported as "the link opens the
 * wrong page": the page eventually settles on the right entry, but it starts
 * on the wrong one.
 *
 * The row is already in hand here, so it travels with the page it describes.
 * The client reads it synchronously and does not fetch a bucket it has been
 * given. The `<` is escaped so a row whose text contains a tag cannot close
 * the script element.
 */
function entryPayloadScript(item) {
  const json = JSON.stringify(item).replace(/</g, "\\u003c");
  return `<script id="litespm-entry" type="application/json">${json}</script>`;
}

/**
 * The shell for a key that names no entry: `noindex`, plus a no-JS notice that
 * says so. A reader without scripting otherwise sees the route index and has
 * to infer that the address itself is wrong; the client view names the miss
 * once it resolves, and this is the same statement in the served HTML.
 */
function rewriteNoindex(response) {
  const notice =
    `<div class="border-b border-rule bg-sunken px-4 py-2.5 text-center text-[12.5px] leading-relaxed text-ink-2">` +
    `No entry in this snapshot matches this address. It may have been renamed or withdrawn, ` +
    `or published after this snapshot was built.` +
    `</div>`;
  return new HTMLRewriter()
    .on('meta[name="robots"]', { element: (el) => el.setAttribute("content", "noindex") })
    .on("noscript", { element: (el) => el.prepend(notice, { html: true }) })
    .transform(response);
}

async function handle(request, env) {
  const url = new URL(request.url);

  // Only page requests need this. Everything else — the sitemap, RSC
  // payloads, writes — goes straight to the asset server. An entry key never
  // ends in `.txt` (the route's own RSC payload does), and a prefetch carries
  // `RSC: 1` or `?_rsc=`, so both guards keep navigation payloads out of the
  // rewriter. HEAD runs the same path as GET so a link checker sees the page's
  // status and headers rather than the 404 a no-file path would answer with.
  if (request.method !== "GET" && request.method !== "HEAD") return env.ASSETS.fetch(request);
  if (request.headers.get("rsc") === "1" || url.searchParams.has("_rsc")) {
    return env.ASSETS.fetch(request);
  }
  if (/\.txt$/i.test(url.pathname)) return env.ASSETS.fetch(request);

  const key = entryKeyFrom(url);
  if (!key) return env.ASSETS.fetch(request);

  const asset = await env.ASSETS.fetch(request);
  const pathIsPage = url.pathname.endsWith("/") && url.pathname !== "/package/";
  // The shell itself is an HTML 200 that is not a per-entry page.
  const shellAsset = asset.status === 200 && isHtml(asset) && !pathIsPage ? asset : null;

  // A real pre-rendered page already carries the entry's identity — return
  // it byte-for-byte, so the 4,000 existing URLs cannot change here.
  if (pathIsPage && asset.status === 200 && isHtml(asset)) return asset;

  const index = bucketForSlug(key);
  const rows = await bucketRows(index, url.origin, env);
  const item = resolveKey(rows, key);

  if (!item) {
    // The trailing-slash form has no page for an unknown key: the export's
    // own 404, unchanged. The other forms keep the shell — the page this
    // route prerenders — marked noindex here rather than only after the
    // client resolves.
    if (pathIsPage) return asset;
    return rewriteNoindex(shellAsset ?? (await shellResponse(url, env)));
  }

  const shell = shellAsset ?? (await shellResponse(url, env));
  return rewrite(shell, { item, key: canonicalKey(item), origin: url.origin });
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch {
      // A rewrite failure must not take a page down: the asset server's own
      // answer is exactly what this route served before the Worker existed.
      return env.ASSETS.fetch(request);
    }
  },
};
