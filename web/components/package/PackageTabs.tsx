"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { kindLabel, publisherDisplayName, sourceLabel } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import { bridgeSnippet, hostPath, isRemoteTransport } from "../../lib/hosts";
import { hostsNamedBy, resolveHostId } from "../../lib/hostIdentity";
import { VerifiedMark } from "../catalog/PublisherMark";
import { TabList } from "../ui/TabList";
import { CopyButton } from "./CopyButton";
import { usePlatformOs } from "./usePlatformOs";
import { categoryLabel } from "../../app/categories/categoryLabel";

/**
 * The technical layer of the package page: setup details, capabilities,
 * compatibility, security and source information for developers and operators.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "capabilities", label: "Capabilities" },
  { id: "compatibility", label: "Compatibility" },
  { id: "security", label: "Trust & security" },
  { id: "source", label: "Source" },
] as const;

export type PackageTabId = (typeof TABS)[number]["id"];

/**
 * Provenance labels, exactly the set the honesty overlay allows, mapped from
 * the field that decides them (`installability`). Nothing here is upgraded for
 * looking established: a `discovery_only` row stays "Listed only".
 */
const INSTALLABILITY: Record<
  NonNullable<Listing["installability"]>,
  { label: string; plain: string }
> = {
  discovery_only: {
    label: "Setup details needed",
    plain: "LiteSPM needs verified source or connection details before it can prepare install steps.",
  },
  metadata_verified: {
    label: "Metadata checked",
    plain: "The listing's source and setup details have been checked.",
  },
  runtime_verified: {
    label: "Runtime verified",
    plain: "The published runtime details have been verified.",
  },
  litespm_tested: {
    label: "LiteSPM tested",
    plain: "The installation path has been tested by LiteSPM.",
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
    const remote = isRemoteTransport(item.transport) && Boolean(item.url);
    return {
      label: "By entry type",
      plain: remote
        ? "Hosts whose documented URL-entry format accepts this listing's transport. This list is LiteSPM's own, not the publisher's."
        : "Every host LiteSPM can set up. This list is LiteSPM's own, not the publisher's.",
    };
  }
  if (item.kind === "skill") {
    return {
      label: "By entry type",
      plain:
        "Hosts with a documented user-scope skills directory. This list is LiteSPM's own, not the publisher's.",
    };
  }
  return { label: "Publisher-declared", plain: "Hosts the publisher declared in its own manifest." };
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
  return item.publisher?.verified
    ? "Publisher manifest"
    : "Directory listing";
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
      {(item.publisher?.name || item.publisher?.url) && (
        <SpecRow label="Publisher">
          {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url)
            ? externalLink(item.publisher.url, publisherDisplayName(item.publisher.name) || "Publisher website")
            : publisherDisplayName(item.publisher?.name) || "Publisher not listed"}
        </SpecRow>
      )}
      <SpecRow label="Publisher listing">
        {item.publisher?.verified ? <VerifiedMark /> : sourceSentence(item)}
      </SpecRow>
      <SpecRow label="Catalog source">{sourceLabel(item.source) || "Source not listed"}</SpecRow>
      {item.version && (
        <SpecRow label="Version">
          <span className="t-mono text-[12px]!">{item.version}</span>
        </SpecRow>
      )}
      {item.kind === "mcp" && item.runtime && (
        <SpecRow label="Runtime">
          <span className="t-mono text-[12px]!">{item.runtime}</span>
        </SpecRow>
      )}
      {item.kind === "mcp" && item.transport && (
        <SpecRow label="Transport">
          <span className="t-mono text-[12px]!">{item.transport}</span>
        </SpecRow>
      )}
    </dl>
  );
}

