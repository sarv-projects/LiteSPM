"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("LiteSPM route error", error);
  }, [error]);

  return (
    <main
      role="alert"
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Unexpected error
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        This page hit a snag.
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        The page could not finish rendering. Your saved configuration and installed entries have not been changed.
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
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Return to catalog
        </Link>
      </div>
    </main>
  );
}
