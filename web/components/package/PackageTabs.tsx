"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { kindLabel } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import { bridgeSnippet, hostPath, isRemoteTransport } from "../../lib/hosts";
import { hostsNamedBy, resolveHostId } from "../../lib/hostIdentity";
import { formatCount } from "../../lib/format";
import { VerifiedMark } from "../catalog/PublisherMark";
import { TabList } from "../ui/TabList";
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
      "No install path has been proven — LiteSPM lists it, but won't install it.",
  },
  metadata_verified: {
    label: "LiteSPM-parsed",
    plain:
      "LiteSPM opened this entry's own published metadata — but hasn't run it.",
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

/**
 * Where this row's host list comes from — stated at its real strength. A
 * remote MCP row's list is the hosts whose config can take a URL entry (on the
 * others the install is refused), so it must not say "every host LiteSPM can
 * set up".
 */
function hostSource(item: Listing): { label: string; plain: string } {
  if (item.kind === "mcp") {
    return {
      label: "By entry type",
      plain: isRemoteTransport(item.transport)
        ? "Every host LiteSPM can add a remote server to. This list is LiteSPM's own, not the publisher's."
        : "Every host LiteSPM can set up. This list is LiteSPM's own, not the publisher's.",
    };
  }
  if (item.kind === "skill") {
    return {
      label: "By entry type",
      plain:
        "Every host LiteSPM can install skills into. This list is LiteSPM's own, not the publisher's.",
    };
  }
  return { label: "Publisher-declared", plain: "Hosts the publisher declared in its own manifest." };
}

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
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // `min-h-[24px]` is the WCAG 2.2 AA target-size floor (SC 2.5.8). The
      // link was 18px tall — a real violation axe reported as serious on
      // every entry page, because the publisher link sits in a definition
      // list rather than in a sentence (so the inline exception does not
      // apply to it).
      className="link inline-flex min-h-[24px] items-center gap-1 break-all"
    >
      {text}
      <ExternalLink className="h-3 w-3 shrink-0 text-ink-3" aria-hidden="true" />
    </a>
  );
}

/** Where this listing came from, for the panels that print it as a line. */
function sourceSentence(item: Listing): string {
  return item.publisher?.provenance === "vendor-manifest"
    ? "Read from the publisher's own manifest."
    : "From a third-party list, not the publisher's own manifest.";
}

/* ------------------------------ panels ------------------------------ */

function OverviewPanel({ item }: { item: Listing }) {
  // The provenance sentence that led this panel repeated the "Publisher
  // listing" row below it and the Source tab's "Where it was read", so the
  // panel is now the record itself.
  return (
    <dl className="spec-list max-w-xl">
      <SpecRow label="ID">
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
    </dl>
  );
}

