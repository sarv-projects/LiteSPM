"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
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
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useApp, exploreHash } from "@/lib/litespm/router";
import { useWatchlist } from "@/lib/litespm/hooks";
import { displayPackageName } from "@/lib/litespm/format";
import type { AssistantCitation, AssistantMeta, CompareColumn, PackageDetailData } from "@/lib/litespm/types";
import { AvailabilityBadge, KindBadge } from "./primitives";
import { InstallBar } from "./install-bar";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: AssistantCitation[];
  meta?: AssistantMeta;
  /** Set while tokens are still arriving for this bubble. */
  streaming?: boolean;
  /** Set when the stream broke after a partial answer. */
  streamError?: string;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; answer: string; citations?: AssistantCitation[]; meta?: AssistantMeta }
  | { type: "error"; message: string };

const SUGGESTIONS = [
  "What can LiteSPM install for working with Postgres?",
  "I want my agent to browse the web — what should I install?",
  "Which skills help with PDF documents?",
  "How do I set up LiteSPM with Claude Code?",
];

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
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
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
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
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
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => setMounted(true), []);

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
      const history = [...messages, { role: "user" as const, content: question }];
      setMessages(history);
      setBusy(true);
      setWaitingFirstToken(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let hasReceivedFirstToken = false;
      // 8-second timeout guard: aborts stalled remote LLM stream and triggers instant catalog search fallback
      const timeoutId = setTimeout(() => {
        if (!hasReceivedFirstToken) {
          controller.abort("TIMEOUT");
        }
      }, 8000);

      const appendStreamBubble = () => {
        hasReceivedFirstToken = true;
        clearTimeout(timeoutId);
        setWaitingFirstToken(false);
        setMessages((prev) => [...prev, { role: "assistant" as const, content: "", streaming: true }]);
      };

      const handleEvent = (event: StreamEvent) => {
        hasReceivedFirstToken = true;
        clearTimeout(timeoutId);
        if (event.type === "delta") {
          patchLast((m) => ({ content: m.content + event.text }));
        } else if (event.type === "done") {
          patchLast({
            content: event.answer,
            citations: event.citations,
            meta: event.meta,
            streaming: false,
          });
        } else if (event.type === "error") {
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
            messages: history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
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
            meta?: AssistantMeta;
            error?: string;
          };
          if (!data.answer) {
            setError(data.error ?? "The assistant is unavailable right now.");
            return;
          }
          setMessages([
            ...history,
            { role: "assistant", content: data.answer, citations: data.citations, meta: data.meta },
          ]);
          return;
        }

        appendStreamBubble();
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
          // If aborted before receiving any tokens, fall back instantly to catalog search
          if (!hasReceivedFirstToken) {
            try {
              const fallbackRes = await fetch(`/api/litespm/list?q=${encodeURIComponent(question)}&pageSize=4`);
              if (fallbackRes.ok) {
                const searchData = (await fallbackRes.json()) as { items?: Array<{ linkKey: string; name: string }> };
                const items = searchData.items ?? [];
                if (items.length > 0) {
                  const fallbackContent = `Here are the matching capabilities found in the live catalog for **${question}**:\n\n\`\`\`json\n{\n  "type": "package_cards",\n  "keys": ${JSON.stringify(items.slice(0, 4).map((x) => x.linkKey))}\n}\n\`\`\``;
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant",
                      content: fallbackContent,
                      streaming: false,
                    },
                  ]);
                  return;
                }
              }
            } catch {
              /* fallback network error */
            }
            setError("Request timed out — please try again or search the catalog directly.");
          } else {
            // The visitor pressed stop or partial stream ended — keep whatever streamed in
            patchLast({ streaming: false });
          }
        } else {
          setError("Network error — please try again.");
        }
      } finally {
        clearTimeout(timeoutId);
        setBusy(false);
        setWaitingFirstToken(false);
        abortRef.current = null;
      }
    },
    [busy, messages, patchLast],
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
              Grounded in the live catalog
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close assistant"
          onClick={() => setAssistant(false)}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Ask what your agent should install — I search the live catalog and answer with real
              listings.
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
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:300ms]" />
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
                          className="ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] animate-pulse rounded-[1px] bg-brand"
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
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            Searching the catalog…
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
            placeholder="Ask about packages, hosts or setup…"
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-border/70 bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-brand/50"
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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-foreground opacity-60" />
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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
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
