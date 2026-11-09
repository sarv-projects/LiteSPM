"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("LiteSPM global application error", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <main
          role="alert"
          className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Application error
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            LiteSPM could not load.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            An unexpected application error interrupted the page. Try rendering it again or return to the catalog.
          </p>
          {error.digest ? (
            <p className="font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Return to catalog
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
