"use client";

import * as React from "react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Cable,
  ExternalLink,
  GitBranch,
  GitCompareArrows,
  Layers,
  Package as PackageIcon,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { recordView, useWatchlist } from "@/lib/litespm/hooks";
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
  const { isWatched, toggle } = useWatchlist();

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
    : (data.installTargets[0]?.id ?? "");
  const [host, setHost] = React.useState<string>(defaultHost);
  React.useEffect(() => setHost(defaultHost), [defaultHost]);
  const watched = isWatched(data.linkKey);
  const inCompare = compareKeys.includes(data.linkKey);

  const installCommand = data.installable
    ? `litespm install ${data.id}${host ? ` --agent ${host}` : ""}`
    : null;

  const targetKindLabel =
    data.kind === "skill" ? "skill targets" : data.kind === "plugin" ? "declared hosts" : "agent hosts";

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
            <RankBadge score={data.rankScore} />
            {data.version && (
              <span className="font-mono text-[11px] text-muted-foreground">v{data.version}</span>
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
            {data.publisher.provenance && (
              <span className="text-muted-foreground/60">· {data.publisher.provenance}</span>
            )}
            {data.distributor && (
              <span className="text-muted-foreground/60">
                · distributed by {data.distributor.name}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Install panel */}
      <div className="mt-7 rounded-2xl border border-border/70 bg-card p-5">
        {data.installable ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Terminal className="h-4 w-4 text-brand" /> Install
              </h2>
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
            <div className="mt-3.5">
              <InstallBar command={installCommand!} />
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
              Writes <span className="font-mono text-[11px]">{host}</span>&apos;s own config —
              previewed, backed up, and recorded in the ledger. Pick from all{" "}
              {data.installTargets.length} {targetKindLabel}, or use{" "}
              <span className="font-mono text-[11px]">--all-detected</span> for every host LiteSPM
              finds.
            </p>
            {data.installHint && (
              <p className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                Publisher hint: {data.installHint}
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Terminal className="h-4 w-4 text-muted-foreground" /> Install unavailable
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {data.availability.plain} You can still use it as a discovery entry — the publisher
              link below is where setup details would come from.
            </p>
          </>
        )}
      </div>

      {/* Facts grid */}
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-7">
          {/* Launch details */}
          {(data.transport || data.runtime || data.url || data.command || data.tools.length > 0 || data.effects.length > 0) && (
            <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="tech-title">
              <h2 id="tech-title" className="text-[15px] font-semibold">
                Technical details
              </h2>
              <dl className="mt-3">
                {data.transport && (
                  <FactRow label="Transport">
                    <span className="font-mono text-[12px]">{data.transport}</span>
                  </FactRow>
                )}
                {data.runtime && (
                  <FactRow label="Runtime">
                    <span className="font-mono text-[12px]">{data.runtime}</span>
                  </FactRow>
                )}
                {data.url && (
                  <FactRow label="Endpoint">
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11.5px] text-brand hover:underline"
                    >
                      {data.url.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </FactRow>
                )}
                {data.command && (
                  <FactRow label="Command">
                    <code className="font-mono text-[11.5px]">
                      {data.command} {(data.args ?? []).join(" ")}
                    </code>
                  </FactRow>
                )}
                {data.skillSource && (
                  <FactRow label="Skill source">
                    <span className="font-mono text-[11.5px]">{data.skillSource}</span>
                  </FactRow>
                )}
              </dl>

              {data.tools.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Tools ({data.tools.length})
                  </p>
                  <ul className="mt-2 space-y-2">
                    {data.tools.slice(0, 12).map((tool) => (
                      <li key={tool.name} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                        <p className="font-mono text-[12px] font-semibold text-brand">{tool.name}</p>
                        {tool.description && (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">{tool.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.effects.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Declared effects
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {data.effects.map((effect, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                        <span>
                          {effect.effect}{" "}
                          <span className="text-muted-foreground/60">(declared by {effect.declaredBy})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

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
                Matched on shared vocabulary, kind, goal and category — duplicates of this tool
                are excluded and cross-linked above instead.
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
                    {rel.why.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rel.why.slice(0, 3).map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full bg-muted/50 px-1.5 py-px text-[10px] text-muted-foreground"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    )}
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
              Record
            </h2>
            <dl className="mt-2">
              <FactRow label="Kind">{kindLabel(data.kind)}</FactRow>
              <FactRow label="Goal">{data.goalLabel}</FactRow>
              {data.category && <FactRow label="Category">{data.category}</FactRow>}
              <FactRow label="Installability">{installabilityLabel(data.installability)}</FactRow>
              <FactRow label="LiteSPM score">
                <span className="inline-flex items-center gap-1.5">
                  <RankBadge score={data.rankScore} size="sm" />
                  <span className="text-muted-foreground/70">/ 100</span>
                </span>
              </FactRow>
              {data.source && (
                <FactRow label="Source">
                  <span className="font-mono text-[11px]">{data.source}</span>
                </FactRow>
              )}
              {data.version && <FactRow label="Version">v{data.version}</FactRow>}
            </dl>
          </section>

          {/* Artifact */}
          {data.artifact && (
            <section className="rounded-2xl border border-border/70 bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" /> Source artifact
              </h2>
              <dl className="mt-2">
                {data.artifact.repo && (
                  <FactRow label="Repository">
                    <a
                      href={data.artifact.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[180px] items-center gap-1 truncate font-mono text-[11px] text-brand hover:underline"
                    >
                      {data.artifact.repo.replace(/^https:\/\/github\.com\//, "")}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </FactRow>
                )}
                {data.artifact.ref && (
                  <FactRow label="Ref">
                    <span className="font-mono text-[11px]">{data.artifact.ref}</span>
                  </FactRow>
                )}
                {data.artifact.pinned !== undefined && (
                  <FactRow label="Pinned">
                    {data.artifact.pinned ? (
                      <span className="text-brand">yes — immutable commit</span>
                    ) : (
                      <span className="text-muted-foreground">no</span>
                    )}
                  </FactRow>
                )}
                {data.artifact.path && (
                  <FactRow label="Path">
                    <span className="font-mono text-[11px]">{data.artifact.path}</span>
                  </FactRow>
                )}
                {data.artifact.sha && (
                  <FactRow label="Commit">
                    <code className="font-mono text-[10.5px]">{data.artifact.sha.slice(0, 12)}…</code>
                  </FactRow>
                )}
              </dl>
              {data.artifact.pinned && data.artifact.repo && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  The plugin installs from this pinned commit, verified before its manifest is read.
                </p>
              )}
            </section>
          )}

          {/* Hosts */}
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Cable className="h-3.5 w-3.5" /> Works with
            </h2>
            {data.hosts.length > 0 ? (
              <>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {data.kind === "plugin"
                    ? "Publisher-declared hosts:"
                    : `All ${data.hosts.length} host${data.hosts.length === 1 ? "" : "s"} this entry can be configured for:`}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {data.hosts.slice(0, 18).map((host) => (
                    <button
                      key={host.value}
                      type="button"
                      onClick={() =>
                        navigate(
                          host.hostId
                            ? `#/agent/${host.hostId}`
                            : exploreHash({ host: host.name, kind: data.kind }),
                        )
                      }
                      className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
                      title={host.adapter ? "LiteSPM writes this host's config" : host.name}
                    >
                      {host.name}
                    </button>
                  ))}
                  {data.hosts.length > 18 && (
                    <span className="rounded-full border border-dashed border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                      +{data.hosts.length - 18} more
                    </span>
                  )}
                </div>
                {data.kind === "mcp" && data.installable && (
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
                    {data.transport && data.transport !== "stdio"
                      ? "URL entry: only hosts whose vendor documents the exact remote entry object for this transport."
                      : "Local entry: every bridge adapter can launch it."}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                No hosts — this listing is discovery-only, so there is nothing to configure.
              </p>
            )}
          </section>

          {/* Provenance note */}
          <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            Every field above comes from the listing&apos;s own record. The goal grouping is
            LiteSPM&apos;s editorial mapping; the category is the source&apos;s own label.
          </p>
        </aside>
      </div>
    </div>
  );
}

function cnButton(active: boolean): string {
  return `inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors ${
    active
      ? "border-brand/50 bg-brand-soft text-brand"
      : "border-border/70 bg-card text-muted-foreground hover:border-brand/40 hover:text-brand"
  }`;
}
