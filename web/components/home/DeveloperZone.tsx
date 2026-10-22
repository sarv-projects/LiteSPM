"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Github } from "lucide-react";
import { copyText } from "../../lib/clipboard";
import { ARCHITECTURE_URL, DOCS_URL, REPO_URL } from "../../lib/site";

/**
 * The get-started band — and the `#install` anchor the header's install button
 * and the hero's calls to action both point at.
 *
 * Every snippet is a command `cmd/litespm/main.go` dispatches today:
 * `version`, `setup`, `doctor`, `search`, `install`, `install remove`,
 * `restore`, `grant`, `approve`, `catalog`, `daemon`, `bridge`, `host`,
 * `uninstall`, `agent`, `skills`, `capabilities`, `invoke`, `help`.
 * The panel is the workflow a new reader follows, in order — set up, sync,
 * install, check — so `litespm list` and `litespm copy` are not in it (both
 * exist; the manage step prints `litespm list`). There is no top-level
 * `litespm sync`: syncing is `litespm catalog sync`, which is the line above.
 *
 * The five benefits that used to sit at the bottom of this panel are now their
 * own section, one screen earlier, under "Why LiteSPM" — a reader who is
 * already past the commands is not deciding anything, and the reasons to use
 * the tool belong before the commands.
 */
const SNIPPETS: Array<{ cmd: string; note: string }> = [
  // No `npm install -g litespm` here: this list moved to /get-started, and
  // that page's step one already teaches the install with its own copy
  // button. Two identical copy buttons for one command on one page is the
  // duplication the landing page was decluttered for.
  { cmd: "litespm setup", note: "Detect your agents, preview the change, approve it" },
  { cmd: "litespm catalog sync", note: "Download the capability catalog" },
  { cmd: "litespm install <id>", note: "Install an eligible package from its exact catalog ID" },
  { cmd: "litespm doctor", note: "Check installation status and common setup issues" },
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
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : `Copy: ${cmd}`}
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
            <p className="kicker">Get started</p>
            <h2 id="dev-title" className="band-title mt-2">
              Install and manage from the terminal
            </h2>
            <p className="band-sub">
              Install LiteSPM from your terminal, connect a supported agent, and start adding
              capabilities from the marketplace. First-time catalog installation requires a sync.
            </p>
          </div>
          <Link href="/get-started/" className="btn btn-solid btn-lg">
            Step-by-step setup
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SNIPPETS.map((s) => (
            <li
              key={s.cmd}
              className="rounded-panel border border-rule bg-sunken px-4 py-3"
            >
              <Snippet cmd={s.cmd} note={s.note} />
            </li>
          ))}
        </ul>

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
