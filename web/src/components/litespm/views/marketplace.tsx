"use client";

import * as React from "react";
import { Check, Copy, Loader2, RefreshCw, RotateCcw, Search, Sparkles, Terminal, Trash2 } from "lucide-react";

import { exploreHash, kindForTab, type ExploreQuery, type MarketplaceTab } from "@/lib/litespm/router";
import { displayPackageName } from "@/lib/litespm/format";
import { cn } from "@/lib/utils";
import { CopyButton } from "../code-block";
import { NavLink } from "../nav-link";
import { CatalogBrowser } from "./catalog-browser";
import { TrendingLeaderboard } from "./trending-leaderboard";
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
        {copied ? <Check className="h-3.5 w-3.5 animate-in fade-in-0 text-emerald-500 duration-150" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <span role="status" className="sr-only">{copied ? "Install command copied" : ""}</span>
    </div>
  );
}

const INITIAL_SANDBOX_RECORDS: InstalledRecord[] = [
  {
    kind: "mcp",
    id: "mcp:builtin:mcp-registry:io.github.github-github-mcp-server",
    name: "GitHub MCP Server",
    agent: "claude-code",
    scope: "user",
    state: "managed",
    placement: "user-config",
    origin: "ledger",
    installId: "inst_gh_984a12",
    configPath: "~/.claude.json",
    locator: "github/github-mcp-server@v0.4.1",
    detail: "CAS digest sha256:4f8a92... | Surgical AST merge verified",
  },
  {
    kind: "skill",
    id: "skill:agentskills:deep-research",
    name: "Deep Research Skill",
    agent: "cursor",
    scope: "project",
    state: "managed",
    placement: "skills-tree",
    origin: "ledger",
    installId: "inst_dr_66b301",
    configPath: ".cursor/rules/deep-research.mdc",
    locator: "agentskills/deep-research@v1.2.0",
    detail: "CAS digest sha256:9b1c77... | 3 skill assets tracked in ledger",
  },
  {
    kind: "mcp",
    id: "mcp:builtin:mcp-registry:postgres-mcp",
    name: "PostgreSQL Connector",
    agent: "cline",
    scope: "user",
    state: "managed",
    placement: "user-config",
    origin: "ledger",
    installId: "inst_pg_11a84f",
    configPath: "~/.cline/data/settings/cline_mcp_settings.json",
    locator: "postgres/mcp@v2.0.0",
    detail: "CAS digest sha256:1a7d55... | Preserves custom comments",
  },
];

