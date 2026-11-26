"use client";

import * as React from "react";
import { ArrowRight, Check, Copy, Info, Key, Layers, Loader2, Sparkles, Terminal, Wrench } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [copiedBar, setCopiedBar] = React.useState(false);
  const [copiedInstall, setCopiedInstall] = React.useState(false);
  const [copiedAll, setCopiedAll] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [showCommands, setShowCommands] = React.useState(false);

  const targets = React.useMemo(() => [ANY_AGENT, ...agents], [agents]);
  const installable = bundle.items.filter((item) => item.installable);
  // With an agent chosen, only commands that agent can take are copied; an
  // item the agent cannot receive (for example a remote server on a local-only
  // host) is left out and counted, never emitted as a command that would fail.
  const forAgent = agent ? installable.filter((item) => item.hostIds.includes(agent)) : installable;
  const skipped = installable.length - forAgent.length;
  
  const bundleCommand = `litespm install bundle:${bundle.id}${agent ? ` --agent ${shellArg(agent)}` : ""}`;
  const commands = forAgent
    .map((item) => `litespm install ${shellArg(item.id)}${agent ? ` --agent ${shellArg(agent)}` : ""}`)
    .join("\n");

  const copyBundleBar = () => {
    navigator.clipboard
      ?.writeText(bundleCommand)
      .then(() => {
        setCopiedBar(true);
        window.setTimeout(() => setCopiedBar(false), 1600);
      })
      .catch(() => {});
  };

  const copyInstallBtn = () => {
    navigator.clipboard
      ?.writeText(bundleCommand)
      .then(() => {
        setCopiedInstall(true);
        window.setTimeout(() => setCopiedInstall(false), 1600);
      })
      .catch(() => {});
  };

  const copyAll = () => {
    if (!commands) return;
    navigator.clipboard
      ?.writeText(commands)
      .then(() => {
        setCopiedAll(true);
        window.setTimeout(() => setCopiedAll(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <>
      <article
        className="flex flex-col rounded-2xl border border-border/70 bg-card p-5"
        aria-labelledby={`bundle-${bundle.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="text-left font-semibold tracking-tight text-[16px] text-foreground hover:text-brand hover:underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            title="Inspect bundle workflow and prerequisite details"
          >
            {bundle.title}
          </button>
          <DifficultyPill level={bundle.difficulty} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
          <span>For: {bundle.audience}</span>
          <span aria-hidden="true">·</span>
          <span className="text-brand">~{Math.max(10, bundle.items.length * 4)} min saved</span>
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{bundle.blurb}</p>

        {(() => {
          const maxPreview = compact ? 4 : 6;
          const visibleItems = bundle.items.slice(0, maxPreview);
          const remainingCount = bundle.items.length - maxPreview;

          return (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`Items in ${bundle.title}`}>
              {visibleItems.map((item) => (
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
              {remainingCount > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    title={`View all ${bundle.items.length} included capabilities in details`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/40 px-2 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
                  >
                    +{remainingCount} more →
                  </button>
                </li>
              )}
            </ul>
          );
        })()}

        <div className="mt-4 pt-4 border-t border-border/40">
          <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5 font-mono text-[11px]">
            <span className="truncate text-foreground/90">
              <span className="text-brand">$</span> {bundleCommand}
            </span>
            <button
              type="button"
              onClick={copyBundleBar}
              title="Copy one-command bundle install"
              aria-label={`Copy bundle install command for ${bundle.title}`}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand hover:underline"
            >
              {copiedBar ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiedBar ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TargetAgentPicker targets={targets} value={agent} onChange={setAgent} kindLabel="agents" />
            <button
              type="button"
              onClick={copyInstallBtn}
              className="inline-flex h-8 w-[176px] justify-center items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-3 text-[12px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              {copiedInstall ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiedInstall ? "Copied command!" : "Install bundle (1 command)"}
            </button>
            <button
              type="button"
              onClick={() => setShowCommands((prev) => !prev)}
              aria-expanded={showCommands}
              title={showCommands ? "Hide individual install commands" : "Expand individual install commands"}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11.5px] font-medium transition-colors",
                showCommands
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border/70 bg-background text-muted-foreground hover:border-brand/50 hover:text-foreground"
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              {showCommands ? "Hide commands" : `All ${forAgent.length} commands`}
            </button>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
            >
              <Info className="h-3.5 w-3.5" /> Details
            </button>
            <span className="sr-only" role="status">
              {copiedBar || copiedInstall ? "Bundle command copied" : copiedAll ? "All commands copied" : ""}
            </span>
          </div>

          {showCommands && (
            <div className="mt-3 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-mono text-muted-foreground">
                  Individual install commands ({forAgent.length}):
                </span>
                <button
                  type="button"
                  onClick={copyAll}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                >
                  {copiedAll ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedAll ? "Copied all" : "Copy script"}
                </button>
              </div>
              <pre className="max-h-44 overflow-y-auto rounded-lg border border-border/50 bg-background p-2.5 font-mono text-[11px] leading-relaxed text-foreground select-all">
                {commands}
              </pre>
            </div>
          )}
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Installs all {forAgent.length} capabilities with a single command.
            {skipped > 0 ? ` (${skipped} item${skipped === 1 ? "" : "s"} left out for this agent).` : " Unified plan and preflight diff before write."}
          </p>
        </div>
      </article>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle className="text-[18px] font-bold tracking-tight">
                {bundle.title}
              </DialogTitle>
              <DifficultyPill level={bundle.difficulty} />
            </div>
            <DialogDescription className="text-[13px] text-muted-foreground mt-1">
              Target Audience: {bundle.audience}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <p className="text-[13.5px] leading-relaxed text-foreground/90">
              {bundle.blurb}
            </p>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-2 text-[12px]">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Wrench className="h-3.5 w-3.5 text-brand" /> Prerequisites & Environment
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>Runtime: Node.js 22.22.2+ (or Python uv where needed for native Python MCPs)</li>
                <li>LiteSPM CLI: <code className="font-mono text-foreground">npm install -g litespm</code></li>
                <li>Common secrets: <code className="font-mono text-foreground">GITHUB_TOKEN</code> if interacting with GitHub repositories; service API tokens when configuring external database or monitoring tools.</li>
              </ul>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-foreground mb-2 flex items-center justify-between">
                <span>Included Capabilities ({bundle.items.length})</span>
                <span className="text-[11.5px] font-normal text-muted-foreground">All installable via LiteSPM</span>
              </h4>
              <ul className="space-y-2">
                {bundle.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card p-3 text-[12.5px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <KindBadge kind={item.kind} />
                        <span className="font-semibold text-foreground truncate">
                          {displayPackageName(item.name)}
                        </span>
                      </div>
                      <NavLink
                        to={`/package/${encodeURIComponent(item.linkKey)}`}
                        className="text-[11.5px] font-medium text-brand hover:underline shrink-0"
                      >
                        View package →
                      </NavLink>
                    </div>
                    {item.summary && (
                      <p className="text-[11.5px] text-muted-foreground leading-relaxed line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                    {item.publisher && (
                      <span className="text-[10.5px] font-mono text-muted-foreground/80">
                        publisher: {item.publisher}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 border-t border-border/60">
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 font-mono text-[11.5px]">
                <span className="truncate text-foreground/90">
                  <span className="text-brand">$</span> {bundleCommand}
                </span>
                <button
                  type="button"
                  onClick={copyBundleBar}
                  title="Copy one-command bundle install"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-brand hover:underline"
                >
                  {copiedBar ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copiedBar ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <TargetAgentPicker targets={targets} value={agent} onChange={setAgent} kindLabel="agents" />
                <button
                  type="button"
                  onClick={copyInstallBtn}
                  className="inline-flex h-8 min-w-[176px] justify-center items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-3 text-[12px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  {copiedInstall ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copiedInstall ? "Copied command!" : "Install bundle (1 command)"}
                </button>
                <button
                  type="button"
                  onClick={copyAll}
                  disabled={!commands}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:opacity-40"
                >
                  {copiedAll ? <Check className="h-3.5 w-3.5 text-brand" /> : <Terminal className="h-3.5 w-3.5" />}
                  {copiedAll ? "Copied" : `All ${forAgent.length} commands`}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useBundles(initial?: BundlesResponse): { data: BundlesResponse | null; error: boolean } {
  const [data, setData] = React.useState<BundlesResponse | null>(initial ?? null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    if (initial) return;
    fetch("/api/litespm/bundles")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bundles"))))
      .then((response: BundlesResponse) => setData(response))
      .catch(() => setError(true));
  }, [initial]);
  return { data, error };
}

export function BundlesView({ initial }: { initial?: BundlesResponse } = {}) {
  const { data, error } = useBundles(initial);
  const [level, setLevel] = React.useState<BundleDifficulty | "all">("all");

  const shown = data?.bundles.filter((b) => level === "all" || b.difficulty === level) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="max-w-[64ch]">
        <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Bundles
        </p>
        <h1 className="mt-2 text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          Curated Tool Stacks.
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          Pre-configured bundles of MCP servers and agent skills tailored for Web Development, DevOps, and Data Science. Install an
          entire workflow in one command with <code className="font-mono text-foreground">litespm install bundle:&lt;id&gt;</code>,
          or copy individual commands with full diff preview and backup.{" "}
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
        <div className="mt-6 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
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
export function PopularBundles({ embedded = false }: { embedded?: boolean }) {
  const { data } = useBundles();
  if (!data || data.bundles.length === 0) return null;
  if (embedded) {
    return (
      <div>
        <NavLink
          to="/bundles"
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
        >
          All {data.bundles.length} bundles <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </NavLink>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {data.bundles.slice(0, 3).map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} agents={data.agents} compact />
          ))}
        </div>
      </div>
    );
  }
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="bundles-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[60ch]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Bundles</p>
          <h2 id="bundles-title" className="mt-1 text-[26px] font-semibold tracking-tight sm:text-[30px]">
            Popular bundles
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Curated sets of installable MCP servers and skills for a common job — installable in one command with unified preview and backup.
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
