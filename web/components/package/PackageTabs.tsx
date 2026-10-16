"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { kindLabel } from "../../lib/catalog";
import { bridgeSnippet, hostPath, hostsFor, resolveHost } from "../../lib/hosts";
import { formatCount, shortDigest } from "../../lib/format";
import { VerifiedMark } from "../catalog/PublisherMark";
import { TabList } from "../ui/TabList";
import { SITE_URL } from "../../lib/site";
import { CopyButton } from "./CopyButton";
import { usePlatformOs } from "./usePlatformOs";
import bundledRelease from "../../data/release.json";
import { categoryLabel } from "../../app/categories/categoryLabel";

/**
 * The technical layer of the package page: six tabs that sit *after* the five
 * plain-language questions (ARCH/25 §7.3), so a reader who just wants the
 * answer never has to open one — and a reader who wants the record can.
 *
 * Every cell is a field the snapshot actually carries. Where a field is empty
 * the tab prints an explicit absent state (`—` / "not published"), never a
 * guess and never a "not compatible": the catalog's semantics are
 * publisher-declared (plugins) or kind-derived (MCP servers, skills), and the
 * labels below never claim more than that.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "capabilities", label: "Capabilities" },
  { id: "compatibility", label: "Compatibility" },
  { id: "security", label: "Security" },
  { id: "versions", label: "Versions" },
  { id: "source", label: "Source" },
] as const;

export type PackageTabId = (typeof TABS)[number]["id"];

/**
 * Provenance labels, exactly the set the honesty overlay allows, mapped from
 * the field that decides them (`installability`). Nothing here is upgraded for
 * looking established: a `discovery_only` row stays "Discovery only".
 */
const INSTALLABILITY: Record<
  NonNullable<Listing["installability"]>,
  { label: string; plain: string }
> = {
  discovery_only: {
    label: "Discovery only",
    plain:
      "LiteSPM found this entry in a source list. Whether it installs, and what it would run, has not been checked.",
  },
  metadata_verified: {
    label: "LiteSPM-parsed",
    plain:
      "LiteSPM read this entry's metadata out of the publisher's own manifest — hosts and install command included — but has not run it.",
  },
  runtime_verified: {
    label: "LiteSPM-verified",
    plain: "The declared runtime behavior was proven; the entry has not been exercised end to end.",
  },
  litespm_tested: {
    label: "LiteSPM-tested",
    plain: "Exercised end to end by LiteSPM.",
  },
};

/** Where this row's host list comes from — stated at its real strength. */
const HOST_SOURCE: Record<Listing["kind"], { label: string; plain: string }> = {
  mcp: {
    label: "kind-derived",
    plain:
      "Every host with a LiteSPM bridge adapter. The list comes from LiteSPM's own adapter registry, not from the publisher, and not from a test.",
  },
  skill: {
    label: "kind-derived",
    plain:
      "Every host with a skills directory LiteSPM can write a SKILL.md into. The list comes from LiteSPM's own skill-target registry, not from the publisher, and not from a test.",
  },
  plugin: {
    label: "Publisher-declared",
    plain:
      "The publisher listed these hosts in its own manifest — a declaration, not a LiteSPM test result.",
  },
};

function Absent({ text = "not published" }: { text?: string }) {
  return <span className="absent">{text}</span>;
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function externalLink(href: string, text: string) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 break-all">
      {text}
      <ExternalLink className="h-3 w-3 shrink-0 text-ink-3" aria-hidden="true" />
    </a>
  );
}

function sourceLabel(item: Listing): string {
  return item.publisher?.provenance === "vendor-manifest"
    ? "read from the publisher's own repository manifest"
    : "claimed by a third-party list, not read from the publisher's own manifest";
}

/** The same fact as a sentence, for the two panels that print it as one. */
function sourceSentence(item: Listing): string {
  return `This row was ${sourceLabel(item)}.`;
}

/* ------------------------------ panels ------------------------------ */

