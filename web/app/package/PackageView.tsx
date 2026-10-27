"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, SearchX } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { Listing } from "../../lib/telemetry";
import { formatCount } from "../../lib/format";
import { displayListingName, kindLabel, listingHref, publisherDisplayName } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import { feasibilityFor } from "../../lib/installFeasibility";
import { hostsNamedBy } from "../../lib/hostIdentity";
import { VerifiedMark } from "../../components/catalog/PublisherMark";
import { readInlineEntry, useProductRow } from "../../lib/catalogData";
import { SITE_URL } from "../../lib/site";
import { listingSummary } from "../../lib/listingSummary.mjs";
import { AGENT_CHOICES, AGENT_STORAGE_KEY, findAgentChoice } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import { AddSteps, scrollToSection } from "../../components/package/AddSteps";
import { InstallBand } from "../../components/package/InstallBand";
import { PlainSummary } from "../../components/package/PlainSummary";
import { TryItPrompts } from "../../components/package/TryItPrompts";
import { PackageTabs } from "../../components/package/PackageTabs";
import type { PackageTabId } from "../../components/package/PackageTabs";
import { SpecCard } from "../../components/package/SpecCard";
import { RelatedRail } from "../../components/package/RelatedRail";
import { categoryLabel } from "../categories/categoryLabel";
import {
  clampMeta,
  entryBreadcrumbJsonLd,
  entryJsonLd,
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
  /** The catalog's host identities, at build time — the coverage denominator. */
  hostTotal: number;
  /** First twelve rows in index order: the list the static shell renders. */
  indexRows: Listing[];
  /**
   * Category slugs this build wrote a sibling file for
   * (`/data/pkg/cat/<slug>.json`), computed by the page from the same rule the
   * emitter uses (`lib/categoryFiles.mjs`). Every category the snapshot has is
   * in the set — the largest two are bounded slices rather than full files —
   * so a slug outside it means an older build's page, which is still answered
   * without a request instead of a guaranteed 404.
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
    <main data-package-index id="main" tabIndex={-1} className="shell flex-1 py-16">
      <div className="max-w-prose">
        <h1 data-entry-name suppressHydrationWarning className="t-cond text-[24px] font-semibold tracking-tight text-ink">
          Find a package
        </h1>
        <p data-entry-summary suppressHydrationWarning className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{`Find a package, choose your agent, and follow its installation guide. Browse ${formatCount(total)} packages in Explore.`}</p>

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
        <div data-index-browse className="mt-6 min-h-[44px]">{note}</div>

        <div data-index-browse className="section-head mt-9">
          <h2>Start of the catalog</h2>
          <Link href="/explore/" className="t-mono shrink-0 text-[12px] text-ink-2 hover:text-ink hover:underline">
            search all
          </Link>
        </div>
        <ul data-index-browse>
          {indexRows.map((item) => (
              <li key={item.id}>
                <Link
                  href={listingHref(item)}
                  className="grid grid-cols-[3px_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 transition-colors hover:bg-hover"
                  prefetch={false}
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-[3px] rounded-[1px]"
                    style={{ backgroundColor: `var(--${item.kind})` }}
                  />
                  <span className="min-w-0">
                    <span className="t-cond block truncate text-[14px] font-medium text-ink">{displayListingName(item)}</span>
                    <span className="row-meta">
                      <span>{item.publisher?.name ? publisherDisplayName(item.publisher.name) : "Publisher not listed"}</span>
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
    <main id="main" tabIndex={-1} className="shell flex-1 py-20">
      <div className="flex max-w-prose flex-col items-start gap-3">
        <SearchX className="h-6 w-6 text-ink-3" aria-hidden="true" />
        <h1 className="t-cond text-[22px] font-semibold tracking-tight text-ink">
          {ambiguous ? "That name matches more than one entry" : "We couldn\u2019t find that entry"}
        </h1>
        {ambiguous ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            This address is shared by more than one entry, so it doesn&rsquo;t name a single one.
            Open the entry from a search result instead.
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            No entry in the catalog&rsquo;s {formatCount(total)} entries matches this address. It may
            have been renamed or withdrawn, or published after the catalog was last updated.
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
 * served by the edge Worker (`worker/index.js`) rather than by a page per
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
    // `/package/<slug>` is the canonical path form, served by the edge Worker
    // (`worker/index.js`). The Worker is transparent, so the browser keeps the
    // path form and `window.location.search` stays empty — which is why the
    // pathname has to be read here rather than relying on the query alone.
    //
    // A bare /package/ resolves-with-nothing, so it shows the route index rather
    // than an unresolved placeholder.
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("slug");
    const fromPath = /^\/package\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    const param = fromQuery ?? (fromPath ? safeDecode(fromPath) : null);
    // Canonicalise the legacy spelling. The edge Worker serves `?slug=` as the
    // same page (its canonical already points at the path form), but only the
    // client can move the address bar without a reload and without touching
    // history length. Anyone who lands on the old form now gets a path-form
    // address in the bar, so what they copy or bookmark is the canonical one.
    if (fromQuery && !fromPath) {
      // The trailing slash is the Worker's canonical form (`worker/index.js`
      // writes `.../package/<key>/`), so the address this moves to has to
      // carry it; without it the bar disagreed with the page's own canonical
      // tag by one character.
      window.history.replaceState(null, "", `/package/${encodeURIComponent(fromQuery)}/`);
    }
    setState({ slug: param, resolved: true });
  }, []);

  return state;
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
  /**
   * The row the edge Worker already resolved, handed to this page with it.
   * Reading it here means the entry can be rendered without the bucket
   * round trip that used to sit between the reader's click and the entry
   * appearing.
   *
   * It is read AFTER the mount, not during the first render. The Worker's
   * page is the shipped shell — the same document every entry outside the
   * pre-rendered set gets — so a first render that already had the row would
   * not match the HTML the server sent, and React would throw the whole tree
   * away and rebuild it in the browser (error #418: "the server rendered HTML
   * didn't match the client"). That is the expensive version of the flash
   * this row was added to remove: the server's markup is discarded, the page
   * is built twice, and the console carries an error.
   *
   * After the mount the first client render matches the server's, the row
   * arrives with the document it was already in — no request — and the entry
   * appears on the next frame instead of after a 170-450 KB round trip.
   */
  const [inlineEntry, setInlineEntry] = useState<Listing | null>(null);
  useEffect(() => {
    setInlineEntry(readInlineEntry());
  }, []);
  // One product row, two counts and the sibling list come from ~170 KB of
  // hash-partitioned rows rather than the 44.5 MB full catalog this route used
  // to concatenate on every visit. A pre-rendered page already has its row, so
  // it asks for nothing — and neither does a page the Worker served with the
  // row in hand.
  const { status, payload, retry } = useProductRow(initialItem || inlineEntry ? null : slug);
  // Ids always resolve; slugs resolve only when the emitter stamped them as
  // the row's whole-dataset `linkKey`, never by a bucket-local first-wins.
  const lookup = useMemo(() => (payload ? buildLookup(payload.rows) : null), [payload]);
  const item = useMemo(
    () =>
      initialItem ??
      inlineEntry ??
      (slug && lookup ? lookup.get(slug) ?? null : null),
    [initialItem, inlineEntry, slug, lookup]
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
  const [tab, setTab] = useState<PackageTabId>("capabilities");

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
   *
   * WHY THIS WATCHES THE HEAD
   *
   * The head belongs to React once the shell has hydrated, and React writes
   * the ROUTE's metadata into it — "Find a package" for this route. The edge
   * Worker had already written the ENTRY's title into the served HTML, and
   * React's hydration found a different text there than the tree it was
   * hydrating, so it re-applied its own.
   *
   * The two writes are ordered by when each happens, and the order is not
   * ours to pick: the shell is a dynamic chunk, so React's head commit lands
   * a couple of hundred milliseconds in — AFTER an effect that already had
   * the entry and had written the title. Whichever write came last won, and
   * it was whichever happened to be last, so the tab title was the entry's
   * name on some visits and the route's generic one on others.
   *
   * So the title is asserted and re-asserted: an observer on the head puts it
   * back whenever React (or anything else) writes over it. The same pass
   * keeps ONE `og:title`/`og:description`, because React's hydration also
   * leaves a second copy of each behind — the Worker's tag and React's, with
   * different contents, in one head.
   */
  const docTitle = item?.name ?? null;
  const docSummary = item ? listingSummary(item) : null;
  const canonicalKey = item ? (item.linkKey ?? item.id) : null;
  const canonicalHref = canonicalKey
    ? `${SITE_URL}/package/${encodeURIComponent(canonicalKey)}/`
    : null;
  useEffect(() => {
    if (!docTitle) return;
    const wanted = `${docTitle} · LiteSPM`;
    const description = clampMeta(
      docSummary?.trim() ||
        `${docTitle} from the LiteSPM catalog: what it is, which agent targets have a supported install path, and how to add it.`
    );

    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
      for (const [property, content] of [
        ["og:title", wanted],
        ["og:description", description],
      ] as const) {
        const nodes = Array.from(
          document.head.querySelectorAll<HTMLMetaElement>(`meta[property="${property}"]`)
        );
        // The last one is the node React owns; removing React's and keeping
        // the Worker's would make a later render re-add a second tag.
        const keep = nodes[nodes.length - 1];
        for (const node of nodes) {
          if (node !== keep) node.remove();
        }
        if (!keep) continue;
        // A write is only a write when the value differs: setAttribute fires a
        // mutation record even for the identical value, and this function is
        // itself the observer's callback.
        if (keep.getAttribute("content") !== content) keep.setAttribute("content", content);
      }
      if (canonicalHref) {
        const links = Array.from(
          document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
        );
        const keep = links[links.length - 1];
        for (const link of links) {
          if (link !== keep) link.remove();
        }
        if (keep && keep.getAttribute("href") !== canonicalHref) {
          keep.setAttribute("href", canonicalHref);
        }
      }
    };
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["content", "href"],
    });
    return () => {
      observer.disconnect();
    };
  }, [docTitle, docSummary, canonicalHref]);

  /**
   * The address bar and the canonical tag name the same entry — always.
   *
   * Three spellings reach this page: `?slug=<key>` (what the route shipped
   * with), `/package/<key>/` (the canonical path form the edge Worker serves
   * and stamps into the head), and `/package/<key>` (what the site's own entry
   * links render — Next drops the trailing slash). The Worker's canonical tag
   * names the trailing-slash form on all three, so that is where the address
   * bar goes.
   *
   * The head needs the same treatment on a non-pre-rendered entry: the Worker
   * rewrites the shell's canonical, and hydration then adds the `/package/`
   * route's own metadata canonical — the index. Two `rel=canonical` links
   * naming different pages is invalid, and a crawler may keep the wrong one,
   * so this keeps one link and points it at the entry.
   *
   * The reconciliation of the tag itself is part of the head observer above,
   * for the same reason the title is: React writes its own canonical when the
   * shell commits, which is after a one-shot effect would have run.
   *
   * Client-side only, like the title rewrite above: what a crawler sees in the
   * served HTML is the Worker's tag, which is already correct.
   */
  useEffect(() => {
    if (!canonicalKey) return;
    const path = `/package/${encodeURIComponent(canonicalKey)}/`;
    if (window.location.pathname !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [canonicalKey]);

  /**
   * An address that names no entry still answers 200 with this shell on the
   * query and no-slash forms (the trailing-slash form is a real 404). The edge
   * Worker marks that shell `noindex` in the served HTML, so a crawler that
   * runs no JavaScript sees the tag too; this effect is the client-side
   * counterpart, kept so the tag is also correct when the page was served
   * without the Worker (a bare static serve) or when the key resolves to
   * nothing here. A resolved entry never gets the tag.
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

  /**
   * The edge Worker injects this entry's structured data into the served HTML
   * (marked `data-litespm-entry`). Once the entry resolves here the client
   * owns that data — its own block is rendered below for a client-resolved
   * page, and a pre-rendered page ships its own without the marker — so the
   * injected block is removed rather than left as a second SoftwareApplication
   * block for one entry, or as a stale one after a client-side navigation.
   * Runs before the early returns below, like every hook here.
   */
  useEffect(() => {
    if (!item) return;
    document.head.querySelector('script[data-litespm-entry]')?.remove();
  }, [item]);

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

  // One entry per host identity (`lib/hostIdentity`), so a skill row's two
  // spellings of the Pi host count once — and this fraction's numerator and
  // `hostTotal` are the same kind of thing.
  const hosts = hostsNamedBy(item);
  const selectedFeasibility = agent && agent.id !== "other" ? feasibilityFor(item, agent.id) : null;
  const avail = availabilityOf(item);

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

  /** The entry view: the plain questions first, the exact fields in the tabs below. */
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
              Catalog
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
            {displayListingName(item)}
          </li>
        </ol>
      </nav>

      <main id="main" tabIndex={-1} className="shell flex-1 pb-16 pt-7">
        <div className="mx-auto w-full max-w-[1040px]">
          {/*
           * Two columns on lg+ — the record runs down the main column while
           * the specifications card sits in an aside beside it, the
           * arrangement both comparable detail pages use (mcp.so and
           * mcpservers.org both put specs in a sidebar at this width). Below
           * lg the aside follows the title block instead, so the
           * specifications stay near the top of the mobile page rather than
           * at its end.
           *
           * The reserved "Sponsor placement" box that used to sit under the
           * specs is gone. This build sells no sponsorship, so the box could
           * only ever state that it was empty — a placeholder advertising its
           * own emptiness in the reader's eyeline, above the fold on every
           * entry page. An unfilled slot that says "reserved" is a worse
           * signal than no slot: it reads as a page still under construction.
           * When a sponsor program exists, the placement belongs here; until
           * then the sidebar carries the specification card and nothing else.
           */}
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-x-10">
            <div className="lg:col-start-1 lg:row-start-1">
          {/* ---- 1. What is this? -------------------------------------- */}
          <header aria-labelledby="pkg-title" className="market-product-header">
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
              className="market-product-heading mt-3 text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]"
            >
              {displayListingName(item)}
            </h1>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-2">
              {item.publisher?.provenance === "source-owner" && <span>Publisher:</span>}
              {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) ? (
                <a
                  href={item.publisher.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {publisherDisplayName(item.publisher.name)}
                </a>
              ) : (
                <span>{item.publisher?.name ? publisherDisplayName(item.publisher.name) : "Publisher not listed"}</span>
              )}
              {item.publisher?.verified && <VerifiedMark />}
              
              {/* The same availability the result cards carry. The detail page
                  stated it indirectly (a section note reading "installability
                  status"), which meant a reader arriving from a search result
                  lost the one field that decided whether they could act. */}
              <span
                data-testid="installability"
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

            {listingSummary(item) && (
              <p className="market-product-summary mt-2.5 max-w-prose text-[14px] leading-relaxed text-ink-2">
                {listingSummary(item)}
              </p>
            )}

            {/* ---- 1c. The action, on the first screen ------------------- */}
            {/*
             * The install line sits in the title block, above everything the
             * page has to explain — the competitor pages all open this way,
             * and a reader who arrived from a search result gets the one
             * thing they came for without scrolling. The guided flow stays
             * in "How do I add it?"; the band's link is the path to it.
             */}
            <InstallBand
              item={item}
              agent={agent}
              onSeeSteps={() => scrollToSection("pkg-add")}
              onChooseAgent={() => scrollToSection("will-it-work")}
            />
          </header>

          {/* ---- 1b. Setup and agent fit ------------------------------ */}
          {/*
           * Identity and published facts live in the header and spec card.
           * This short block keeps only the two decisions a new reader needs:
           * whether LiteSPM has a setup path and how that path fits their
           * agent. The technical tabs below hold the exact fields.
           */}
          <PlainSummary
            item={item}
            hostTotal={hostTotal}
            agent={agent}
            onOpenTab={(nextTab) => {
              setTab(nextTab);
              scrollToSection("pkg-details");
            }}
          />
            </div>

            <aside className="mt-9 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
              {/* Sticky on lg+ so the specs travel with the reader; the inner
                  div does the sticking because the aside itself is the grid
                  item that spans both rows. */}
              <div className="space-y-4 lg:sticky lg:top-[calc(var(--site-header-height)+16px)]">
                <SpecCard item={item} />
              </div>
            </aside>

            <div className="lg:col-start-1 lg:row-start-2">

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
                {hosts.length ? `${hosts.length} of ${hostTotal} hosts` : avail.label}
              </span>
            </div>

            {hosts.length === 0 ? (
              /* Nothing can be configured, so there is no per-agent answer to
                 give — but the section's own question still has one, and it is
                 the availability gate's words rather than a second explanation
                 of them. */
              <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-ink-2">
                Choose an agent to see whether this package has a setup path. {avail.plain}
              </p>
            ) : (
              <>
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
                      Choose another agent to see its setup path.
                    </p>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[11px] font-medium ${
                        selectedFeasibility?.state === "supported" ||
                        selectedFeasibility?.state === "requires-setup"
                          ? "border-accent/30 bg-accent-wash text-accent-text"
                          : "border-rule bg-sunken text-ink-3"
                      }`}
                      title={selectedFeasibility?.limitations.join(". ") ?? "No agent target selected."}
                    >
                      {selectedFeasibility?.state === "supported" && (
                        <Check className="h-3 w-3" aria-hidden="true" />
                      )}
                      {selectedFeasibility?.state === "supported"
                        ? `Installable for ${agent.label}`
                        : selectedFeasibility?.state === "requires-setup"
                          ? `Requires setup for ${agent.label}`
                          : selectedFeasibility?.state === "discovery-only"
                            ? `Setup details needed for ${agent.label}`
                            : selectedFeasibility?.state === "unsupported"
                              ? `Choose another agent`
                              : selectedFeasibility?.state === "unknown"
                                ? `Check setup for ${agent.label}`
                                : `Choose an agent`}
                    </span>
                  )}
                </div>

                <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-3">
                  Choose an agent to see its configuration file and exact install command.
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
              </>
            )}
          </section>

                    {/* ---- then: tabs -------------------------------------------- */}
          <div id="pkg-details" tabIndex={-1} className="scroll-mt-16">
            <PackageTabs
              item={item}
              agent={agent}
              hostTotal={hostTotal}
              active={tab}
              onChange={setTab}
            />
          </div>
            </div>
          </div>

          {/* ---- related ---- */}
          <RelatedRail item={item} siblingCategories={siblingCategories} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default function PackagePage(props: PackageViewProps) {
  return <PackageContent {...props} />;
}
