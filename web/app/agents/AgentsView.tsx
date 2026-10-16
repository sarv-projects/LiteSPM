"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SquareTerminal, Check } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { AgentLogo } from "../../components/AgentLogo";
import { HOSTS, resolveHost } from "../../lib/hosts";
import { vendorName } from "../../lib/vendorNames";
import { formatCount } from "../../lib/format";
import { AGENT_STORAGE_KEY, findAgentChoice } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";

/**
 * Host coverage is an aggregate: `app/agents/page.tsx` derives it from the
 * full row set at build time. This route never needs the rows themselves and
 * therefore never fetches the dataset.
 */
export interface AgentsViewProps {
  hostCount: number;
  agents: Array<{ name: string; slug: string; count: number }>;
}

export default function AgentsPage({ hostCount, agents }: AgentsViewProps) {
  /**
   * The agent chosen in the home page's "What do you use?" strip, remembered
   * in `localStorage` under the same key Explore reads. This page only marks
   * the row it names — a "your pick" chip, never a filter. The preference is
   * recognition, and silently narrowing a host index would hide the other
   * hosts on the one page whose job is to list them.
   *
   * Read after mount, so the server and the first client render agree; the
   * chip simply appears once the stored choice is known.
   */
  const [savedAgent, setSavedAgent] = useState<AgentChoice | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
      if (stored) setSavedAgent(findAgentChoice(stored));
    } catch {
      /* storage can be unavailable (private mode, policy) */
    }
  }, []);

  /**
   * The one row the remembered choice names. Adapter id first — the row whose
   * config LiteSPM can write is the row a reader means — then the catalog's
   * own host spellings, which is the match Explore uses. "Other" carries no
   * hosts, so it marks nothing.
   */
  const pickedSlug = savedAgent
    ? agents.find((agent) => resolveHost(agent.name)?.id === savedAgent.id)?.slug ??
      agents.find((agent) => savedAgent.hosts.includes(agent.name))?.slug ??
      null
    : null;

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" className="shell flex-1 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Agent hosts</h1>
          <p className="t-mono text-[11px] text-ink-3">
            {formatCount(hostCount)} hosts named · {formatCount(HOSTS.length)} with compiled-in
            adapters
          </p>
        </div>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Compatibility follows from what an entry is: MCP servers install into any host with a
          bridge adapter, skills into any host with a skills directory, and plugins only into the
          hosts their publisher lists. LiteSPM can edit the config of hosts with a compiled-in
          adapter; the others are indexed, not configured.
        </p>

        <div className="mt-7 border-b border-ink pb-2">
          <h2 className="sr-only">Agent hosts, compatible entry counts, and config adapters</h2>
          {/* Column order must match the rendered cell order, which the rows
              set with md:order-2 (adapter) and md:order-3 (compatible count). */}
          <div className="t-mono hidden grid-cols-[minmax(0,1fr)_92px_84px_minmax(0,1fr)] items-center gap-3 text-[10px] text-ink-3 md:grid">
            <span>Host</span>
            <span>Adapter</span>
            <span className="text-right">Compatible</span>
            <span>Config file this host uses</span>
          </div>
        </div>

        <ul>
          {agents.map((agent) => {
            const host = resolveHost(agent.name);
            return (
              <li key={agent.slug}>
                {/* The row is a container, not a link: the name goes to the
                    host's detail page when LiteSPM can edit that host's
                    config, and the count keeps the Explore filter this row
                    already had — two targets, so no nested anchors. */}
                <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-3 transition-colors hover:bg-hover md:grid-cols-[minmax(0,1fr)_92px_84px_minmax(0,1fr)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={
                        host
                          ? `/agents/${host.id}/`
                          : `/explore/?host=${encodeURIComponent(agent.name)}`
                      }
                      // Measured: each scroll-past row is a ~9.5 KB speculative
                      // RSC download, so a full read cost 456,794 B (83%) and a
                      // passive load 173,281 B (66%) in prefetch alone. Next
                      // still prefetches on hover and touchstart with this set,
                      // so pointer and touch readers keep the fast click; only
                      // keyboard-through readers pay the ~250 ms cold commit on
                      // a slow link. See the measurement note in CURRENT_RUN.
                      prefetch={false}
                      className="flex min-h-[44px] min-w-0 items-center gap-2.5 md:min-h-0"
                    >
                      {/* The agent's own mark where we have one; the generic
                          terminal tile only for catalog hosts with no adapter
                          (and therefore no registry id to look a logo up by). */}
                      {host ? (
                        <AgentLogo id={host.id} name={agent.name} size={22} />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-chip bg-sunken-2"
                        >
                          <SquareTerminal className="h-3 w-3 text-ink-2" />
                        </span>
                      )}
                      <span className="t-cond truncate text-[14px] font-medium text-ink transition-colors duration-hover group-hover:text-accent-text">
                        {/* The vendor's own spelling — the catalog's host string
                            is not always what the product calls itself. The link
                            above still carries the catalog string, which is what
                            Explore filters on. */}
                        {host ? vendorName(host.id, agent.name) : agent.name}
                      </span>
                    </Link>
                    {agent.slug === pickedSlug && (
                      <span
                        className="inline-flex shrink-0 items-center rounded-chip border border-accent/30 bg-accent-wash px-1.5 py-0.5 text-[10.5px] font-medium text-accent-text"
                        title="Remembered from the home page — saved in this browser only"
                      >
                        your pick
                      </span>
                    )}
                    {/* The page's whole point is which hosts LiteSPM can
                        configure itself, and on a phone that distinction used to
                        be hidden with the column that carries it — a mobile
                        reader saw a name and a count and nothing else. Same
                        `host` value as the desktop column below, so the two
                        cannot disagree; icon-only here, with a label, because a
                        bare glyph would be unreadable to a screen reader. */}
                    <span
                      className="inline-flex shrink-0 items-center gap-1 text-[10.5px] md:hidden"
                      aria-label={
                        host
                          ? "LiteSPM can write this host's config file"
                          : "No adapter — compatibility is publisher-declared"
                      }
                    >
                      {host ? (
                        <Check className="h-3 w-3 text-ink" aria-hidden="true" />
                      ) : (
                        <span aria-hidden="true" className="h-px w-2.5 bg-ink-3" />
                      )}
                    </span>
                  </div>

                  <Link
                    href={`/explore/?host=${encodeURIComponent(agent.name)}`}
                    aria-label={`${formatCount(agent.count)} catalog entries in Explore for ${agent.name}`}
                    className="t-mono t-tabular inline-flex min-h-[44px] items-center justify-end text-[12px] text-ink-2 transition-colors duration-hover hover:text-accent-text md:min-h-0 md:order-3"
                  >
                    {formatCount(agent.count)}
                  </Link>

                  <span className="hidden md:order-2 md:block">
                    {host ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-ink"
                        title="LiteSPM has a compiled-in adapter that can write this host's config file"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        managed
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-3" title="No compiled-in adapter; publishers declare compatibility themselves">
                        declared
                      </span>
                    )}
                  </span>

                  <code
                    className="t-mono hidden truncate text-[11px] text-ink-3 md:order-4 md:block"
                    title={host ? host.userPath : undefined}
                  >
                    {host ? host.userPath : "not managed by LiteSPM"}
                  </code>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 max-w-prose text-[12px] leading-relaxed text-ink-3">
          Compatibility comes from LiteSPM&rsquo;s adapter registries, or from a publisher&rsquo;s
          own list for plugins — declared, not tested.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
