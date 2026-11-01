"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, Send, Sparkles, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useApp } from "@/lib/litespm/router";
import type { AssistantCitation, AssistantMeta } from "@/lib/litespm/types";

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

/** Render the assistant's markdown-lite answer: bold, code, links, lists. */
function RichAnswer({ text, onOpenLink }: { text: string; onOpenLink: (href: string) => void }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="ml-1 space-y-1.5">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-relaxed">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  <span>{renderInline(line.replace(/^\s*([-*•]|\d+\.)\s+/, ""), onOpenLink)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-relaxed">
            {lines.map((line, j) => (
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

function renderInline(text: string, onOpenLink: (href: string) => void): React.ReactNode[] {
  // Pattern: [label](href) or `code` or **bold**
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = match[2];
      const isInternal = href.startsWith("#/");
      parts.push(
        isInternal ? (
          <button
            key={key++}
            type="button"
            onClick={() => onOpenLink(href)}
            className="font-medium text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
          >
            {match[1]}
          </button>
        ) : (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline decoration-brand/40 underline-offset-2"
          >
            {match[1]}
          </a>
        ),
      );
    } else if (match[3] !== undefined) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[11.5px] text-foreground"
        >
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[4]}
        </strong>,
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

      const appendStreamBubble = () => {
        setWaitingFirstToken(false);
        setMessages((prev) => [...prev, { role: "assistant" as const, content: "", streaming: true }]);
      };

      const handleEvent = (event: StreamEvent) => {
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
        if (controller.signal.aborted) {
          // The visitor pressed stop — keep whatever streamed in.
          patchLast({ streaming: false });
        } else {
          setError("Network error — please try again.");
        }
      } finally {
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
        "fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-2xl transition-all",
        open ? "pointer-events-auto h-[min(600px,calc(100vh-7rem))]" : "pointer-events-none h-0 border-0",
      )}
      role="dialog"
      aria-label="Ask LiteSPM assistant"
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-brand-soft/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <p className="text-[13.5px] font-semibold leading-tight">Ask LiteSPM</p>
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
              {message.citations && message.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
                  {message.citations.slice(0, 6).map((c) => (
                    <button
                      key={c.linkKey}
                      type="button"
                      onClick={() => {
                        navigate(`#/package/${encodeURIComponent(c.linkKey)}`);
                        setAssistant(false);
                      }}
                      title={`${c.publisher}${c.installable ? " — installable" : " — discovery only"}`}
                      className="max-w-[170px] truncate rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {message.meta && (
                <p className="mt-2 text-[10px] leading-none text-muted-foreground/60">
                  {message.meta.cached
                    ? "cached answer · instant"
                    : [
                        `via ${message.meta.provider}${message.meta.keyIndex ? ` · key #${message.meta.keyIndex}` : ""}`,
                        `${(message.meta.tookMs / 1000).toFixed(1)}s`,
                        message.meta.attempts.length > 1
                          ? `${message.meta.attempts.length - 1} failover${message.meta.attempts.length > 2 ? "s" : ""}`
                          : null,
                      ]
                      .filter(Boolean)
                      .join(" · ")}
                </p>
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
        aria-label={open ? "Close the LiteSPM assistant" : "Open the LiteSPM assistant"}
        className={cn(
          "fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-brand/40 bg-brand px-4 text-[13px] font-semibold text-brand-foreground shadow-lg shadow-brand/20 transition-all hover:opacity-95",
          open && "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Ask LiteSPM
        {messages.length === 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-foreground opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-brand-foreground" />
          </span>
        )}
      </button>
      {!open && messages.length > 0 && (
        <span className="fixed bottom-[4.3rem] right-[3.4rem] z-40 flex h-2.5 w-2.5" aria-hidden="true">
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