function InstalledTab() {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "unavailable"; command?: string }
    | { status: "ready"; report: InstalledReport }
  >({ status: "loading" });
  const [kind, setKind] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [sandboxMode, setSandboxMode] = React.useState(false);
  const [sandboxRecords, setSandboxRecords] = React.useState<InstalledRecord[]>(INITIAL_SANDBOX_RECORDS);
  const [rollingBackId, setRollingBackId] = React.useState<string | null>(null);
  const [rolledBackNotice, setRolledBackNotice] = React.useState<string | null>(null);

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

  const handleSimulateRollback = (rec: InstalledRecord) => {
    setRollingBackId(rec.installId);
    window.setTimeout(() => {
      setSandboxRecords((prev) => prev.filter((r) => r.installId !== rec.installId));
      setRollingBackId(null);
      setRolledBackNotice(`Surgically rolled back ${rec.name}: byte-exact pre-image restored, 0 orphan files left.`);
    }, 700);
  };

  if (state.status === "loading" && !sandboxMode) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the local ledger…
      </div>
    );
  }
  if (state.status === "unavailable" && !sandboxMode) {
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div>
            <p className="text-[12.5px] font-medium text-foreground">Want to preview how LiteSPM manages installed capabilities?</p>
            <p className="text-[11.5px] text-muted-foreground">Test AST pruning and surgical byte-exact rollback in simulated sandbox mode.</p>
          </div>
          <button
            type="button"
            onClick={() => setSandboxMode(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/20"
          >
            <Sparkles className="h-3.5 w-3.5" /> Launch Sandbox Demo
          </button>
        </div>
      </div>
    );
  }

  const records = sandboxMode ? sandboxRecords : (state.status === "ready" ? state.report.records ?? [] : []);
  const kinds = [...new Set(records.map((r) => r.kind))].sort();
  const needle = query.trim().toLowerCase();
  const filtered = records.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (!needle) return true;
    return `${r.name} ${r.id} ${r.agent} ${r.state} ${r.detail}`.toLowerCase().includes(needle);
  });
  const counts = state.status === "ready" && !sandboxMode ? state.report.counts : { uniqueCapabilities: records.length, deployments: records.length };
  const capturedAt = state.status === "ready" ? state.report.capturedAt : undefined;

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
      {sandboxMode && (
        <div className="mb-4 rounded-xl border border-brand/40 bg-brand-soft/60 p-4 text-[12.5px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-brand animate-pulse" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">Interactive Sandbox Demo</span>
              <span className="text-muted-foreground">· Simulated Ledger & AST Config</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSandboxRecords(INITIAL_SANDBOX_RECORDS);
                  setRolledBackNotice(null);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Reset Demo
              </button>
              <button
                type="button"
                onClick={() => setSandboxMode(false)}
                className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Exit Sandbox
              </button>
            </div>
          </div>
          {rolledBackNotice && (
            <p className="mt-2 font-mono text-[11.5px] text-brand">
              ✓ {rolledBackNotice}
            </p>
          )}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-muted-foreground">
            {counts?.uniqueCapabilities ?? records.length} unique capabilities ·{" "}
            {counts?.deployments ?? records.length} deployments
            {capturedAt ? ` · read ${capturedAt}` : ""}
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
                      {sandboxMode ? (
                        <button
                          type="button"
                          disabled={rollingBackId === r.installId}
                          onClick={() => handleSimulateRollback(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                        >
                          {rollingBackId === r.installId ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> Rolling back…
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-3 w-3" /> Simulate Rollback
                            </>
                          )}
                        </button>
                      ) : action.command ? (
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
      {state.status === "ready" && state.report.warnings && state.report.warnings.length > 0 && (
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
  { id: "trending", label: "Trending", blurb: "Community leaderboard: verified skills.sh weekly installs & GitHub stars" },
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
  const [agentMode, setAgentMode] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 max-w-full overflow-x-clip px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
            LiteSPM Marketplace
          </p>
          <h1 className="mt-1 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-tight">
            Find it once. Install it everywhere.
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Search 55,113 installable MCP servers, skills, and plugins (68,933 indexed) across 52+ agents, then copy the exact{" "}
            <code className="font-mono">litespm install</code> command.{" "}
            <NavLink to="/docs/methodology" className="whitespace-nowrap font-medium text-brand hover:underline">
              How we rank
            </NavLink>
            : installable listings come first, ranked by verification and metadata quality — never pay-to-play.
          </p>
        </div>

        {/* Dual-Audience Mode Switcher */}
        <div className="shrink-0 flex items-center gap-1 rounded-xl border border-border/70 bg-card p-1 text-[11px] font-medium shadow-xs">
          <button
            type="button"
            onClick={() => setAgentMode(false)}
            className={cn(
              "rounded-lg px-2.5 py-1 transition-colors",
              !agentMode ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            👤 Developer GUI
          </button>
          <button
            type="button"
            onClick={() => setAgentMode(true)}
            className={cn(
              "rounded-lg px-2.5 py-1 transition-colors",
              agentMode ? "bg-brand text-brand-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            🤖 AI Agent API
          </button>
        </div>
      </div>

      {/* Machine-Readable Agent Discovery Box when in Agent Mode */}
      {agentMode && (
        <div className="mt-4 rounded-xl border border-brand/35 bg-brand-soft/40 p-4 font-mono text-[12px] text-foreground">
          <div className="flex items-center justify-between gap-2 border-b border-brand/20 pb-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-emerald-400">Agent API / LLM Discovery Endpoint</span>
            </div>
            <button
              type="button"
              onClick={() => setAgentMode(false)}
              className="font-sans text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Close ✕
            </button>
          </div>
          <p className="mt-2 text-[11.5px] font-sans text-muted-foreground">
            Autonomous coding agents (Claude Code, Cursor, Pi, Grok, Codex) can search and install directly through the LiteSPM stdio MCP bridge or via HTTP:
          </p>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-border/60 bg-muted/60 p-2.5 text-[11px]">
            <code className="truncate text-brand">GET /api/litespm/list?q={query.q || ""}&pageSize=24</code>
            <CopyButton value={`curl -s "https://lite-spm-nine.vercel.app/api/litespm/list?pageSize=24"`} label="Copy cURL" />
          </div>
          <p className="mt-2 text-[10.5px] font-sans text-muted-foreground">
            In-agent MCP Bridge tool: <code className="text-foreground">search_catalog(query: string)</code> and <code className="text-foreground">request_install(id: string)</code>.
          </p>
        </div>
      )}

      {/* Quick Trending / Curated Pills */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-[11px] font-medium text-muted-foreground mr-1">Trending:</span>
        {[
          { label: "⚡ Playwright", q: "playwright" },
          { label: "📄 PDF & Documents", q: "pdf" },
          { label: "🛡️ Skill Vetter", q: "vetter" },
          { label: "🌐 Browserbase", q: "browserbase" },
          { label: "🧠 Context7", q: "context7" },
          { label: "🗄️ PostgreSQL", q: "postgres" },
          { label: "🤖 Agentic Skills", q: "agent" },
        ].map((item) => (
          <NavLink
            key={item.q}
            to={exploreHash({ q: item.q, kind: kindForTab(tab) }, tab)}
            className="rounded-full border border-border/70 bg-card px-2.5 py-0.5 text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <nav
        role="tablist"
        aria-label="Marketplace sections"
        className="mt-6 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3"
      >
        {TAB_META.map((t) => {
          const active = tab === t.id;
          return (
            <NavLink
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`tabpanel-${t.id}`}
              to={
                t.id === "installed"
                  ? "/marketplace?tab=installed"
                  : t.id === "trending"
                  ? "/marketplace?tab=trending"
                  : exploreHash({ q: query.q, kind: kindForTab(t.id) }, t.id)
              }
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

      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="mt-5"
      >
        {tab === "installed" ? (
          <InstalledTab />
        ) : tab === "trending" ? (
          <TrendingLeaderboard />
        ) : (
          <CatalogBrowser query={query} tab={tab} />
        )}
      </div>
    </div>
  );
}