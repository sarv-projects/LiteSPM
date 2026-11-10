"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Cable,
  CheckCircle2,
  ExternalLink,
  FileJson,
  FolderTree,
  Globe,
  Loader2,
  MonitorSmartphone,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { formatFull } from "@/lib/litespm/format";
import type { AgentDetailData } from "@/lib/litespm/types";
import { inAgentFor, inAgentNoneFor, EVIDENCE_LABEL } from "@/lib/litespm/in-agent";
import { BrandMark } from "../brand-mark";
import { CodeBlock } from "../code-block";
import { InstallBar } from "../install-bar";
import { FactRow, KindBadge, Stat } from "../primitives";

export function AgentDetailView({ id }: { id: string }) {
  const navigate = useApp((s) => s.navigate);
  const [detail, setDetail] = React.useState<AgentDetailData | null>(null);
  const [state, setState] = React.useState<"loading" | "found" | "missing">("loading");
  const [platform, setPlatform] = React.useState<"win" | "mac" | "linux">("linux");

  React.useEffect(() => {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) setPlatform("win");
    else if (/Macintosh|Mac OS/i.test(ua)) setPlatform("mac");
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/litespm/agent/${encodeURIComponent(id)}`)
      .then((r) => (r.status === 404 ? null : r.json()))
      .then((data: { found: boolean; detail?: AgentDetailData } | null) => {
        if (cancelled) return;
        if (data?.found && data.detail) {
          setDetail(data.detail);
          setState("found");
        } else {
          setState("missing");
        }
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted/40" />
        <div className="mt-6 h-44 animate-pulse rounded-2xl bg-muted/30" />
        <div className="mt-4 h-56 animate-pulse rounded-2xl bg-muted/20" />
      </div>
    );
  }

  if (state === "missing" || !detail) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <Cable className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h1 className="mt-4 text-[22px] font-semibold">Agent not found</h1>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          No agent profile resolves to “{id}”.
        </p>
        <Button className="mt-6 rounded-xl" onClick={() => navigate("#/agents")}>
          <ArrowLeft className="h-4 w-4" /> Back to agents
        </Button>
      </div>
    );
  }

  const { row, setup } = detail;
  const platformPath = setup.platformPaths?.[platform];
  const platformSnippet = setup.bridgeSnippets?.[platform] ?? (platform === "linux" ? setup.bridgeSnippet : undefined);
  const platformLabel = platform === "win" ? "Windows" : platform === "mac" ? "macOS" : "Linux";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={() => navigate("#/agents")}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Agents
      </button>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <BrandMark id={row.hostId ?? row.slug} name={row.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {setup.hostId ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand/35 bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                  <ShieldCheck className="h-3 w-3" /> Verified host integration
                </span>
              ) : row.skill ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand/35 bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                  <CheckCircle2 className="h-3 w-3" /> Skills supported
                </span>
              ) : null}
            </div>
            <h1 className="mt-1.5 text-[clamp(1.6rem,3.2vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em]">
              {row.name}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {row.profileType ?? "Agent profile"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.website && (
            <a href={row.website} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-9 rounded-lg text-[12.5px]">
                <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          )}
          {setup.docsUrl && (
            <a href={setup.docsUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-9 rounded-lg text-[12.5px]">
                <FileJson className="h-3.5 w-3.5" /> Config docs <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {row.summary && (
        <p className="mt-5 max-w-[76ch] text-[14.5px] leading-relaxed text-muted-foreground">
          {row.summary}
        </p>
      )}

      {/* Stat strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          value={formatFull(row.total)}
          label="Compatible rows"
          hint="Catalog rows LiteSPM can configure for this host"
        />
        <Stat
          value={formatFull(detail.installable)}
          label="Installable"
          hint="Rows litespm install can complete"
        />
        <Stat
          value={formatFull(detail.kinds.mcp)}
          label="MCP servers"
          hint="MCP rows that work with this host"
        />
        <Stat
          value={formatFull(detail.kinds.skill)}
          label="Skills"
          hint="Skill rows this host can receive"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_330px]">
        <div className="space-y-7">
          {/* Capabilities */}
          {row.capabilities && row.capabilities.length > 0 && (
            <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="caps-title">
              <h2 id="caps-title" className="flex items-center gap-2 text-[15px] font-semibold">
                <Wrench className="h-4 w-4 text-brand" /> What it does
              </h2>
              <ul className="mt-3 space-y-2">
                {row.capabilities.map((capability) => (
                  <li key={capability} className="flex items-start gap-2.5 text-[13.5px]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span className="leading-relaxed text-muted-foreground">{capability}</span>
                  </li>
                ))}
              </ul>
              {detail.noteSource && (
                <p className="mt-3 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground/70">
                  Read from{" "}
                  <a
                    href={detail.noteSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                  >
                    {detail.noteSource}
                  </a>
                </p>
              )}
            </section>
          )}

          {/* Setup */}
          {setup.hostId && (
            <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="setup-title">
              <h2 id="setup-title" className="flex items-center gap-2 text-[15px] font-semibold">
                <Terminal className="h-4 w-4 text-brand" /> Connect LiteSPM
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Configure the bridge in {row.name}&apos;s documented config format. LiteSPM previews the
                change, backs up the original file, and verifies the result.
              </p>
              {setup.platformPaths && (
              <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Operating system">
                {([
                  ["win", "Windows"],
                  ["mac", "macOS"],
                  ["linux", "Linux"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={platform === value}
                    onClick={() => setPlatform(value)}
                    className={
                      platform === value
                        ? "rounded-lg border border-brand/40 bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand"
                        : "rounded-lg border border-border/70 bg-background px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              )}
              {!setup.hostId ? (
                <p className="mt-3.5 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  LiteSPM does not currently have an MCP configuration adapter for this host.
                </p>
              ) : platformPath ? (
                <div className="mt-3.5">
                  <InstallBar command={`litespm host setup ${setup.hostId}`} />
                  {setup.projectOnly && (
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                      Workspace scope only. Run the setup command from the project root; install entries with{" "}
                      <code className="font-mono text-[11px]">--scope project --agent {setup.hostId}</code>.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3.5 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  {row.name} does not publish a supported {platformLabel} configuration. LiteSPM will not guess a config path or write to an unsupported location.
                </p>
              )}

              {platformPath && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Default config location. LiteSPM honours documented host-specific environment overrides when present.
                  {platform === "win" && setup.windowsPathHomeDerived
                    ? " This Windows path expands the home-relative location under %USERPROFILE%; it is not a separately published vendor path."
                    : ""}
                </p>
              )}

              {platformSnippet && platformPath && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Or paste the entry yourself
                  </p>
                  <CodeBlock
                    code={platformSnippet}
                    title={platformPath}
                    language={setup.format === "toml" ? "toml" : "json"}
                    maxHeight={260}
                  />
                </div>
              )}

              <InAgentNote hostId={id} />
            </section>
          )}

          {/* Top categories */}
          {detail.topCategories.length > 0 && (
            <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="cats-title">
              <h2 id="cats-title" className="text-[15px] font-semibold">
                What {row.name} users install
              </h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                The source categories of this host&apos;s compatible rows, largest first.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.topCategories.map((category) => (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() =>
                      navigate(exploreHash({ category: category.name, host: row.name }))
                    }
                    className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    {category.name}
                    <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground/60">
                      {formatFull(category.count)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Browse */}
          <section aria-labelledby="browse-title">
            <h2 id="browse-title" className="text-[15px] font-semibold">
              Browse for {row.name}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {row.mcp && (
                <button
                  type="button"
                  onClick={() => navigate(exploreHash({ host: row.mcp!.host, kind: "mcp", installable: "1" }))}
                  className="group rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-brand/40"
                >
                  <div className="flex items-center justify-between">
                    <KindBadge kind="mcp" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-brand" />
                  </div>
                  <p className="mt-2 text-[20px] font-semibold tabular-nums">
                    {formatFull(row.mcp.count)}
                  </p>
                  <p className="text-[12px] text-muted-foreground">installable MCP servers</p>
                </button>
              )}
              {row.skill && (
                <button
                  type="button"
                  onClick={() => navigate(exploreHash({ host: row.skill!.host, kind: "skill" }))}
                  className="group rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-brand/40"
                >
                  <div className="flex items-center justify-between">
                    <KindBadge kind="skill" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-brand" />
                  </div>
                  <p className="mt-2 text-[20px] font-semibold tabular-nums">
                    {formatFull(row.skill.count)}
                  </p>
                  <p className="text-[12px] text-muted-foreground">skills it can receive</p>
                </button>
              )}
              {row.plugin && (
                <button
                  type="button"
                  onClick={() => navigate(exploreHash({ host: row.name, kind: "plugin" }))}
                  className="group rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-brand/40"
                >
                  <div className="flex items-center justify-between">
                    <KindBadge kind="plugin" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-brand" />
                  </div>
                  <p className="mt-2 text-[20px] font-semibold tabular-nums">
                    {formatFull(row.plugin.count)}
                  </p>
                  <p className="text-[12px] text-muted-foreground">publisher-declared plugins</p>
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Registry facts
            </h2>
            {setup.hostId ? (
              <dl className="mt-2">
                <FactRow label="Host id">
                  <code className="font-mono text-[11px]">{setup.hostId}</code>
                </FactRow>
                <FactRow label="Config format">
                  <span className="font-mono text-[11px] uppercase">{setup.format}</span>
                </FactRow>
                {setup.keyPath && (
                  <FactRow label="Key path">
                    <code className="font-mono text-[11px]">{setup.keyPath}</code>
                  </FactRow>
                )}
                {setup.shape && (
                  <FactRow label="Entry shape">
                    <span className="font-mono text-[11px]">{setup.shape}</span>
                  </FactRow>
                )}
                {platformPath && (
                  <FactRow label={setup.projectOnly ? "Project config" : `Config (${platformLabel})`}>
                    <code className="break-all font-mono text-[10.5px]">{platformPath}</code>
                  </FactRow>
                )}
                {!setup.projectOnly && setup.projectPath && (
                  <FactRow label="Project config">
                    <code className="font-mono text-[10.5px]">{setup.projectPath}</code>
                  </FactRow>
                )}
                {setup.projectOnly && (
                  <FactRow label="Scope">
                    <span className="text-muted-foreground">project only</span>
                  </FactRow>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                Manual configuration required — vendor has not published an automated config format for MCP servers.{" "}
                {row.skill ? "Skills install directly into the agent's documented skills directory." : ""}
              </p>
            )}
          </section>

          {/* Remote support */}
          {setup.hostId && (
            <section className="rounded-2xl border border-border/70 bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <MonitorSmartphone className="h-3.5 w-3.5" /> Remote (URL) MCP
              </h2>
              {setup.remote ? (
                <>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    This agent supports remote URL server endpoints directly in its configuration:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(setup.remoteTransports ?? []).map((transport) => (
                      <span
                        key={transport}
                        className="rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 font-mono text-[10.5px] font-medium text-brand"
                      >
                        {transport}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  Local stdio only — this agent does not support remote URL endpoints in its configuration file. LiteSPM protects your config from unsupported formats.
                </p>
              )}
            </section>
          )}

          {/* Skills facts */}
          {row.skill && (
            <section className="rounded-2xl border border-border/70 bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <FolderTree className="h-3.5 w-3.5" /> Skills
              </h2>
              <dl className="mt-2">
                <FactRow label="Target">
                  <span className="font-mono text-[11px]">{row.skill.host}</span>
                </FactRow>
                {setup.skillUniversal && (
                  <FactRow label="Universal">
                    <span className="text-brand">any content</span>
                  </FactRow>
                )}
                <FactRow label="User scope">
                  {setup.skillHasGlobal ? (
                    <span className="text-brand">yes</span>
                  ) : (
                    <span className="text-muted-foreground">project only</span>
                  )}
                </FactRow>
                <FactRow label="Compatible skills">
                  <button
                    type="button"
                    onClick={() => navigate(exploreHash({ host: row.skill!.host, kind: "skill" }))}
                    className="font-mono text-[11px] text-brand hover:underline"
                  >
                    {formatFull(row.skill.count)} →
                  </button>
                </FactRow>
              </dl>
            </section>
          )}

          {/* Aliases */}
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Cable className="h-3.5 w-3.5" /> Also known as
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Every catalog spelling that resolves into this profile:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.strings.map((string) => (
                <span
                  key={string}
                  className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {string}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** What `litespm host setup <id>` installs inside this agent (see lib/litespm/in-agent.ts). */
function InAgentNote({ hostId }: { hostId: string }) {
  const entry = inAgentFor(hostId);
  const none = inAgentNoneFor(hostId);
  return (
    <div className="mt-3.5 rounded-xl border border-border/60 bg-muted/20 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
        Marketplace inside this agent
      </p>
      {entry ? (
        <p className="mt-1.5">
          {entry.kind === "popup" ? "Interactive popup" : "Prompt command"}:{" "}
          <span className="font-mono text-[11.5px] text-foreground">{entry.invoke}</span> ({entry.mechanism}).{" "}
          {entry.kind === "popup"
            ? "It renders in the agent and spends no model turn."
            : "The agent's model drives LiteSPM's tools and shows you the plan."}
          {entry.evidence !== "n/a" && ` ${EVIDENCE_LABEL[entry.evidence]}.`}
          {entry.note ? ` ${entry.note}` : ""} Installed by{" "}
          <span className="font-mono text-[11px]">litespm host setup {hostId}</span> from release 0.6.1; removed
          by <span className="font-mono text-[11px]">litespm host remove {hostId}</span>.
        </p>
      ) : (
        <p className="mt-1.5">
          {none?.note ?? "This agent gets no marketplace command from LiteSPM."} The LiteSPM bridge still works:
          use <span className="font-mono text-[11px]">litespm marketplace</span> in a terminal.
        </p>
      )}
      <p className="mt-1.5">An agent can prepare a plan; only you can approve it.</p>
    </div>
  );
}