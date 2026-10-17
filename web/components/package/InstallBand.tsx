"use client";

import React from "react";
import type { Listing } from "../../lib/telemetry";
import { availabilityOf } from "../../lib/availability";
import { CopyButton } from "./CopyButton";

const INSTALL_COMMAND_PREFIX = "litespm install ";

/**
 * The entry page's first-screen action: the install line, on screen before
 * anything the page has to explain.
 *
 * The competitor entry pages all put the add command directly under the title
 * (mcpservers.org at ~375px, mcp.so at ~926px of a 1440-wide page), and the
 * pages that don't make a reader scroll to find one. This page used to open
 * with the plain-summary block and put the command at 48-51% of the document
 * depth; the band moves it into the title block, above the fold on a phone
 * and a desktop alike.
 *
 * The two states are the CLI's own states, not a marketing variant of them:
 *
 *   installable     → the exact command plus Copy. The command genuinely
 *                     completes without an agent pick — `litespm install`
 *                     resolves its targets itself (detected agent skills trees
 *                     for a skill, every registered bridge host for an MCP
 *                     server) — so the band cannot imply a pick is required.
 *   not installable → a disabled CTA carrying the availability label, with the
 *                     full explanation in the control's tooltip. A short
 *                     label, never a paragraph: the caveat is a property of
 *                     the action, and the detail belongs on hover / in the
 *                     install section below, not as prose in the title block.
 *
 * The band shows the command; the guided three-step flow stays in `AddSteps`
 * ("How do I add it?") and the link here is the path between the two.
 */
export function InstallBand({ item, onSeeSteps }: { item: Listing; onSeeSteps: () => void }) {
  const avail = availabilityOf(item);

  if (!avail.installable) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" disabled className="btn shrink-0" title={avail.plain}>
          Install unavailable
        </button>
        <p className="text-[12px] leading-relaxed text-ink-3" title={avail.plain}>
          {item.kind === "plugin"
            ? "Plugin installs are not supported yet."
            : "No command or endpoint is published for this entry."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 border border-rule-2 bg-sunken px-3 py-2.5">
      <span className="t-mono shrink-0 text-[12px] text-ink-3" aria-hidden="true">
        $
      </span>
      <code className="t-mono min-w-0 flex-1 break-all text-[12.5px] text-ink select-all">
        {INSTALL_COMMAND_PREFIX}
        {item.id}
      </code>
      <CopyButton
        text={`${INSTALL_COMMAND_PREFIX}${item.id}`}
        label="Copy install command"
        message="Install command copied"
      />
      <button
        type="button"
        onClick={onSeeSteps}
        className="t-mono basis-full text-left text-[11px] text-ink-3 transition-colors duration-state ease-out hover:text-ink hover:underline sm:basis-auto sm:shrink-0 sm:text-left"
      >
        three-step guide ↓
      </button>
    </div>
  );
}
