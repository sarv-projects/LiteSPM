"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Terminal, Zap } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shellArg } from "@/lib/litespm/shell";
import type { PackageDetailData } from "@/lib/litespm/types";
import { CopyButton } from "../code-block";
import { InstallBar } from "../install-bar";
import { TargetAgentPicker } from "../target-agent-picker";

function repoSlug(url: string): string {
  return url
    .replace(/^https:\/\/(www\.)?github\.com\//, "")
    .replace(/^https:\/\/(www\.)?gitlab\.com\//, "gitlab/")
    .replace(/\.git$/, "");
}

/** Directory inside the repository that holds the skill, when the data names one. */
function skillDir(data: PackageDetailData): string {
  const fromArtifact = data.artifact?.path?.replace(/^\/+|\/+$/g, "");
  if (fromArtifact) return fromArtifact;
  const m = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:tree|blob)\/[^/]+\/(.+?)\/?$/.exec(data.skillSource ?? "");
  return m ? decodeURIComponent(m[1]) : "";
}

export function InstallSection({
  data,
  host,
  setHost,
  installCommand,
  cursorInstallUri,
  targetKindLabel,
  selectedHostId,
  setSelectedHostId,
}: {
  data: PackageDetailData;
  host: string;
  setHost: (id: string) => void;
  installCommand: string | null;
  cursorInstallUri: string | null;
  targetKindLabel: string;
  selectedHostId: string | null;
  setSelectedHostId: (id: string) => void;
}) {
  if (!data.installable) {
    // Discovery-only: no tabs, no commands that would not work.
    return (
      <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="install-title">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 id="install-title" className="text-[15px] font-semibold text-foreground">
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
              <p className="font-semibold text-foreground">This plugin cannot be installed yet</p>
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
      </section>
    );
  }

  const hostName = data.installTargets.find((t) => t.id === host)?.name ?? host;
  const hostConfigs = data.mcpSpec?.hostConfigs ?? [];
  const isRemote = data.kind === "mcp" && data.availability.id === "remote";
  const localConfigs = data.kind === "mcp" && !isRemote ? hostConfigs : [];

  const repo = data.repoUrl ?? data.artifact?.repo ?? null;
  const dir = data.kind === "skill" ? skillDir(data) : "";
  const hasManual =
    (data.kind === "mcp" && (localConfigs.length > 0 || (isRemote && Boolean(data.url)))) ||
    (data.kind === "skill" && Boolean(repo || data.skillSource));

  const promptText = `Use LiteSPM to install ${data.id} for ${hostName}.`;

  const activeConfig =
    localConfigs.find((h) => h.id === selectedHostId) ??
    localConfigs.find((h) => h.id === host) ??
    localConfigs[0];

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="install-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="install-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <Terminal className="h-4 w-4 text-brand" /> Install
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {cursorInstallUri && (
            <a
              href={cursorInstallUri}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-soft px-3 text-[12px] font-semibold text-brand shadow-xs transition-colors hover:bg-brand/20"
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

      <Tabs defaultValue="cli" className="mt-3.5 gap-3">
        <TabsList className="h-9 bg-muted/40">
          <TabsTrigger value="cli" className="px-3.5 text-[12px]">CLI</TabsTrigger>
          {hasManual && <TabsTrigger value="manual" className="px-3.5 text-[12px]">Manual</TabsTrigger>}
          <TabsTrigger value="prompt" className="px-3.5 text-[12px]">Prompt</TabsTrigger>
        </TabsList>

        <TabsContent value="cli">
          <InstallBar command={installCommand!} />
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
            Writes <span className="font-mono text-[11px]">{host}</span>&apos;s own config —
            previewed, backed up, and recorded in the ledger. Works with {data.installTargets.length}{" "}
            {targetKindLabel}
            {isRemote ? ` (remote entries are accepted by ${data.installTargets.length} hosts)` : ""}.
          </p>
          {data.kind === "mcp" && data.availability.id === "local" && data.command && (
            <p className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
              Local launch: {[data.command, ...(data.args ?? [])].join(" ")}
            </p>
          )}
          {data.installHint && data.installHint.trim() !== installCommand?.trim() && (
            <p className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
              <span className="font-sans text-muted-foreground/80">Or straight from the source repository: </span>
              {data.installHint}
            </p>
          )}
        </TabsContent>

        {hasManual && (
          <TabsContent value="manual">
            {localConfigs.length > 0 && activeConfig && (
              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Add this entry to the host&apos;s own config file yourself — shown in that
                    host&apos;s shape.
                  </p>
                  <div className="relative shrink-0">
                    <select
                      id="host-config-selector"
                      aria-label="Target agent host configuration"
                      value={activeConfig.id}
                      onChange={(e) => setSelectedHostId(e.target.value)}
                      className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-border/80 bg-card px-3 pr-8 text-[12px] font-medium text-foreground outline-none transition-colors hover:border-brand/50 focus:border-brand sm:w-[240px]"
                    >
                      {localConfigs.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.format.toUpperCase()})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-b-0 border-border/80 bg-muted/50 px-3.5 py-2 text-[12px]">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <code className="max-w-full truncate rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {activeConfig.configPath}
                      </code>
                      <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-brand">
                        {activeConfig.format}
                      </span>
                    </div>
                    <CopyButton value={activeConfig.snippet} label="Copy snippet" />
                  </div>
                  <pre className="overflow-x-auto rounded-b-xl border border-border/80 bg-muted/30 p-4 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                    {activeConfig.snippet}
                  </pre>
                </div>
              </div>
            )}

            {isRemote && data.url && (
              <div className="space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                <p>
                  This is a remote server. Each host spells a remote entry differently, so the
                  LiteSPM host adapter generates the exact entry when you install; this page does
                  not guess it. To add it by hand, use your host&apos;s MCP documentation with:
                </p>
                <dl className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-[12px]">
                  <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="min-w-0 truncate font-mono text-[11.5px] text-foreground">{data.url}</code>
                      <CopyButton value={data.url} label="Copy URL" />
                    </dd>
                  </div>
                  {data.transport && (
                    <div className="flex items-center justify-between gap-2 py-1">
                      <dt className="text-muted-foreground">Transport</dt>
                      <dd className="font-mono text-[11.5px] text-foreground">{data.transport}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {data.kind === "skill" && (
              <ol className="space-y-3 text-[12.5px] leading-relaxed text-muted-foreground">
                <li className="flex gap-2.5">
                  <StepNumber n={1} />
                  <div className="min-w-0">
                    Get the skill from its source
                    {repo ? (
                      <>
                        {" "}
                        (
                        <a
                          href={data.skillSource ?? repo}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          {repoSlug(repo)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        ):
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <code className="min-w-0 truncate rounded bg-muted/60 px-2 py-1 font-mono text-[11.5px] text-foreground">
                            git clone {repo.replace(/\.git$/, "")}.git
                          </code>
                          <CopyButton value={`git clone ${repo.replace(/\.git$/, "")}.git`} />
                        </div>
                      </>
                    ) : data.skillSource ? (
                      <>
                        :{" "}
                        <a
                          href={data.skillSource}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          open the source <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    ) : null}
                  </div>
                </li>
                <li className="flex gap-2.5">
                  <StepNumber n={2} />
                  <span>
                    Copy the{" "}
                    {dir ? (
                      <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">{dir}</code>
                    ) : (
                      "repository"
                    )}{" "}
                    folder — the one that contains <code className="font-mono text-[11.5px] text-foreground">SKILL.md</code> —
                    into <span className="text-foreground">{hostName}</span>&apos;s skills directory. See{" "}
                    {hostName}&apos;s documentation for where that is; this page does not guess the path.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <StepNumber n={3} />
                  <span>
                    Restart the agent. The CLI tab does all of this for you and records it in the skills ledger so
                    <span className="font-mono text-[11.5px]"> litespm skills remove</span> can undo it.
                  </span>
                </li>
              </ol>
            )}
          </TabsContent>
        )}

        <TabsContent value="prompt">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3">
            <p className="min-w-0 font-mono text-[12.5px] leading-relaxed text-foreground/90">{promptText}</p>
            <CopyButton value={promptText} label="Copy prompt" className="shrink-0" />
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
            Paste this into an agent that has the LiteSPM bridge connected (run{" "}
            <span className="font-mono text-[11px]">litespm</span> once to set that up). The agent prepares an
            install plan; nothing is written until you approve it.
          </p>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
      {n}
    </span>
  );
}

/** "Check that it works" for installable MCP rows. Generic, and true of every host. */
export function CheckItWorks({ data, host }: { data: PackageDetailData; host: string }) {
  if (data.kind !== "mcp" || !data.installable) return null;
  const hostName = data.installTargets.find((t) => t.id === host)?.name ?? host;
  const listCmd = `litespm list --agent ${shellArg(host)}`;
  const askPrompt = `List the tools provided by the ${data.name} MCP server.`;
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="check-title">
      <h2 id="check-title" className="text-[15px] font-semibold">Check that it works</h2>
      <ol className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-muted-foreground">
        <li className="flex gap-2.5">
          <StepNumber n={1} />
          <span>
            Restart <span className="text-foreground">{hostName}</span> so it reloads its MCP configuration.
          </span>
        </li>
        <li className="flex gap-2.5">
          <StepNumber n={2} />
          <div className="min-w-0">
            See the entry LiteSPM wrote:
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="min-w-0 truncate rounded bg-muted/60 px-2 py-1 font-mono text-[11.5px] text-foreground">
                {listCmd}
              </code>
              <CopyButton value={listCmd} />
            </div>
          </div>
        </li>
        <li className="flex gap-2.5">
          <StepNumber n={3} />
          <div className="min-w-0">
            Ask the agent to list its tools:
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="min-w-0 rounded bg-muted/60 px-2 py-1 font-mono text-[11.5px] text-foreground">
                {askPrompt}
              </code>
              <CopyButton value={askPrompt} />
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
