"use client";

import { ArrowUpRight, Github, Heart } from "lucide-react";

import { useApp } from "@/lib/litespm/router";
import { useWatchlist } from "@/lib/litespm/hooks";
import { LogoMark } from "./logo";
import { NavLink } from "./nav-link";

const COLUMNS: Array<{
  title: string;
  links: Array<{ label: string; hash?: string; href?: string }>;
}> = [
  {
    title: "Product",
    links: [
      { label: "Marketplace", hash: "/marketplace" },
      { label: "Bundles", hash: "/bundles" },
      { label: "Installed on this machine", hash: "/marketplace?tab=installed" },
      { label: "Supported agents", hash: "/agents" },
      { label: "Compare packages", hash: "/compare" },
      { label: "Publish a listing", hash: "/publish" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Getting started", hash: "/docs/getting-started" },
      { label: "Command reference", hash: "/docs/commands" },
      { label: "How an install works", hash: "/docs/install-flow" },
      { label: "In-agent marketplace", hash: "/docs/in-agent-marketplace" },
      { label: "Agent compatibility", hash: "/docs/agent-compatibility" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "How we rank and label", hash: "/docs/methodology" },
      { label: "Security model", hash: "/docs/security" },
      { label: "Troubleshooting & FAQ", hash: "/docs/troubleshooting" },
      { label: "Insights dashboard", hash: "/insights" },
      { label: "Architecture notes", href: "https://github.com/sarv-projects/LiteSPM/tree/main/ARCH" },
      { label: "Changelog", href: "https://github.com/sarv-projects/LiteSPM/blob/main/CHANGELOG.md" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub repository", href: "https://github.com/sarv-projects/LiteSPM" },
      { label: "npm package", href: "https://www.npmjs.com/package/litespm" },
      { label: "Report an issue", href: "https://github.com/sarv-projects/LiteSPM/issues" },
      { label: "Apache-2.0 license", href: "https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE" },
    ],
  },
];
export function Footer() {
  const navigate = useApp((s) => s.navigate);
  const { entries } = useWatchlist();

  return (
    <footer className="mt-auto border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="text-brand">
                <LogoMark className="h-5 w-5" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">LiteSPM</span>
            </div>
            <p className="mt-3 max-w-[40ch] text-[12.5px] leading-relaxed text-muted-foreground">
              The package manager for AI agents. Find MCP servers, skills and plugins once, and
              install them into every coding agent you use — with preview, backup and undo.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href="https://github.com/sarv-projects/LiteSPM"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LiteSPM on GitHub"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="https://www.npmjs.com/package/litespm"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LiteSPM on npm (opens in new tab)"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
              >
                npm
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {column.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.hash ? (
                      <NavLink
                        to={link.hash}
                        className="text-left text-[13px] text-muted-foreground transition-colors hover:text-brand"
                      >
                        {link.label}
                      </NavLink>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] text-muted-foreground transition-colors hover:text-brand"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border/50 pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 LiteSPM &middot; Open source &middot; Licensed under Apache-2.0</p>
          <p className="flex items-center gap-1.5">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("/marketplace")}
                className="mr-2 text-brand hover:underline"
              >
                {entries.length} watched
              </button>
            )}
            No account &middot; no telemetry <Heart className="h-3 w-3 text-brand" aria-hidden="true" />
          </p>
        </div>
      </div>
    </footer>
  );
}
