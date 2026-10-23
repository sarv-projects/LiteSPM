"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SquareTerminal, Check } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { AgentLogo } from "../../components/AgentLogo";
import { HOSTS } from "../../lib/hosts";
import { formatCount } from "../../lib/format";
import { isDiscontinued } from "../../lib/lifecycle";
import { AGENT_STORAGE_KEY, findAgentChoice } from "../../lib/landing";
import type { AgentChoice } from "../../lib/landing";
import type { AgentRow, KindCount } from "./agentRows";

/**
 * Host coverage is an aggregate: `app/agents/page.tsx` derives it from the
 * full row set at build time — one row per host (`agentRows.ts`), not per
 * catalog spelling. This route never needs the entries themselves and
 * therefore never fetches the dataset.
 */
export interface AgentsViewProps {
  /** Rows in the list below. */
  hostCount: number;
  agents: AgentRow[];
}

/**
 * One kind's count, linked to the Explore filter that returns exactly that
 * number. The filter key is the catalog string the kind's registry names the
 * host by (`agentRows.ts`), so the figure and the filter cannot disagree; the
 * kind is named because the same host legitimately appears with one count per
 * kind, and a bare number repeated twice reads as a mistake.
 */
function KindLink({
  kind,
  label,
  kc,
}: {
  kind: "mcp" | "skill" | "plugin";
  label: string;
  kc: KindCount | null;
}) {
  if (!kc) return null;
  return (
    <Link
      href={`/explore/?kind=${kind}&host=${encodeURIComponent(kc.host)}`}
      aria-label={`${formatCount(kc.count)} ${label} entries in Explore for ${kc.host}`}
      title={`${formatCount(kc.count)} ${label} — the entries that name “${kc.host}”`}
      // Same measured trade as the name link above: each in-viewport link is a
      // speculative RSC download, and a row can carry three of these.
      prefetch={false}
      // The 24 px floor is the WCAG 2.2 AA target size (SC 2.5.8) and it
      // holds at every width: `md:min-h-0` used to drop it on desktop, where
      // the link collapsed to its 17 px line box and the axe audit found 104
      // targets under the floor on this page.
      className="inline-flex min-h-[24px] items-center justify-end whitespace-nowrap transition-colors duration-hover hover:text-accent-text"
    >
      {formatCount(kc.count)} {label}
    </Link>
  );
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
   * config LiteSPM can write is the row a reader means — then the row's own
   * catalog spellings, which is the match Explore uses. "Other" carries no
   * hosts, so it marks nothing.
   */
  const pickedSlug = savedAgent
    ? agents.find((agent) => agent.hostId === savedAgent.id)?.slug ??
      agents.find((agent) => savedAgent.hosts.some((h) => agent.strings.includes(h)))?.slug ??
      null
    : null;

  return (
    <div className="flex min-h-screen flex-col" style={{ ["--stack-top" as string]: "var(--site-header-height)" }}>
      <Header />

      <main id="main" tabIndex={-1} className="shell flex-1 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Browse AI agents</h1>
          <p className="t-mono text-[11px] text-ink-3">
            {formatCount(hostCount)} hosts · {formatCount(HOSTS.length)} that LiteSPM configures
          </p>
        </div>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          See which coding agents LiteSPM can configure and discover available MCP servers,
          skills, and plugins for each one. Support varies by agent and package.
        </p>

        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          These profiles explain how LiteSPM works with each agent host: setup path, config file,
          and capability targets. LiteSPM currently catalogs MCP servers, skills, and plugins; it
          does not install agent applications themselves.
        </p>

        <p className="mt-3 max-w-prose text-[12px] leading-relaxed text-ink-3">
          Counts are catalog relationships, not runtime test results. MCP and skill totals follow
          LiteSPM&rsquo;s install targets; plugin totals follow publisher-declared host lists, and
          some plugin entries are discovery-only. Each listing shows its own install status.
        </p>

        <div className="mt-7 border-b border-ink pb-2">
          <h2 className="sr-only">Agent hosts, compatible entry counts by kind, and config adapters</h2>
          {/* Column order must match the rendered cell order, which the rows
              set with md:order-2 (adapter) and md:order-3 (compatible counts). */}
          <div className="t-mono hidden grid-cols-[minmax(0,1fr)_92px_100px_minmax(0,1fr)] items-center gap-3 text-[10px] text-ink-3 md:grid">
            <span>AI agent</span>
            <span>Setup</span>
            <span className="text-right">Catalog entries</span>
            <span>Configuration path</span>
          </div>
        </div>

        <ul>
          {agents.map((agent) => {
            const host = agent.hostId
              ? HOSTS.find((h) => h.id === agent.hostId)
              : undefined;
            return (
              <li key={agent.slug}>
                {/* The row is a container, not a link: the name goes to the
                    host's detail page when LiteSPM can edit that host's
                    config, and each count keeps the Explore filter its kind
                    is named by — several targets, so no nested anchors. */}
                <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-3 transition-colors hover:bg-hover md:grid-cols-[minmax(0,1fr)_92px_100px_minmax(0,1fr)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={
                        agent.pageId
                          ? `/agents/${agent.pageId}/`
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
                        {/* The vendor's own spelling, applied in `agentRows.ts`
                            to the row's whole spelling set. The Explore filter
                            resolves every spelling of a host to one identity,
                            so the link and every count below agree whatever
                            the reader sees here. */}
                        {agent.name}
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
                    {agent.hostId && isDiscontinued(agent.hostId) && (
                      // The row stays: this is the index of every host the
                      // catalog names, and its own page carries the vendor's
                      // notice. The mark is what keeps the listing honest.
                      <span
                        className="inline-flex shrink-0 items-center rounded-chip border border-rule bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3"
                        title="The vendor has ended this product. Its own notice is on the host's page."
                      >
                        discontinued
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
                          : "LiteSPM can't write this host's config; compatibility is publisher-declared"
                      }
                    >
                      {host ? (
                        <Check className="h-3 w-3 text-ink" aria-hidden="true" />
                      ) : (
                        <span aria-hidden="true" className="h-px w-2.5 bg-ink-3" />
                      )}
                    </span>
                  </div>

                  {/* One line per kind. Each number counts the entries of that
                      kind whose registry names this host — an entry that names
                      it through two strings counts once (agentRows.ts) — and
                      links to the Explore filter that returns exactly that
                      number, so the figure and its filter cannot disagree. */}
                  <span className="t-mono t-tabular flex flex-col items-end justify-center text-[11px] text-ink-2 md:order-3">
                    <KindLink kind="mcp" label="MCP" kc={agent.mcp} />
                    <KindLink kind="skill" label="skills" kc={agent.skill} />
                    <KindLink kind="plugin" label="plugins" kc={agent.plugin} />
                  </span>

                  <span className="hidden md:order-2 md:block">
                    {host ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-ink"
                        title="LiteSPM can write this host's config file"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        managed
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-3" title="LiteSPM can't write this host's config; compatibility is publisher-declared">
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

        <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Done comparing? <Link href="/explore/" className="link">Browse what these hosts can
          run</Link>, or <Link href="/get-started/" className="link">connect one of them</Link>.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
