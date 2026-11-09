"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Terminal,
} from "lucide-react";

import { useApp } from "@/lib/litespm/router";
import type { CatalogHit, CatalogListResponse } from "@/lib/litespm/types";
import { displayPackageName, formatFull } from "@/lib/litespm/format";
import { shellArg } from "@/lib/litespm/shell";
import { KindBadge } from "../primitives";

type TabId = "skills" | "plugins" | "mcp" | "installed";

const TABS: Array<{ id: TabId; label: string; kind?: "skill" | "plugin" | "mcp" }> = [
  { id: "skills", label: "Skills", kind: "skill" },
  { id: "plugins", label: "Plugins", kind: "plugin" },
  { id: "mcp", label: "MCP Servers", kind: "mcp" },
  { id: "installed", label: "Installed" },
];

interface InstalledRecord {
  kind: string;
  id: string;
  name: string;
  agent: string;
  scope: string;
  state: string;
  placement: string;
  origin: string;
  installId: string;
  configPath: string;
  locator: string;
  installAt?: string;
  detail: string;
}

interface InstalledReport {
  schema?: string;
  capturedAt?: string;
  counts?: Record<string, number>;
  records?: InstalledRecord[];
  warnings?: string[];
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("clipboard unavailable"));
}

function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <Terminal className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
        {command}
      </code>
      <button
        type="button"
        onClick={() => {
          copyText(command).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          });
        }}
        aria-label="Copy install command"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-brand"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function ResultCard({ hit }: { hit: CatalogHit }) {
  const navigate = useApp((s) => s.navigate);
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-brand/40">
      <div className="flex items-center justify-between gap-2">
        <KindBadge kind={hit.kind} />
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {hit.publisher.name}
        </span>
      </div>
      <h3 className="mt-2.5 truncate text-[15px] font-semibold tracking-tight">
        {displayPackageName(hit.name)}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[12.5px] leading-relaxed text-muted-foreground">
        {hit.summary || "No summary published."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/80">
        {hit.version && <span className="font-mono">v{hit.version}</span>}
        {hit.transport && <span className="font-mono">{hit.transport}</span>}
        {hit.installability === "discovery_only" && <span>discovery only</span>}
      </div>
      <InstallCommand command={`litespm install ${shellArg(hit.id)}`} />
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <button
          type="button"
          onClick={() => navigate(`/package/${encodeURIComponent(hit.linkKey)}`)}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
        >
          <Download className="h-3.5 w-3.5" /> Details
        </button>
        <span className="text-[10.5px] text-muted-foreground">installable</span>
      </div>
    </article>
  );
}