function CapabilitiesPanel({ item }: { item: Listing }) {
  const launch = item.command
    ? `${item.command}${item.args?.length ? ` ${item.args.join(" ")}` : ""}`
    : null;

  /**
   * The panel's rows, split into the ones the catalog publishes and the ones
   * it does not.
   *
   * A skill's Capabilities tab used to be five consecutive "not published"
   * rows — Tools, Runtime, Transport, Launch line, Install from source — with
   * the one useful fact (the skill's source repository) last. A list of
   * absences is not a capability list, and a reader who came for the skill's
   * instructions found the repository link after all five. So the published
   * facts come first, the source link leads them, and the absences collapse
   * into one sentence that says which fields are missing.
   */
  const published: Array<[string, React.ReactNode]> = [];
  const absent: string[] = [];

  if (item.skillSource) {
    published.push([
      "Skill source",
      <span className="t-mono break-all text-[12px]!">{item.skillSource}</span>,
    ]);
  }
  if (item.tools?.length) {
    published.push([
      "Tools",
      <span className="t-mono text-[12px]!">{item.tools.length} declared</span>,
    ]);
  } else {
    absent.push("tool list");
  }
  if (item.runtime) {
    published.push([
      "Runtime",
      <span className="t-mono text-[12px]!">{item.runtime}</span>,
    ]);
  } else {
    absent.push("runtime");
  }
  if (item.transport) {
    published.push([
      "Transport",
      <span className="t-mono text-[12px]!">{item.transport}</span>,
    ]);
  } else {
    absent.push("transport");
  }
  if (launch) {
    published.push(["Launch line", <span className="t-mono break-all text-[12px]!">{launch}</span>]);
  } else {
    absent.push("launch line");
  }
  if (item.installHint) {
    published.push([
      item.kind === "skill" ? "Install from source" : "Host command",
      <span className="t-mono break-all text-[12px]!">{item.installHint}</span>,
    ]);
  } else {
    absent.push(item.kind === "skill" ? "install command" : "host command");
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
          {item.kind === "mcp" && (
            <>Your agent discovers this server&rsquo;s tools when it connects.</>
          )}
          {item.kind === "skill" && (
            <>
              This skill&rsquo;s instructions live in its SKILL.md — the file your agent reads. No
              tool list is published for it.
            </>
          )}
          {item.kind === "plugin" && (
            <>
              Your agent host installs this plugin and its components; what it adds shows up
              afterwards.
            </>
          )}
        </p>
      </div>

      <div>
        {published.length > 0 && (
          <dl className="spec-list">
            {published.map(([label, value]) => (
              <SpecRow key={label} label={label}>
                {value}
              </SpecRow>
            ))}
          </dl>
        )}

        {/*
            The absences, in one sentence. Five rows of "not published" told
            the reader the catalog was empty; one sentence tells them which
            fields the source does not publish — which is a fact about the
            source, not about this entry.
        */}
        {absent.length > 0 && (
          <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
            The catalog publishes no {absent.slice(0, -1).join(", ")} or {absent[absent.length - 1]} for
            this entry.
          </p>
        )}
      </div>
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
  const hosts = hostsNamedBy(item);
  const source = hostSource(item);
  // One entry per host identity: a skill row names the Pi host through two of
  // its strings, and this list (and the count beside it) says one host.
  const wanted = new Set(
    (agent?.hosts ?? [])
      .map((name) => resolveHostId(name))
      .filter((id): id is string => id !== null)
  );
  /* The select used to preselect whichever host sorted first in the registry
     and change nothing else — a control whose state nothing read, and an
     invitation to read that first host as "the" host for this entry. It now
     starts empty and answers with the one per-host fact this page can state:
     what LiteSPM writes for that host, and where. `selected` may go stale when
     `item` changes; `chosen` re-derives it, so there is no effect and no
     hook-order hazard. */
  const [selected, setSelected] = useState<string>("");
  const chosen = hosts.find((h) => h.value === selected) ?? null;
  const adapter = chosen?.adapter;
  const platformOs = usePlatformOs();

  return (
    <div>
      {/* With nothing installable there is no host list to head, so the tab
          states the availability verdict where the count would go and drops the
          "every host LiteSPM can set up" line that the count used to introduce. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip pointer-events-none">
          {hosts.length ? source.label : availabilityOf(item).label}
        </span>
        {hosts.length > 0 && (
          <span className="t-mono t-tabular text-[12px] text-ink-3">
            {hosts.length} of {hostTotal} hosts in this catalog
          </span>
        )}
      </div>

      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
        {hosts.length ? source.plain : availabilityOf(item).plain}
      </p>

      {hosts.length ? (
        <div className="mt-4">
          {/* The agent the visitor already chose, surfaced on its own line. It
              used to be one highlighted chip among fifty, which is why the page
              read as though only that agent worked. */}
          {wanted.size > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
              Works with
              {hosts
                .filter((h) => wanted.has(h.value))
                .map((h) => (
                  <span
                    key={h.value}
                    className="inline-flex min-h-[24px] items-center rounded-chip border border-accent/40 bg-accent-wash px-2 py-0.5 text-[12px] text-accent-text"
                    title={`Matches the agent you selected. ${source.plain}`}
                  >
                    {h.name}
                  </span>
                ))}
            </p>
          )}

          <label className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
            Show setup for
            <select
              value={chosen?.value ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="field max-w-full"
            >
              <option value="">Choose a host…</option>
              {hosts.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>

          {chosen && (
            <div className="mt-3 border border-rule-2 bg-sunken px-3 py-3">
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <span className="inline-flex min-h-[24px] items-center rounded-chip border border-accent bg-accent-wash px-2 py-0.5 text-[12px] font-medium text-accent-text">
                  {chosen.name}
                </span>
                {adapter
                  ? "LiteSPM's bridge entry goes in this file:"
                  : "LiteSPM can't write this host's config, so there is no setup entry to show."}
              </p>

              {adapter && (
                <>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="t-mono min-w-0 flex-1 break-all border border-rule-2 bg-surface px-2.5 py-2 text-[11px] text-ink-2">
                      {hostPath(adapter, platformOs)}
                    </code>
                    <CopyButton
                      text={hostPath(adapter, platformOs)}
                      label={`Copy the config path for ${chosen.name}`}
                      message="Config path copied"
                    />
                  </div>
                  <pre className="t-mono mt-2 max-h-56 overflow-auto whitespace-pre-wrap border border-rule-2 bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-ink-2">
                    {bridgeSnippet(adapter, "litespm", platformOs)}
                  </pre>
                  <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-3">
                    LiteSPM&rsquo;s bridge entry connects {chosen.name} to LiteSPM — installing a
                    capability doesn&rsquo;t change it.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-ink-3">
          Nothing to install, so there is no host to set it up in.
        </p>
      )}
    </div>
  );
}

function SecurityPanel({ item }: { item: Listing }) {
  const installability = item.installability ? INSTALLABILITY[item.installability] : null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">What LiteSPM has read</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="chip pointer-events-none">{installability ? installability.label : "—"}</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {installability ? installability.plain : "This entry doesn't publish a provenance level."}
        </p>
      </div>

      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">Who published it</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.publisher?.verified ? <VerifiedMark /> : <span className="chip pointer-events-none">third-party list entry</span>}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {item.publisher?.verified
            ? "Read from the publisher's own manifest."
            : "Claimed by a third-party list."}
        </p>
      </div>

      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">What LiteSPM changes</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          A host config file is backed up before LiteSPM edits it, and{" "}
          <code className="t-mono text-ink">litespm restore</code> puts the original back.
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
            <span className="text-ink-3">as published by the source</span>
          </p>
        ) : (
          <>
            <p className="mt-3">
              <Absent text="not published" />
            </p>
            <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
              No version is published for this entry.{" "}
              <span className="t-mono t-tabular">{formatCount(versioned)}</span> of{" "}
              <span className="t-mono t-tabular">{formatCount(total)}</span> entries carry one.
            </p>
          </>
        )}
      </div>

      <div>
        <div className="section-head">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">Catalog release</h3>
        </div>
        <dl className="spec-list mt-3">
          <SpecRow label="Release">
            <span className="t-mono text-[12px]!">
              {typeof release.releaseId === "string" ? release.releaseId : <Absent text="not published" />}
            </span>
          </SpecRow>
          <SpecRow label="Built">
            <span className="t-mono text-[12px]!">
              {createdAt ? createdAt.replace("T", " ").replace("Z", " UTC") : <Absent text="not published" />}
            </span>
          </SpecRow>
        </dl>
      </div>
    </div>
  );
}

