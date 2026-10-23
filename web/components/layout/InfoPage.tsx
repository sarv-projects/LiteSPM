import React from "react";
import { Header } from "../navigation/Header";
import { SiteFooter } from "./SiteFooter";

/**
 * Shell for the site's static information routes (`/privacy`, `/contact`,
 * `/terms`). They are prose rather than catalog surfaces, so they carry the
 * same furniture as every other route and nothing else: the header, one
 * heading, a measure that stays readable, and the footer.
 *
 * Every page built on this ends with a link to its own source file. That is
 * deliberate rather than decorative: a privacy or terms page is a set of claims
 * about what the software does, and the repository is where a reader can check
 * them. It also gives these pages a truthful date story — they ship with the
 * source and change when it changes, so there is no "last updated" stamp to
 * invent.
 */
export function InfoPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: React.ReactNode;
  /** Repository-relative path of this page, for the source link. */
  sourcePath?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main id="main" tabIndex={-1} className="shell flex-1 pb-16 pt-8">
        <h1 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-ink-2">{lede}</p>

        <div className="mt-9 max-w-[72ch] space-y-9">{children}</div>

      </main>

      <SiteFooter />
    </div>
  );
}

/** One titled block of an information page. */
export function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

/**
 * A labelled list of facts. The label column is mono because it holds names and
 * paths — a storage key, a directory, an environment variable — which are the
 * things a reader copies out of a page like this.
 */
export function Facts({ children }: { children: React.ReactNode }) {
  return (
    <dl className="border-t border-rule">
      {children}
    </dl>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[13rem_1fr] sm:gap-5">
      <dt className="t-mono text-[11px] leading-relaxed text-ink-3">{label}</dt>
      <dd className="text-[14px] leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}
