"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, Layers, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { displayPackageName } from "@/lib/litespm/format";
import { shellArg } from "@/lib/litespm/shell";
import type { BundleData, BundleDifficulty, BundlesResponse } from "@/lib/litespm/types";
import { KindBadge } from "../primitives";
import { NavLink } from "../nav-link";
import { TargetAgentPicker } from "../target-agent-picker";

const DIFFICULTY_STYLE: Record<BundleDifficulty, string> = {
  Beginner: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Intermediate: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Advanced: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const DIFFICULTIES: BundleDifficulty[] = ["Beginner", "Intermediate", "Advanced"];

/** "" means no `--agent` flag: the CLI then asks which detected agent to use. */
const ANY_AGENT = { id: "", name: "Any agent (CLI asks)" };

export function DifficultyPill({ level }: { level: BundleDifficulty }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
        DIFFICULTY_STYLE[level],
      )}
    >
      {level}
    </span>
  );
}

/** One bundle: difficulty, item chips, a target agent and a copy-all button. */
export function BundleCard({
  bundle,
  agents,
  compact = false,
}: {
  bundle: BundleData;
  agents: Array<{ id: string; name: string }>;
  compact?: boolean;
}) {
  const [agent, setAgent] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const targets = React.useMemo(() => [ANY_AGENT, ...agents], [agents]);
  const installable = bundle.items.filter((item) => item.installable);
  // With an agent chosen, only commands that agent can take are copied; an
  // item the agent cannot receive (for example a remote server on a local-only
  // host) is left out and counted, never emitted as a command that would fail.
  const forAgent = agent ? installable.filter((item) => item.hostIds.includes(agent)) : installable;
  const skipped = installable.length - forAgent.length;
  const commands = forAgent
    .map((item) => `litespm install ${shellArg(item.id)}${agent ? ` --agent ${shellArg(agent)}` : ""}`)
    .join("\n");

  const copy = () => {
    if (!commands) return;
    navigator.clipboard
      ?.writeText(commands)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5"
      aria-labelledby={`bundle-${bundle.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={`bundle-${bundle.id}`} className="text-[16px] font-semibold tracking-tight">
          {bundle.title}
        </h3>
        <DifficultyPill level={bundle.difficulty} />
      </div>
      <p className="mt-1 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        For: {bundle.audience}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{bundle.blurb}</p>

      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`Items in ${bundle.title}`}>
        {bundle.items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={`/package/${encodeURIComponent(item.linkKey)}`}
              title={`${item.name} by ${item.publisher || "unknown publisher"}: ${item.summary}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 py-1 text-[12px] font-medium transition-colors hover:border-brand/50 hover:text-brand"
            >
              <KindBadge kind={item.kind} />
              <span className="truncate">{displayPackageName(item.name)}</span>
              {item.publisher && !compact && (
                <span className="hidden truncate text-[10.5px] font-normal text-muted-foreground sm:inline">
                  {item.publisher}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <TargetAgentPicker targets={targets} value={agent} onChange={setAgent} kindLabel="agents" />
          <button
            type="button"
            onClick={copy}
            disabled={!commands}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12px] font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? "Copied" : "Copy install commands"}
          </button>
          <span className="sr-only" role="status">
            {copied ? "Install commands copied" : ""}
          </span>
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          {forAgent.length} command{forAgent.length === 1 ? "" : "s"}, one per line (
          <code className="font-mono">litespm install</code> takes one id at a time)
          {skipped > 0 ? `. ${skipped} item${skipped === 1 ? "" : "s"} left out: that agent cannot receive ${skipped === 1 ? "it" : "them"}.` : "."}
        </p>
      </div>
    </motion.article>
  );
}

export function useBundles(): { data: BundlesResponse | null; error: boolean } {
  const [data, setData] = React.useState<BundlesResponse | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    fetch("/api/litespm/bundles")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bundles"))))
      .then((response: BundlesResponse) => setData(response))
      .catch(() => setError(true));
  }, []);
  return { data, error };
}

export function BundlesView() {
  const { data, error } = useBundles();
  const [level, setLevel] = React.useState<BundleDifficulty | "all">("all");

  const shown = data?.bundles.filter((b) => level === "all" || b.difficulty === level) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="max-w-[64ch]">
        <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Bundles
        </p>
        <h1 className="mt-2 text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          Start from a working set.
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          Hand-picked MCP servers and skills for a common job. Every item is a catalog listing
          that LiteSPM can install today, mostly from the vendor&apos;s own publisher. A bundle is a
          list, not a new package: copy the commands and each item installs on its own, with the
          usual preview and backup.{" "}
          <NavLink to="/docs/methodology" className="font-medium text-brand hover:underline">
            How we rank and label
          </NavLink>
          .
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by difficulty">
        {(["all", ...DIFFICULTIES] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={level === value}
            onClick={() => setLevel(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              level === value
                ? "border-brand bg-brand-soft text-brand"
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "all" ? "All levels" : value}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-10 text-[14px] text-muted-foreground">Bundles are unavailable right now. Refresh in a moment.</p>
      )}
      {!data && !error && (
        <div className="mt-16 flex items-center justify-center gap-2.5 text-[13.5px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" /> Loading bundles
        </div>
      )}
      {data && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} agents={data.agents} />
          ))}
        </div>
      )}
      {data && (
        <p className="mt-8 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          Looking for something else?{" "}
          <NavLink to="/marketplace?installable=1" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
            Browse installable listings <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </NavLink>
        </p>
      )}
    </div>
  );
}

/** Home page teaser: the first three bundles, linking to the full page. */
export function PopularBundles() {
  const { data } = useBundles();
  if (!data || data.bundles.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="bundles-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[60ch]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Bundles</p>
          <h2 id="bundles-title" className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
            Popular bundles
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Curated sets of installable MCP servers and skills for a common job, one command per item.
          </p>
        </div>
        <NavLink
          to="/bundles"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
        >
          All {data.bundles.length} bundles <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </NavLink>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {data.bundles.slice(0, 3).map((bundle) => (
          <BundleCard key={bundle.id} bundle={bundle} agents={data.agents} compact />
        ))}
      </div>
    </section>
  );
}
