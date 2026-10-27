import React from "react";
import type { Listing } from "../../lib/telemetry";
import { availabilityOf } from "../../lib/availability";
import { feasibilityFor } from "../../lib/installFeasibility";
import { hostsNamedBy } from "../../lib/hostIdentity";
import { SKILL_TARGETS, hostPath, resolveHost, skillTargetPaths } from "../../lib/hosts";
import type { AgentChoice } from "../../lib/landing";
import type { PackageTabId } from "./PackageTabs";

/**
 * Two first-time questions that need a plain answer: what setup LiteSPM can
 * offer, and whether it has a path for the selected agent. Identity and static
 * metadata already appear in the header and specs card; repeating them here
 * made every product page longer without helping someone decide what to do.
 */
export interface PlainSummaryProps {
  item: Listing;
  /** The catalog's host universe — the coverage denominator. */
  hostTotal: number;
  /** The agent selected on the rest of the package page, if any. */
  agent?: AgentChoice | null;
  /** Opens a technical tab. Without it the link still jumps to Details. */
  onOpenTab?: (tab: PackageTabId) => void;
}

function Fact({
  term,
  children,
  detail,
}: {
  term: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div>
      <dt>{term}</dt>
      <dd className="m-0 text-[13.5px] leading-relaxed text-ink-2">
        {children}
        {detail && <div className="mt-1">{detail}</div>}
      </dd>
    </div>
  );
}

export function PlainSummary({ item, hostTotal, agent = null, onOpenTab }: PlainSummaryProps) {
  const avail = availabilityOf(item);
  const feasibility = feasibilityFor(item);
  const hosts = hostsNamedBy(item);
  const selectedFeasibility = agent && agent.id !== "other"
    ? feasibilityFor(item, agent.id)
    : null;
  const selectedTargetListed = agent
    ? hosts.some((host) => host.value === agent.id || host.value === agent.label)
    : false;
  const adapter = agent && agent.id !== "other" ? resolveHost(agent.id) : undefined;
  const skillTarget = agent
    ? SKILL_TARGETS.find((target) => target.id === agent.id)
    : undefined;
  const skillPaths = skillTarget ? skillTargetPaths(skillTarget) : undefined;
  const selectedDestination = item.kind === "skill"
    ? skillPaths?.userPath
      ? `Default Unix user skills folder: ${skillPaths.userPath}. Project folder: ${skillPaths.projectPath}.`
      : skillPaths
        ? `Project-scope folder: ${skillPaths.projectPath}.`
        : null
    : adapter
      ? `Config file: ${hostPath(adapter, "linux")}.`
      : null;

  const installSetup = !avail.installable
    ? avail.plain
    : selectedFeasibility?.state === "supported"
      ? `Install path available for ${agent?.label}.`
      : selectedFeasibility?.state === "requires-setup"
        ? `Project setup is required for ${agent?.label}.`
        : selectedFeasibility?.state === "discovery-only"
          ? `LiteSPM needs more setup details before it can install this for ${agent?.label}.`
          : selectedFeasibility?.state === "unsupported"
            ? `No LiteSPM install path is available for ${agent?.label}.`
            : selectedFeasibility?.state === "unknown"
              ? `LiteSPM does not have a confirmed setup path for ${agent?.label}.`
              : "Install path available — choose an agent to target the command.";

  const detailLink = (tab: PackageTabId, text: string) => (
    <a
      href="#pkg-details"
      onClick={
        onOpenTab
          ? (event) => {
              event.preventDefault();
              onOpenTab(tab);
            }
          : undefined
      }
      className="link t-mono text-[11px]"
    >
      {text}
    </a>
  );

  return (
    <section id="pkg-plain" aria-labelledby="pkg-plain-title" className="mt-8">
      <div className="section-head">
        <h2 id="pkg-plain-title">The short version</h2>
        <span className="section-note">setup and agent fit</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 border-b border-rule pb-4 md:grid-cols-2">
        <Fact term="Install setup" detail={detailLink("security", "setup details →")}>
          {installSetup}
        </Fact>

        <Fact
          term={item.kind === "plugin" ? "Publisher-declared hosts" : "Agent install targets"}
          detail={detailLink("compatibility", "details: Compatibility →")}
        >
          {item.kind === "plugin" ? hosts.length > 0 ? (
            <>
              {selectedTargetListed
                ? `The publisher lists ${agent?.label} for this plugin.`
                : agent
                  ? `${agent.label} is not in the publisher's host list.`
                  : `${hosts.length} agent host${hosts.length === 1 ? "" : "s"} listed for this plugin. Choose yours to see the setup details.`}
            </>
          ) : (
            <>Choose an agent below to see whether setup details are available.</>
          ) : (
            <>
              {selectedFeasibility ? (
                <>
                  {selectedFeasibility.state === "supported"
                    ? `Setup is available for ${agent?.label}.`
                    : selectedFeasibility.state === "requires-setup"
                      ? `Project setup is required for ${agent?.label}.`
                      : selectedFeasibility.state === "discovery-only"
                        ? `More listing details are needed for ${agent?.label}.`
                        : selectedFeasibility.state === "unsupported"
                          ? `This listing cannot be installed for ${agent?.label}.`
                          : `Setup details are unknown for ${agent?.label}.`}
                  {selectedDestination ? ` ${selectedDestination}` : ""}
                </>
              ) : feasibility.supportedHostIds.length > 0 ? (
                <>Setup is available for {feasibility.supportedHostIds.length} of {hostTotal} agent hosts. Select yours to view its destination.</>
              ) : (
                <>Choose an agent to check whether setup is available.</>
              )}
            </>
          )}
        </Fact>
      </dl>

      <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-3">
        Transport, runtime, config paths and the raw commands are in{" "}
        <a href="#pkg-details" className="link">
          Details
        </a>{" "}
        below.
      </p>
    </section>
  );
}
