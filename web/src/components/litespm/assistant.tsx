"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  BrainCircuit,
  Check,
  Copy,
  ExternalLink,
  GitCompareArrows,
  Loader2,
  MessageCircle,
  Package,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { useWatchlist } from "@/lib/litespm/hooks";
import { displayPackageName } from "@/lib/litespm/format";
import type { AssistantCitation, AssistantMeta, CompareColumn, PackageDetailData } from "@/lib/litespm/types";
import { AvailabilityBadge, KindBadge } from "./primitives";
import { InstallBar } from "./install-bar";

interface AssistantSource {
  id: string;
  title: string;
  source: string;
  section: string;
  startLine: number;
  endLine: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: AssistantCitation[];
  sources?: AssistantSource[];
  meta?: AssistantMeta;
  /** Set while tokens are still arriving for this bubble. */
  streaming?: boolean;
  /** Set when the stream broke after a partial answer. */
  streamError?: string;
  /** Retrieval cards rendered before the model's prose. */
  preview?: boolean;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "status"; text: string }
  | { type: "cards"; keys: string[]; citations?: AssistantCitation[] }
  | { type: "sources"; sources: AssistantSource[] }
  | { type: "done"; answer: string; citations?: AssistantCitation[]; sources?: AssistantSource[]; meta?: AssistantMeta }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "Hi! What can you help me with?",
  "What is LiteSPM and how does it work?",
  "Recommend PostgreSQL MCP servers for database administration.",
  "Explain LiteSPM’s security and rollback model.",
];

// The streamed answer's first token has been measured at ~10s on a cold
// provider. Eight seconds aborted the request before the server could send
// anything, then the fallback searched for the whole question ("What can
// LiteSPM install for working with Postgres?") and found nothing. Keep the
// guard below the route's 60s budget but above the real first-token latency.
const FIRST_TOKEN_TIMEOUT_MS = 25_000;

const FALLBACK_STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "could", "do", "does", "for", "from", "help",
  "how", "i", "in", "install", "is", "it", "litespm", "me", "mcp", "my", "of",
  "on", "or", "plugin", "plugins", "server", "servers", "should", "skill",
  "skills", "that", "the", "this", "to", "want", "what", "which", "with",
  "work", "working", "would", "you", "your",
]);

/**
 * Turn a chat question into catalog queries, best first. The full question is
 * useful for exact phrases; the stop-word-stripped terms and the longest term
 * make suggested chips like "What can LiteSPM install for working with
 * Postgres?" resolve to "postgres" when the LLM is slow.
 */
export function assistantFallbackQueries(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const keywords = words.filter((w) => w.length >= 2 && !FALLBACK_STOP_WORDS.has(w));
  const joined = keywords.join(" ").trim();
  const longest = [...keywords].sort((a, b) => b.length - a.length)[0] ?? "";
  return [...new Set([question.trim(), joined, longest].filter(Boolean))];
}

