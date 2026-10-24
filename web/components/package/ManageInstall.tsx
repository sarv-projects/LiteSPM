"use client";

import type { Listing } from "../../lib/telemetry";
import { DarkCmd } from "./DarkCmd";
import { CopyButton } from "./CopyButton";

/**
 * Install → manage: what the install control becomes once the reader says the
 * install ran.
 *
 * The honest boundary first: this site is static and LiteSPM's install ledger
 * lives on the reader's machine, so no page here can read it, and a
 * localStorage flag cannot either. Pretending otherwise — a "Remove" button
 * that cannot remove anything — would be worse than the plain button it
 * replaced. So the panel does the three things a static page genuinely can:
 *
 *   1. shows the exact CLI commands that manage the install (`litespm list`
 *      first, because it is the only source of truth), each copyable;
 *   2. offers a prompt that asks the connected agent to read the ledger
 *      through the bridge (`list_installed`) — the one path that can actually
 *      see local state, because the bridge runs where the ledger does;
 *   3. lets the reader clear the browser-only mark, and says what the mark is.
 *
 * The mark itself is written by `AddSteps`; the key helper lives here so both
 * sides cannot drift. It is a note to self, never a claim of installation.
 */

/** localStorage key for "I ran the install for this entry in this browser". */
export function installMarkKey(entryId: string): string {
  return `litespm-install-mark:${entryId}`;
}

interface ManageCommand {
  label: string;
  cmd: string;
  note: string;
}

function commandsFor(item: Listing): ManageCommand[] {
  const commands: ManageCommand[] = [
    {
      label: "See what is really installed",
      cmd: "litespm list",
      note:
        "Lists the packages LiteSPM installed and the IDs used by the commands below. Add `mcp` or `skills` to narrow the list.",
    },
  ];

  if (item.kind === "skill") {
    commands.push({
      label: "Update the skill",
      cmd: "litespm skills update",
      note:
        "Updates all LiteSPM-managed skills from their original sources. Add a name to update one skill.",
    });
    commands.push({
      label: "Remove the skill",
      cmd: "litespm skills remove <name>",
      note:
        "Use the name shown by `litespm skills list`. LiteSPM removes only the skill directory it manages.",
    });
  } else {
    commands.push({
      label: "Update or re-register it",
      cmd: `litespm install ${item.id}`,
      note:
        "Re-running the install reads the current listing and updates its LiteSPM-managed host entry. Your other settings stay in place.",
    });
    commands.push({
      label: "Remove it",
      cmd: "litespm install remove <installId>",
      note:
        "Use the install ID shown by `litespm list`. LiteSPM removes only its own host entry and leaves your other settings in place.",
    });
  }

  commands.push({
    label: "Undo the config write",
    cmd: "litespm restore <installId>",
    note:
      "Restores the host configuration from the backup saved before the change. Add `--host <host-id>` to restore installs for one agent.",
  });

  return commands;
}

export interface ManageInstallProps {
  item: Listing;
  /** Clears the browser mark; the panel disappears with it. */
  onClear: () => void;
}

export function ManageInstall({ item, onClear }: ManageInstallProps) {
  const commands = commandsFor(item);

  const bridgePrompt = [
    "Call the LiteSPM bridge tool list_installed and tell me whether this entry is installed:",
    "",
    `  id:   ${item.id}`,
    `  name: ${item.name}`,
    "",
    "If it is installed, show me its install id, scope and config path, and the exact commands to update or remove it.",
    "If it is not installed, say so and change nothing.",
  ].join("\n");

  return (
    <section
      id="pkg-manage"
      aria-labelledby="pkg-manage-title"
      tabIndex={-1}
      className="mt-6 scroll-mt-16"
    >
      <div className="section-head">
        <h2 id="pkg-manage-title">Manage this install</h2>
        <span className="section-note">Install records stay on your computer</span>
      </div>

      <div className="on-dark panel-dark mt-3">
        <p className="border-b border-dark-rule pb-3.5 text-[13px] leading-relaxed text-dark-ink">
          Use these commands to see, update or remove this package. <code className="t-mono text-dark-ink">litespm list</code> shows what LiteSPM manages on your computer.
        </p>

        <ul className="mt-4 space-y-4">
          {commands.map((command) => (
            <li key={command.label}>
              <h3 className="text-[13.5px] font-semibold text-dark-ink">{command.label}</h3>
              <DarkCmd
                text={command.cmd}
                label={`Copy: ${command.label}`}
                message="Command copied"
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-dark-ink-2">{command.note}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-dark-rule pt-3.5">
          <h3 className="text-[13.5px] font-semibold text-dark-ink">
            Ask your agent what it sees
          </h3>
          <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-dark-ink-2">
            If the LiteSPM bridge is connected to your agent, it can check the install record on your computer. Paste this prompt into that agent; it only reads information.
          </p>
          <div className="mt-2 border border-dark-rule bg-dark-2 px-3 py-2.5">
            <div className="flex items-start gap-3">
              <pre className="t-mono min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-dark-ink select-all">
                {bridgePrompt}
              </pre>
              <CopyButton
                text={bridgePrompt}
                label="Copy the check-with-your-agent prompt"
                message="Check prompt copied"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-dark-rule pt-3.5">
          <button type="button" className="btn" onClick={onClear}>
            Back to installation
          </button>
          <p className="text-[12px] leading-relaxed text-dark-ink-2">
            Use litespm list to see the packages LiteSPM manages on your computer.
          </p>
        </div>
      </div>
    </section>
  );
}
