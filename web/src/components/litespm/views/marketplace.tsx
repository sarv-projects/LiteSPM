"use client";

import * as React from "react";
import { Check, Copy, Loader2, RefreshCw, Search, Terminal } from "lucide-react";

import { exploreHash, kindForTab, type ExploreQuery, type MarketplaceTab } from "@/lib/litespm/router";
import { displayPackageName } from "@/lib/litespm/format";
import { cn } from "@/lib/utils";
import { NavLink } from "../nav-link";
import { CatalogBrowser } from "./catalog-browser";
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

const TAB_META: Array<{ id: MarketplaceTab; label: string; blurb: string }> = [
  { id: "all", label: "All", blurb: "MCP servers, skills and plugins" },
  { id: "mcp", label: "MCP Servers", blurb: "Tools an agent can call" },
  { id: "skills", label: "Skills", blurb: "Reusable SKILL.md workflows" },
  { id: "plugins", label: "Plugins", blurb: "Bundles of servers and skills" },
  { id: "installed", label: "Installed", blurb: "What LiteSPM manages on this machine" },
];

/**
 * The single catalog page. Tabs are the kind filter (real links, so each tab
 * is shareable and back/forward works); search, facets and pagination are
 * server-side in <CatalogBrowser>. `/explore` redirects here.
 */
export function MarketplaceView({
  tab,
  query,
}: {
  tab: MarketplaceTab;
  query: ExploreQuery;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
          LiteSPM Marketplace
        </p>
        <h1 className="mt-1 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-tight">
          Find it once. Install it everywhere.
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Search the live catalog, then copy the exact <code className="font-mono">litespm install</code>{" "}
          command. Inside your agent, <code className="font-mono">litespm setup</code> adds a{" "}
          <code className="font-mono">/litespm-marketplace</code> command that browses your locally
          synced copy of this catalog.{" "}
          <NavLink to="/docs/methodology" className="whitespace-nowrap font-medium text-brand hover:underline">
            How we rank
          </NavLink>
          : installable listings come first, and nothing here is a download count.
        </p>
      </div>

      <nav aria-label="Marketplace sections" className="mt-6 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3">
        {TAB_META.map((t) => {
          const active = tab === t.id;
          return (
            <NavLink
              key={t.id}
              to={t.id === "installed" ? "/marketplace?tab=installed" : exploreHash({ q: query.q, kind: kindForTab(t.id) }, t.id)}
              aria-current={active ? "page" : undefined}
              title={t.blurb}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {t.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-5">
        {tab === "installed" ? <InstalledTab /> : <CatalogBrowser query={query} tab={tab} />}
      </div>
    </div>
  );
}