"use client";

import React, { useEffect, useState } from "react";

/**
 * The one health check this site can honestly make.
 *
 * A static export has no server to ask, so there is no uptime figure to
 * publish. What there *is* is a file the origin serves: the catalog pointer
 * at `/v1/current.json`, which names the release the origin is serving. This
 * component asks for it once, from the reader&rsquo;s own browser, and reports
 * exactly what that one request did.
 *
 * What it deliberately does not do:
 *
 *   * it does not turn one successful request into an uptime percentage;
 *   * it does not keep a history, and it does not compare against a previous
 *     run — there is nothing to compare against, because nothing is stored;
 *   * it does not say the site is &ldquo;operational&rdquo;. One request from
 *     one browser at one moment is a sample, and it is labelled as one.
 *
 * The check is the same one the CLI makes: `litespm catalog sync` fetches this
 * pointer, verifies it and the manifest it names, and refuses to index a chunk
 * whose digest does not match.
 */
type Result =
  | { state: "pending" }
  | { state: "ok"; ms: number; releaseId: string | null; itemCount: number | null }
  | { state: "failed"; reason: string };

export function HealthProbe() {
  const [result, setResult] = useState<Result>({ state: "pending" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    const started = Date.now();

    fetch("/v1/current.json", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`the origin answered ${response.status}`);
        }
        const body = (await response.json()) as { releaseId?: unknown; itemCount?: unknown };
        if (cancelled) return;
        setResult({
          state: "ok",
          ms: Date.now() - started,
          releaseId: typeof body.releaseId === "string" ? body.releaseId : null,
          itemCount: typeof body.itemCount === "number" ? body.itemCount : null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          state: "failed",
          reason: error instanceof Error && error.message ? error.message : "the request did not finish",
        });
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <p className="min-h-[3.2em] text-[13px] leading-relaxed text-ink-2" role="status">
      {result.state === "pending" && (
        <>
          <span className="t-mono text-[11px] uppercase tracking-wider text-ink-3">
            One check, from this browser
          </span>
          <br />
          Asking the origin for the catalog pointer…
        </>
      )}
      {result.state === "ok" && (
        <>
          <span className="t-mono text-[11px] uppercase tracking-wider text-ink-3">
            One check, from this browser
          </span>
          <br />
          The catalog pointer at <code className="t-mono text-ink">/v1/current.json</code> answered{" "}
          <code className="t-mono text-ink">200 OK</code> in {result.ms} ms
          {result.releaseId ? (
            <>
              {" "}
              and names the release <code className="t-mono text-ink">{result.releaseId}</code>
              {typeof result.itemCount === "number" ? ` (${result.itemCount.toLocaleString()} entries)` : ""}
            </>
          ) : null}
          . That is one request from one browser at one moment. It is not an uptime figure.
        </>
      )}
      {result.state === "failed" && (
        <>
          <span className="t-mono text-[11px] uppercase tracking-wider text-ink-3">
            One check, from this browser
          </span>
          <br />
          The catalog pointer at <code className="t-mono text-ink">/v1/current.json</code> did not
          answer: {result.reason}. You are still reading these pages — a failed pointer is not a
          failed site.
        </>
      )}
    </p>
  );
}