function CodeBlockSnippet({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative my-2.5 rounded-xl border border-border/80 bg-muted/40 p-3 font-mono text-[11.5px]">
      <div className="absolute right-2.5 top-2.5">
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-border/60 bg-background/90 p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      {lang && (
        <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {lang}
        </span>
      )}
      <pre className="overflow-x-auto pr-8 leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Interactive Mini Package Card embedded directly in chat */
function InteractivePackageItem({ linkKey, onOpenLink }: { linkKey: string; onOpenLink: (href: string) => void }) {
  const [data, setData] = React.useState<PackageDetailData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(linkKey);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/litespm/package/${encodeURIComponent(linkKey)}`)
      .then((r) => r.json())
      .then((res: { found: boolean; detail?: PackageDetailData }) => {
        if (!cancelled && res.found && res.detail) {
          setData(res.detail);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [linkKey]);

  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border border-border/60 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground/60" />
      </div>
    );
  }

  if (!data) return null;

  const installCommand =
    (data.id ? `litespm install ${data.id}` : `litespm install ${data.slug || data.linkKey}`);

  return (
    <div className="group relative my-2 overflow-hidden rounded-xl border border-border/75 bg-card/90 p-3.5 shadow-xs transition-all hover:border-brand/40 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <KindBadge kind={data.kind} />
            <AvailabilityBadge
              installable={data.installable}
              label={data.availability?.label ?? (data.installable ? "Installable" : "Discovery-only")}
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenLink(`#/package/${encodeURIComponent(data.linkKey)}`)}
            className="mt-1.5 block truncate text-left text-[14px] font-semibold text-foreground transition-colors hover:text-brand"
          >
            {displayPackageName(data.name)}
          </button>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {data.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggle({ linkKey: data.linkKey, name: data.name, kind: data.kind })}
          className={cn(
            "rounded-lg border p-1.5 transition-colors",
            watched
              ? "border-brand/40 bg-brand/10 text-brand"
              : "border-border/60 bg-background text-muted-foreground hover:border-brand/40 hover:text-brand",
          )}
          title={watched ? "Remove from watchlist" : "Save to watchlist"}
          aria-label={watched ? "Remove from watchlist" : "Save to watchlist"}
        >
          {watched ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
        </button>
      </div>

      {data.installable && (
        <div className="mt-3">
          <InstallBar command={installCommand} compact />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
        <span>By {data.publisher.name} {data.publisher.verified && "✓"}</span>
        <button
          type="button"
          onClick={() => onOpenLink(`#/package/${encodeURIComponent(data.linkKey)}`)}
          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
        >
          View package <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/** Interactive Comparison Matrix embedded directly in chat */
function InteractiveCompareMatrix({
  keys,
  features,
  onOpenLink,
}: {
  keys: string[];
  features?: Array<{ attribute: string; values: Record<string, string> }>;
  onOpenLink: (href: string) => void;
}) {
  const [columns, setColumns] = React.useState<CompareColumn[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/litespm/compare?keys=${keys.map(encodeURIComponent).join(",")}`)
      .then((r) => r.json())
      .then((res: { columns?: CompareColumn[] }) => {
        if (!cancelled && res.columns) setColumns(res.columns);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [keys.join(",")]);

  if (loading) {
    return (
      <div className="my-3 flex h-24 items-center justify-center rounded-xl border border-border/60 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground/60" />
      </div>
    );
  }

  if (columns.length === 0) return null;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          <GitCompareArrows className="h-3.5 w-3.5 text-brand" />
          Package Comparison Matrix
        </div>
        <button
          type="button"
          onClick={() => onOpenLink(`#/compare?keys=${columns.map((c) => encodeURIComponent(c.linkKey)).join(",")}`)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
        >
          Full comparison view <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11.5px]">
          <thead>
            <tr className="border-b border-border/70 bg-muted/20">
              <th className="px-3 py-2 font-medium text-muted-foreground w-28">Capability</th>
              {columns.map((col) => (
                <th key={col.linkKey} className="px-3 py-2 font-semibold text-foreground">
                  <button
                    type="button"
                    onClick={() => onOpenLink(`#/package/${encodeURIComponent(col.linkKey)}`)}
                    className="hover:text-brand transition-colors text-left font-semibold"
                  >
                    {col.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            <tr>
              <td className="px-3 py-2 font-medium text-muted-foreground">Type</td>
              {columns.map((col) => (
                <td key={col.linkKey} className="px-3 py-2">
                  <KindBadge kind={col.kind} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium text-muted-foreground">Installable</td>
              {columns.map((col) => (
                <td key={col.linkKey} className="px-3 py-2 font-mono">
                  {col.installable ? (
                    <span className="text-brand font-semibold">Yes (Native)</span>
                  ) : (
                    <span className="text-muted-foreground">Discovery-only</span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium text-muted-foreground">Transport</td>
              {columns.map((col) => (
                <td key={col.linkKey} className="px-3 py-2 font-mono text-[11px]">
                  {col.transport || "Local stdio"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium text-muted-foreground">Publisher</td>
              {columns.map((col) => (
                <td key={col.linkKey} className="px-3 py-2 text-foreground/90">
                  {col.publisher} {col.publisherVerified && "✓"}
                </td>
              ))}
            </tr>
            {features && features.map((feat, fIdx) => (
              <tr key={fIdx}>
                <td className="px-3 py-2 font-medium text-muted-foreground">{feat.attribute}</td>
                {columns.map((col) => (
                  <td key={col.linkKey} className="px-3 py-2 text-foreground/90">
                    {feat.values[col.linkKey] ?? feat.values[col.name] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Explore Deep-Link Button embedded directly in chat */
function InteractiveExploreLink({
  label,
  query,
  onOpenLink,
}: {
  label: string;
  query: Record<string, string>;
  onOpenLink: (href: string) => void;
}) {
  const hash = exploreHash(query);
  return (
    <div className="my-2.5">
      <button
        type="button"
        onClick={() => onOpenLink(hash)}
        className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3.5 py-2 text-[12.5px] font-semibold text-brand transition-all hover:bg-brand/15 hover:border-brand/60"
      >
        <Package className="h-3.5 w-3.5" />
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function tryParseWidgetJson(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

/** Render Dynamic UI Widgets or fall back to standard code block */
function InteractiveChecklist({ items }: { items: Array<{ label: string; detail?: string }> }) {
  const [checked, setChecked] = React.useState<boolean[]>(() => items.map(() => false));
  const completed = checked.filter(Boolean).length;
  return (
    <div className="my-3 rounded-xl border border-border/70 bg-card/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold">Checklist</p>
        <span className="text-[10px] tabular-nums text-muted-foreground">{completed}/{items.length} complete</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${items.length ? completed / items.length * 100 : 0}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} />
      </div>
      <div className="space-y-2">
        {items.slice(0, 12).map((item, index) => (
          <label key={`${item.label}-${index}`} className="flex cursor-pointer items-start gap-2.5 text-[12px]">
            <input type="checkbox" checked={!!checked[index]} onChange={(event) => setChecked((old) => old.map((value, i) => i === index ? event.target.checked : value))} className="mt-0.5 accent-[var(--brand)]" />
            <span className={cn("min-w-0", checked[index] && "text-muted-foreground line-through")}>
              <span className="font-medium">{item.label}</span>
              {item.detail && <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function DynamicWidgetOrCode({
  content,
  lang,
  onOpenLink,
}: {
  content: string;
  lang?: string;
  onOpenLink: (href: string) => void;
}) {
  if (lang === "json" || !lang) {
    const parsed = tryParseWidgetJson(content);
    if (parsed) {
      if (parsed.type === "package_cards" && Array.isArray(parsed.keys)) {
        return (
          <div className="my-2.5 flex flex-col gap-2.5">
            {(parsed.keys as string[]).slice(0, 4).map((k: string) => (
              <InteractivePackageItem key={k} linkKey={k} onOpenLink={onOpenLink} />
            ))}
          </div>
        );
      }
      if (parsed.type === "comparison_matrix" && Array.isArray(parsed.keys)) {
        const rawFeatures = Array.isArray(parsed.features) ? parsed.features : [];
        const normalizedFeatures: Array<{ attribute: string; values: Record<string, string> }> = rawFeatures.map(
          (f: Record<string, unknown>) => {
            const attribute = typeof f.attribute === "string" ? f.attribute : "Feature";
            const values: Record<string, string> = {};
            if (f.values && typeof f.values === "object") {
              for (const [k, v] of Object.entries(f.values as Record<string, unknown>)) {
                if (typeof v === "string") values[k] = v;
              }
            } else {
              for (const [k, v] of Object.entries(f)) {
                if (k !== "attribute" && typeof v === "string") values[k] = v;
              }
            }
            return { attribute, values };
          },
        );

        return (
          <InteractiveCompareMatrix
            keys={(parsed.keys as string[]).slice(0, 4)}
            features={normalizedFeatures}
            onOpenLink={onOpenLink}
          />
        );
      }
      if (parsed.type === "metric_cards" && Array.isArray(parsed.metrics)) {
        const metrics = (parsed.metrics as Array<Record<string, unknown>>).slice(0, 4).filter((item) => typeof item.label === "string" && (typeof item.value === "string" || typeof item.value === "number"));
        return (
          <div className="my-3 grid grid-cols-2 gap-2">
            {metrics.map((item, index) => (
              <motion.div key={`${String(item.label)}-${index}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07, duration: 0.24 }} className="rounded-xl border border-border/70 bg-card/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{String(item.label).slice(0, 48)}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight">{String(item.value).slice(0, 32)}</p>
                {typeof item.detail === "string" && <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{item.detail.slice(0, 120)}</p>}
              </motion.div>
            ))}
          </div>
        );
      }
      if (parsed.type === "steps" && Array.isArray(parsed.steps)) {
        const steps = (parsed.steps as Array<Record<string, unknown>>).slice(0, 8).filter((step) => typeof step.title === "string");
        return (
          <div className="my-3 space-y-2">
            {steps.map((step, index) => (
              <motion.div key={`${String(step.title)}-${index}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }} className="flex gap-3 rounded-xl border border-border/70 bg-card/60 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">{index + 1}</span>
                <div className="min-w-0"><p className="text-[12px] font-semibold">{String(step.title).slice(0, 72)}</p>{typeof step.description === "string" && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{step.description.slice(0, 220)}</p>}</div>
              </motion.div>
            ))}
          </div>
        );
      }
      if (parsed.type === "host_cards" && Array.isArray(parsed.hosts)) {
        const hosts = (parsed.hosts as Array<Record<string, unknown>>).slice(0, 8).filter((host) => typeof host.id === "string" && typeof host.name === "string");
        return (
          <div className="my-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {hosts.map((host, index) => (
              <motion.div key={String(host.id)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="rounded-xl border border-border/70 bg-card/70 p-3">
                <div className="flex items-start justify-between gap-2"><p className="text-[12px] font-semibold">{String(host.name).slice(0, 60)}</p><span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand">{host.remote === true ? "REMOTE" : "STDIO"}</span></div>
                <code className="mt-1 block text-[10px] text-muted-foreground">{String(host.id).slice(0, 80)}</code>
                {typeof host.keyPath === "string" && <p className="mt-2 truncate text-[10px] text-muted-foreground">Config: {host.keyPath}</p>}
                {typeof host.userPath === "string" && <p className="mt-1 truncate text-[10px] text-muted-foreground">{host.userPath}</p>}
              </motion.div>
            ))}
          </div>
        );
      }
      if (parsed.type === "checklist" && Array.isArray(parsed.items)) {
        const items = (parsed.items as Array<Record<string, unknown>>).filter((item) => typeof item.label === "string").slice(0, 12).map((item) => ({ label: String(item.label).slice(0, 100), detail: typeof item.detail === "string" ? item.detail.slice(0, 180) : undefined }));
        return <InteractiveChecklist items={items} />;
      }
      if (parsed.type === "timeline" && Array.isArray(parsed.events)) {
        const events = (parsed.events as Array<Record<string, unknown>>).slice(0, 8).filter((event) => typeof event.title === "string");
        return <div className="my-3 space-y-0">{events.map((event, index) => <motion.div key={`${String(event.title)}-${index}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="relative flex gap-3 pb-4 last:pb-0"><span className="relative mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-background">{index < events.length - 1 && <span className="absolute top-2 h-12 w-px bg-border" />}</span><div><p className="text-[12px] font-semibold">{String(event.title).slice(0, 80)}</p>{typeof event.time === "string" && <p className="text-[10px] text-brand">{event.time.slice(0, 40)}</p>}{typeof event.description === "string" && <p className="mt-1 text-[11px] text-muted-foreground">{event.description.slice(0, 180)}</p>}</div></motion.div>)}</div>;
      }
      if (parsed.type === "explore_link" && typeof parsed.label === "string" && parsed.query && typeof parsed.query === "object") {
        const sanitizedQuery: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.query as Record<string, unknown>)) {
          if (typeof v === "string") sanitizedQuery[k] = v;
        }

        return (
          <InteractiveExploreLink
            label={parsed.label}
            query={sanitizedQuery}
            onOpenLink={onOpenLink}
          />
        );
      }
    }
  }

  return <CodeBlockSnippet code={content} lang={lang} />;
}

/** Render the assistant's rich markdown answer: tables, code, bold, links, lists. */
function RichAnswer({ text, onOpenLink }: { text: string; onOpenLink: (href: string) => void }) {
  const blocks = parseMarkdownBlocks(text);

  // If the response already contains package_cards widgets, suppress any
  // markdown tables — they duplicate information and clip badly in the narrow drawer.
  const hasPackageCards = blocks.some(
    (b) => b.type === "code" && (() => { try { const p = JSON.parse(b.content); return p?.type === "package_cards"; } catch { return false; } })()
  );

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "code") {
          return (
            <DynamicWidgetOrCode
              key={i}
              content={block.content}
              lang={block.lang}
              onOpenLink={onOpenLink}
            />
          );
        }

        if (block.type === "table") {
          // Suppress markdown tables when package_cards are present in the same response
          if (hasPackageCards) return null;
          return (
            <div key={i} className="my-2.5 max-w-full overflow-x-auto rounded-xl border border-border/80 bg-card/60 shadow-xs">
              <table className="min-w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/60">
                    {block.headers.map((h, idx) => (
                      <th key={idx} className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-foreground">
                        {renderInline(h.trim(), onOpenLink)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="transition-colors hover:bg-muted/30">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1.5 align-top leading-relaxed text-foreground/90">
                          {renderInline(cell.trim(), onOpenLink)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "header") {
          return (
            <h4 key={i} className="pt-1 text-[13.5px] font-semibold text-foreground">
              {renderInline(block.text, onOpenLink)}
            </h4>
          );
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={cn("ml-1 space-y-1.5", block.ordered && "list-decimal list-inside")}>
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-[13px] leading-relaxed">
                  {!block.ordered && (
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  )}
                  <span className="flex-1">{renderInline(item, onOpenLink)}</span>
                </li>
              ))}
            </Tag>
          );
        }

        // Paragraph
        return (
          <p key={i} className="text-[13px] leading-relaxed">
            {block.text.split("\n").map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line, onOpenLink)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function parseMarkdownBlocks(text: string) {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<
    | { type: "code"; lang: string; content: string }
    | { type: "table"; headers: string[]; rows: string[][] }
    | { type: "list"; items: string[]; ordered: boolean }
    | { type: "header"; level: number; text: string }
    | { type: "p"; text: string }
  > = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced Code Block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith("```")) {
        codeLines.push(rawLines[i]);
        i++;
      }
      if (i < rawLines.length) i++;
      blocks.push({ type: "code", lang, content: codeLines.join("\n") });
      continue;
    }

    // Markdown Table: requires row with '|' and next line with '---'
    if (line.includes("|") && i + 1 < rawLines.length && /^\s*\|?\s*:?-+:?\s*\|/.test(rawLines[i + 1])) {
      const parseCells = (row: string) => {
        let trimmed = row.trim();
        if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
        if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
        return trimmed.split("|").map((c) => c.trim());
      };

      const headers = parseCells(line);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < rawLines.length && rawLines[i].includes("|") && rawLines[i].trim()) {
        rows.push(parseCells(rawLines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Heading: #, ##, ###
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "header", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // List: - or * or 1.
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < rawLines.length && /^\s*([-*•]|\d+\.)\s+/.test(rawLines[i])) {
        items.push(rawLines[i].replace(/^\s*([-*•]|\d+\.)\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", items, ordered });
      continue;
    }

    // Regular paragraph
    const pLines: string[] = [line];
    i++;
    while (
      i < rawLines.length &&
      rawLines[i].trim() &&
      !rawLines[i].trim().startsWith("```") &&
      !/^(#{1,4})\s+/.test(rawLines[i]) &&
      !/^\s*([-*•]|\d+\.)\s+/.test(rawLines[i]) &&
      !(rawLines[i].includes("|") && i + 1 < rawLines.length && /^\s*\|?\s*:?-+:?\s*\|/.test(rawLines[i + 1]))
    ) {
      pLines.push(rawLines[i]);
      i++;
    }
    blocks.push({ type: "p", text: pLines.join("\n") });
  }

  return blocks;
}

function safeExternalHref(href: string): string | null {
  // Model output is untrusted: a catalog summary can steer the model toward a
  // javascript:, data:, or lookalike link. Only absolute HTTPS links leave the
  // app; internal #/ routes are handled separately.
  try {
    const url = new URL(href);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderInline(text: string, onOpenLink: (href: string) => void): React.ReactNode[] {
  // Pattern: [label](href) or `code` or **bold** or *italic*
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    // [label](href)
    if (match[1] !== undefined && match[2] !== undefined) {
      const label = match[1];
      const href = match[2];
      const isInternal = href.startsWith("#/");
      const external = isInternal ? null : safeExternalHref(href);

      if (!isInternal && !external) {
        // Do not render an anchor for a scheme we do not allow. The label is
        // still readable, but it cannot become a javascript:/data: link.
        parts.push(<span key={key++}>{label}</span>);
      } else {
        parts.push(
          isInternal ? (
            <button
              key={key++}
              type="button"
              onClick={() => onOpenLink(href)}
              className="inline-flex items-center gap-1 mx-0.5 rounded-md border border-brand/40 bg-brand-soft/70 px-1.5 py-0.5 font-medium text-brand hover:bg-brand-soft transition-colors text-[12px] align-baseline"
            >
              <span>{label}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 opacity-80" />
            </button>
          ) : (
            <a
              key={key++}
              href={external!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mx-0.5 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-medium text-brand hover:bg-muted/80 transition-colors text-[12px] align-baseline"
            >
              <span>{label}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
            </a>
          ),
        );
      }
    } else if (match[3] !== undefined) {
      // `code`
      parts.push(
        <code
          key={key++}
          className="rounded border border-border/60 bg-muted/70 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground"
        >
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      // **bold**
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[4]}
        </strong>,
      );
    } else if (match[5] !== undefined) {
      // *italic*
      parts.push(
        <em key={key++} className="italic text-foreground/90">
          {match[5]}
        </em>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Assistant() {
  const open = useApp((s) => s.assistantOpen);
  const setAssistant = useApp((s) => s.setAssistant);
  const navigate = useApp((s) => s.navigate);
  const compareActive = useApp((s) => s.compareKeys.length > 0 && s.route.view !== "compare");
  const [mounted, setMounted] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [rememberChats, setRememberChats] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = React.useState(false);
  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setMounted(true);
    try {
      const enabled = window.localStorage.getItem("litespm-askai-memory-enabled") === "1";
      setRememberChats(enabled);
      if (enabled) {
        const saved = window.localStorage.getItem("litespm-askai-history");
        if (saved) {
          const parsed = JSON.parse(saved) as ChatMessage[];
          if (Array.isArray(parsed)) setMessages(parsed.filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && !item.streaming && !item.preview).slice(-50));
        }
      }
    } catch { /* local history is optional and may be unavailable */ }
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    try {
      if (rememberChats) {
        window.localStorage.setItem("litespm-askai-memory-enabled", "1");
        window.localStorage.setItem("litespm-askai-history", JSON.stringify(messages.filter((item) => !item.streaming && !item.preview).slice(-50)));
      } else {
        window.localStorage.removeItem("litespm-askai-memory-enabled");
        window.localStorage.removeItem("litespm-askai-history");
      }
    } catch { /* storage quota/private browsing must not break chat */ }
  }, [messages, rememberChats, mounted]);

  React.useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Escape closes the panel — unless the user is mid-composition in the
  // textarea, where Escape is left to the input's own behavior.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        setAssistant(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setAssistant]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  /** Patch the trailing assistant bubble (the one tokens stream into). */
  const patchLast = React.useCallback((patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) => {
    setMessages((prev) =>
      prev.map((message, i) =>
        i === prev.length - 1 && message.role === "assistant"
          ? { ...message, ...(typeof patch === "function" ? patch(message) : patch) }
          : message,
      ),
    );
  }, []);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = React.useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      setError(null);
      setInput("");
      // Retrieval previews are UI-only; never send their JSON back as
      // assistant conversation history.
      const history = [
        ...messages.filter((message) => !message.preview),
        { role: "user" as const, content: question },
      ];
      setMessages(history);
      setBusy(true);
      setWaitingFirstToken(true);
      setStatusText(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let hasReceivedFirstToken = false;
      let proseStarted = false;
      let streamSources: AssistantSource[] = [];
      // Abort a stalled remote LLM stream and fall back to the catalog. The
      // window is deliberately wider than the observed cold-start latency.
      const timeoutId = setTimeout(() => {
        if (!hasReceivedFirstToken) {
          controller.abort("TIMEOUT");
        }
      }, FIRST_TOKEN_TIMEOUT_MS);

      const appendStreamBubble = () => {
        hasReceivedFirstToken = true;
        clearTimeout(timeoutId);
        setWaitingFirstToken(false);
        setStatusText(null);
        setMessages((prev) => [...prev, { role: "assistant" as const, content: "", streaming: true }]);
      };

      const handleEvent = (event: StreamEvent) => {
        if (event.type === "status") {
          setStatusText(event.text);
          return;
        }

        if (event.type === "sources") {
          streamSources = event.sources;
          return;
        }

        if (event.type === "cards") {
          if (event.keys.length === 0) return;
          const content = `Here are the closest matches in the live catalog:\n\n\`\`\`json\n{\n  "type": "package_cards",\n  "keys": ${JSON.stringify(event.keys.slice(0, 4))}\n}\n\`\`\``;
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content,
              citations: event.citations,
              preview: true,
              streaming: false,
            },
          ]);
          setStatusText("Writing the answer…");
          return;
        }

        if (event.type === "delta") {
          if (!proseStarted) {
            proseStarted = true;
            appendStreamBubble();
          }
          patchLast((m) => ({ content: m.content + event.text }));
          return;
        }

        if (event.type === "done") {
          hasReceivedFirstToken = true;
          clearTimeout(timeoutId);
          setWaitingFirstToken(false);
          setStatusText(null);
          setMessages((prev) => {
            // The model is told not to repeat package cards when the UI
            // already showed retrieval cards. If it does anyway, drop the
            // preview so the answer does not render the same cards twice.
            const hasWidget =
              event.answer.includes('"type": "package_cards"') ||
              event.answer.includes('"type": "comparison_matrix"');
            const withoutPreview = hasWidget
              ? prev.filter((message) => !message.preview)
              : prev;
            const last = withoutPreview[withoutPreview.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              return withoutPreview.map((message, index) =>
                index === withoutPreview.length - 1
                  ? {
                      ...message,
                      content: event.answer,
                      citations: event.citations,
                      sources: event.sources ?? streamSources,
                      meta: event.meta,
                      streaming: false,
                    }
                  : message,
              );
            }
            return [
              ...withoutPreview,
              {
                role: "assistant",
                content: event.answer,
                citations: event.citations,
                sources: event.sources ?? streamSources,
                meta: event.meta,
              },
            ];
          });
          return;
        }

        if (event.type === "error") {
          clearTimeout(timeoutId);
          setWaitingFirstToken(false);
          setStatusText(null);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.streaming && last.content.length > 0) {
              // Partial answer already on screen — keep it, flag the cut.
              return prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, streaming: false, streamError: event.message } : m,
              );
            }
            if (last?.role === "assistant" && last.streaming) {
              // Nothing arrived — drop the empty bubble and raise the error.
              setError(event.message);
              return prev.slice(0, -1);
            }
            setError(event.message);
            return prev;
          });
        }
      };

      try {
        const response = await fetch("/api/litespm/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? "The assistant is unavailable right now.");
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("ndjson") || !response.body) {
          // Buffered fallback (older route or proxy without streaming).
          const data = (await response.json()) as {
            answer?: string;
            citations?: AssistantCitation[];
            sources?: AssistantSource[];
            meta?: AssistantMeta;
            error?: string;
          };
          if (!data.answer) {
            setError(data.error ?? "The assistant is unavailable right now.");
            return;
          }
          setMessages([
            ...history,
            { role: "assistant", content: data.answer, citations: data.citations, sources: data.sources, meta: data.meta },
          ]);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              handleEvent(JSON.parse(trimmed) as StreamEvent);
            } catch {
              /* partial JSON — the next chunk completes it */
            }
          }
          if (done) break;
        }
        // Flush a trailing line the stream ended without a newline on.
        const trailing = buffer.trim();
        if (trailing) {
          try {
            handleEvent(JSON.parse(trailing) as StreamEvent);
          } catch {
            /* ignore */
          }
        }
        patchLast({ streaming: false });
      } catch {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          if (!hasReceivedFirstToken) {
            setError("The assistant took too long to respond. Please try again.");
          } else {
            patchLast({ streaming: false });
          }
        } else {
          setError("Network error — please try again.");
        }
      } finally {
        clearTimeout(timeoutId);
        setBusy(false);
        setWaitingFirstToken(false);
        setStatusText(null);
        abortRef.current = null;
      }
    },
    [busy, messages, patchLast, rememberChats],
  );

  if (!mounted) return null;

  const panel = (
    <div
      className={cn(
        "fixed bottom-2 sm:bottom-4 right-2 sm:right-4 z-50 flex w-[min(460px,calc(100vw-1rem))] sm:w-[480px] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl transition-all",
        open ? "pointer-events-auto h-[min(620px,calc(100dvh-4.5rem))] sm:h-[min(640px,calc(100vh-6rem))]" : "pointer-events-none h-0 border-0",
      )}
      role="dialog"
      aria-label="Ask AI assistant"
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-brand-soft/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <p className="text-[13.5px] font-semibold leading-tight">Ask AI</p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              General chat · documentation RAG · live catalog
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setRememberChats((enabled) => !enabled)}
          title={rememberChats ? "Conversation history is saved on this device. Click to turn off and clear it." : "Turn on local conversation history for this device."}
          aria-label={rememberChats ? "Turn off local chat memory" : "Turn on local chat memory"}
          className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors", rememberChats ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted")}
        >
          <BrainCircuit className="h-3.5 w-3.5" />
          {rememberChats ? "Memory on" : "Memory off"}
        </button>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} disabled={busy} aria-label="Clear conversation" title="Clear this conversation and any locally saved history" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Close assistant"
          onClick={() => setAssistant(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Ask me anything. I can chat normally, explain LiteSPM using its documentation, or search and compare real catalog listings when you need something to install.
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-border/60 bg-card px-3 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div key={i} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5",
                message.role === "user"
                  ? "bg-brand text-brand-foreground"
                  : "border border-border/60 bg-card",
              )}
            >
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.content}</p>
              ) : (
                <>
                  {message.content.length === 0 && message.streaming ? (
                    <div className="flex items-center gap-1.5 py-1" aria-label="The assistant is thinking">
                      <span className="h-1.5 w-1.5 animate-bounce motion-reduce:animate-none rounded-full bg-brand [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce motion-reduce:animate-none rounded-full bg-brand [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce motion-reduce:animate-none rounded-full bg-brand [animation-delay:300ms]" />
                    </div>
                  ) : (
                    <div>
                      <RichAnswer
                        text={message.content}
                        onOpenLink={(href) => {
                          navigate(href);
                          setAssistant(false);
                        }}
                      />
                      {message.streaming && (
                        <span
                          className="ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] animate-pulse motion-reduce:animate-none rounded-[1px] bg-brand"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  )}
                  {message.streamError && (
                    <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                      {message.streamError}
                    </p>
                  )}
                </>
              )}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      <BookOpen className="h-3 w-3 text-brand" /> Documentation sources
                    </p>
                    {message.meta?.rag && (
                      <span
                        className="rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                        title={`${message.meta.rag.chunks.toLocaleString()} chunks across ${message.meta.rag.sources} sources · ${message.meta.rag.embeddedChunks.toLocaleString()} semantic embeddings`}
                      >
                        {message.meta.rag.mode === "hybrid-semantic" ? "Semantic hybrid" : "Lexical + local vectors"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {message.sources.slice(0, 6).map((source) => (
                      <span key={source.id} title={`${source.section} · lines ${source.startLine}-${source.endLine}`} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/70 bg-muted/50 px-2 py-1 text-[10.5px] text-muted-foreground">
                        <span className="font-semibold text-brand">{source.id}</span>
                        <span className="truncate">{source.source}</span>
                        <span className="shrink-0 opacity-70">L{source.startLine}–{source.endLine}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {message.citations && message.citations.length > 0 && !message.content.includes('"type": "package_cards"') && (
                <div className="mt-3 border-t border-border/60 pt-2.5">
                  <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    <Package className="h-3 w-3 text-brand" /> Referenced packages:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {message.citations.slice(0, 8).map((c) => (
                      <button
                        key={c.linkKey}
                        type="button"
                        onClick={() => {
                          navigate(`#/package/${encodeURIComponent(c.linkKey)}`);
                          setAssistant(false);
                        }}
                        title={`${c.publisher}${c.installable ? " — installable" : " — discovery only"}`}
                        className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-lg border border-brand/30 bg-brand-soft/70 px-2.5 py-1 text-[11px] font-medium text-brand transition-all hover:border-brand/60 hover:bg-brand-soft shadow-xs"
                      >
                        <span className="truncate">{c.name}</span>
                        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-70" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && waitingFirstToken && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none text-brand" />
            {statusText ?? "Searching the catalog…"}
          </div>
        )}
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            {error}
          </p>
        )}
      </div>

      <form
        className="border-t border-border/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask anything — chat, docs, packages, code…"
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-border/70 bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-brand/52"
            aria-label="Message"
          />
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? stop : undefined}
            disabled={!busy && !input.trim()}
            aria-label={busy ? "Stop generating" : "Send"}
            title={busy ? "Stop generating" : "Send"}
            className={cn(
              "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40",
              busy ? "border border-border/70 bg-card text-foreground" : "bg-brand text-brand-foreground",
            )}
          >
            {busy ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );

  return createPortal(
    <>
      {panel}
      <button
        type="button"
        onClick={() => setAssistant(!open)}
        aria-label={open ? "Close the Ask AI assistant" : "Open the Ask AI assistant"}
        className={cn(
          "fixed right-3 sm:right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-brand/40 bg-brand px-4 text-[13px] font-semibold text-brand-foreground shadow-lg shadow-brand/20 transition-all hover:opacity-95",
          compareActive ? "bottom-20 sm:bottom-4" : "bottom-3 sm:bottom-4",
          open && "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Ask AI
        {messages.length === 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-brand-foreground opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-brand-foreground" />
          </span>
        )}
      </button>
      {!open && messages.length > 0 && (
        <span
          className={cn(
            "fixed right-[3.4rem] z-40 flex h-2.5 w-2.5",
            compareActive ? "bottom-[5.8rem] sm:bottom-[4.3rem]" : "bottom-[4.3rem]"
          )}
          aria-hidden="true"
        >
          <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
      )}
      <span className="sr-only">
        <MessageCircle />
      </span>
    </>,
    document.body,
  );
}
