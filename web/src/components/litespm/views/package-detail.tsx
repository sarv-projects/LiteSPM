"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Cable,
  CheckCircle2,
  ChevronDown,
  Code2,
  ExternalLink,
  FileCode,
  FolderTree,
  GitBranch,
  GitCommit,
  GitCompareArrows,
  Github,
  Globe,
  HelpCircle,
  Key,
  Layers,
  Lock,
  Package as PackageIcon,
  Play,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { recordView, useWatchlist } from "@/lib/litespm/hooks";
import { shellArg } from "@/lib/litespm/shell";
import {
  displayPackageName,
  installabilityLabel,
  kindLabel,
} from "@/lib/litespm/format";
import type { PackageDetailResponse, PackageDetailData } from "@/lib/litespm/types";
import { CopyButton } from "../code-block";
import { InstallBar } from "../install-bar";
import { AvailabilityBadge, FactRow, KindBadge } from "../primitives";
import { RankBadge, RankExplainer } from "../rank-badge";
import { TargetAgentPicker } from "../target-agent-picker";

export function PackageView({ linkKey }: { linkKey: string }) {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = React.useState<PackageDetailData | null>(null);
  const [state, setState] = React.useState<"loading" | "found" | "missing">("loading");

  React.useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/litespm/package/${encodeURIComponent(linkKey)}`)
      .then((r) => (r.status === 404 ? null : r.json()))
      .then((response: PackageDetailResponse | null) => {
        if (cancelled) return;
        if (response?.found && response.detail) {
          setData(response.detail);
          setState("found");
          document.title = `${displayPackageName(response.detail.name)} — LiteSPM`;
          recordView({
            linkKey: response.detail.linkKey,
            name: response.detail.name,
            kind: response.detail.kind,
          });
          fetch("/api/litespm/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linkKey: response.detail.linkKey,
              kind: response.detail.kind,
              name: response.detail.name,
            }),
          }).catch(() => {});
        } else {
          setState("missing");
        }
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [linkKey]);

  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted/40" />
        <div className="mt-6 h-40 animate-pulse rounded-2xl bg-muted/30" />
        <div className="mt-4 h-64 animate-pulse rounded-2xl bg-muted/20" />
      </div>
    );
  }

  if (state === "missing" || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <PackageIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h1 className="mt-4 text-[22px] font-semibold">Package not found</h1>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          No catalog listing resolves to “{decodeURIComponent(linkKey)}”. It may have been renamed
          or removed in a newer release.
        </p>
        <Button className="mt-6 rounded-xl" onClick={() => navigate(exploreHash({}))}>
          <ArrowLeft className="h-4 w-4" /> Back to Explore
        </Button>
      </div>
    );
  }

  return <PackageDetailBody data={data} />;
}

function PackageDetailBody({ data }: { data: PackageDetailData }) {
  const navigate = useApp((s) => s.navigate);
  const compareKeys = useApp((s) => s.compareKeys);
  const toggleCompare = useApp((s) => s.toggleCompare);
  const { isWatched, toggle } = useWatchlist();

  const defaultHost = data.installTargets.some((t) => t.id === "claude-code")
    ? "claude-code"
    : (data.installTargets[0]?.id ?? "claude-code");
  const [host, setHost] = React.useState<string>(defaultHost);
  const [selectedHostId, setSelectedHostId] = React.useState<string>("claude-code");
  React.useEffect(() => setHost(defaultHost), [defaultHost]);

  const watched = isWatched(data.linkKey);
  const inCompare = compareKeys.includes(data.linkKey);

  const installCommand = data.installable
    ? `litespm install ${shellArg(data.id)}${host ? ` --agent ${shellArg(host)}` : ""}`
    : null;

  const cursorInstallUri = React.useMemo(() => {
    if (!data.installable || data.kind !== "mcp") return null;
    if (data.url) {
      return `cursor://anysphere.cursor-mcp/install?name=${encodeURIComponent(data.slug)}&url=${encodeURIComponent(data.url)}`;
    }
    // Only a publisher-declared launch line is offered. The old fallback
    // invented `npx -y <slug>` for rows that never published a command.
    if (!data.command) return null;
    const args = data.args ?? [];
    return `cursor://anysphere.cursor-mcp/install?name=${encodeURIComponent(data.slug)}&command=${encodeURIComponent(data.command)}&args=${encodeURIComponent(JSON.stringify(args))}`;
  }, [data]);

  const targetKindLabel =
    data.kind === "skill" ? "skill targets" : "agent hosts";

  // Version or fallback ref
  const versionDisplay =
    data.version
      ? `v${data.version}`
      : data.skillSpec?.versionFallback ||
        (data.artifact?.sha ? `@${data.artifact.sha.slice(0, 7)}` : null);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={() => navigate(exploreHash({}))}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Explore
      </button>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={data.kind} />
            <AvailabilityBadge
              installable={data.installable}
              label={data.availability.label}
              title={data.availability.plain}
            />
            <RankBadge score={data.rankScore} breakdown={data.rankBreakdown} />

            {versionDisplay && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                title="Package release version / revision"
              >
                <GitCommit className="h-3 w-3 text-muted-foreground/60" />
                {versionDisplay}
              </span>
            )}

            {data.pluginSpec && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  data.pluginSpec.pinningStatus === "version"
                    ? "border-brand/40 bg-brand-soft text-brand"
                    : data.pluginSpec.pinningStatus === "commit"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                    : "border-border/80 bg-muted/50 text-muted-foreground"
                }`}
              >
                <Lock className="h-3 w-3" />
                {data.pluginSpec.pinningBadge}
              </span>
            )}
          </div>

          <h1 className="mt-2.5 text-[clamp(1.6rem,3.4vw,2.3rem)] font-semibold leading-tight tracking-[-0.03em]">
            {displayPackageName(data.name)}
          </h1>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {data.publisher.verified && <ShieldCheck className="h-3.5 w-3.5 text-brand" />}
              {data.publisher.url ? (
                <a
                  href={data.publisher.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground/90 hover:text-brand"
                >
                  {data.publisher.name}
                </a>
              ) : (
                <span className="font-medium text-foreground/90">{data.publisher.name}</span>
              )}
            </span>
            {data.repoUrl && (
              <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                ·
                <a
                  href={data.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-mono text-muted-foreground hover:text-brand"
                >
                  <Github className="h-3 w-3" />
                  <span>
                    {data.repoUrl
                      .replace(/^https:\/\/(www\.)?github\.com\//, "")
                      .replace(/^https:\/\/(www\.)?gitlab\.com\//, "gitlab/")
                      .replace(/\.git$/, "")}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </a>
              </span>
            )}
            {data.distributor && (
              <span className="text-muted-foreground/60">
                · distributed by {data.distributor.name}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.repoUrl ? (
            <a
              href={data.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-soft px-3 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand/20"
              title={`View repository on GitHub: ${data.repoUrl}`}
            >
              <Github className="h-4 w-4" />
              <span>GitHub</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          ) : data.url ? (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3 text-[12.5px] font-medium text-foreground/90 transition-colors hover:border-brand/50 hover:text-brand"
              title={`Official endpoint / site: ${data.url}`}
            >
              <Globe className="h-4 w-4 text-brand" />
              <span>Official Site</span>
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => toggleCompare(data.linkKey)}
            aria-pressed={inCompare}
            className={cnButton(inCompare)}
            title={inCompare ? "Remove from compare" : "Add to compare"}
          >
            <GitCompareArrows className="h-4 w-4" />
            <span className="hidden sm:inline">{inCompare ? "Staged" : "Compare"}</span>
          </button>
          <button
            type="button"
            onClick={() => toggle({ linkKey: data.linkKey, name: data.name, kind: data.kind })}
            aria-pressed={watched}
            className={cnButton(watched)}
            title={watched ? "Remove from watchlist" : "Save to watchlist"}
          >
            {watched ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            <span className="hidden sm:inline">{watched ? "Watching" : "Watch"}</span>
          </button>
          <CopyButton
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/#/package/${encodeURIComponent(data.linkKey)}`}
            label="Link"
          />
        </div>
      </div>

      <p className="mt-5 max-w-[76ch] text-[14.5px] leading-relaxed text-muted-foreground">
        {data.summary || "The publisher did not publish a summary for this listing."}
      </p>

      {/* Also available as — the same tool under other kinds or publishers */}
      {data.alsoAvailable.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-brand" /> Also available as
          </span>
          {data.alsoAvailable.map((twin) => (
            <button
              key={twin.linkKey}
              type="button"
              onClick={() => navigate(`#/package/${encodeURIComponent(twin.linkKey)}`)}
              title={`${twin.publisher}${twin.installable ? " — installable" : " — discovery only"}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
            >
              <KindBadge kind={twin.kind} />
              <span className="max-w-[180px] truncate">{twin.publisher}</span>
            </button>
          ))}
        </div>
      )}

      {/* Installation Panel */}
      <div className="mt-7 rounded-2xl border border-border/70 bg-card p-5">
        {data.installable ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Terminal className="h-4 w-4 text-brand" /> Install
              </h2>
              <div className="flex flex-wrap items-center gap-2.5">
                {cursorInstallUri && (
                  <a
                    href={cursorInstallUri}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-soft px-3 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/20 shadow-xs"
                    title="Install directly into Cursor with 1-click URI protocol handler"
                  >
                    <Zap className="h-3.5 w-3.5 fill-current" />
                    <span>Install in Cursor</span>
                  </a>
                )}
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  Target agent
                  <TargetAgentPicker
                    targets={data.installTargets}
                    value={host}
                    onChange={setHost}
                    kindLabel={targetKindLabel}
                  />
                </label>
              </div>
            </div>
            <div className="mt-3.5">
              <InstallBar command={installCommand!} />
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
              Writes <span className="font-mono text-[11px]">{host}</span>&apos;s own config —
              previewed, backed up, and recorded in the ledger. Compatible across all{" "}
              {data.installTargets.length} {targetKindLabel}
              {data.kind === "mcp" && data.availability.id === "remote"
                ? ` (remote entries are accepted by ${data.installTargets.length} hosts)`
                : ""}
            </p>
            {data.kind === "mcp" && data.availability.id === "local" && data.command && (
              <p className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                Local launch: {[data.command, ...(data.args ?? [])].join(" ")}
              </p>
            )}
            {data.installHint && (
              <p className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                Publisher hint: {data.installHint}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-[15px] font-semibold text-foreground">
                {data.kind === "plugin" && data.pluginSpec?.pinningStatus === "unpinned"
                  ? "Installation Paused: Version-Pinned Source Required"
                  : "Installation Not Available"}
              </h2>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {data.availability.plain}
              {data.kind === "plugin" && data.pluginSpec?.pinningStatus === "unpinned"
                ? " LiteSPM refuses an unpinned branch ref or local directory rather than installing content that can change under the approval."
                : ""}
            </p>

            {data.pluginSpec?.remediation?.isBlocked && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-[12px] leading-relaxed">
                <p className="font-semibold text-foreground">
                  {data.pluginSpec.remediation.isBlocked
                    ? "This plugin cannot be installed yet"
                    : "How to install this plugin"}
                </p>
                <p className="mt-1 text-muted-foreground">{data.pluginSpec.remediation.reason}</p>
                {data.pluginSpec.remediation.userCliBypass && (
                  <div className="mt-2">
                    <InstallBar command={data.pluginSpec.remediation.userCliBypass} />
                  </div>
                )}
                <div className="mt-3 text-[11.5px] text-muted-foreground">
                  <strong>For package maintainers:</strong> {data.pluginSpec.remediation.publisherAction}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          TYPE-SPECIFIC SECTION 1: MCP SERVER EXPERIENCE
          ========================================================================= */}
      {data.kind === "mcp" && data.mcpSpec && (
        <div className="mt-8 space-y-6">
          {/* Permissions & Scopes Card */}
          <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="perms-title">
            <div className="flex items-center justify-between">
              <h2 id="perms-title" className="flex items-center gap-2 text-[15px] font-semibold">
                <Shield className="h-4 w-4 text-brand" /> Permissions & Access Scopes
              </h2>
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-brand">
                {data.mcpSpec.authType}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {data.mcpSpec.authDescription}
            </p>
            {data.mcpSpec.hasDeclaredTools && (
              <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                Categories are inferred from the declared tool names. They are a reading aid, not a
                publisher-declared permission or a security audit.
              </p>
            )}

            {data.mcpSpec.hasDeclaredTools ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {/* Read Operations */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Read Operations ({data.mcpSpec.permissions.read.length})
                  </div>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                    {data.mcpSpec.permissions.read.slice(0, 4).map((p) => (
                      <li key={p.name} className="truncate font-mono">
                        • {p.name}
                      </li>
                    ))}
                    {data.mcpSpec.permissions.read.length === 0 && (
                      <li className="italic text-muted-foreground/60">No read tools declared</li>
                    )}
                  </ul>
                </div>

                {/* Write Operations */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Write Operations ({data.mcpSpec.permissions.write.length})
                  </div>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                    {data.mcpSpec.permissions.write.slice(0, 4).map((p) => (
                      <li key={p.name} className="truncate font-mono">
                        • {p.name}
                      </li>
                    ))}
                    {data.mcpSpec.permissions.write.length === 0 && (
                      <li className="italic text-muted-foreground/60">No state-modifying operations</li>
                    )}
                  </ul>
                </div>

                {/* Destructive Operations */}
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Destructive Operations ({data.mcpSpec.permissions.destructive.length})
                  </div>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                    {data.mcpSpec.permissions.destructive.slice(0, 4).map((p) => (
                      <li key={p.name} className="truncate font-mono">
                        • {p.name}
                      </li>
                    ))}
                    {data.mcpSpec.permissions.destructive.length === 0 && (
                      <li className="italic text-muted-foreground/60">Zero destructive actions</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-brand/10 p-2 text-brand">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      Dynamic Runtime Permission Model
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      This MCP server advertises capabilities dynamically during the MCP protocol handshake. Permission scopes and tool executions are inspected and approved by your agent host (e.g. Cursor, Claude Code, Cline) at runtime when individual actions are requested.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Connection & Required Env Vars */}
          {data.mcpSpec.envVars.length > 0 && (
            <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="env-title">
              <h2 id="env-title" className="flex items-center gap-2 text-[15px] font-semibold">
                <Key className="h-4 w-4 text-brand" /> Environment Variables & Secrets
              </h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Set these environment variables before launching your agent host to authenticate this server.
              </p>
              <div className="mt-3 space-y-2">
                {data.mcpSpec.envVars.map((env) => (
                  <div
                    key={env.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-[12.5px] font-semibold text-brand">{env.name}</code>
                        {env.required ? (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-500">
                            Required
                          </span>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Optional
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">{env.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="max-w-[280px] truncate rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {env.example}
                      </code>
                      <CopyButton value={env.example} label="Copy export" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Functions & Tools Catalog */}
          <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="tools-title">
            <h2 id="tools-title" className="flex items-center gap-2 text-[15px] font-semibold">
              <Code2 className="h-4 w-4 text-brand" /> Tools & Capabilities {data.mcpSpec.hasDeclaredTools ? `(${data.mcpSpec.functions.length})` : ""}
            </h2>
            {data.mcpSpec.hasDeclaredTools && data.mcpSpec.functions.length > 0 ? (
              <>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Declared inventory of MCP tools exposed to your agent:
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {data.mcpSpec.functions.map((fn) => (
                    <div
                      key={fn.name}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3.5 transition-colors hover:border-brand/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[12.5px] font-semibold text-foreground">
                          {fn.name}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            fn.category === "read"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : fn.category === "write"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-rose-500/10 text-rose-500"
                          }`}
                        >
                          {fn.category}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                        {fn.description}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-brand/10 p-2 text-brand">
                    <Terminal className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      Runtime Tool Discovery (MCP Protocol)
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      This server exposes its tools dynamically via the Model Context Protocol (<code className="font-mono text-brand">tools/list</code>). Tool schemas, parameter definitions, and descriptions are inspected automatically when your agent connects.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span className="font-mono text-[11px] rounded bg-muted/80 px-2 py-0.5 text-foreground/80">
                        Transport: {data.transport || (data.command ? "stdio" : "unknown")}
                      </span>
                      {data.url && (
                        <span className="font-mono text-[11px] rounded bg-muted/80 px-2 py-0.5 text-foreground/80 truncate max-w-[340px]">
                          Endpoint: {data.url}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Host Configuration Preview */}
          {data.mcpSpec.hostConfigs.length > 0 && (
          <section className="rounded-2xl border border-border/80 bg-card p-5" aria-labelledby="hostconfig-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="hostconfig-title" className="flex items-center gap-2 text-[15px] font-semibold">
                  <Server className="h-4 w-4 text-brand" /> Host Configuration Preview
                </h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Local entries are shown in the host&apos;s own shape. Remote entries are generated by
                  the host adapter at install time; this page does not guess the URL spelling.
                </p>
              </div>

              {/* Dropdown with the hosts this row can target */}
              <div className="relative shrink-0">
                <select
                  id="host-config-selector"
                  aria-label="Target agent host configuration"
                  value={selectedHostId}
                  onChange={(e) => setSelectedHostId(e.target.value)}
                  className="h-9 w-full sm:w-[260px] appearance-none rounded-lg border border-border/80 bg-card px-3 pr-8 text-[12px] font-medium text-foreground outline-none transition-colors hover:border-brand/50 focus:border-brand cursor-pointer"
                >
                  <optgroup label="Popular Hosts">
                    {data.mcpSpec.hostConfigs.slice(0, 6).map((h) => (
                      <option key={`pop-${h.id}`} value={h.id}>
                        {h.name} ({h.format.toUpperCase()})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`Compatible Hosts (${data.mcpSpec.hostConfigs.length})`}>
                    {data.mcpSpec.hostConfigs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} — {h.configPath}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Quick-select pills */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1">
                Quick select:
              </span>
              {data.mcpSpec.hostConfigs.slice(0, 6).map((h) => {
                const isActive = (selectedHostId || data.mcpSpec?.hostConfigs[0]?.id) === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedHostId(h.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                      isActive
                        ? "bg-brand-soft text-brand border border-brand/40"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border/50"
                    }`}
                  >
                    {h.name.replace(/ \(.*\)/, "").replace(/ CLI$/, "")}
                  </button>
                );
              })}
            </div>

            {/* Snippet box */}
            {(() => {
              const active =
                data.mcpSpec.hostConfigs.find((h) => h.id === selectedHostId) ??
                data.mcpSpec.hostConfigs[0];
              if (!active) return null;
              return (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-b-0 border-border/80 bg-muted/50 px-3.5 py-2 text-[12px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground/90">{active.name}</span>
                      <span className="text-muted-foreground">·</span>
                      <code className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {active.configPath}
                      </code>
                      <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-brand">
                        {active.format}
                      </span>
                    </div>
                    <CopyButton value={active.snippet} label="Copy snippet" />
                  </div>

                  <div className="relative rounded-b-xl border border-border/80 bg-muted/30 p-4 font-mono text-[11.5px]">
                    <pre className="overflow-x-auto leading-relaxed text-foreground/90">
                      {active.snippet}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </section>
          )}
        </div>
      )}

      {/* =========================================================================
          TYPE-SPECIFIC SECTION 2: SKILL EXPERIENCE
          ========================================================================= */}
      {data.kind === "skill" && data.skillSpec && (
        <div className="mt-8 space-y-6">
          {/* Interactive SKILL.md Inspector */}
          <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="skill-title">
            <div className="flex items-center justify-between">
              <h2 id="skill-title" className="flex items-center gap-2 text-[15px] font-semibold">
                <FileCode className="h-4 w-4 text-brand" /> Skill Specification & Instructions
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground">
                {data.skillSpec.versionFallback}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Portable agent workflow. Inspect triggers, skip constraints, and instructions:
            </p>

            <Tabs defaultValue="triggers" className="mt-4">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-muted/40">
                <TabsTrigger value="triggers" className="text-[12px]">Trigger Rules</TabsTrigger>
                <TabsTrigger value="skips" className="text-[12px]">Skip Rules</TabsTrigger>
                <TabsTrigger value="instructions" className="text-[12px]">Instructions</TabsTrigger>
                <TabsTrigger value="files" className="text-[12px]">File Structure</TabsTrigger>
              </TabsList>

              {/* Triggers */}
              <TabsContent value="triggers" className="mt-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Zap className="h-4 w-4" /> Activation Conditions (When to read this skill)
                  </p>
                  <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-foreground/90">
                    {data.skillSpec.triggerRules.length === 0 ? (
                      <li className="text-muted-foreground">
                        The publisher did not publish trigger rules for this skill. LiteSPM will not
                        invent activation conditions; read the skill body before relying on it.
                      </li>
                    ) : (
                      data.skillSpec.triggerRules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span>{rule}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </TabsContent>

              {/* Skips */}
              <TabsContent value="skips" className="mt-3">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> Skip Rules (When agent should avoid triggering)
                  </p>
                  <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-foreground/90">
                    {data.skillSpec.skipRules.length === 0 ? (
                      <li className="text-muted-foreground">
                        The publisher did not publish skip rules for this skill. LiteSPM will not
                        invent them.
                      </li>
                    ) : (
                      data.skillSpec.skipRules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          <span>{rule}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </TabsContent>

              {/* Instructions */}
              <TabsContent value="instructions" className="mt-3">
                <div className="relative rounded-xl border border-border/70 bg-muted/30 p-4 font-mono text-[12px] leading-relaxed text-foreground/90">
                  <div className="absolute right-3 top-3">
                    <CopyButton value={data.skillSpec.instructions} label="Copy prompt" />
                  </div>
                  <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap pr-16">
                    {data.skillSpec.instructions ||
                      "The catalog does not publish this skill's instruction body. Install it with `litespm skills add` and read SKILL.md before use."}
                  </pre>
                </div>
              </TabsContent>

              {/* File Structure */}
              <TabsContent value="files" className="mt-3">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <p className="flex items-center gap-2 text-[13px] font-semibold">
                    <FolderTree className="h-4 w-4 text-brand" /> Skill Directory Layout
                  </p>
                  <div className="mt-3 space-y-2">
                    {data.skillSpec.fileTree.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        The catalog does not publish a file inventory for this skill. The installed
                        tree is whatever its source repository contains.
                      </p>
                    ) : (
                      data.skillSpec.fileTree.map((item) => (
                        <div
                          key={item.path}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2 text-[12px]"
                        >
                          <span className="font-mono font-medium text-brand">{item.path}</span>
                          <span className="text-muted-foreground">{item.description}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          {/* Security & Execution Boundary */}
          <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="skillsec-title">
            <h2 id="skillsec-title" className="flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-brand" /> Safety & Execution Boundary
            </h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {data.skillSpec.security.summary}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
                <p className="text-muted-foreground">Executable Scripts</p>
                <p className="mt-1 font-semibold text-foreground">
                  {data.skillSpec.security.scripts === "present"
                    ? "Present in the source (not inspected)"
                    : data.skillSpec.security.scripts === "none"
                      ? "None published"
                      : "Not inspected"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
                <p className="text-muted-foreground">Network Access</p>
                <p className="mt-1 font-semibold text-foreground">
                  {data.skillSpec.security.network === "active"
                    ? "Active (not inspected)"
                    : data.skillSpec.security.network === "passive"
                      ? "Passive (not inspected)"
                      : "Not inspected"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
                <p className="text-muted-foreground">Credential Storage</p>
                <p className="mt-1 font-semibold text-foreground">
                  {data.skillSpec.security.credentials === "required"
                    ? "May require credentials (not inspected)"
                    : data.skillSpec.security.credentials === "none"
                      ? "None published"
                      : "Not inspected"}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* =========================================================================
          TYPE-SPECIFIC SECTION 3: PLUGIN EXPERIENCE
          ========================================================================= */}
      {data.kind === "plugin" && data.pluginSpec && (
        <div className="mt-8 space-y-6">
          {/* Manifest Breakdown */}
          <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="plugman-title">
            <div className="flex items-center justify-between">
              <h2 id="plugman-title" className="flex items-center gap-2 text-[15px] font-semibold">
                <Layers className="h-4 w-4 text-brand" /> Plugin Source &amp; Components
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  data.pluginSpec.pinningStatus !== "unpinned"
                    ? "bg-brand-soft text-brand"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {data.pluginSpec.pinningBadge}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {data.pluginSpec.pinningExplanation}
            </p>

            <div className="mt-4 space-y-3">
              {/* Bundled Skills */}
              {data.pluginSpec.manifest.skills.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Bundled Skills ({data.pluginSpec.manifest.skills.length})
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {data.pluginSpec.manifest.skills.map((s) => (
                      <div key={s.name} className="flex items-center justify-between text-[12.5px]">
                        <span className="font-medium text-foreground">{s.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{s.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bundled MCP Servers */}
              {data.pluginSpec.manifest.mcpServers.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Bundled MCP Servers ({data.pluginSpec.manifest.mcpServers.length})
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {data.pluginSpec.manifest.mcpServers.map((s) => (
                      <div key={s.name} className="flex items-center justify-between text-[12.5px]">
                        <span className="font-mono text-brand">{s.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{s.transport}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Host-specific extras */}
              {data.pluginSpec.manifest.hostExtras.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Host-Specific Extras (Commands & Hooks)
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    These components run only on natively compatible hosts. LiteSPM isolates portable
                    skills and MCP servers so other hosts can still run the portable parts:
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {data.pluginSpec.manifest.hostExtras.map((e) => (
                      <div key={e.name} className="flex items-center justify-between text-[12px]">
                        <span className="font-mono text-foreground">{e.name}</span>
                        <span className="text-muted-foreground/80">{e.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.pluginSpec.manifest.skills.length === 0 &&
                data.pluginSpec.manifest.mcpServers.length === 0 &&
                data.pluginSpec.manifest.hostExtras.length === 0 && (
                  <p className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
                    The catalog publishes this plugin&apos;s artifact locator, not its manifest.
                    LiteSPM reads and verifies the manifest from the pinned tree at install time;
                    this page does not invent bundled servers, skills, or host extras.
                  </p>
                )}
            </div>
          </section>
        </div>
      )}

      {/* Facts grid & Technical details fallback */}
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-7">
          {/* Try prompts */}
          {data.prompts.length > 0 && (
            <section aria-labelledby="try-title">
              <h2 id="try-title" className="text-[15px] font-semibold">
                Try it once installed
              </h2>
              <div className="mt-3 space-y-3">
                {data.prompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                          <Play className="h-3.5 w-3.5 text-brand" /> {prompt.label}
                        </p>
                        <p className="mt-1.5 rounded-lg bg-muted/40 px-3 py-2 font-mono text-[12px] leading-relaxed">
                          {prompt.prompt}
                        </p>
                        <p className="mt-1.5 text-[11px] text-muted-foreground/80">{prompt.basis}</p>
                      </div>
                      <CopyButton value={prompt.prompt} label="Copy" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Related */}
          {data.related.length > 0 && (
            <section aria-labelledby="related-title">
              <h2 id="related-title" className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                Related listings
                <RankExplainer />
              </h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Matched on shared vocabulary, kind, goal and category.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {data.related.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => navigate(`#/package/${encodeURIComponent(rel.linkKey)}`)}
                    className="group rounded-xl border border-border/70 bg-card p-3.5 text-left transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-center gap-2">
                      <KindBadge kind={rel.kind} />
                      <span className="truncate text-[13px] font-semibold">{displayPackageName(rel.name)}</span>
                      <span className="ml-auto shrink-0">
                        <RankBadge score={rel.rankScore} size="sm" />
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                      {rel.summary}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Package Overview
            </h2>
            <dl className="mt-2">
              <FactRow label="Kind">{kindLabel(data.kind)}</FactRow>
              <FactRow label="Category">{data.category || "General"}</FactRow>
              <FactRow label="Goal">{data.goalLabel}</FactRow>
              <FactRow label="Score">
                <span className="font-mono font-semibold text-brand">{data.rankScore}/100</span>
              </FactRow>
              <FactRow label="Installability">{installabilityLabel(data.installability)}</FactRow>
            </dl>
          </section>

          {/* Genuine Upstream Source & Repository */}
          {(data.repoUrl || data.artifact?.repo || data.url || data.publisher.url) && (
            <section className="rounded-2xl border border-border/70 bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5 text-brand" /> Original Source
              </h2>
              <dl className="mt-2">
                {(data.repoUrl || data.artifact?.repo) && (
                  <FactRow label="Repository">
                    <a
                      href={data.repoUrl || data.artifact?.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[190px] items-center gap-1 truncate font-mono text-[11px] font-medium text-brand hover:underline"
                    >
                      <Github className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {(data.repoUrl || data.artifact?.repo || "")
                          .replace(/^https:\/\/(www\.)?github\.com\//, "")
                          .replace(/^https:\/\/(www\.)?gitlab\.com\//, "gitlab/")
                          .replace(/\.git$/, "")}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                    </a>
                  </FactRow>
                )}
                <FactRow label="Source Type">
                  <span className="font-medium text-foreground">
                    {data.sourceType === "github" || (data.repoUrl && data.repoUrl.includes("github.com"))
                      ? "GitHub Repository"
                      : data.sourceType === "gitlab"
                      ? "GitLab Repository"
                      : data.sourceType === "endpoint" || (!data.repoUrl && data.url)
                      ? "Remote MCP Service"
                      : "Official Upstream"}
                  </span>
                </FactRow>
                {data.artifact?.ref && (
                  <FactRow label="Branch / Ref">
                    <span className="font-mono text-[11px]">{data.artifact.ref}</span>
                  </FactRow>
                )}
                {data.artifact?.pinned !== undefined && (
                  <FactRow label="Pinning State">
                    {data.artifact.pinned ? (
                      <span className="font-medium text-brand">Version Pinned (Immutable)</span>
                    ) : (
                      <span className="font-medium text-amber-500">Unpinned Branch Ref</span>
                    )}
                  </FactRow>
                )}
                {data.artifact?.sha && (
                  <FactRow label="Commit">
                    <code className="font-mono text-[10.5px]">{data.artifact.sha.slice(0, 10)}…</code>
                  </FactRow>
                )}
                {data.url && (
                  <FactRow label="Endpoint">
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[190px] items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{data.url.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  </FactRow>
                )}
                {data.publisher.url && !data.publisher.url.includes("github.com") && (
                  <FactRow label="Publisher Site">
                    <a
                      href={data.publisher.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[190px] items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{data.publisher.url.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  </FactRow>
                )}
              </dl>
            </section>
          )}

          {/* Compatible Hosts */}
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Cable className="h-3.5 w-3.5" /> Works with
            </h2>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {data.kind === "plugin"
                ? "Publisher-declared compatibility. LiteSPM installs the plugin's portable MCP servers and skills into each selected host; host-specific extras are skipped unless the install is acknowledged with --allow-partial."
                : data.kind === "skill"
                ? data.availability.installable
                  ? `Configurable across ${data.installTargets.length} agent skill targets.`
                  : "No verified git tree is recorded, so no skill target is claimed."
                : data.availability.id === "remote"
                ? `Remote (URL) entries are accepted by ${data.installTargets.length} hosts; the local-only hosts refuse them.`
                : data.availability.id === "local"
                ? `Local stdio entries are supported across ${data.installTargets.length} agent hosts.`
                : "No verified launch line is recorded, so no host target is claimed."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.installTargets.slice(0, 16).map((target) => (
                <span
                  key={target.id}
                  className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {target.name}
                </span>
              ))}
              {data.installTargets.length > 16 && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  +{data.installTargets.length - 16} more
                </span>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function cnButton(active: boolean): string {
  return `inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-medium transition-colors ${
    active
      ? "border-brand/50 bg-brand-soft text-brand"
      : "border-border/70 bg-background text-muted-foreground hover:border-brand/40 hover:text-foreground"
  }`;
}
