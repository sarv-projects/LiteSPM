"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, GitCompareArrows, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { displayPackageName } from "@/lib/litespm/format";
import type { CatalogListResponse, CompareColumn } from "@/lib/litespm/types";
import { InstallBar } from "../install-bar";
import { AvailabilityBadge, KindBadge } from "../primitives";
import { RankBadge } from "../rank-badge";

const SEARCHABLE_COUNT = 6;

export function CompareView({ keys }: { keys: string[] }) {
  const navigate = useApp((s) => s.navigate);
  const compareKeys = useApp((s) => s.compareKeys);
  const [columns, setColumns] = React.useState<CompareColumn[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [suggestions, setSuggestions] = React.useState<CatalogListResponse | null>(null);
  const [search, setSearch] = React.useState("");
  const [searching, setSearching] = React.useState(false);

  const activeKeys = keys.length > 0 ? keys : compareKeys;

  React.useEffect(() => {
    if (activeKeys.length === 0) {
      setColumns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/litespm/compare?keys=${activeKeys.map(encodeURIComponent).join(",")}`)
      .then((r) => r.json())
      .then((data: { columns?: CompareColumn[] }) => {
        if (!cancelled) setColumns(data.columns ?? []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeKeys.join(",")]);

  React.useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSuggestions(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/litespm/list?q=${encodeURIComponent(q)}&pageSize=${SEARCHABLE_COUNT}&sort=relevance`)
        .then((r) => r.json())
        .then((data: CatalogListResponse) => {
          if (!cancelled) setSuggestions(data);
        })
        .catch(() => {})
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const addColumn = (linkKey: string) => {
    const next = Array.from(new Set([...activeKeys, linkKey])).slice(0, 4);
    setSearch("");
    setSuggestions(null);
    navigate(`#/compare?keys=${next.map(encodeURIComponent).join(",")}`);
  };

  const removeColumn = (linkKey: string) => {
    const next = activeKeys.filter((k) => k !== linkKey);
    navigate(next.length === 0 ? "#/compare" : `#/compare?keys=${next.map(encodeURIComponent).join(",")}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
            Compare
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
            Packages, side by side
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {activeKeys.length} of 4 slots used. Stage packages from any card&apos;s compare icon,
            or search below.
          </p>
        </div>
        {activeKeys.length > 0 && (
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={() => navigate("#/compare")}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Search to add */}
      <div className="mt-5 max-w-xl">
        <label className="relative flex h-10 items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search packages to compare</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packages to add…"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
        </label>
        {suggestions && suggestions.items.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-lg">
            {suggestions.items.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => addColumn(hit.linkKey)}
                className="flex w-full items-center gap-2.5 border-b border-border/40 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/40"
              >
                <KindBadge kind={hit.kind} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {displayPackageName(hit.name)}
                </span>
                <span className="max-w-[180px] truncate text-[11.5px] text-muted-foreground">
                  {hit.publisher.name}
                </span>
              </button>
            ))}
          </div>
        )}
        {suggestions && suggestions.items.length === 0 && search.trim().length >= 2 && (
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            No matches for “{search.trim()}”.
          </p>
        )}
      </div>

      {/* Empty state */}
      {activeKeys.length === 0 && !loading && (
        <div className="mt-10 rounded-2xl border border-dashed border-border/70 p-14 text-center">
          <GitCompareArrows className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-4 text-[15px] font-medium">Nothing staged yet.</p>
          <p className="mx-auto mt-1 max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground">
            Use the compare icon on any package card in Explore, or search above and add up to four
            packages.
          </p>
          <Button className="mt-5 rounded-xl" variant="outline" onClick={() => navigate(exploreHash({}))}>
            Go to Explore <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && activeKeys.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-2.5 py-20 text-[13.5px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand" /> Loading comparison…
        </div>
      )}

      {/* Table */}
      {!loading && columns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 overflow-x-auto rounded-2xl border border-border/70 bg-card"
        >
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="w-[130px] px-4 py-3 align-top text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Attribute
                </th>
                {columns.map((column) => (
                  <th key={column.linkKey} className="min-w-[190px] px-4 py-3 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate(`#/package/${encodeURIComponent(column.linkKey)}`)}
                          className="block truncate text-left text-[14.5px] font-semibold hover:text-brand"
                        >
                          {displayPackageName(column.name)}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <KindBadge kind={column.kind} />
                          {column.version && (
                            <span className="font-mono text-[10.5px] text-muted-foreground">
                              v{column.version}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${column.name} from comparison`}
                        onClick={() => removeColumn(column.linkKey)}
                        className="rounded-md p-1 text-muted-foreground/50 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              <CompareRow label="Install">
                {columns.map((column) =>
                  column.installable ? (
                    <InstallBar
                      key={column.linkKey}
                      command={column.installCommand}
                      compact
                      className="min-w-[170px]"
                    />
                  ) : (
                    <span
                      key={column.linkKey}
                      className="text-[12px] text-muted-foreground"
                    >
                      Not installable
                    </span>
                  ),
                )}
              </CompareRow>
              <CompareRow label="Score">
                {columns.map((column) => (
                  <div key={column.linkKey} className="flex items-center gap-1.5">
                    <RankBadge score={column.rankScore} size="sm" />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {column.rankScore ?? 0}/100
                    </span>
                  </div>
                ))}
              </CompareRow>
              <CompareRow label="Type Spec">
                {columns.map((column) => (
                  <span
                    key={column.linkKey}
                    className="rounded bg-muted/30 px-2 py-1 font-mono text-[11px] text-foreground/90"
                  >
                    {column.typeSpecificHint || "—"}
                  </span>
                ))}
              </CompareRow>
              <CompareRow label="Availability">
                {columns.map((column) => (
                  <AvailabilityBadge
                    key={column.linkKey}
                    installable={column.installable}
                    label={column.availabilityLabel}
                  />
                ))}
              </CompareRow>
              <CompareRow label="Publisher">
                {columns.map((column) => (
                  <span key={column.linkKey} className="flex items-center gap-1.5 text-[12.5px]">
                    {column.publisherVerified && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand" />
                    )}
                    <span className="truncate">{column.publisher}</span>
                  </span>
                ))}
              </CompareRow>
              <CompareRow label="Summary">
                {columns.map((column) => (
                  <p
                    key={column.linkKey}
                    className="line-clamp-4 text-[12px] leading-relaxed text-muted-foreground"
                  >
                    {column.summary || "—"}
                  </p>
                ))}
              </CompareRow>
              <CompareRow label="Goal">
                {columns.map((column) => (
                  <span key={column.linkKey} className="text-[12.5px]">
                    {column.goalLabel || "—"}
                  </span>
                ))}
              </CompareRow>
              <CompareRow label="Category">
                {columns.map((column) => (
                  <span key={column.linkKey} className="text-[12.5px]">
                    {column.category || "—"}
                  </span>
                ))}
              </CompareRow>
              <CompareRow label="Transport">
                {columns.map((column) => (
                  <code key={column.linkKey} className="font-mono text-[11.5px]">
                    {column.transport ?? "—"}
                  </code>
                ))}
              </CompareRow>
              <CompareRow label="Runtime">
                {columns.map((column) => (
                  <code key={column.linkKey} className="font-mono text-[11.5px]">
                    {column.runtime ?? "—"}
                  </code>
                ))}
              </CompareRow>
              <CompareRow label="Works with">
                {columns.map((column) => (
                  <span key={column.linkKey} className="block text-[12px] leading-relaxed text-muted-foreground">
                    {column.hosts.length > 0
                      ? `${column.hosts.slice(0, 4).join(", ")}${column.hostCount > 4 ? ` +${column.hostCount - 4} more` : ""}`
                      : "No hosts (discovery-only)"}
                  </span>
                ))}
              </CompareRow>
              <CompareRow label="Source artifact">
                {columns.map((column) => (
                  <span key={column.linkKey} className="block text-[11.5px] leading-relaxed">
                    {column.artifactRepo ? (
                      <>
                        <a
                          href={column.artifactRepo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-brand hover:underline"
                        >
                          {column.artifactRepo.replace(/^https:\/\/github\.com\//, "")}
                        </a>
                        {column.artifactRef && (
                          <span className="ml-1 font-mono text-muted-foreground">
                            @ {column.artifactRef}
                          </span>
                        )}
                        {column.pinned && (
                          <span className="mt-0.5 block text-[10.5px] text-brand">
                            pinned commit
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                ))}
              </CompareRow>
              <CompareRow label="Endpoint">
                {columns.map((column) =>
                  column.url ? (
                    <a
                      key={column.linkKey}
                      href={column.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-[180px] truncate font-mono text-[11px] text-brand hover:underline"
                    >
                      {column.url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    <span key={column.linkKey} className="text-muted-foreground">
                      —
                    </span>
                  ),
                )}
              </CompareRow>
            </tbody>
          </table>
        </motion.div>
      )}

      {columns.length === 1 && !loading && (
        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          Add at least one more package for the comparison to be useful — up to four fit.
        </p>
      )}
    </div>
  );
}

function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <th
        scope="row"
        className="px-4 py-3 text-left align-top text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
      >
        {label}
      </th>
      {React.Children.map(children, (child, i) => (
        <td key={i} className="px-4 py-3 align-top">
          {child}
        </td>
      ))}
    </tr>
  );
}
