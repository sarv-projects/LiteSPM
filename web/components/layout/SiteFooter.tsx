"use client";

import React from "react";
import Link from "next/link";
import bundledRelease from "../../data/release.json";
import { CountUp } from "../ui/CountUp";

const REPO = "https://github.com/sarv-projects/LiteSPM";

const COUNTS = {
  total: Number(bundledRelease.totalCapabilities ?? bundledRelease.itemCount ?? 0),
  mcp: Number(bundledRelease.mcpServersCount ?? 0),
  skill: Number(bundledRelease.agentSkillsCount ?? 0),
  plugin: Number(bundledRelease.pluginsCount ?? 0),
};
const SNAPSHOT_DATE = String(bundledRelease.createdAt ?? "").slice(0, 10);
const RELEASE_ID = String(bundledRelease.releaseId ?? "");

/**
 * Footer: where this site lives, and what it is.
 *
 * It used to carry a third column explaining the site's own data provenance —
 * how many adapters there are, why no popularity figures appear, what
 * "vendor-listed" means. That text was written as a contract, but placed in the
 * footer of every page it did three unhelpful things: it justified design
 * decisions to readers who never asked, it read as a project describing itself
 * rather than a product, and most of it was already stated where it is actually
 * useful — the badge tooltips and the package page define their own vocabulary,
 * `/agents/` reports the adapter count, and Coverage explains the counts.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule bg-surface">
      <div className="shell grid gap-8 py-10 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <p className="text-[15px] font-semibold text-ink">LiteSPM</p>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
            The package manager for AI agents. Find, install and remove MCP servers,
            skills and plugins across the agents you use — and update the skills you
            installed.
          </p>
        </div>

        <nav aria-labelledby="footer-browse-title">
          <p id="footer-browse-title" className="t-mono text-[11px] font-medium text-ink">
            Browse
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
            <li>
              <Link href="/explore/" className="link touch-link">
                Explore
              </Link>
            </li>
            <li>
              <Link href="/categories/" className="link touch-link">
                Categories
              </Link>
            </li>
            <li>
              <Link href="/agents/" className="link touch-link">
                Agent hosts
              </Link>
            </li>
            <li>
              <Link href="/compare/" className="link touch-link">
                Compare hosts
              </Link>
            </li>
            <li>
              <Link href="/insights/" className="link touch-link">
                Coverage
              </Link>
            </li>
            {/* The one growth lever the site had and did not link: a publisher
                with a server or a skill had to guess that /submit/ existed. */}
            <li>
              <Link href="/submit/" className="link touch-link">
                Submit a listing
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-trust-title">
          <p id="footer-trust-title" className="t-mono text-[11px] font-medium text-ink">
            How it works
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
            <li>
              <Link href="/how-it-works/" className="link touch-link">
                What it does to your machine
              </Link>
            </li>
            <li>
              <Link href="/get-started/" className="link touch-link">
                Get started
              </Link>
            </li>
            <li>
              <Link href="/status/" className="link touch-link">
                Release status
              </Link>
            </li>
            <li>
              <Link href="/security/" className="link touch-link">
                Security
              </Link>
            </li>
            <li>
              <Link href="/submit/" className="link touch-link">
                Submit a listing
              </Link>
            </li>
            <li>
              <Link href="/support/" className="link touch-link">
                Support
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-rule bg-sunken">
        <div className="shell flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-1.5">
              <dd className="t-cond text-[18px] font-semibold leading-none text-ink">
                <CountUp value={COUNTS.total} />
              </dd>
              <dt className="t-mono text-[11px] text-ink-3">capabilities</dt>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dd className="t-cond text-[18px] font-semibold leading-none text-mcp">
                <CountUp value={COUNTS.mcp} />
              </dd>
              <dt className="t-mono text-[11px] text-ink-3">MCP</dt>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dd className="t-cond text-[18px] font-semibold leading-none text-skill">
                <CountUp value={COUNTS.skill} />
              </dd>
              <dt className="t-mono text-[11px] text-ink-3">skills</dt>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dd className="t-cond text-[18px] font-semibold leading-none text-plugin">
                <CountUp value={COUNTS.plugin} />
              </dd>
              <dt className="t-mono text-[11px] text-ink-3">plugins</dt>
            </div>
          </dl>

          <p className="t-mono text-[11px] text-ink-3">
            Catalog snapshot{" "}
            <Link href="/status/" className="link">
              {RELEASE_ID}
            </Link>
            {SNAPSHOT_DATE ? ` · ${SNAPSHOT_DATE}` : ""}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <nav aria-label="Site" className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/privacy/" className="link text-[12px]">
                Privacy
              </Link>
              <Link href="/contact/" className="link text-[12px]">
                Contact
              </Link>
              <Link href="/terms/" className="link text-[12px]">
                Terms
              </Link>
            </nav>
            <p className="t-mono text-[11px] text-ink-3">
              Open source. No analytics, no cookies, no install telemetry.
            </p>
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="btn h-7 text-[11px]!"
            >
              GitHub repository
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
