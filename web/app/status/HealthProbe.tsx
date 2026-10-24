"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, RotateCw } from "lucide-react";

type Result = "checking" | "available" | "unavailable";

export function HealthProbe() {
  const [result, setResult] = useState<Result>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);

    fetch("/v1/current.json", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("unavailable");
        if (!cancelled) setResult("available");
      })
      .catch(() => {
        if (!cancelled) setResult("unavailable");
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [attempt]);

  const retry = () => {
    setResult("checking");
    setAttempt((value) => value + 1);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p role="status" aria-live="polite" className="flex min-h-10 items-center gap-3 text-[14px] text-ink-2">
        {result === "checking" ? (
          <>
            <LoaderCircle className="h-5 w-5 animate-spin text-accent-text" aria-hidden="true" />
            Checking catalog availability…
          </>
        ) : result === "available" ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-accent-text" aria-hidden="true" />
            <span><strong className="font-semibold text-ink">Catalog available.</strong> You can browse package details and setup paths.</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-5 w-5 text-ink-2" aria-hidden="true" />
            <span><strong className="font-semibold text-ink">Catalog temporarily unavailable.</strong> Try again shortly.</span>
          </>
        )}
      </p>
      {result !== "checking" && (
        <button type="button" onClick={retry} className="btn min-h-10">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Check again
        </button>
      )}
    </div>
  );
}
