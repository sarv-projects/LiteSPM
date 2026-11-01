"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, CheckCircle2, Database, GitBranch, Layers, Loader2, PackageSearch, Users } from "lucide-react";

import { useApp } from "@/lib/litespm/router";
import { formatFull, formatDate } from "@/lib/litespm/format";
import type { InsightsResponse } from "@/lib/litespm/types";
import { FactRow, InsightBarRow, SectionHeading, Stat } from "../primitives";

export function InsightsView() {
  const navigate = useApp((s) => s.navigate);
  const [data, setData] = React.useState<InsightsResponse | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/litespm/insights")
      .then((r) => r.json())
      .then((response: InsightsResponse) => setData(response))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <p className="text-[15px] font-medium">Insights are unavailable right now.</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The catalog did not finish loading in this process. Refresh in a moment.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-32 sm:px-6">
        <div className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          Measuring the catalog — this takes a moment the first time…
        </div>
      </div>
    );
  }

  const t = data.totals;
  const installShare = t.unique === 0 ? 0 : t.installable / t.unique;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="max-w-[64ch]">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
          Insights
        </p>
        <h1 className="mt-2 text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          The catalog, measured.
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          Every number below is computed over the same unique rows the search engine serves, with
          the same gates. Nothing is estimated or sampled — the release manifest pins exactly which
          dataset these figures answer to.
        </p>
      </div>

      {/* Release card */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 rounded-2xl border border-border/70 bg-card p-5"
        aria-labelledby="release-title"
      >
        <h2 id="release-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <GitBranch className="h-4 w-4 text-brand" /> Release manifest
        </h2>
        <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
          <dl>
            <FactRow label="Release id">
              <code className="font-mono text-[11.5px]">{data.release.releaseId}</code>
            </FactRow>
            <FactRow label="Sequence">{data.release.sequence}</FactRow>
            <FactRow label="Created">{formatDate(data.release.createdAt)}</FactRow>
          </dl>
          <dl>
            <FactRow label="Raw rows">{formatFull(data.release.itemCount)}</FactRow>
            <FactRow label="Manifest digest">
              <code className="font-mono text-[10.5px]">
                {data.release.manifestDigest.slice(0, 24)}…
              </code>
            </FactRow>
            <FactRow label="Dataset digest">
              <code className="font-mono text-[10.5px]">
                {data.release.datasetDigest.slice(0, 24)}…
              </code>
            </FactRow>
          </dl>
        </div>
      </motion.section>

      {/* Totals */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={formatFull(t.unique)} label="Unique listings" hint="After cross-source dedupe" />
        <Stat value={formatFull(t.installable)} label="Installable" hint={`${(installShare * 100).toFixed(1)}% of the catalog`} />
        <Stat value={formatFull(t.publishers)} label="Publishers" />
        <Stat value={formatFull(t.duplicatesRemoved)} label="Duplicates merged" hint={`${formatFull(t.raw)} raw rows in`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* By kind */}
        <ChartCard
          icon={Layers}
          title="By kind"
          note="The darker bar is the whole kind; the lighter overlay is the installable share of it."
        >
          {data.byKind.map((bar) => (
            <InsightBarRow
              key={bar.id}
              label={bar.label}
              value={bar.value}
              max={Math.max(...data.byKind.map((b) => b.value))}
              sub={bar.sub}
              subLabel={bar.subLabel}
              href={bar.href}
              onNavigate={navigate}
            />
          ))}
        </ChartCard>

        {/* Installability */}
        <ChartCard
          icon={CheckCircle2}
          title="By installability"
          note="The provenance the publisher established — the gate litespm install asks first."
        >
          {data.byInstallability.map((bar) => (
            <InsightBarRow
              key={bar.label}
              label={installabilityLabelPretty(bar.label)}
              value={bar.value}
              max={Math.max(...data.byInstallability.map((b) => b.value))}
            />
          ))}
        </ChartCard>

        {/* By goal */}
        <ChartCard
          icon={PackageSearch}
          title="By goal — LiteSPM's editorial taxonomy"
          note="Task-shaped groups mapped from each row's own text. 'Other' is the honest remainder, never hidden."
          className="lg:col-span-2"
        >
          <div className="grid gap-x-8 md:grid-cols-2">
            {data.byGoal.map((bar) => (
              <InsightBarRow
                key={bar.id}
                label={bar.label}
                value={bar.value}
                max={Math.max(...data.byGoal.map((b) => b.value))}
                href={bar.href}
                onNavigate={navigate}
              />
            ))}
          </div>
          <p className="mt-3 border-t border-border/50 pt-3 text-[12px] leading-relaxed text-muted-foreground">
            Coverage: <strong className="text-foreground">{(data.taxonomyCoverage.coverage * 100).toFixed(1)}%</strong>{" "}
            of the catalog lands in one of the eleven goals; the largest single goal is{" "}
            <strong className="text-foreground">
              {data.taxonomyCoverage.largest.label} ({(data.taxonomyCoverage.largest.share * 100).toFixed(1)}%)
            </strong>
            . The sources&apos; own labels would put 65.4% in one bucket — &ldquo;Developer
            Tools&rdquo;.
          </p>
        </ChartCard>

        {/* Top categories */}
        <ChartCard icon={BarChart3} title="Top source categories" note="The upstream labels, as published.">
          {data.topCategories.map((bar) => (
            <InsightBarRow
              key={bar.label}
              label={bar.label}
              value={bar.value}
              max={Math.max(...data.topCategories.map((b) => b.value))}
              href={`#/explore?category=${encodeURIComponent(bar.label)}`}
              onNavigate={navigate}
            />
          ))}
        </ChartCard>

        {/* Top publishers */}
        <ChartCard icon={Users} title="Top publishers" note="By published rows after dedupe.">
          {data.topPublishers.map((bar) => (
            <InsightBarRow
              key={bar.label}
              label={bar.label}
              value={bar.value}
              max={Math.max(...data.topPublishers.map((b) => b.value))}
              href={`#/explore?publisher=${encodeURIComponent(bar.label)}`}
              onNavigate={navigate}
            />
          ))}
        </ChartCard>

        {/* Transports */}
        <ChartCard icon={Activity} title="MCP transports" note="How installable servers are reached.">
          {data.byTransport.map((bar) => (
            <InsightBarRow
              key={bar.label}
              label={bar.label}
              value={bar.value}
              max={Math.max(...data.byTransport.map((b) => b.value))}
            />
          ))}
        </ChartCard>

        {/* Sources */}
        <ChartCard icon={Database} title="Catalog sources" note="Where listings were aggregated from.">
          {data.bySource.map((bar) => (
            <InsightBarRow
              key={bar.label}
              label={bar.label}
              value={bar.value}
              max={Math.max(...data.bySource.map((b) => b.value))}
            />
          ))}
        </ChartCard>
      </div>

      {/* Host leaderboard */}
      <section className="mt-10" aria-labelledby="hosts-title">
        <SectionHeading
          eyebrow="Hosts"
          title={<span id="hosts-title">The host leaderboard</span>}
          description="Compatible rows per agent host — installable rows only, counted once per host however the catalog spells it. Remote support and the config file each adapter writes are from the generated registry."
        />
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border/70 bg-card">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Host</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">MCP</th>
                <th className="px-4 py-3 text-right font-semibold">Skills</th>
                <th className="px-4 py-3 text-right font-semibold">Plugins</th>
                <th className="px-4 py-3 font-semibold">Remote</th>
                <th className="px-4 py-3 font-semibold">Config file</th>
              </tr>
            </thead>
            <tbody>
              {data.hostLeaderboard.slice(0, 20).map((host, i) => (
                <tr
                  key={host.id}
                  className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40"
                  onClick={() => navigate(`#/agent/${host.id}`)}
                >
                  <td className="px-4 py-2.5 font-mono text-muted-foreground/60">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{host.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatFull(host.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {formatFull(host.mcp)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {formatFull(host.skill)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {formatFull(host.plugin)}
                  </td>
                  <td className="px-4 py-2.5">
                    {host.remote ? (
                      <span className="rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                        URL entries
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/70">stdio only</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="font-mono text-[10.5px] text-muted-foreground">
                      {host.configPath || "—"}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          Showing the top 20 of {data.hostLeaderboard.length} hosts with compiled-in adapters.{" "}
          <button
            type="button"
            onClick={() => navigate("#/agents")}
            className="font-medium text-brand hover:underline"
          >
            Browse all agent profiles →
          </button>
        </p>
      </section>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  note,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-border/70 bg-card p-5 ${className ?? ""}`}
    >
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Icon className="h-4 w-4 text-brand" /> {title}
      </h2>
      {note && <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{note}</p>}
      <div className="mt-4 space-y-1">{children}</div>
    </motion.section>
  );
}

function installabilityLabelPretty(value: string): string {
  switch (value) {
    case "metadata_verified":
      return "Metadata verified";
    case "runtime_verified":
      return "Runtime verified";
    case "litespm_tested":
      return "LiteSPM tested";
    default:
      return "Discovery only";
  }
}
