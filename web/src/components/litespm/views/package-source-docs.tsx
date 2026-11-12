"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { ExternalLink, FileText, Github } from "lucide-react";

import type { SourceDocsLocation, SourceDocsResponse } from "@/lib/litespm/source-docs-types";
import { CopyButton } from "../code-block";

/* ------------------------------------------------------------------------- */
/* Data hook                                                                  */
/* ------------------------------------------------------------------------- */

export type SourceDocsState =
  | { status: "loading" }
  | { status: "done"; data: SourceDocsResponse };

/** Fetches the live upstream document after mount so the SSR page stays fast. */
export function useSourceDocs(linkKey: string): SourceDocsState {
  const [state, setState] = React.useState<SourceDocsState>({ status: "loading" });
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/litespm/source/${encodeURIComponent(linkKey)}`)
      .then((r) => r.json() as Promise<SourceDocsResponse>)
      .then((data) => {
        if (!cancelled) setState({ status: "done", data });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "done",
            data: {
              found: false,
              reason: "The source document could not be loaded.",
              fetchedAt: new Date().toISOString(),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [linkKey]);
  return state;
}

/* ------------------------------------------------------------------------- */
/* URL handling                                                               */
/* ------------------------------------------------------------------------- */

const IMAGE_HOSTS = new Set([
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "camo.githubusercontent.com",
]);

function isAllowedImage(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (IMAGE_HOSTS.has(url.hostname)) return true;
  return url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/");
}

function docDir(source: SourceDocsLocation): string {
  return /\.md$/i.test(source.path) ? source.path.split("/").slice(0, -1).join("/") : source.path;
}

function enc(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

/**
 * Resolves a markdown href/src to an absolute URL on github.com (links) or
 * raw.githubusercontent.com (images), or null when it must not be followed.
 * Relative targets are confined to the source repository.
 */
function resolveTarget(
  raw: string,
  source: SourceDocsLocation | undefined,
  sourceUrl: string | undefined,
  image: boolean,
): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("#")) return sourceUrl ? `${sourceUrl}${value}` : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    if (value.startsWith("//")) return null;
    try {
      const u = new URL(value);
      if (u.protocol === "https:") return u.toString();
      if (!image && u.protocol === "mailto:") return u.toString();
    } catch {
      /* fall through */
    }
    return null;
  }
  if (!source) return null;
  const repoPrefix = image
    ? `https://raw.githubusercontent.com/${source.owner}/${source.repo}/`
    : `https://github.com/${source.owner}/${source.repo}/`;
  const root = `${repoPrefix}${image ? "" : "blob/"}${enc(source.ref)}/`;
  const rootRelative = value.startsWith("/");
  const base = rootRelative ? root : `${root}${enc(docDir(source))}${docDir(source) ? "/" : ""}`;
  try {
    const resolved = new URL(rootRelative ? value.replace(/^\/+/, "") : value, base).toString();
    return resolved.startsWith(repoPrefix) ? resolved : null;
  } catch {
    return null;
  }
}

/** github.com/<o>/<r>/blob|raw/<ref>/<path> images are served from raw.githubusercontent.com. */
function githubRawImage(target: string): string {
  try {
    const u = new URL(target);
    if (u.hostname !== "github.com") return target;
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
    if (!m) return target;
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  } catch {
    return target;
  }
}

/** True while rendering the children of a markdown link, so an image never nests a second <a>. */
const InLinkContext = React.createContext(false);

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/* ------------------------------------------------------------------------- */
/* Markdown                                                                   */
/* ------------------------------------------------------------------------- */

function buildComponents(
  source: SourceDocsLocation | undefined,
  sourceUrl: string | undefined,
): Components {
  return {
    h1: ({ children }) => <h3 className="mb-2 mt-5 text-[17px] font-semibold tracking-tight first:mt-0">{children}</h3>,
    h2: ({ children }) => <h4 className="mb-2 mt-5 border-b border-border/50 pb-1 text-[15px] font-semibold first:mt-0">{children}</h4>,
    h3: ({ children }) => <h5 className="mb-1.5 mt-4 text-[14px] font-semibold first:mt-0">{children}</h5>,
    h4: ({ children }) => <h6 className="mb-1.5 mt-3.5 text-[13px] font-semibold first:mt-0">{children}</h6>,
    h5: ({ children }) => <h6 className="mb-1 mt-3 text-[13px] font-semibold">{children}</h6>,
    h6: ({ children }) => <h6 className="mb-1 mt-3 text-[12.5px] font-semibold text-muted-foreground">{children}</h6>,
    p: ({ children }) => <p className="my-2.5 text-[13.5px] leading-relaxed text-foreground/90">{children}</p>,
    ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/90">{children}</ul>,
    ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-foreground/90">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-brand/40 pl-3 text-muted-foreground">{children}</blockquote>
    ),
    hr: () => <hr className="my-5 border-border/60" />,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    a: ({ href, children }) => {
      const target = href ? resolveTarget(href, source, sourceUrl, false) : null;
      if (!target) return <span>{children}</span>;
      return (
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          <InLinkContext.Provider value={true}>{children}</InLinkContext.Provider>
        </a>
      );
    },
    img: ({ src, alt }) => <MarkdownImage src={typeof src === "string" ? src : ""} alt={alt} source={source} sourceUrl={sourceUrl} />,
    pre: ({ children }) => {
      const text = textOf(children).replace(/\n$/, "");
      return (
        <div className="relative my-3">
          <div className="absolute right-2 top-2 z-10">
            <CopyButton value={text} label="Copy" />
          </div>
          <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-3.5 pr-20 font-mono text-[12px] leading-relaxed text-foreground/90 [&_code]:bg-transparent [&_code]:p-0">
            {children}
          </pre>
        </div>
      );
    },
    code: ({ className, children }) => (
      <code
        className={
          className ?? "rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.88em] text-foreground"
        }
      >
        {children}
      </code>
    ),
  };
}

