"use client";

import React from "react";
import type { Listing } from "../../lib/telemetry";
import { availabilityOf } from "../../lib/availability";
import {
  exactIdCommand,
  installCommandFor,
  searchCommand,
} from "../../lib/installCommand";
import { CopyButton } from "./CopyButton";

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
 *
 * ## Which command
 *
 * `lib/installCommand.ts` decides, because the CLI decides: the short form
 * (`litespm install --search <term>`) is published only when the binary
 * accepts it, and the exact id is always available — in the disclosure when
 * the short form is the headline, and as the headline when it is not. A page
 * that printed a command the binary refuses would break the one promise this
 * site makes, so the switch is gated by
 * `scripts/check-install-command.mjs` against the CLI's own flag parser.
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

  const command = installCommandFor(item);

  return (
    <div className="mt-4 border border-rule-2 bg-sunken px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="t-mono shrink-0 text-[12px] text-ink-3" aria-hidden="true">
          $
        </span>
        <code className="t-mono min-w-0 flex-1 break-all text-[12.5px] text-ink select-all">
          {command.command}
        </code>
        <CopyButton
          text={command.command}
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

      {/*
       * One line saying what the command is. In the id form the reason is the
       * interesting part: the id is long, and a reader who wonders "is there
       * a shorter way?" deserves the answer rather than the length.
       */}
      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{command.label}</p>

      {/*
       * The disclosure holds the OTHER way to do this, so the exact id is
       * always one click away and never the thing a reader has to copy:
       *
       *   short form published → the exact id, the unambiguous form;
       *   id form published     → `litespm search`, which finds the entry by
       *                          name in the local index and prints its id.
       */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11.5px] font-medium text-ink-2 hover:text-ink">
          {command.short ? "Details — the exact id" : "Details — find it by name"}
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="t-mono shrink-0 text-[12px] text-ink-3" aria-hidden="true">
            $
          </span>
          <code className="t-mono min-w-0 flex-1 break-all text-[12px] text-ink-2 select-all">
            {command.short ? exactIdCommand(item) : searchCommand(item)}
          </code>
          <CopyButton
            text={command.short ? exactIdCommand(item) : searchCommand(item)}
            label={command.short ? "Copy the exact id command" : "Copy the search command"}
            message={command.short ? "Install command copied" : "Search command copied"}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          {command.short
            ? "The id is unambiguous: it names this entry and nothing else. Copy it when you want the install to be exact."
            : "LiteSPM's installer takes the entry's exact id and has no short name for it, so the id above is the command that installs. `litespm search` looks the entry up by name in the catalog index on your machine and prints the id — it needs a synced index (`litespm catalog sync`)."}
        </p>
      </details>
    </div>
  );
}
