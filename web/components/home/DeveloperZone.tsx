"use client";

import React from "react";
import Link from "next/link";
import { Check, Copy, Github } from "lucide-react";
import { copyText } from "../../lib/clipboard";
import { ARCHITECTURE_URL, DOCS_URL, REPO_URL } from "../../lib/site";

/**
 * Developer zone — and the `#install` anchor the header's Install button and
 * the hero's "Install instructions" both point at.
 *
 * Every snippet is a command `cmd/litespm/main.go` dispatches today:
 * `version`, `setup`, `doctor`, `search`, `install`, `install remove`,
 * `restore`, `grant`, `approve`, `catalog`, `daemon`, `bridge`, `host`,
 * `uninstall`, `agent`, `skills`, `capabilities`, `invoke`, `help`.
 * `litespm list`, `litespm copy` and `litespm sync` are backlog rows
 * (`LPSM-J010`, `LPSM-J011`), so they are not advertised here.
 */
/**
 * Delete this the moment `v0.4.1` ships; it is deliberately one line to remove.
 *
 * `npm install -g litespm` installs the published `0.4.0`, which fails
 * `catalog sync` with `manifest missing listings.json entry` — the tag was cut
 * 2h29m before the shard-aware client landed, so search, install and
 * `/marketplace` are all unavailable with it. A build from `main` works.
 *
 * Advertising a command that does not work is the one thing this site must not
 * do, and it is the first thing a visitor reads. STATUS.md §2 carries the
 * provenance; CURRENT_RUN.md carries the re-tag procedure.
 */
const NPM_INSTALL_CAVEAT =
  "Published 0.4.0 cannot read the published catalog yet — a fix is prepared and awaiting re-tag.";

const SNIPPETS: Array<{ cmd: string; note: string }> = [
  { cmd: "npm install -g litespm", note: "Install the CLI (npm wrapper around the native binary)" },
  { cmd: "litespm setup", note: "Interactive wizard: pick a host, merge one bridge entry safely" },
  { cmd: "litespm search github", note: "Search the locally synced catalog index" },
  { cmd: "litespm install <id>", note: "Plan, approve, and install into a host's config" },
  { cmd: "litespm doctor", note: "Environment check: daemon, bridge, adapters, vault" },
];

const FEATURES: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "Everything stays on your machine",
    body: (
      <>
        No account, no analytics, no install telemetry. Your configs, your catalog and your history
        are files on your disk, and nowhere else.
      </>
    ),
  },
  {
    title: "You can see where it came from",
    body: (
      <>
        Every install records the source it came from, and the catalog is checked against a
        signature every time it updates.
      </>
    ),
  },
  {
    title: "Undo, exactly",
    body: (
      <>
        <code className="t-mono">litespm restore</code> puts a config file back exactly as it was
        before we touched it.
      </>
    ),
  },
  {
    title: "It only touches its own line",
    body: (
      <>
        Your other servers, your comments and your formatting survive. We add, replace or remove the
        one entry we own — nothing else in the file.
      </>
    ),
  },
  {
    title: "Locks that hold in CI",
    body: (
      <>
        Pin what you resolved to <code className="t-mono">litespm.lock</code>, commit it, and let CI
        fail if anything drifted underneath you.
      </>
    ),
  },
];

function Snippet({ cmd, note }: { cmd: string; note: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    const ok = await copyText(cmd, `${cmd} copied`);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    // A <div>, never an <li>: the caller already owns the list item, and a
    // nested <li> is invalid HTML — the parser would close the outer item and
    // React would then hydrate against a tree the browser had reshaped.
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <code className="t-mono block truncate text-[13px] text-ink">
          <span className="text-ink-3" aria-hidden="true">
            $&nbsp;
          </span>
          {cmd}
        </code>
        <p className="text-[12px] text-ink-3">{note}</p>
        {/*
          Only on the install snippet, and only while the published package
          cannot read the published catalog. The note above describes what the
          command is meant to do; this says whether it currently does it, which
          is a different and more urgent fact for someone about to paste it.
        */}
        {cmd.startsWith("npm install") && NPM_INSTALL_CAVEAT ? (
          <p className="text-[12px] text-ink">{NPM_INSTALL_CAVEAT}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy: ${cmd}`}
        className="btn shrink-0 self-start sm:self-auto"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

export function DeveloperZone() {
  return (
    <section id="install" className="shell band scroll-mt-16" aria-labelledby="dev-title">
      <div className="rounded-card border border-rule bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">For developers</p>
            <h2 id="dev-title" className="band-title mt-2">
              Built for developers too.
            </h2>
            <p className="band-sub">
              The website is one surface. The CLI is where installs, approvals, restores and
              diagnostics actually happen.
            </p>
          </div>
        </div>

        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {SNIPPETS.map((s) => (
            <li
              key={s.cmd}
              className="rounded-panel border border-rule bg-sunken px-4 py-3"
            >
              <Snippet cmd={s.cmd} note={s.note} />
            </li>
          ))}
        </ul>

        <div className="mt-8 grid gap-x-8 gap-y-4 border-t border-rule pt-6 md:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <h3 className="text-[14px] font-semibold tracking-tight text-ink">{feature.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{feature.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-rule pt-5">
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="btn">
            Read the docs
          </a>
          <a href={ARCHITECTURE_URL} target="_blank" rel="noopener noreferrer" className="btn">
            View architecture
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn">
            <Github className="h-3.5 w-3.5" aria-hidden="true" />
            GitHub
          </a>
          <Link href="/explore/" className="touch-link ml-auto text-[13px] text-ink-2 hover:text-accent-text hover:underline">
            Or just browse the catalog →
          </Link>
        </div>
      </div>
    </section>
  );
}