function MarkdownImage({
  src,
  alt,
  source,
  sourceUrl,
}: {
  src: string;
  alt?: string;
  source: SourceDocsLocation | undefined;
  sourceUrl: string | undefined;
}) {
  const inLink = React.useContext(InLinkContext);
  const resolved = resolveTarget(src, source, sourceUrl, true);
  const target = resolved ? githubRawImage(resolved) : null;
  let allowed = false;
  if (target) {
    try {
      allowed = isAllowedImage(new URL(target));
    } catch {
      allowed = false;
    }
  }
  if (target && allowed) {
    return (
      <img
        src={target}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ maxWidth: "100%", height: "auto" }}
        className="my-1 inline-block rounded-md align-middle"
      />
    );
  }
  // Any other image host is not loaded. Inside a link the alt text stands in
  // (the outer link already goes somewhere); elsewhere it becomes a link.
  const label = alt || "image";
  if (inLink) {
    return <span className="mr-1 inline-block rounded border border-border/60 px-1.5 py-0.5 text-[11.5px]">{label}</span>;
  }
  const link = target ?? (src.startsWith("https://") ? src : null);
  if (!link) return <span>{alt}</span>;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-brand underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

/* ------------------------------------------------------------------------- */
/* Section                                                                    */
/* ------------------------------------------------------------------------- */

function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

export function sourceLabel(source: SourceDocsLocation): string {
  return `${source.owner}/${source.repo}@${shortRef(source.ref)}${source.path ? `/${source.path}` : ""}`;
}

const COLLAPSED_PX = 520;

export function SourceDocSection({
  state,
  kind,
  fallbackSourceUrl,
}: {
  state: SourceDocsState;
  kind: "skill" | "mcp" | "plugin";
  fallbackSourceUrl?: string | null;
}) {
  const title = kind === "skill" ? "SKILL.md" : "README";
  const [expanded, setExpanded] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const data = state.status === "done" ? state.data : null;
  const markdown = data?.found ? (data.markdown ?? "") : "";

  const components = React.useMemo(
    () => buildComponents(data?.source, data?.sourceUrl),
    [data?.source, data?.sourceUrl],
  );

  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > COLLAPSED_PX + 40);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [markdown]);

  if (state.status === "loading") {
    return (
      <section className="rounded-2xl border border-border/70 bg-card p-5" aria-busy="true" aria-labelledby="srcdoc-title">
        <h2 id="srcdoc-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <FileText className="h-4 w-4 text-brand" /> {title}
        </h2>
        <div className="mt-4 space-y-2.5" aria-hidden="true">
          <div className="h-4 w-2/5 animate-pulse rounded bg-muted/50" />
          <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted/30" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted/30" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-muted/30" />
        </div>
      </section>
    );
  }

  const d = state.data;
  if (!d.found || !markdown.trim()) {
    const href = d.sourceUrl ?? fallbackSourceUrl ?? null;
    return (
      <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="srcdoc-title">
        <h2 id="srcdoc-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <FileText className="h-4 w-4 text-brand" /> {title}
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          {d.reason ?? `The ${title} could not be loaded from the source.`}
          {href && (
            <>
              {" "}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
              >
                View the source <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5" aria-labelledby="srcdoc-title">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="srcdoc-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <FileText className="h-4 w-4 text-brand" /> {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">Fetched live from GitHub</span>
      </div>
      {d.source && d.sourceUrl && (
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Github className="h-3 w-3 shrink-0" />
          <span className="shrink-0">Source:</span>
          <a
            href={d.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-brand hover:underline"
          >
            <span className="truncate">{sourceLabel(d.source)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </p>
      )}

      <div className="relative mt-4">
        <div
          ref={bodyRef}
          className="min-w-0 [overflow-wrap:anywhere]"
          style={!expanded && overflowing ? { maxHeight: COLLAPSED_PX, overflow: "hidden" } : undefined}
        >
          <ReactMarkdown components={components} urlTransform={(url) => url}>
            {markdown}
          </ReactMarkdown>
        </div>
        {!expanded && overflowing && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card via-card/85 to-transparent"
          />
        )}
      </div>

      {d.truncated && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          This document is longer than the 512 KB preview limit; the rest is on GitHub.
        </p>
      )}

      {overflowing && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-border/70 bg-background px-3.5 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-brand/50 hover:text-brand"
          >
            {expanded ? `Show less` : `Show full ${title}`}
          </button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Helpers shared with the stats card                                         */
/* ------------------------------------------------------------------------- */

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}
