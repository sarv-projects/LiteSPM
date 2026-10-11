"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Header } from "../../../components/navigation/Header";
import { SiteFooter } from "../../../components/layout/SiteFooter";
import { CopyButton } from "../../../components/package/CopyButton";
import { formatCount } from "../../../lib/format";

/**
 * One host, end to end. Every prop is a fact derived on the server from
 * `lib/hosts.ts`, `lib/hostNotes.ts`, `SKILL_TARGETS` or the catalog snapshot
 * — nothing here is inferred, and a host with no note renders registry facts
 * and the verified configuration documentation instead of prose this
 * repository cannot source.
 *
 * The memorable block is the file card: the real path as its heading, the
 * real bridge entry as its body, copyable, with the one sentence that says
 * what LiteSPM touches.
 */
export interface AgentDetailViewProps {
  /** Registry id — also the static param and the CLI argument. */
  id: string;
  /** Registry display name: the `<h1>` and the string Explore filters by. */
  name: string;
  /** How the host is run: a note's `interface`, or the plain default. */
  interfaceLabel: string;
  /** The product's own site. Present only when this repo holds a note. */
  website?: string;
  /** One sourced sentence from `hostNotes.ts`. */
  summary?: string;
  /** Where that sentence was read, so a reviewer can check it. */
  source?: string;
  /** The configuration file LiteSPM writes, home directory shown as `~`. */
  filePath: string;
  /** The single bridge entry this host receives, ready to paste. */
  snippet: string;
  /** Config format from the adapter registry. */
  format: "json" | "toml";
  /** Project config path relative to the repo root, when the adapter has one. */
  projectPath?: string;
  /** True when `SKILL_TARGETS` registers a skills directory for this host. */
  skillsSupported: boolean;
  /** Catalog entries that install into `name` — what the Explore link shows. */
  count: number;
  /** Vendor MCP configuration docs; carries the no-note fallback link. */
  docsUrl?: string;
}

export default function AgentDetailView({
  id,
  name,
  interfaceLabel,
  website,
  summary,
  source,
  filePath,
  snippet,
  format,
  projectPath,
  skillsSupported,
  count,
  docsUrl,
}: AgentDetailViewProps) {
  const command = `litespm host setup ${id}`;
  const exploreHref = `/explore/?host=${encodeURIComponent(name)}`;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ ["--stack-top" as string]: "var(--site-header-height)" }}
    >
      <Header />

      <main id="main" className="shell flex-1 pb-16 pt-8">
        <Link
          href="/agents/"
          className="touch-link gap-1.5 text-[12.5px] text-ink-2 transition-colors duration-hover hover:text-accent-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All agent hosts
        </Link>

        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
          {name}
        </h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          <span>{interfaceLabel}</span>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="link break-all"
            >
              {website}
            </a>
          )}
        </p>

        {summary && source ? (
          <>
            <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-ink-2">
              {summary}
            </p>
            <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-ink-3">
              The description above comes from{" "}
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="link break-all"
              >
                {source}
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 max-w-prose text-[14px] leading-relaxed text-ink-2">
              This repository documents the configuration LiteSPM writes for
              this host, not the product itself.
            </p>
            {docsUrl && (
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-3">
                The adapter registry cites the{" "}
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  configuration documentation
                </a>{" "}
                this adapter was verified against.
              </p>
            )}
          </>
        )}

        {/* ---- the file card --------------------------------------------- */}
        <section className="mt-10" aria-labelledby="agent-file-title">
          <div className="section-head">
            <h2 id="agent-file-title">Config file</h2>
            <span className="section-note">one bridge entry</span>
          </div>

          <div className="mt-4 overflow-hidden rounded-card border border-rule bg-surface shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-rule bg-sunken px-3 py-2">
              <span
                className="t-mono min-w-0 truncate text-[12px] text-ink-2"
                title={filePath}
              >
                {filePath}
              </span>
              <CopyButton
                text={snippet}
                label="Copy the bridge entry"
                message="Bridge entry copied"
              />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap p-3.5 font-mono text-[12px] leading-relaxed text-ink">
              {snippet}
            </pre>
          </div>

          <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
            This is the only file LiteSPM changes.
          </p>
        </section>

        {/* ---- one command ----------------------------------------------- */}
        <section className="mt-9" aria-labelledby="agent-command-title">
          <div className="section-head">
            <h2 id="agent-command-title">One command</h2>
            <span className="section-note">writes the same entry</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-rule bg-sunken px-3 py-2.5">
            <code className="t-mono min-w-0 break-all text-[13px] text-ink">
              {command}
            </code>
            <CopyButton
              text={command}
              label="Copy the host setup command"
              message="Command copied"
            />
          </div>
        </section>

        {/* ---- facts ------------------------------------------------------ */}
        <section className="mt-9" aria-labelledby="agent-facts-title">
          <div className="section-head">
            <h2 id="agent-facts-title">Facts</h2>
            <span className="section-note">from the adapter registry</span>
          </div>

          <dl className="spec-list mt-2">
            <div>
              <dt>Config format</dt>
              <dd>{format === "toml" ? "TOML" : "JSON"}</dd>
            </div>
            <div>
              <dt>Project scope</dt>
              <dd>
                {projectPath ? (
                  <>
                    Writes into this project too:{" "}
                    <code className="t-mono text-[12.5px]">{projectPath}</code>
                  </>
                ) : (
                  "User-wide only."
                )}
              </dd>
            </div>
            <div>
              <dt>Skills support</dt>
              <dd>
                {skillsSupported
                  ? "This host has a registered skills directory, and LiteSPM installs skills into it."
                  : "This host has no registered skills directory, so LiteSPM does not install skills into it."}
              </dd>
            </div>
          </dl>
        </section>

        {/* ---- what works with it ----------------------------------------- */}
        <section className="mt-9" aria-labelledby="agent-works-title">
          <div className="section-head">
            <h2 id="agent-works-title">What works with it</h2>
            <span className="section-note">current catalog snapshot</span>
          </div>

          <p className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="t-cond t-tabular text-[26px] font-semibold leading-none text-ink">
              {formatCount(count)}
            </span>
            <span className="max-w-prose text-[14px] leading-relaxed text-ink-2">
              catalog entries install into {name}.
            </span>
          </p>

          <div className="mt-4">
            <Link href={exploreHref} className="btn">
              Browse them in Explore
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ---- honest limits ---------------------------------------------- */}
        <section className="mt-9" aria-labelledby="agent-limits-title">
          <div className="section-head">
            <h2 id="agent-limits-title">Honest limits</h2>
            <span className="section-note">what this page does not claim</span>
          </div>

          <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
            This page claims only what this repository records: the
            configuration file LiteSPM changes, the command that changes it,
            and counts from the current catalog snapshot. It does not claim
            operating-system support, popularity, ratings, or which host is
            best, because this repository does not hold those facts.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