function CatalogTab({ kind, query }: { kind: "skill" | "plugin" | "mcp"; query: string }) {
  const [data, setData] = React.useState<CatalogListResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({
      kind,
      installable: "1",
      pageSize: "36",
      page: String(page),
      sort: query ? "relevance" : "rank",
      // The panel shows cards, not filter counts: skip eight extra full-catalog
      // facet scans so a tab switch is a page, not a multi-second wait.
      facets: "0",
    });
    if (query) params.set("q", query);
    fetch(`/api/litespm/list?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<CatalogListResponse>;
      })
      .then((json) => {
        setData((previous) =>
          page > 1 && previous
            ? { ...json, items: [...previous.items, ...json.items] }
            : json,
        );
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [kind, query, page]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Searching the live catalog…
      </div>
    );
  }
  if (error && !data) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-[13px] text-muted-foreground">
        The catalog could not be loaded. Check the connection and try again.
      </p>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <p className="rounded-xl border border-border/70 bg-card p-6 text-center text-[13px] text-muted-foreground">
        No installable {kind === "mcp" ? "MCP servers" : `${kind}s`} match this search.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[12px] text-muted-foreground">
        <span>
          {formatFull(data.total)} installable {kind === "mcp" ? "MCP servers" : `${kind}s`}
          {query ? ` matching “${query}”` : ""} · showing {formatFull(data.items.length)}
        </span>
        <span className="font-mono text-[10.5px]">
          {query ? "ranked by relevance" : "ranked by catalog rank"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((hit) => (
          <ResultCard key={hit.id} hit={hit} />
        ))}
      </div>
      {error && (
        <p className="mt-3 text-[12px] text-amber-600 dark:text-amber-400">
          More results could not be loaded. The {data.items.length} shown above are still valid.
        </p>
      )}
      {data.page < data.pageCount && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-wait disabled:opacity-60"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? "Loading more…" : "Load 36 more"}
          </button>
        </div>
      )}
    </div>
  );
}

function InstalledTab() {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "unavailable"; command?: string }
    | { status: "ready"; report: InstalledReport }
  >({ status: "loading" });
  const [kind, setKind] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    setState({ status: "loading" });
    fetch("/api/litespm/installed", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { available: boolean; report?: InstalledReport; command?: string }) => {
        if (json.available && json.report) setState({ status: "ready", report: json.report });
        else setState({ status: "unavailable", command: json.command });
      })
      .catch(() => setState({ status: "unavailable" }));
  }, [reload]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the local ledger…
      </div>
    );
  }
  if (state.status === "unavailable") {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <h3 className="text-[14px] font-semibold">Installed capabilities live on your machine</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          This page is served remotely, so it cannot read your local LiteSPM ledger. Run the
          command below in the project where LiteSPM is installed — or run{" "}
          <code className="font-mono text-foreground">litespm marketplace</code> locally to open
          the same panel with the Installed tab wired to your ledger.
        </p>
        <InstallCommand command={state.command || "litespm list --json"} />
      </div>
    );
  }

  const records = state.report.records ?? [];
  const kinds = [...new Set(records.map((r) => r.kind))].sort();
  const needle = query.trim().toLowerCase();
  const filtered = records.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (!needle) return true;
    return `${r.name} ${r.id} ${r.agent} ${r.state} ${r.detail}`.toLowerCase().includes(needle);
  });
  const counts = state.report.counts;

  // An observed row is not LiteSPM's to remove: the honest next step is
  // adoption, which records ownership without rewriting the agent's config.
  // A managed row gets the ledger-scoped removal instead.
  const actionFor = (r: InstalledRecord): { command: string | null; label: string } => {
    if (r.state === "observed" || r.origin === "host-config") {
      if (r.kind === "skill") {
        return {
          command: `litespm skills adopt ${r.name || r.id}${r.agent ? ` --agent ${r.agent}` : ""}`,
          label: "Adopt",
        };
      }
      return {
        command: `litespm adopt ${r.name || r.id}${r.agent ? ` --host ${r.agent}` : ""}`,
        label: "Adopt",
      };
    }
    if (r.kind === "skill") {
      return { command: `litespm skills remove ${r.name || r.id} --all`, label: "Remove" };
    }
    if (r.installId) {
      return { command: `litespm install remove ${r.installId}`, label: "Remove" };
    }
    return { command: null, label: "Read-only" };
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-muted-foreground">
            {counts?.uniqueCapabilities ?? records.length} unique capabilities ·{" "}
            {counts?.deployments ?? records.length} deployments
            {state.report.capturedAt ? ` · read ${state.report.capturedAt}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Read-only inventory. LiteSPM does not health-check these entries, so no row claims
            “Ready”. Observed rows are adopted, never silently rewritten.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter installed…"
              aria-label="Filter installed capabilities"
              className="w-44 rounded-lg border border-border/70 bg-background py-1.5 pl-8 pr-2 text-[12px] outline-none focus:border-brand/52"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-lg border border-border/70 bg-background px-2 py-1.5 text-[12px] text-foreground"
            >
              <option value="all">All ({records.length})</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k} ({records.filter((r) => r.kind === k).length})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-brand/40 hover:text-brand"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border/70 bg-card p-6 text-center text-[13px] text-muted-foreground">
          {records.length === 0
            ? "LiteSPM’s ledger is empty on this machine. Install something from the other tabs to see it here."
            : "Nothing installed matches this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
          <table className="w-full min-w-[46rem] text-left text-[12px]">
            <thead className="border-b border-border/60 bg-muted/30 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Capability</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const action = actionFor(r);
                return (
                  <tr key={`${r.kind}:${r.id}:${r.agent}:${r.scope}`} className="border-b border-border/40 last:border-0">
                    <td className="max-w-[22rem] px-3 py-2.5">
                      <span className="block truncate font-medium">{displayPackageName(r.name || r.id)}</span>
                      <span className="block truncate font-mono text-[10.5px] text-muted-foreground">{r.id}</span>
                    </td>
                    <td className="px-3 py-2.5">{r.kind || "—"}</td>
                    <td className="px-3 py-2.5">{r.agent || "—"}</td>
                    <td className="px-3 py-2.5">{r.scope || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="block">{r.state || "—"}</span>
                      {r.detail && (
                        <span className="block max-w-[15rem] truncate text-[10.5px] text-muted-foreground" title={r.detail}>
                          {r.detail}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {action.command ? (
                        <>
                          <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            {action.label}
                          </span>
                          <InstallCommand command={action.command} />
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {state.report.warnings && state.report.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11.5px] text-amber-600 dark:text-amber-400">
          {state.report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarketplaceView({
  initialTab = "skills",
  initialQuery = "",
}: {
  initialTab?: string;
  initialQuery?: string;
}) {
  const navigate = useApp((s) => s.navigate);
  const [tab, setTab] = React.useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "skills",
  );
  const [query, setQuery] = React.useState(initialQuery);
  const [submitted, setSubmitted] = React.useState(initialQuery);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]!;

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSubmitted(query.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    const params = new URLSearchParams({ tab });
    if (submitted) params.set("q", submitted);
    // Keep the address bar shareable without forcing a full navigation.
    window.history.replaceState(null, "", `/marketplace?${params.toString()}`);
  }, [tab, submitted]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            LiteSPM Marketplace
          </p>
          <h1 className="mt-1 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-tight">
            Find it once. Install it everywhere.
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Search the live catalog by kind, then copy the install command. The Installed tab reads
            the local ledger when this panel is served by the LiteSPM CLI.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/explore")}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border/70 px-3 py-2 text-[12px] font-medium text-muted-foreground hover:border-brand/40 hover:text-brand sm:self-auto"
        >
          <Package className="h-3.5 w-3.5" /> Advanced filters
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Marketplace tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-foreground"
                  : "rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "installed" && (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${active.label.toLowerCase()} in the live catalog…`}
              aria-label={`Search ${active.label}`}
              className="w-full rounded-xl border border-border/70 bg-background py-2.5 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-brand/52"
            />
          </label>
        )}
      </div>

      <div className="mt-5">
        {tab === "installed" ? (
          <InstalledTab />
        ) : (
          // Remounting on kind/search is deliberate: the panel must never
          // label last tab's rows as the new tab's results while the next
          // request is in flight.
          <CatalogTab key={`${active.kind}:${submitted}`} kind={active.kind!} query={submitted} />
        )}
      </div>
    </div>
  );
}

export const MARKETPLACE_TABS = TABS;