function OverviewPanel({ item }: { item: Listing }) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
          The catalog&rsquo;s record for {item.name}, exactly as this snapshot carries it. Fields
          the publisher never provided are marked <span className="absent">not published</span> —
          nothing here is guessed.
        </p>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-3">
          {sourceSentence(item)}
        </p>
      </div>

      <dl className="spec-list">
        <SpecRow label="Catalog id">
          <span className="t-mono text-[12px]!">{item.id}</span>
        </SpecRow>
        <SpecRow label="Kind">{kindLabel(item.kind)}</SpecRow>
        <SpecRow label="Category">
          <span className="t-mono text-[12px]!">{categoryLabel(item.category)}</span>
        </SpecRow>
        <SpecRow label="Publisher">
          {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) ? (
            externalLink(item.publisher.url, item.publisher.name)
          ) : (
            item.publisher?.name || <Absent text="not published" />
          )}
        </SpecRow>
        <SpecRow label="Publisher listing">
          {item.publisher?.verified ? <VerifiedMark /> : <Absent text="third-party list entry" />}
        </SpecRow>
        <SpecRow label="Version">
          {item.version ? (
            <span className="t-mono text-[12px]!">{item.version}</span>
          ) : (
            <Absent text="not published" />
          )}
        </SpecRow>
        {/* Runtime and transport used to sit in their own "What can it do?"
            section at the top of every page, inside a disclosure. They are
            per-entry technical fields, which is what this list is for. */}
        {item.kind === "mcp" && (
          <SpecRow label="Runtime">
            {item.runtime ? (
              <span className="t-mono text-[12px]!">{item.runtime}</span>
            ) : (
              <Absent text="not published" />
            )}
          </SpecRow>
        )}
        {item.kind === "mcp" && (
          <SpecRow label="Transport">
            {item.transport ? (
              <span className="t-mono text-[12px]!">{item.transport}</span>
            ) : (
              <Absent text="not published" />
            )}
          </SpecRow>
        )}
        <SpecRow label="Popularity">
          <span
            className="absent"
            title="The catalog's sources publish no star, download or install counts, so there is no number to show."
          >
            not published
          </span>
        </SpecRow>
      </dl>
    </div>
  );
}

function CapabilitiesPanel({ item }: { item: Listing }) {
  const launch = item.command
    ? `${item.command}${item.args?.length ? ` ${item.args.join(" ")}` : ""}`
    : null;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
          {item.kind === "mcp" && (
            <>
              The catalog doesn&rsquo;t list this server&rsquo;s tools. Your agent discovers them
              when it connects.
            </>
          )}
          {item.kind === "skill" && (
            <>
              This skill&rsquo;s instructions live in its SKILL.md — the file your agent reads. The
              catalog indexes the skill and its source; it carries no tool list.
            </>
          )}
          {item.kind === "plugin" && (
            <>
              The host installs this plugin and its components. What it adds shows up in your agent
              afterwards; the catalog carries the publisher&rsquo;s description and host list, not
              the plugin&rsquo;s internals.
            </>
          )}
        </p>
      </div>

      <dl className="spec-list">
        <SpecRow label="Tools">
          {item.tools?.length ? (
            <span className="t-mono text-[12px]!">{item.tools.length} declared</span>
          ) : (
            <Absent />
          )}
        </SpecRow>
        <SpecRow label="Access effects">
          {item.effects?.length ? (
            <span className="t-mono text-[12px]!">{item.effects.length} declared</span>
          ) : (
            <Absent text="not yet published" />
          )}
        </SpecRow>
        <SpecRow label="Runtime">
          {item.runtime ? (
            <span className="t-mono text-[12px]!">{item.runtime}</span>
          ) : (
            <Absent text="not published" />
          )}
        </SpecRow>
        <SpecRow label="Transport">
          {item.transport ? (
            <span className="t-mono text-[12px]!">{item.transport}</span>
          ) : (
            <Absent text="not published" />
          )}
        </SpecRow>
        <SpecRow label="Launch line">
          {launch ? <span className="t-mono break-all text-[12px]!">{launch}</span> : <Absent text="not published" />}
        </SpecRow>
        <SpecRow label={item.kind === "skill" ? "Install from source" : "Host command"}>
          {item.installHint ? (
            <span className="t-mono break-all text-[12px]!">{item.installHint}</span>
          ) : (
          <Absent text="not published" />
          )}
        </SpecRow>
        <SpecRow label="Skill source">
          {item.skillSource ? (
            <span className="t-mono break-all text-[12px]!">{item.skillSource}</span>
          ) : (
            <Absent text="not published" />
          )}
        </SpecRow>
      </dl>
    </div>
  );
}

