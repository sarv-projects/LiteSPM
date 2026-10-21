"use client";

import React from "react";
import Link from "next/link";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { availabilityOf } from "../../lib/availability";
import { feasibilityFor } from "../../lib/installFeasibility";
import { isRemoteTransport } from "../../lib/hosts";
import {
  WEBSITE_CATALOG_SYNC_COMMAND,
  WEBSITE_SETUP_COMMAND,
  websiteInstallCommandFor,
} from "../../lib/installCommand";
import { CopyButton } from "./CopyButton";

/**
 * Actual commands supported by the published npm CLI. Website-only release:
 * first-run setup/catalog sync remain explicit, not magically automated.
 * --agent names the target for every kind, and the installer seals that
 * destination in the approved plan.
 */
export function InstallBand({
  item,
  agent,
  onSeeSteps,
}: {
  item: Listing;
  agent: AgentChoice | null;
  onSeeSteps: () => void;
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled className="btn shrink-0" title={availability.plain}>Install unavailable</button>
          <p className="text-[13px] font-semibold text-ink">Install unavailable for this selection</p>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          {incompatible
            ? `${agent?.label} is not a confirmed install target for this entry. Choose another agent below.`
            : availability.plain}
        </p>
        <button className="btn mt-3" type="button" onClick={onSeeSteps}>
          See compatibility and alternatives
        </button>
      </div>
    );
  }	// A remote MCP is hosted by its publisher: LiteSPM writes a config entry that
  // points at it, and nothing runs on this machine. Saying "run locally" on a
  // remote entry is the contradiction the site audit found, so the badge
  // distinguishes the two runtimes instead of describing the installer.
  const remote = isRemoteTransport(item.transport);
  return (
    <section aria-label="Install with LiteSPM" className="mt-5 rounded-xl border border-rule-2 bg-sunken px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">Install with LiteSPM</h2>
        <span className="text-[11px] font-medium text-ink-3">
          {remote ? "Hosted by publisher" : "Runs on your computer"} · No LiteSPM account
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
        {remote
          ? "LiteSPM adds the publisher's endpoint to your agent's configuration. The server itself stays hosted by the publisher."
          : "LiteSPM installs the server on this machine and adds it to your agent's configuration."}{" "}
        Copy the command into your terminal; first-time setup and catalog sync are separate steps for now.
      </p>
      {/* Prerequisites come BEFORE the command: a reader who runs the install
          line on a fresh machine hits "no agent configured" first, and the fix
          then looks like a separate product. The published CLI still needs
          these two steps; the panel says so where the reader is about to act,
          not in a footnote after the copy button. */}
      <details className="mt-3 rounded-lg border border-rule px-3 py-2.5">
        <summary className="cursor-pointer text-[12.5px] font-medium text-ink">
          First time using LiteSPM? Set up these two steps first
        </summary>
        <ol className="mt-3 space-y-3 text-[12px] text-ink-2">
          <li>
            <p className="mb-1">1. Start the interactive wizard and connect your agent.</p>
            <div className="flex items-center gap-2">
              <code className="t-mono min-w-0 flex-1 break-all text-ink">{WEBSITE_SETUP_COMMAND}</code>
              <CopyButton text={WEBSITE_SETUP_COMMAND} label="Copy setup command" message="Setup command copied" />
            </div>
          </li>
          <li>
            <p className="mb-1">2. Download and verify the public catalog.</p>
            <div className="flex items-center gap-2">
              <code className="t-mono min-w-0 flex-1 break-all text-ink">{WEBSITE_CATALOG_SYNC_COMMAND}</code>
              <CopyButton text={WEBSITE_CATALOG_SYNC_COMMAND} label="Copy catalog sync command" message="Catalog command copied" />
            </div>
          </li>
        </ol>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          The published CLI does not yet combine bootstrap, agent setup and installation
          into one interactive command. npx can run LiteSPM without global npm installation.
        </p>
      </details>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-rule bg-surface px-3 py-3">
        <code className="t-mono min-w-0 flex-1 break-all text-[12.5px] leading-relaxed text-ink select-all">
          {command.command}
        </code>
        <CopyButton text={command.command} label="Copy install command" message="Install command copied" />
      </div>	      {chosenId && (
	        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
	          Selected agent: {agent?.label}. The --agent option targets exactly this
	          agent, and the plan seals the destinations before anything is written.
	        </p>
	      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
        <button type="button" onClick={onSeeSteps} className="font-medium text-ink hover:underline">
          Full installation guide ↓
        </button>
        <Link href="/get-started/" className="text-ink-2 hover:text-ink hover:underline">
          Setup help →
        </Link>
      </div>
    </section>
  );
}
