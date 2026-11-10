"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Check, Copy, GitCompareArrows, Github, ShieldCheck, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { useApp } from "@/lib/litespm/router";
import { displayPackageName, formatFull, formatCompact } from "@/lib/litespm/format";
import { useWatchlist } from "@/lib/litespm/hooks";
import type { CatalogHit } from "@/lib/litespm/types";
import { shellArg } from "@/lib/litespm/shell";
import { NavLink } from "./nav-link";
import { AvailabilityBadge, KindBadge } from "./primitives";
import { RankBadge } from "./rank-badge";

/**
 * One catalog row, as a card. Everything on it is clickable through to the
 * entry page; the watch and compare controls stop propagation.
 */
export function PackageCard({
  hit,
  index = 0,
  compact,
}: {
  hit: CatalogHit;
  index?: number;
  compact?: boolean;
}) {
  const compareKeys = useApp((s) => s.compareKeys);
  const toggleCompare = useApp((s) => s.toggleCompare);
  const { isWatched, toggle } = useWatchlist();

  const href = `/package/${encodeURIComponent(hit.linkKey)}`;
  const [copied, setCopied] = React.useState(false);
  const inCompare = compareKeys.includes(hit.linkKey);
  const watched = isWatched(hit.linkKey);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.25) }}
      className={cn(
        "group relative flex flex-col rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-brand/40 hover:shadow-[0_2px_18px_-8px_rgba(16,185,129,0.25)]",
        compact && "p-3.5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KindBadge kind={hit.kind} />
          {hit.publisher.verified && (
            <span
              title="Verified publisher"
              className="inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              <span className="truncate">{hit.publisher.name}</span>
            </span>
          )}
          {!hit.publisher.verified && (
            <span className="truncate text-[10.5px] text-muted-foreground/80">
              {hit.publisher.name}
            </span>
          )}
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {typeof hit.stars === "number" && hit.stars > 0 && (
            <span
              title={`${formatFull(hit.stars)} GitHub stars`}
              className="inline-flex items-center gap-0.5 font-mono text-[10.5px] text-muted-foreground"
            >
              <Star className="h-3 w-3 text-brand/80" /> {formatCompact(hit.stars)}
            </span>
          )}
          {hit.repoUrl && (
            <a
              href={hit.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`View source on GitHub: ${hit.repoUrl}`}
              className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:text-brand"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
          )}
          <RankBadge score={hit.rankScore} size="sm" />
          <button
            type="button"
            aria-label={inCompare ? `Remove ${hit.name} from compare` : `Add ${hit.name} to compare`}
            title={inCompare ? "Remove from compare" : "Add to compare"}
            onClick={(e) => {
              e.stopPropagation();
              toggleCompare(hit.linkKey);
            }}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              inCompare
                ? "text-brand"
                : "text-muted-foreground/40 hover:text-foreground",
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={watched ? `Unwatch ${hit.name}` : `Watch ${hit.name}`}
            title={watched ? "Remove from watchlist" : "Save to watchlist"}
            onClick={(e) => {
              e.stopPropagation();
              toggle({ linkKey: hit.linkKey, name: hit.name, kind: hit.kind });
            }}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              watched ? "text-brand" : "text-muted-foreground/40 hover:text-foreground",
            )}
          >
            {watched ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <h3 className="mt-2.5 truncate text-[15px] font-semibold tracking-tight">
        {/* Stretched link: the whole card is one real, keyboard-focusable
            anchor (right-click, open in new tab, copy link all work). The
            action buttons sit above it with `relative z-10`. */}
        <NavLink
          to={href}
          className="after:absolute after:inset-0 after:content-['] focus-visible:outline-offset-4"
        >
          {displayPackageName(hit.name)}
          <span className="sr-only"> — {hit.kind}</span>
        </NavLink>
      </h3>
      <p className={cn("mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground")}>
        {hit.summary || "No summary published."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/90">
        <AvailabilityBadge installable={hit.installable} label={hit.installable ? "Installable" : "Discovery only"} />
        {hit.transport && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]">{hit.transport}</span>
        )}
        {hit.version && (
          <span className="font-mono text-[10.5px]" title={`Version ${hit.version}`}>
            v{hit.version}
          </span>
        )}
        {hit.category && <span className="truncate">{hit.category}</span>}
      </div>

      {hit.installable && (
        <button
          type="button"
          title="Copy the install command"
          aria-label={`Copy install command for ${hit.name}`}
          onClick={() => {
            navigator.clipboard
              ?.writeText(`litespm install ${shellArg(hit.id)}`)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              })
              .catch(() => {});
          }}
          className="relative z-10 mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
        >
          <span className="min-w-0 truncate">
            <span className="text-brand">$</span> litespm install {shellArg(shortId(hit))}
          </span>
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          )}
          <span className="sr-only" role="status">{copied ? "Copied" : ""}</span>
        </button>
      )}
      {!hit.installable && (
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11.5px]">
          <span className="text-muted-foreground">{hit.category ? hit.category : "Catalog entry"}</span>
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors group-hover:text-brand">
            View details
          </span>
        </div>
      )}
    </motion.article>
  );
}

/** Keep card commands short: namespaced ids get their slug back. */
function shortId(hit: CatalogHit): string {
  if (hit.id.length <= 40) return hit.id;
  return hit.slug.length <= 32 ? hit.slug : hit.id;
}

export function formatHitCount(n: number): string {
  return formatFull(n);
}