function CompatibilityPanel({
  item,
  agent,
  hostTotal,
}: {
  item: Listing;
  agent: AgentChoice | null;
  hostTotal: number;
}) {
  const hosts = hostsFor(item);
  const source = HOST_SOURCE[item.kind];
  const wanted = (agent?.hosts ?? []).map((n) => n.toLowerCase());
  /* The select used to preselect whichever host sorted first in the registry
     and change nothing else — a control whose state nothing read, and an
     invitation to read that first host as "the" host for this entry. It now
     starts empty and answers with the one per-host fact this page can state:
     what LiteSPM writes for that host, and where. `selected` may go stale when
     `item` changes; `chosen` re-derives it, so there is no effect and no
     hook-order hazard. */
  const [selected, setSelected] = useState<string>("");
  const chosen = hosts.includes(selected) ? selected : "";
  const adapter = chosen ? resolveHost(chosen) : undefined;
  const platformOs = usePlatformOs();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip pointer-events-none">{source.label}</span>
        <span className="t-mono t-tabular text-[12px] text-ink-3">
          {hosts.length} of {hostTotal} hosts in this catalog
        </span>
      </div>

      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">{source.plain}</p>

      {hosts.length ? (
        <div className="mt-4">
          {/* The agent the visitor already chose, surfaced on its own line. It
              used to be one highlighted chip among fifty, which is why the page
              read as though only that agent worked. */}
          {wanted.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
              Works with
              {hosts
                .filter((h) => wanted.includes(h.toLowerCase()))
                .map((h) => (
                  <span
                    key={h}
                    className="inline-flex min-h-[24px] items-center rounded-chip border border-accent/40 bg-accent-wash px-2 py-0.5 text-[12px] text-accent-text"
                    title={`Matches the agent you selected. ${source.plain}`}
                  >
                    {h}
                  </span>
                ))}
            </p>
          )}

          <label className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
            Show setup for
            <select
              value={chosen}
              onChange={(e) => setSelected(e.target.value)}
              className="field max-w-full"
            >
              <option value="">Choose a host…</option>
              {hosts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>

          {chosen && (
            <div className="mt-3 border border-rule-2 bg-sunken px-3 py-3">
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <span className="inline-flex min-h-[24px] items-center rounded-chip border border-accent bg-accent-wash px-2 py-0.5 text-[12px] font-medium text-accent-text">
                  {chosen}
                </span>
                {adapter
                  ? "LiteSPM's bridge entry goes in this file:"
                  : "LiteSPM's host registry has no bridge adapter for this host, so there is no config entry to show."}
              </p>

              {adapter && (
                <>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="t-mono min-w-0 flex-1 break-all border border-rule-2 bg-surface px-2.5 py-2 text-[11px] text-ink-2">
                      {hostPath(adapter, platformOs)}
                    </code>
                    <CopyButton
                      text={hostPath(adapter, platformOs)}
                      label={`Copy the config path for ${chosen}`}
                      message="Config path copied"
                    />
                  </div>
                  <pre className="t-mono mt-2 max-h-56 overflow-auto whitespace-pre-wrap border border-rule-2 bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-ink-2">
                    {bridgeSnippet(adapter, "litespm", platformOs)}
                  </pre>
                  <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-3">
                    This is LiteSPM&rsquo;s own bridge entry — the same on every catalog page. It
                    connects {chosen} to LiteSPM; the entry itself doesn&rsquo;t change when you
                    install a capability.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-ink-3">
          This entry doesn&rsquo;t name any compatible hosts — an absence of a claim, not a claim
          that it fails anywhere.
        </p>
      )}

      <p className="mt-4 max-w-prose text-[12px] leading-relaxed text-ink-3">
        Compatibility is declared by the publisher or derived from the entry&rsquo;s kind. This site
        doesn&rsquo;t run what it lists, so none of it is a test result.
      </p>
    </div>
  );
}

function SecurityPanel({ item }: { item: Listing }) {
  const installability = item.installability ? INSTALLABILITY[item.installability] : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">What LiteSPM checked</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="chip pointer-events-none">{installability ? installability.label : "—"}</span>
          <code className="t-mono text-[11px] text-ink-3">
            installability = {item.installability ? `"${item.installability}"` : "not published"}
          </code>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {installability ? installability.plain : "This entry doesn't publish a provenance level."}
        </p>
        {/* Two different questions share the words "Discovery only", and only
            this sentence separates them: `installability` grades how much
            metadata was *read*, while the badge at the top of the page answers
            whether `litespm install` will actually run — which also weighs the
            entry's kind. A plugin can be `metadata_verified` (LiteSPM-parsed)
            and still be not installable, which is exactly the pair a reader
            would otherwise read as a contradiction. */}
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
          This grade is about the record, not about whether an install will run — the badge at the
          top of the page answers that, and it also weighs the entry&rsquo;s kind: a plugin can be
          <em> LiteSPM-parsed</em> and still not installable.
        </p>
      </div>

      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">Who published it</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.publisher?.verified ? <VerifiedMark /> : <span className="chip pointer-events-none">third-party list entry</span>}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          &ldquo;From publisher manifest&rdquo; means the row came from that publisher&rsquo;s own
          marketplace manifest. That is where the data is from — no registry vouches for the
          publisher, and LiteSPM has not audited it.
        </p>
      </div>

      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">What it can touch</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          The catalog has no per-entry access declaration yet, so no file, network or credential
          scope is listed. One guarantee does hold: a host config file is backed up before LiteSPM
          edits it, and <code className="t-mono text-ink">litespm restore</code> puts the original
          back.
        </p>
      </div>

      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">Secrets stay out of configs</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          Pass a credential by name with{" "}
          <code className="t-mono text-ink">litespm install --env NAME</code>, and the host config
          records a <code className="t-mono text-ink">{"${NAME}"}</code> reference — never the
          value. The secret stays in the environment your agent was started in.
        </p>
      </div>
    </div>
  );
}

function VersionsPanel({
  item,
  total,
  versioned,
}: {
  item: Listing;
  total: number;
  versioned: number;
}) {
  const release = bundledRelease as Record<string, unknown>;
  const createdAt = typeof release.createdAt === "string" ? release.createdAt : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="section-head">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">This entry</h3>
        </div>
        {item.version ? (
          <p className="mt-3 flex items-baseline gap-2 text-[13px] text-ink-2">
            <span className="t-mono text-[15px] text-ink">{item.version}</span>
            <span className="text-ink-3">as published by the source this row came from</span>
          </p>
        ) : (
          <>
            <p className="mt-3">
              <Absent text="not published" />
            </p>
            <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
              The source this row came from publishes no version for {item.name}, and this page
              won&rsquo;t invent one.{" "}
              <span className="t-mono t-tabular">{formatCount(versioned)}</span> of{" "}
              <span className="t-mono t-tabular">{formatCount(total)}</span> entries in this snapshot
              carry a version.
            </p>
          </>
        )}
      </div>

      <div>
        <div className="section-head">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">This snapshot</h3>
        </div>
        <dl className="spec-list mt-3">
          <SpecRow label="Release">
            <span className="t-mono text-[12px]!">
              {typeof release.releaseId === "string" ? release.releaseId : <Absent text="not published" />}
            </span>
          </SpecRow>
          <SpecRow label="Sequence">
            {typeof release.sequence === "number" ? (
              <span className="t-mono t-tabular text-[12px]!">{release.sequence}</span>
            ) : (
              <Absent text="not published" />
            )}
          </SpecRow>
          <SpecRow label="Built">
            <span className="t-mono text-[12px]!">
              {createdAt ? createdAt.replace("T", " ").replace("Z", " UTC") : <Absent text="not published" />}
            </span>
          </SpecRow>
          <SpecRow label="Dataset digest">
            <span className="t-mono text-[12px]!">
              {shortDigest(typeof release.datasetDigest === "string" ? release.datasetDigest : undefined) ?? (
                <Absent text="not published" />
              )}
            </span>
          </SpecRow>
          <SpecRow label="Manifest digest">
            <span className="t-mono text-[12px]!">
              {shortDigest(typeof release.manifestDigest === "string" ? release.manifestDigest : undefined) ?? (
                <Absent text="not published" />
              )}
            </span>
          </SpecRow>
        </dl>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
          Rows are requested with <code className="t-mono text-ink-2">?v=&lt;dataset digest&gt;</code>,
          so a cached copy cannot disagree with the HTML beside it.
        </p>
      </div>
    </div>
  );
}

function SourcePanel({ item, pageHref }: { item: Listing; pageHref: string }) {
  const canonical = `${SITE_URL}${pageHref}`;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
          Where this record came from, and where to go upstream.
        </p>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-3">
          {sourceSentence(item)}
        </p>
        {item.publisher?.verified && (
          <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-3">
            The verified listing means the row was parsed from the publisher&rsquo;s own manifest —
            not that anyone reviewed the code.
          </p>
        )}
      </div>

      <dl className="spec-list">
        <SpecRow label="Publisher URL">
          {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) ? (
            externalLink(item.publisher.url, item.publisher.url)
          ) : (
            <Absent text="not published" />
          )}
        </SpecRow>
        <SpecRow label="Skill source">
          {item.skillSource ? (
            externalLink(item.skillSource, item.skillSource)
          ) : (
            <Absent text="not published" />
          )}
        </SpecRow>
        <SpecRow label="Source class">
          <span className="t-mono text-[12px]!">
            {item.publisher?.provenance === "vendor-manifest" ? "vendor-manifest" : "awesome-list-claim"}
          </span>
        </SpecRow>
        <SpecRow label="Slug">
          <span className="t-mono text-[12px]!">{item.slug}</span>
        </SpecRow>
        <SpecRow label="This page">
          <span className="t-mono break-all text-[12px]!">{canonical}</span>
        </SpecRow>
      </dl>
    </div>
  );
}

