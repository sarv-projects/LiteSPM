"use client";

import React from "react";
import Link from "next/link";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { availabilityOf } from "../../lib/availability";
import { feasibilityFor } from "../../lib/installFeasibility";
import { isRemoteTransport } from "../../lib/hosts";
import { websiteInstallCommandFor } from "../../lib/installCommand";
import { CopyButton } from "./CopyButton";

/**
 * Actual commands supported by the published npm CLI. Website-only release:
 * first-run setup/catalog sync remain explicit, not magically automated.
 * `--host` names the target for every kind, and the installer seals that
 * destination in the approved plan. It is spelled `--host` rather than
 * `--agent` because `npx --yes litespm@latest` runs the published release,
 * and that release's install verb takes `--host` — see
 * `lib/installCommand.ts` for the full account.
 */
export function InstallBand({
  item,
  agent,
  onSeeSteps,
  onChooseAgent,
}: {
  item: Listing;
  agent: AgentChoice | null;
  onSeeSteps: () => void;
  onChooseAgent: () => void;
}) {
  const availability = availabilityOf(item);
  const chosenId = agent && agent.id !== "other" ? agent.id : null;
  const feasibility = chosenId ? feasibilityFor(item, chosenId) : null;
  const incompatible = Boolean(chosenId && feasibility && feasibility.state !== "supported");
  const command = availability.installable && !incompatible
    ? websiteInstallCommandFor(item, chosenId)
    : null;

  if (!availability.installable || incompatible || !command) {
    return (
      <div className="mt-4 rounded-xl border border-rule-2 bg-sunken px-4 py-4">
        <p className="text-[13px] font-semibold text-ink">
          {incompatible
            ? feasibility?.state === "unknown"
              ? "Choose another agent"
              : feasibility?.state === "requires-setup"
                ? "Review project setup"
                : `Choose another agent for ${item.name}`
            : "View setup options"}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          {incompatible
            ? feasibility?.state === "unknown"
              ? `Choose an agent with a setup path for ${item.name}.`
              : feasibility?.state === "requires-setup"
                ? `${agent?.label} uses project-level configuration. Review the destination before installing.`
                : `${agent?.label} does not support this package's connection type. Choose another agent.`
            : availability.plain}
        </p>
        {/* A discovery-only SKILL is the one case where a manual path exists
            and works: the skill is a repository somewhere, and the installer
            the manual command runs is the same one, with the same ledger. The
            page already shows this row's own source below, so the two lines
            meet without the reader having to hunt for the address. */}
        {!incompatible && availability.id === "discovery" && item.kind === "skill" && item.skillSource ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            Install it by hand from the repository the publisher names (shown under Source
            below): <code className="t-mono">litespm skills add &lt;repo&gt;</code>. That path
            verifies the skill's <code className="t-mono">SKILL.md</code> as it copies, and the
            result is ledgered exactly like an installed listing.
          </p>
        ) : null}
        <button
          className="btn mt-3"
          type="button"
          onClick={incompatible ? onChooseAgent : onSeeSteps}
        >
          {incompatible ? "Choose another agent" : "See setup options"}
        </button>
      </div>
    );
  }	// A remote MCP is hosted by its publisher: LiteSPM writes a config entry that
  // points at it, and nothing runs on this machine. Saying "run locally" on a
  // remote entry is the contradiction the site audit found, so the badge
  // distinguishes the two runtimes instead of describing the installer.
  const remote = isRemoteTransport(item.transport) && Boolean(item.url);
  const runtimeLabel = remote
    ? "Publisher-hosted endpoint"
    : item.kind === "skill"
      ? "Copies skill files"
      : item.kind === "plugin"
        ? "Installs pinned source"
        : "Local MCP process";
  const installDescription = remote
    ? "LiteSPM adds the publisher's endpoint to your agent's configuration. The server itself stays hosted by the publisher."
    : item.kind === "skill"
      ? "LiteSPM copies this skill into the agent's documented skills folder and records the files so you can remove or restore them."
      : item.kind === "plugin"
        ? "LiteSPM fetches the publisher's pinned source, reads its manifest, and registers the MCP servers that manifest declares."
        : "LiteSPM adds this MCP server to your agent's configuration using its published install details. Its local process runs on this computer.";
  return (
    <section aria-label="Install with LiteSPM" className="mt-5 rounded-xl border border-rule-2 bg-sunken px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">Install with LiteSPM</h2>
        <span className="text-[11px] font-medium text-ink-3">
          {runtimeLabel} · No LiteSPM account
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
        {installDescription}{" "}
        Copy the command into your terminal to install this package with LiteSPM.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-rule bg-surface px-3 py-3">
        <code className="t-mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[12.5px] leading-relaxed text-ink select-all">
          {command.command}
        </code>
        <CopyButton text={command.command} label="Copy install command" message="Install command copied" />
      </div>
      {chosenId && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
          Selected agent: {agent?.label}. The --host option targets exactly this
          agent, and the plan seals the destinations before anything is written.
        </p>
      )}
      {!chosenId && command.command.includes("install skill:") && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
          With no agent chosen, this installs into the skills targets detected on this
          machine. Add <code className="t-mono">--host &lt;id&gt;</code> (repeatable) to
          name the ones you want instead.
        </p>
      )}
      {!chosenId && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-surface px-3 py-2.5">
          <p className="max-w-[56ch] text-[12px] leading-relaxed text-ink-2">
            Want to name a specific agent? Choose it to check the target and add it to this command.
          </p>
          <button type="button" onClick={onChooseAgent} className="btn shrink-0">
            Choose an agent target
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-ink-3">First install? The guide covers agent setup and catalog sync.</p>
          <button type="button" onClick={onSeeSteps} className="font-medium text-ink hover:underline">
            Full installation guide ↓
          </button>
        </div>
        <Link href="/get-started/" className="text-ink-2 hover:text-ink hover:underline">
          Setup help →
        </Link>
      </div>
    </section>
  );
}
