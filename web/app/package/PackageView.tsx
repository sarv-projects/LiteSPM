"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, SearchX } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { Listing } from "../../lib/telemetry";
import { formatCount } from "../../lib/format";
import { kindLabel, listingHref, sortListings } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import { hostsFor } from "../../lib/hosts";
import { VerifiedMark } from "../../components/catalog/PublisherMark";
import { fetchCategorySiblings, useProductRow } from "../../lib/catalogData";
import { SITE_URL } from "../../lib/site";
import { AGENT_CHOICES, AGENT_STORAGE_KEY, findAgentChoice, rowWorksWithAgent } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { AddSteps, scrollToSection } from "../../components/package/AddSteps";
import { PlainSummary } from "../../components/package/PlainSummary";
import { TryItPrompts } from "../../components/package/TryItPrompts";
import { PackageTabs } from "../../components/package/PackageTabs";
import type { PackageTabId } from "../../components/package/PackageTabs";
import { categoryLabel } from "../categories/categoryLabel";
import {
  clampMeta,
  entryBreadcrumbJsonLd,
  entryJsonLd,
  staticEntryHref,
} from "../../lib/packageEntries";

/** Same key the home strip writes; one preference, one storage slot. */

/**
 * What `/package/` needs from the catalog, and all it needs before a reader
 * actually asks for an entry. The index shell below is what the route
 * prerenders; the detail view resolves from `?slug=`, which can only be
 * answered from the full row set — so this route fetches `data/catalog.json`
 * when (and only when) a slug is present. A bare `/package/` visit ships no
 * catalog rows at all.
 */
export interface PackageViewProps {
  /** Row count of this build's snapshot, for the index copy. */
  total: number;
  /** `hostUniverse(rows).length` at build time — the coverage denominator. */
  hostTotal: number;
  /** First twelve rows in index order: the list the static shell renders. */
  indexRows: Listing[];
  /**
   * Category slugs this build wrote a sibling file for
   * (`/data/pkg/cat/<slug>.json`), computed by the page from the same rule the
   * emitter uses (`lib/categoryFiles.mjs`). A category outside this set has no
   * file — the two largest hold most of the catalog and never get one — so
   * the page answers it without a request instead of a guaranteed 404.
   */
  siblingCategories: string[];
  /**
   * The entry, resolved at build time. Present only on the pre-rendered
   * `/package/<key>/` pages: it makes the server-rendered HTML carry the
   * entry's own facts (and its metadata) instead of the generic shell, and it
   * tells the view that no bucket fetch is needed. The `/package/` route
   * leaves it unset and keeps resolving `?slug=` in the browser.
   */
  initialItem?: Listing;
  /**
   * Whole-snapshot counts. The server pages compute these from the full row
   * set at build time; without them the view falls back to the bucket payload
   * (or zeros on a page that never fetched).
   */
  snapshot?: { total: number; versioned: number };
}

/**
 * Lookup is built once over the fetched row set. Ids always resolve; a slug is
 * registered only when the emitter stamped it as the row's `linkKey` — which it
 * does over the whole dataset, never over a bucket. 5,217 of this catalog's
 * 57,112 distinct slugs are shared by 17,481 rows, so a bucket-local count
 * would call a shared slug unique (see `scripts/emit-catalog-shards.mjs`). A
 * slug this route cannot vouch for resolves to nothing rather than to whichever
 * row the bucket happened to hold, and the not-found state says which case it
 * is.
 */
function buildLookup(rows: Listing[]): Map<string, Listing> {
  const byKey = new Map<string, Listing>();
  for (const row of rows) byKey.set(row.id, row);
  for (const row of rows) {
    if (row.linkKey && row.linkKey !== row.id) byKey.set(row.linkKey, row);
  }
  return byKey;
}

/**
 * The prerendered body of `/package/`. Detail content is keyed off `?slug=`,
 * so the static shell explains the route and links onward instead of shipping
 * an empty frame.
 *
 * `note` is rendered only on the client (a deep link resolved after mount), so
 * it never appears in — and never mismatches — the prerendered HTML.
 */
