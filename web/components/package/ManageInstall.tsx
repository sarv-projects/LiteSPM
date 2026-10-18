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
        "The ledger on your machine is the source of truth, and it prints the install id the other commands take. `litespm list mcp` and `litespm list skills` narrow it.",
    },
  ];

  if (item.kind === "skill") {
    commands.push({
      label: "Update the skill",
      cmd: "litespm skills update",
      note:
        "No arguments updates every skill LiteSPM installed, each from the source its ledger row recorded; add a name to scope it.",
    });
    commands.push({
      label: "Remove the skill",
      cmd: "litespm skills remove <name>",
      note:
        "Takes the name `litespm skills list` prints. Removal is ledger-scoped: only directories the ledger names are deleted.",
    });
  } else {
    commands.push({
      label: "Update or re-register it",
      cmd: `litespm install ${item.id}`,
      note:
        "Re-running the install re-reads this entry and rewrites the host entries LiteSPM manages for it; nothing is removed that you edited.",
    });
    commands.push({
      label: "Remove it",
      cmd: "litespm install remove <installId>",
      note:
        "Takes the install id `litespm list` prints. It strips only LiteSPM's entries and keeps any node you edited.",
    });
  }

  commands.push({
    label: "Undo the config write",
    cmd: "litespm restore <installId>",
    note:
      "Puts the host config back from the backup LiteSPM took before it wrote. `litespm restore --host <host-id>` restores every install for one host.",
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
        <span className="section-note">the ledger stays on your machine</span>
      </div>

      <div className="on-dark panel-dark mt-3">
        <p className="border-b border-dark-rule pb-3.5 text-[13px] leading-relaxed text-dark-ink">
          These are the commands you run yourself —{" "}
          <code className="t-mono text-dark-ink">litespm list</code> is the one source of truth
          for what is installed.
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
            The LiteSPM bridge runs where the ledger does, so your agent can check this for
            real. Paste this into the agent you installed it for — it only reads.
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
            Not installed — clear this mark
          </button>
          <p className="text-[12px] leading-relaxed text-dark-ink-2">
            The mark this page showed is stored in this browser only. Clearing it changes
            nothing on your machine.
          </p>
        </div>
      </div>
    </section>
  );
}