/* ------------------------------ shell ------------------------------ */

export interface PackageTabsProps {
  item: Listing;
  /** The agent the reader picked; drives the highlighted compatibility chips. */
  agent: AgentChoice | null;
  /** `hostUniverse(rows).length` — the coverage denominator. */
  hostTotal: number;
  /** Version coverage over the loaded row set (rows are loaded on this route). */
  snapshot: { total: number; versioned: number };
  /**
   * The path this page is actually served at: `/package/<key>/` on a
   * pre-rendered entry page, `/package/?slug=<key>` on the client-resolved
   * one. The Source tab prints it as "This page", so it must be the address
   * the reader is on — not the client form on a page whose canonical is the
   * path form.
   */
  pageHref: string;
  /** Controlled so a question block above can jump to a tab — local state only. */
  active: PackageTabId;
  onChange: (id: PackageTabId) => void;
}

/**
 * Six tabs, one record. The strip itself is `ui/TabList` (shared with the
 * install panel's Command | Prompt choice); the active tab carries the accent
 * underline, the inactive ones stay neutral. The state lives in the view so a
 * link from the questions above can open a specific tab — switching never
 * fetches anything (the row is already in memory).
 */
export function PackageTabs({ item, agent, hostTotal, snapshot, pageHref, active, onChange }: PackageTabsProps) {
  const renderPanel = (tab: PackageTabId): React.ReactNode => {
    switch (tab) {
      case "overview":
        return <OverviewPanel item={item} />;
      case "capabilities":
        return <CapabilitiesPanel item={item} />;
      case "compatibility":
        return <CompatibilityPanel item={item} agent={agent} hostTotal={hostTotal} />;
      case "security":
        return <SecurityPanel item={item} />;
      case "versions":
        return <VersionsPanel item={item} total={snapshot.total} versioned={snapshot.versioned} />;
      case "source":
        return <SourcePanel item={item} pageHref={pageHref} />;
    }
  };

  return (
    <section aria-labelledby="pkg-details-title" className="mt-9">
      <div className="section-head">
        <h2 id="pkg-details-title">Details</h2>
        <span className="section-note">the full record</span>
      </div>

      <TabList
        tabs={TABS}
        active={active}
        onChange={onChange}
        label="Package details"
        idPrefix="pkg"
        className="mt-1"
      />

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`pkg-panel-${tab.id}`}
          aria-labelledby={`pkg-tab-${tab.id}`}
          tabIndex={0}
          hidden={active !== tab.id}
          className="mt-5"
        >
          {renderPanel(tab.id)}
        </div>
      ))}
    </section>
  );
}