function PackageIndexShell({
  total,
  indexRows,
  note,
}: {
  total: number;
  indexRows: Listing[];
  note?: React.ReactNode;
}) {
  return (
    <main id="main" className="shell flex-1 py-16">
      <div className="max-w-prose">
        <p className="t-mono text-[11px] text-ink-3">Entry detail</p>
        <h1 className="t-cond mt-2 text-[24px] font-semibold tracking-tight text-ink">
          Find a package
        </h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
          Open any entry for its full record: what it does, which agent hosts it works with, and how
          to add it. Below is the start of this snapshot&rsquo;s {formatCount(total)} entries — search
          the full set if what you want isn&rsquo;t here.
        </p>

        {/*
          The note slot is reserved at a fixed height, and the vertical spacing
          lives on the wrapper rather than on the note.

          The shell prerenders with NO note (the slug has not resolved yet) and
          then renders one once it has. Two things moved everything below it:
          the note added height, and — because a plain `<div>` does not establish
          a block formatting context — the note's own `mt-6` **collapsed out**
          of the wrapper and moved the wrapper itself down 24px. Together that
          measured as CLS 0.0132 against this repository's stated bar of *zero*
          layout shift, on every visit to every product page, because it is the
          mount→resolved transition itself. Spacing on the wrapper cannot
          collapse, and `min-h` keeps both states the same height, so the shift
          is gone. (A fetch *error* swaps in a taller panel and still moves
          things; that is an exceptional state where a message appearing is the
          feedback, and a permanently taller reservation would be worse.)

          A bare `/package/` visit — a slug can never resolve, so a lookup note
          can never appear — fills the slot with a static hint instead of
          leaving it empty (see the caller).
        */}
        <div className="mt-6 min-h-[44px]">{note}</div>

        <div className="section-head mt-9">
          <h2>Start of the catalog</h2>
          <Link href="/explore/" className="t-mono shrink-0 text-[12px] text-ink-2 hover:text-ink hover:underline">
            search all
          </Link>
        </div>
        <ul>
          {indexRows.map((item) => (
              <li key={item.id}>
                <Link
                  href={listingHref(item)}
                  className="grid grid-cols-[3px_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 transition-colors hover:bg-hover"
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-[3px] rounded-[1px]"
                    style={{ backgroundColor: `var(--${item.kind})` }}
                  />
                  <span className="min-w-0">
                    <span className="t-cond block truncate text-[14px] font-medium text-ink">{item.name}</span>
                    <span className="row-meta">
                      <span>{item.publisher?.name || "unspecified"}</span>
                      <span className="t-mono">{item.kind}</span>
                      <span className="truncate">{categoryLabel(item.category)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </div>
    </main>
  );
}

function NotFound({
  total,
  ambiguous,
}: {
  total: number;
  /** The address named a slug more than one entry answers to. */
  ambiguous: boolean;
}) {
  return (
    <main id="main" className="shell flex-1 py-20">
      <div className="flex max-w-prose flex-col items-start gap-3">
        <SearchX className="h-6 w-6 text-ink-3" aria-hidden="true" />
        <h1 className="t-cond text-[22px] font-semibold tracking-tight text-ink">
          {ambiguous ? "That name matches more than one entry" : "We couldn\u2019t find that entry"}
        </h1>
        {ambiguous ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            The slug in this address is shared by more than one entry in this snapshot, so it
            doesn&rsquo;t name a single one. Open the entry from a search result or use its catalog
            id — the address bar keeps the id form for every entry whose slug is ambiguous.
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Nothing in this snapshot&rsquo;s {formatCount(total)} entries matches this address. It may
            have been renamed or withdrawn, or published after this snapshot was built.
          </p>
        )}
        <Link href="/explore/" className="btn btn-solid mt-2">
          Search the catalog
        </Link>
      </div>
    </main>
  );
}

/**
 * Decode one URL path segment, tolerating malformed input.
 *
 * `decodeURIComponent` throws on a lone `%` or a truncated escape, and this runs
 * on whatever the address bar holds — a hand-typed `/package/100%` must fall
 * through to "no such key", not blank the page.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The slug is read from `window.location` after mount rather than through
 * `useSearchParams`, so this route still prerenders as static HTML instead of
 * bailing into a Suspense boundary. At 69,376 entries the detail pages stay on
 * one prerendered page - `generateStaticParams` would emit 69,376 files, past
 * the 20,000-file free-plan limit and ~2 GB of HTML, inside the same 20-minute
 * build. (This comment said 5,814 entries; the catalog is 12x that now, so the
 * argument has only strengthened.) The canonical path form `/package/<slug>` is
 * served by a `_redirects` proxy in the deploy bundle rather than by a page per
 * entry, which is why `useSlugParam` reads the pathname as well as the query.
 *
 * A slug is also the signal that the full row set is needed: the request fires
 * in the same effect that reads the parameter, so the fetch starts on the first
 * client frame rather than one render later. A bare `/package/` never asks.
 */
function useSlugParam(): { slug: string | null; resolved: boolean } {
  const [state, setState] = useState<{ slug: string | null; resolved: boolean }>({
    slug: null,
    resolved: false,
  });

  useEffect(() => {
    // Two spellings of the same page. `?slug=` is what the route shipped with;
    // `/package/<slug>` is the canonical path form, served by a `_redirects`
    // proxy in the deploy bundle. The proxy is transparent, so the browser keeps
    // the path form and `window.location.search` stays empty — which is why the
    // pathname has to be read here rather than relying on the query alone.
    //
    // A bare /package/ resolves-with-nothing, so it shows the route index rather
    // than an unresolved placeholder.
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("slug");
    const fromPath = /^\/package\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    const param = fromQuery ?? (fromPath ? safeDecode(fromPath) : null);
    // Canonicalise the legacy spelling. `_redirects` cannot match on a query
    // string (Cloudflare lists `Query Parameters` as unsupported in the source),
    // so the server cannot rewrite `?slug=` to the path form — but the client
    // can, without a reload and without touching history length. Anyone who
    // lands on the old form now gets a path-form address in the bar, so what
    // they copy or bookmark is the canonical one.
    if (fromQuery && !fromPath) {
      window.history.replaceState(null, "", `/package/${encodeURIComponent(fromQuery)}`);
    }
    setState({ slug: param, resolved: true });
  }, []);

  return state;
}

/**
 * Rewrite one `<meta property="…">` and return a restore function. The tag is
 * written by the layout's `openGraph` block, so it is edited in place and put
 * back rather than duplicated — two `og:title` tags would be invalid.
 */
function setMetaProperty(property: string, content: string): () => void {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) return () => {};
  const previous = el.getAttribute("content");
  el.setAttribute("content", content);
  return () => {
    if (previous === null) el.removeAttribute("content");
    else el.setAttribute("content", previous);
  };
}

function PackageContent({
  total,
  hostTotal,
  indexRows,
  siblingCategories,
  initialItem,
  snapshot: snapshotProp,
}: PackageViewProps) {
  const { slug, resolved } = useSlugParam();
  // One product row, two counts and the sibling list come from ~170 KB of
  // hash-partitioned rows rather than the 44.5 MB full catalog this route used
  // to concatenate on every visit. A pre-rendered page already has its row, so
  // it asks for nothing.
  const { status, payload, retry } = useProductRow(initialItem ? null : slug);
  // Ids always resolve; slugs resolve only when the emitter stamped them as
  // the row's whole-dataset `linkKey`, never by a bucket-local first-wins.
  const lookup = useMemo(() => (payload ? buildLookup(payload.rows) : null), [payload]);
  const item = useMemo(
    () => initialItem ?? (slug && lookup ? lookup.get(slug) ?? null : null),
    [initialItem, slug, lookup]
  );

  /**
   * The address named a slug that more than one row answers to. The bucket
   * keeps the first such row (filed by the emitter so the ambiguity is
   * detectable here), and its stamped `linkKey` is its id rather than the slug
   * — that difference is the signal. Ids never take this path: they always
   * resolve.
   */
  const ambiguousSlug = useMemo(() => {
    if (item || !slug || !payload) return false;
    return payload.rows.some(
      (row) => row.slug === slug && row.linkKey !== undefined && row.linkKey !== row.slug
    );
  }, [item, slug, payload]);

  // The agent preference. Reading it is enough to personalize the page;
  // changing it writes the same `litespm-agent` key the home strip uses and
  // recomputes over rows already in memory — it never calls `request()` (the
  // E1 fetch contract: only a `?slug=` deep link asks for the dataset here).
  const [agentId, setAgentId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setAgentId(window.localStorage.getItem(AGENT_STORAGE_KEY));
    } catch {
      // Storage can be unavailable (private mode, policy); the page still
      // works, it just cannot remember the choice.
    }
  }, []);
  const changeAgent = (id: string) => {
    setAgentId(id);
    try {
      window.localStorage.setItem(AGENT_STORAGE_KEY, id);
    } catch {
      /* preference is best-effort */
    }
  };
  const agent: AgentChoice | null = findAgentChoice(agentId);

  // Which tab the detail section is showing. Local state only: switching a tab
  // renders rows already in memory, nothing is fetched.
  const [tab, setTab] = useState<PackageTabId>("overview");

  // Version coverage over the loaded row set — a count only because this route
  // has the rows in memory once a slug resolved. The pre-rendered pages pass
  // the same whole-snapshot counts their server page computed from the full
  // row set, so a page that never fetches a bucket still reports a real count.
  const snapshot = useMemo(
    () => snapshotProp ?? payload?.counts ?? { total: 0, versioned: 0 },
    [snapshotProp, payload]
  );

  /**
   * The tab, the history entry and any bookmark read `document.title`, and
   * every product page shipped the site's generic one — so browsing ten
   * products gave ten identical tabs. Once an entry resolves, the same rewrite
   * applies to `og:title` and `og:description`, for anything that reads the
   * live DOM rather than the original HTML.
   *
   * This hook runs *before* the early returns below, on purpose: placing it
   * after them changed the number of hooks between the unresolved and resolved
   * renders, and React refuses that with error #310 ("rendered more hooks than
   * during the previous render"). The null case is handled by the dependency
   * instead of a guard.
   *
   * Client-side only, and not dressed up as more than it is: this fixes what
   * the reader sees, not what a crawler or a link preview fetches before any
   * script runs. For the bounded set of entries that have one, that is what
   * `/package/<key>/` is for: a real pre-rendered page with its own title,
   * description, canonical and JSON-LD. This effect still runs there (and
   * rewrites the same values it already shipped), and it is still the only
   * per-entry metadata the client-resolved pages can offer.
   */
  const docTitle = item?.name ?? null;
  const docSummary = item?.summary ?? null;
  useEffect(() => {
    if (!docTitle) return;
    const previous = document.title;
    document.title = `${docTitle} · LiteSPM Market`;
    const restoreOgTitle = setMetaProperty("og:title", `${docTitle} · LiteSPM Market`);
    const restoreOgDescription = setMetaProperty(
      "og:description",
      clampMeta(
        docSummary?.trim() ||
          `${docTitle} from the LiteSPM catalog: what it is, which agent hosts it works with, and how to add it.`
      )
    );
    return () => {
      document.title = previous;
      restoreOgTitle();
      restoreOgDescription();
    };
  }, [docTitle, docSummary]);

  /**
   * `/package/<slug>` is served by a 200 proxy rule, so an address that names
   * no entry still answers 200 with this shell. Nothing here can change the
   * status code — the file is prerendered — so the unresolved state carries
   * `noindex` instead: a crawler that renders the page learns the entry does
   * not exist, and a resolved entry never gets the tag. (A crawler that runs
   * no JavaScript sees neither; that is the static-export limit this route
   * already lives with, not something a client-side tag can fix.)
   */
  const missing = resolved && status === "ready" && !item;
  useEffect(() => {
    if (!missing) return;
    // The layout's `robots: { index, follow }` is already on the page, so that
    // tag is rewritten rather than joined by a second one (crawlers combine
    // conflicting tags by taking the most restrictive, but one tag is
    // unambiguous). A build without it gets a fresh tag, removed on cleanup.
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (existing) {
      const previous = existing.getAttribute("content");
      existing.setAttribute("content", "noindex");
      return () => {
        if (previous === null) existing.removeAttribute("content");
        else existing.setAttribute("content", previous);
      };
    }
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, [missing]);

  if (!item && (!resolved || !slug)) {
    // Pre-hydration, and when the route is visited bare, we cannot know which
    // entry is wanted. Both cases get the route index: a described frame with
    // real links, not a spinner and not a false "not found". A pre-rendered
    // page never takes this branch — its entry arrived with the HTML.
    //
    // A bare visit fills the reserved note slot with a static hint instead of
    // leaving it empty forever: the slot is the one piece of this shell whose
    // content only ever arrives on the client, and with no slug no lookup note
    // can ever come. The hint costs no layout shift (the slot is already
    // reserved) and stops the page reading as a gap waiting for something.
    return (
      <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
        <Header />
        <PackageIndexShell
          total={total}
          indexRows={indexRows}
          note={
            resolved && !slug ? (
              <p className="text-[12px] leading-relaxed text-ink-3">
                Open an entry from the list below, or search the full catalog.
              </p>
            ) : undefined
          }
        />
        <SiteFooter />
      </div>
    );
  }

  if (!item) {
    // Three honest states, never a premature "not found": the index shell
    // stays on screen while the snapshot is still being fetched (it is what
    // this route prerendered, so the DOM does not flash), a failed fetch says
    // so with a retry, and only a completed snapshot may declare a key absent.
    if (status === "ready") {
      return (
        <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
          <Header />
          <NotFound total={total} ambiguous={ambiguousSlug} />
          <SiteFooter />
        </div>
      );
    }
    const pending = status === "loading" || status === "idle";
    return (
      <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
        <Header />
        <PackageIndexShell
          total={total}
          indexRows={indexRows}
          note={
            pending ? (
              <p className="t-mono text-[12px] text-ink-3" role="status">
                Looking up “{slug}”…
              </p>
            ) : (
              <div className="border border-rule-2 bg-sunken px-4 py-3">
                <p className="text-[13px] text-ink-2">
                  The catalog data didn&rsquo;t load, so we can&rsquo;t tell whether this entry
                  exists. Check your connection and try again.
                </p>
                <button type="button" onClick={retry} className="btn btn-solid mt-2">
                  Try again
                </button>
              </div>
            )
          }
        />
        <SiteFooter />
      </div>
    );
  }

  const hosts = hostsFor(item);
  const worksWith = rowWorksWithAgent(item, agent);
  const avail = availabilityOf(item);

  /**
   * The address this page is actually served at. The client-resolved form is
   * `/package/?slug=<key>`; a pre-rendered entry page is `/package/<key>/` and
   * declares that path as its canonical, so the Source tab prints the URL the
   * reader (and a crawler) is on rather than the legacy query spelling.
   */
  const pageHref = initialItem ? staticEntryHref(initialItem) : listingHref(item);

  // Emitted by the client only on the client-resolved route. A pre-rendered
  // `/package/<key>/` page carries the same structured data in its own HTML
  // (from the server page), and rendering it here as well would put two
  // SoftwareApplication blocks for one entry in the document.
  const jsonLd = entryJsonLd(
    item,
    `${SITE_URL}${listingHref(item)}`,
    categoryLabel(item.category)
  );
  const breadcrumb = entryBreadcrumbJsonLd(item, SITE_URL, categoryLabel(item.category));

  /** Question two — plain first, exact fields one disclosure deeper. */
  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      {!initialItem && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([jsonLd, breadcrumb]).replace(/</g, "\\u003c"),
          }}
        />
      )}

      <nav aria-label="Breadcrumb" className="border-b border-rule bg-sunken">
        {/* Each separator lives inside the item it follows: an `<ol>` may only
            contain `<li>` children, and the chevrons used to sit between them
            as bare SVGs. */}
        <ol className="t-mono shell flex items-center gap-1.5 overflow-x-auto py-2 text-[11px] text-ink-3">
          <li className="flex shrink-0 items-center gap-1.5">
            <Link href="/" className="hover:text-ink hover:underline">
              Index
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-rule-2" aria-hidden="true" />
          </li>
          <li className="flex shrink-0 items-center gap-1.5">
            <Link href={`/explore/?kind=${item.kind}`} className="hover:text-ink hover:underline">
              {kindLabel(item.kind)}s
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-rule-2" aria-hidden="true" />
          </li>
          <li className="flex min-w-0 items-center gap-1.5">
            <Link
              href={`/explore/?category=${encodeURIComponent(item.category)}`}
              className="truncate hover:text-ink hover:underline"
            >
              {categoryLabel(item.category)}
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-rule-2" aria-hidden="true" />
          </li>
          <li aria-current="page" className="truncate text-ink">
            {item.name}
          </li>
        </ol>
      </nav>

      <main id="main" className="shell flex-1 pb-16 pt-7">
        <div className="mx-auto w-full max-w-[1040px]">
          {/* ---- 1. What is this? -------------------------------------- */}
          <header aria-labelledby="pkg-title">
            <p className="kicker">What is this?</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip pointer-events-none">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-[3px] rounded-[1px]"
                  style={{ backgroundColor: `var(--${item.kind})` }}
                />
                {kindLabel(item.kind)}
              </span>
              <span className="chip pointer-events-none">{categoryLabel(item.category)}</span>
            </div>

            <h1
              id="pkg-title"
              className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]"
            >
              {item.name}
            </h1>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-2">
              {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) ? (
                <a
                  href={item.publisher.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {item.publisher.name}
                </a>
              ) : (
                <span>{item.publisher?.name || "unspecified publisher"}</span>
              )}
              {item.publisher?.verified && <VerifiedMark />}
              {/* The same availability the result cards carry. The detail page
                  stated it indirectly (a section note reading "installability
                  status"), which meant a reader arriving from a search result
                  lost the one field that decided whether they could act. */}
              <span
                className={`inline-flex items-center rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
                  avail.installable
                    ? "border-rule-2 bg-surface text-ink-2"
                    : "border-dashed border-ink-3 bg-sunken text-ink-3"
                }`}
                title={avail.plain}
              >
                {avail.label}
              </span>
            </p>

            <p className="mt-2.5 max-w-prose text-[14px] leading-relaxed text-ink-2">{item.summary}</p>
          </header>

          {/* ---- 1b. The short version -------------------------------- */}
          {/*
           * The plain layer (ARCH/25 §7.1: "nontechnical text is the default;
           * the technical layer sits behind disclosure"). The header above
           * states the identity; this block answers the five questions a
           * non-developer arrives with, each pointing at the tab that holds
           * the exact field. It sits before the action so a reader knows what
           * they are looking at before being told how to add it.
           */}
          <PlainSummary
            item={item}
            hostTotal={hostTotal}
            onOpenTab={(nextTab) => {
              setTab(nextTab);
              scrollToSection("pkg-details");
            }}
          />

          {/* ---- 2. How do I add it? ----------------------------------- */}
          {/*
           * The action comes second, immediately after "what is this?".
           *
           * It used to be fifth, below three sections that explain the
           * capability *kind* rather than this capability: on the rendered page
           * the install command sat at 48-51% of the document, so a reader had
           * to scroll past a definition of the word "plugin" before learning
           * how to add one. Explanations that are genuinely wanted now follow
           * the action instead of preceding it — the same order the
           * competitor pages use, and the one a reader arrives expecting.
           */}
          <div className="mt-9">
            <AddSteps
              item={item}
              agent={agent}
              onChooseAgent={() => scrollToSection("will-it-work")}
            />
          </div>

          {/* ---- 2b. What to try once it's installed ------------------- */}
          {/*
           * Prompts come after the install panel because they only make sense
           * after it: a non-developer who just installed the entry needs to
           * know what to say next, and the record's own words are the only
           * honest source for that (see lib/tryPrompts). Nothing renders for
           * entries the CLI cannot install.
           */}
          <TryItPrompts item={item} />

          {/* ---- 3. Will it work with what I use? ---------------------- */}
          <section
            id="will-it-work"
            aria-labelledby="pkg-fit-title"
            tabIndex={-1}
            className="mt-9 scroll-mt-16"
          >
            <div className="section-head">
              <h2 id="pkg-fit-title">Will it work with what I use?</h2>
              <span className="section-note t-mono t-tabular">
                {hosts.length} of {hostTotal} hosts
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] text-ink-3">You use:</span>
              {AGENT_CHOICES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={agent?.id === option.id}
                  onClick={() => changeAgent(option.id)}
                  className="chip"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!agent ? (
                <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
                  Choose your agent above and this page answers for it.
                </p>
              ) : agent.hosts.length === 0 ? (
                <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
                  This catalog carries no compatibility data for &ldquo;{agent.label}&rdquo;, so this
                  entry neither claims nor denies support.
                </p>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[11px] font-medium ${
                    worksWith
                      ? "border-accent/30 bg-accent-wash text-accent-text"
                      : "border-rule bg-sunken text-ink-3"
                  }`}
                  title={
                    worksWith
                      ? "This entry's host list includes this agent — declared by the publisher or derived from the entry's kind. A declaration, not a test result."
                      : "This entry's host list doesn't include this agent. An absence of a claim, not evidence it fails."
                  }
                >
                  {worksWith && <Check className="h-3 w-3" aria-hidden="true" />}
                  {worksWith ? `Works with ${agent.label}` : `Not declared for ${agent.label}`}
                </span>
              )}
            </div>

            <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-3">
              Compatibility comes from the publisher&rsquo;s declaration or from the entry&rsquo;s
              kind — MCP servers run through the LiteSPM bridge, skills go into any host with a
              skills directory. This site doesn&rsquo;t run what it lists, so none of it is a test
              result.
            </p>

            <button
              type="button"
              className="btn mt-3"
              onClick={() => {
                setTab("compatibility");
                scrollToSection("pkg-details");
              }}
            >
              See the full compatibility list
            </button>
          </section>

          {/* ---- 4. What access does it need? -------------------------- */}
          <section aria-labelledby="pkg-access-title" className="mt-9">
            <div className="section-head">
              <h2 id="pkg-access-title">What access does it need?</h2>
              <span className="section-note">from the catalog record</span>
            </div>

            <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-ink-2">
              Nothing in the catalog says which files, sites or credentials this entry can reach —
              that per-entry list isn&rsquo;t published yet, so this page doesn&rsquo;t guess. Where
              a server needs a credential, LiteSPM records the variable&rsquo;s name at install time,
              never its value.
            </p>

            <details className="group mt-2 border-t border-rule">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[36px]">
                The raw record fields
                <span
                  aria-hidden="true"
                  className="text-ink-3 transition-transform duration-panel ease-out group-open:rotate-90"
                >
                  →
                </span>
              </summary>
              <dl className="spec-list pb-1">
                <div>
                  <dt>effects</dt>
                  <dd className="text-[12.5px]!">
                    <span className="absent">not yet published</span> — the per-entry access list
                    this page would show
                  </dd>
                </div>
                <div>
                  <dt>command / args</dt>
                  <dd className="t-mono text-[12px]!">
                    {item.command ? (
                      <span className="break-all">
                        {item.command}
                        {item.args?.length ? ` ${item.args.join(" ")}` : ""}
                      </span>
                    ) : (
                      <span className="absent">not published</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>installHint</dt>
                  <dd className="t-mono text-[12px]!">
                    {item.installHint ? (
                      <span className="break-all">{item.installHint}</span>
                    ) : (
                      <span className="absent">not published</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>skillSource</dt>
                  <dd className="t-mono text-[12px]!">
                    {item.skillSource ? (
                      <span className="break-all">{item.skillSource}</span>
                    ) : (
                      <span className="absent">not published</span>
                    )}
                  </dd>
                </div>
              </dl>
            </details>
          </section>

          {/* ---- then: tabs -------------------------------------------- */}
          <div id="pkg-details" tabIndex={-1} className="scroll-mt-16">
            <PackageTabs
              item={item}
              agent={agent}
              hostTotal={hostTotal}
              snapshot={snapshot}
              pageHref={pageHref}
              active={tab}
              onChange={setTab}
            />
          </div>

          {/* ---- related ---- */}
          <RelatedRow item={item} siblingCategories={siblingCategories} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * Also-in-category: discovery after the record, never a popularity list.
 *
 * The siblings arrive as their own ~50 KB file. Two categories hold most of the
 * catalog (45,373 and 19,209 rows) and deliberately have no file: twelve
 * arbitrary entries out of forty-five thousand is noise, and the "see all"
 * link below is the honest answer there. The build hands this component the
 * set of categories that *do* have a file, so the two that don't are answered
 * without a request — and a missing file still renders nothing.
 */
function RelatedRow({ item, siblingCategories }: { item: Listing; siblingCategories: string[] }) {
  const [siblings, setSiblings] = useState<Listing[] | null>(null);

  useEffect(() => {
    let alive = true;
    setSiblings(null);
    fetchCategorySiblings(item.category, siblingCategories)
      .then((rows) => {
        if (alive) setSiblings(rows ?? []);
      })
      .catch(() => {
        if (alive) setSiblings([]);
      });
    return () => {
      alive = false;
    };
  }, [item.category, siblingCategories]);

  const related = useMemo(() => {
    if (!siblings) return [];
    return sortListings(
      siblings.filter((i) => i.id !== item.id),
      "index"
    ).slice(0, 6);
  }, [item.id, siblings]);

  if (related.length === 0) return null;

  return (
    <section className="mt-9">
      <div className="section-head">
        <h2>Also in {item.category}</h2>
        <Link
          href={`/explore/?category=${encodeURIComponent(item.category)}`}
          className="t-mono shrink-0 text-[12px] text-ink-2 hover:text-ink hover:underline"
        >
          see all
        </Link>
      </div>
      <ul>
        {related.map((r) => (
          <li key={r.id}>
            <Link
              href={listingHref(r)}
              className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5 transition-colors hover:bg-hover"
            >
              <span
                aria-hidden="true"
                className="h-7 w-[3px] rounded-[1px]"
                style={{ backgroundColor: `var(--${r.kind})` }}
              />
              <span className="min-w-0">
                <span className="t-cond block truncate text-[14px] font-medium text-ink">{r.name}</span>
                <span className="row-meta">
                  <span className="meta-publisher">{r.publisher?.name || "unspecified"}</span>
                  <span className="truncate text-ink-3">{r.summary}</span>
                </span>
              </span>
              <span className="t-mono t-tabular shrink-0 text-[11px] text-ink-3">{r.kind}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PackagePage(props: PackageViewProps) {
  return <PackageContent {...props} />;
}
