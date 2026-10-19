"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Header } from "../../../components/navigation/Header";
import { SiteFooter } from "../../../components/layout/SiteFooter";
import { CopyButton } from "../../../components/package/CopyButton";
import { AgentLogo } from "../../../components/AgentLogo";
import type { DiscontinuedHost } from "../../../lib/lifecycle";
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
  /**
   * What the page calls the agent: the vendor's own name when `hostNotes.ts`
   * records that the registry row is wrong, otherwise the registry name.
   */
  name: string;
  /**
   * The registry row's own string, always shown alongside `name` when the two
   * differ — this is what Explore's host filter matches on, so a reader who
   * arrived searching for the old name can see it was not a wrong turn.
   */
  registryName: string;
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
  /**
   * True when the host takes skills and has no MCP configuration adapter.
   *
   * Twenty-nine of the seventy-nine hosts the catalog names are like this:
   * LiteSPM installs agent skills into them and writes no configuration file
   * for them. Their page says that, instead of showing a config file and a
   * bridge entry the host does not have.
   */
  skillsOnly?: boolean;
  /** Project config path relative to the repo root, when the adapter has one. */
  repoConfigPath?: string;
  /** True when `SKILL_TARGETS` registers a skills directory for this host. */
  skillsSupported: boolean;
  /** Catalog entries that install into `name` — what the Explore link shows. */
  count: number;
  /** Vendor MCP configuration docs; carries the no-note fallback link. */
  docsHref?: string;
  /** What the agent does, from its own documentation (web/lib/hostNotes.ts). */
  capabilities?: string[];
  /**
   * Set only when this vendor has ended the product. Renders a notice at the
   * top of the page so an inbound link tells the reader the truth instead of
   * presenting a discontinued agent as current.
   */
  discontinued?: DiscontinuedHost;
}

/** "https://cursor.com/docs" → "cursor.com": a link that reads like a link
 *  rather than a URL the reader has to parse. Falls back to the raw string for
 *  anything that is not a URL. */