function SourcePanel({ item }: { item: Listing }) {
  return (
    <div className="max-w-xl">
      <dl className="spec-list">
        <SpecRow label="Where it was read">{sourceSentence(item)}</SpecRow>
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
      </dl>

      {/*
          The absence of a popularity figure, stated where the absence is
          felt. Every competitor's entry page prints a star count, a download
          count or an install count; this catalog publishes none, and a reader
          arriving from one of those pages should not have to read `/terms/`
          to find out why. One line, in the block that is about what the
          source published.
      */}
      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
        No star or download count exists for this entry — no upstream source publishes one.
      </p>
    </div>
  );
}

/* ------------------------------ shell ------------------------------ */

export interface PackageTabsProps {
  item: Listing;
  /** The agent the reader picked; drives the highlighted compatibility chips. */
  agent: AgentChoice | null;
  /** The catalog's host identities — the coverage denominator. */
  hostTotal: number;
  /** Version coverage over the loaded row set (rows are loaded on this route). */
  snapshot: { total: number; versioned: number };
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
export function PackageTabs({ item, agent, hostTotal, snapshot, active, onChange }: PackageTabsProps) {
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
        return <SourcePanel item={item} />;
    }
  };

  return (
    <section aria-labelledby="pkg-details-title" className="mt-9">
      <div className="section-head">
        <h2 id="pkg-details-title">Details</h2>
        <span className="section-note">the full listing</span>
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