function CapabilitiesPanel({ item }: { item: Listing }) {
  const launch = item.command
    ? `${item.command}${item.args?.length ? ` ${item.args.join(" ")}` : ""}`
    : null;

  const published: Array<[string, React.ReactNode]> = [];

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
  }
  if (item.runtime) {
    published.push([
      "Runtime",
      <span className="t-mono text-[12px]!">{item.runtime}</span>,
    ]);
  }
  if (item.transport) {
    published.push([
      "Transport",
      <span className="t-mono text-[12px]!">{item.transport}</span>,
    ]);
  }
  if (launch) {
    published.push(["Launch line", <span className="t-mono break-all text-[12px]!">{launch}</span>]);
  }
  if (item.installHint) {
    published.push([
      item.kind === "skill" ? "Install from source" : "Host command",
      <span className="t-mono break-all text-[12px]!">{item.installHint}</span>,
    ]);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
          {item.kind === "mcp" && (
            <>Your agent discovers this server&rsquo;s tools when it connects.</>
          )}
          {item.kind === "skill" && (
            <>Your agent reads this skill&rsquo;s instructions from SKILL.md when a task calls for them.</>
          )}
          {item.kind === "plugin" && (
            <>A plugin brings related tools and workflows together as one package.</>
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
  const preferredHost = Array.from(wanted).find((id) => hosts.some((host) => host.value === id)) ?? "";
  /* The select follows the visitor's saved target when that target is listed
     for this entry. Otherwise it stays empty instead of picking whichever
     host sorts first. Its answer is the per-host fact this page can state:
     what LiteSPM writes for that host, and where. */
  const [selected, setSelected] = useState<string>(preferredHost);
  useEffect(() => {
    setSelected(preferredHost);
  }, [preferredHost, item.id]);
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
            Setup available for {hosts.length} of {hostTotal} listed agent hosts
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
              Agent targets
              {hosts
                .filter((h) => wanted.has(h.value))
                .map((h) => (
                  <span
                    key={h.value}
                    className="inline-flex min-h-[24px] items-center rounded-chip border border-accent/40 bg-accent-wash px-2 py-0.5 text-[12px] text-accent-text"
                    title={`This package lists the agent you selected. ${source.plain}`}
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
                  ? "LiteSPM adds its connection details to this file:"
                  : "Add skills to this agent using its documented skills folder."}
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
      ) : null}
    </div>
  );
}

function SecurityPanel({ item }: { item: Listing }) {
  const installability = item.installability ? INSTALLABILITY[item.installability] : null;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">Install setup</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="chip pointer-events-none">{installability ? installability.label : "Setup details needed"}</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {installability ? installability.plain : "Choose an agent to see the setup details available for this package."}
        </p>
      </div>

      <div className="border-t border-rule pt-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">Publisher and source</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.publisher?.verified ? <VerifiedMark /> : <span className="chip pointer-events-none">{sourceLabel(item.source) || "Catalog listing"}</span>}
          {item.publisher?.name && <span className="text-[13px] font-medium text-ink">{publisherDisplayName(item.publisher.name)}</span>}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {item.publisher?.verified
            ? "Listing details come from the publisher's own package manifest."
            : "This entry is listed through " + sourceLabel(item.source) + "."}
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

function SourcePanel({ item }: { item: Listing }) {
  return (
    <div className="max-w-xl">
      <dl className="spec-list">
        <SpecRow label="Catalog source">{sourceLabel(item.source) || "Source not listed"}</SpecRow>
        <SpecRow label="Publisher listing">{sourceSentence(item)}</SpecRow>
        {item.publisher?.name && <SpecRow label="Publisher ID"><span className="t-mono text-[12px]!">{item.publisher.name}</span></SpecRow>}
        {item.publisher?.url && /^https?:\/\//i.test(item.publisher.url) && (
          <SpecRow label="Publisher website">
            {externalLink(item.publisher.url, publisherDisplayName(item.publisher.name) || item.publisher.url)}
          </SpecRow>
        )}
        {item.skillSource && (
          <SpecRow label="Skill source">
            {externalLink(item.skillSource, item.skillSource)}
          </SpecRow>
        )}
      </dl>


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
export function PackageTabs({ item, agent, hostTotal, active, onChange }: PackageTabsProps) {
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