function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function AgentDetailView({
  id,
  name,
  registryName,
  interfaceLabel,
  website,
  summary,
  source,
  filePath,
  snippet,
  format,
  repoConfigPath,
  skillsSupported,
  skillsOnly = false,
  count,
  docsHref,
  capabilities,
  discontinued,
}: AgentDetailViewProps) {
  const command = skillsOnly ? "litespm skills add <source>" : `litespm host setup ${id}`;
  // Explore resolves every spelling of a host to one identity, and the page's
  // own name is one of them, so the link opens exactly the count above it.
  const exploreHref = `/explore/?host=${encodeURIComponent(name)}`;
  const nameDiffers = name !== registryName;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ ["--stack-top" as string]: "var(--site-header-height)" }}
    >
      <Header />

      <main id="main" tabIndex={-1} className="shell flex-1 pb-16 pt-8">
        {/* Two columns: what the agent is on the left, what LiteSPM can say
            about it on the right. A single left-aligned column left the top
            half of this page empty, which is what made it read as a stub. */}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-10">
          <div>
        <Link
          href="/agents/"
          className="touch-link gap-1.5 text-[12.5px] text-ink-2 transition-colors duration-hover hover:text-accent-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All agent hosts
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <AgentLogo id={id} name={name} size={44} />
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
            {name}
          </h1>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          <span>{interfaceLabel}</span>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              {websiteLabel(website)}
            </a>
          )}
          {nameDiffers && (
            // The vendor renamed, or our registry row predates their current
            // spelling. Saying so keeps the Explore link below (which still
            // keys on the registry string) from looking like a mislink.
            <span className="text-ink-3">
              listed in LiteSPM as <span className="t-mono text-ink-2">{registryName}</span>
            </span>
          )}
        </p>

        {discontinued && (
          /* Left-ruled block, matching `HeroSection`'s emphasis treatment —
             the palette has no warning token, and inventing one for a single
             callout would be a new design language for one component. */
          <div
            role="note"
            className="mt-5 border-l-2 border-ink bg-sunken px-4 py-3"
          >
            <p className="kicker text-ink-3">Discontinued</p>
            <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-ink-2">
              {discontinued.notice}
            </p>
            <a
              href={discontinued.source}
              target="_blank"
              rel="noopener noreferrer"
              className="link mt-1.5 inline-block text-[12.5px]"
            >
              Read the vendor&rsquo;s notice
            </a>
          </div>
        )}

        {summary ? (
          <p className="mt-5 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">{summary}</p>
        ) : skillsOnly ? (
          /* A host with no MCP configuration adapter. It is not a lesser
             entry: it is a host LiteSPM installs skills into, and the page
             says exactly that instead of describing a config file it does
             not have. */
          <p className="mt-5 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
            LiteSPM installs agent skills into {name}. It has no MCP configuration file, so
            there is no bridge entry to write — what LiteSPM does here is put a{" "}
            <code className="t-mono text-[13px]">SKILL.md</code> in the host&rsquo;s skills
            directory.
          </p>
        ) : (
          <p className="mt-5 max-w-prose text-[14px] leading-relaxed text-ink-2">
            No write-up for {name} yet — what&rsquo;s below is the setup LiteSPM uses
            {docsHref && (
              <>
                , checked against{" "}
                <a
                  href={docsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  its configuration docs
                </a>
              </>
            )}
            : where this agent&rsquo;s config lives, and what LiteSPM puts in it.
          </p>
        )}

        {capabilities && capabilities.length > 0 && (
          <ul className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-card border border-rule bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-ink-2"
              >
                {capability}
              </li>
            ))}
          </ul>
        )}

        {summary && source && (
          <p className="mt-3 max-w-prose text-[12px] leading-relaxed text-ink-3">
            The summary and capabilities above were read from{" "}
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              {websiteLabel(source)}
            </a>
            .
          </p>
        )}

        {/* ---- the file card --------------------------------------------- */}
        </div>

        <aside className="rounded-card border border-rule bg-surface p-4 lg:sticky lg:top-20">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">
            What LiteSPM does here
          </h2>
          <dl className="spec-list mt-2">
            {/*
                A skills-only host has no config file, no format and no
                project config — printing them empty would be three rows of
                "—", which reads as "we do not know" rather than "there is
                no such thing here".
            */}
            {!skillsOnly && (
              <div>
                <dt>Config file</dt>
                <dd>
                  <code className="t-mono text-[11.5px] break-all">{filePath}</code>
                </dd>
              </div>
            )}
            {!skillsOnly && (
              <div>
                <dt>Format</dt>
                <dd>{format === "toml" ? "TOML" : "JSON"}</dd>
              </div>
            )}
            {!skillsOnly && (
              <div>
                <dt>Project config</dt>
                <dd>
                  {repoConfigPath ? (
                    <code className="t-mono text-[11.5px] break-all">{repoConfigPath}</code>
                  ) : (
                    "No — one config for the whole machine."
                  )}
                </dd>
              </div>
            )}
            {skillsOnly && (
              <div>
                <dt>MCP config</dt>
                <dd>None — LiteSPM writes no config file for this host.</dd>
              </div>
            )}
            <div>
              <dt>Skills</dt>
              <dd>
                {skillsSupported
                  ? "Installed into this host."
                  : "Not this host — it has no skills directory."}
              </dd>
            </div>
            <div>
              <dt>Works with</dt>
              <dd>
                <span className="t-cond t-tabular text-[15px] font-semibold text-ink">
                  {formatCount(count)}
                </span>{" "}
                catalog entries
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <Link href={exploreHref} className="btn w-full justify-center">
              Browse them
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </aside>
        </div>

        {skillsOnly ? (
          /* A host with no configuration file: there is no file card to
             show, and a card with an empty body would be a card about
             nothing. The section states the one thing that is true. */
          <section className="mt-10" aria-labelledby="agent-skills-title">
            <div className="section-head">
              <h2 id="agent-skills-title">Skills</h2>
              <span className="section-note">a directory, not a config</span>
            </div>

            <div className="mt-4 rounded-card border border-rule bg-surface p-3.5">
              <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
                LiteSPM installs a skill into {name} by writing its{" "}
                <code className="t-mono text-[12px]">SKILL.md</code> into the host&rsquo;s skills
                directory. It records every file it wrote, so the install can be undone.
              </p>
            </div>
          </section>
        ) : (
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
        )}

        {/* ---- one command ----------------------------------------------- */}
        <section className="mt-9" aria-labelledby="agent-command-title">
          <div className="section-head">
            <h2 id="agent-command-title">One command</h2>
            <span className="section-note">
              {skillsOnly ? "installs a skill here" : "writes the same entry"}
            </span>
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

          {skillsOnly && (
            <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
              There is no setup command for this host: LiteSPM has no configuration file to
              write for it. A skill install writes into every skills directory LiteSPM finds on
              your machine, this one included.
            </p>
          )}
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
            <span className="max-w-prose text-[13px] leading-relaxed text-ink-2">
              catalog entries declare compatibility with {name}.
            </span>
          </p>

          <div className="mt-4">
            <Link href={exploreHref} className="btn">
              Browse them in Explore
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {/* This caveat used to be its own "Honest limits" section: five
              lines of what the page does *not* claim, standing alone right
              before the footer. The footer's long form is gone and one line
              here does the same job next to the number it qualifies. */}
          <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
            No source publishes operating-system support, popularity or ratings for this host.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
