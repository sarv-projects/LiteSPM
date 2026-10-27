"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { CommandCopy } from "./CommandCopy";
import { OSSelect, terminalName, type GuideOS } from "./OSSelect";

/**
 * The setup guide builder on `/get-started/`.
 *
 * It asks two questions — which agent, which operating system — and prints a
 * short guide built from the answers. That is all it does, and the page says
 * so in as many words, because the failure mode this component exists to
 * avoid is a reader believing that ticking two boxes configured anything.
 *
 * Three rules hold everywhere in here:
 *
 *   1. **Nothing is installed, detected or verified.** The answers are read
 *      from the two controls and nowhere else. There is no system probe, no
 *      network call, and no storage key: the answers live in this component's
 *      state and are gone when the tab closes. They only change the guide text.
 *   2. **No state that could be read as success.** There is no checkmark, no
 *      "ready", no "done" anywhere in the guide, and no sentence that could be
 *      quoted as "the setup completed". The guide is a list of commands for
 *      the reader to run, in their own terminal.
 *   3. **Every path and command comes from the registry**, not from a
 *      hand-typed list: the agent rows are built on the server from
 *      `lib/hosts.ts`, the same file the entry pages read, so the guide cannot
 *      print a path the binary would refuse to write.
 *
 * The component is deliberately split from its page: the page is a Server
 * Component that resolves the agent rows at build time, and only this
 * interactive part is shipped to the browser.
 */

/** One agent host, as the guide needs it. Built on the server from the registry. */
export interface GuideAgent {
  /** The adapter id, as `litespm host setup <id>` takes it. */
  id: string;
  /** The display name the registry publishes. */
  name: string;
  /** The configuration file's format. */
  format: "json" | "toml" | "extension";
  /** The key the bridge entry is written under, in the host's own spelling. */
  keyPath: string;
  /** The user-scope configuration file, per platform. */
  paths: { windows: string; macos: string; linux: string };
}

/** The agent answer that is not an agent: "I do not know yet". */
const UNSURE_AGENT = "unsure";

function pathFor(agent: GuideAgent, os: GuideOS): string | null {
  if (os === "windows") return agent.paths.windows;
  if (os === "macos") return agent.paths.macos;
  if (os === "linux") return agent.paths.linux;
  return null;
}

function dataRootFor(os: GuideOS): string {
  switch (os) {
    case "macos":
      return "~/Library/Application Support/LiteSPM";
    case "linux":
      return "~/.local/share/litespm";
    case "windows":
      return "%LOCALAPPDATA%\\LiteSPM";
    default:
      return "";
  }
}

const ALL_DATA_ROOTS = (
  <>
    <code className="t-mono text-ink-2">~/Library/Application Support/LiteSPM</code> on macOS ·{" "}
    <code className="t-mono text-ink-2">~/.local/share/litespm</code> on Linux ·{" "}
    <code className="t-mono text-ink-2">%LOCALAPPDATA%\LiteSPM</code> on Windows
  </>
);

/**
 * The guide itself. The first steps stay visible; detailed requirements and
 * recovery notes sit behind one disclosure.
 */
const OS_LABEL: Record<GuideOS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  unsure: "your platform",
};

function Guide({
  agent,
  os,
  unsure,
}: {
  agent: GuideAgent | null;
  os: GuideOS;
  /** True when the reader answered "Not sure / just exploring". */
  unsure: boolean;
}) {
  const path = agent ? pathFor(agent, os) : null;
  const dataRoot = dataRootFor(os);

  return (
    <section className="mt-9" aria-labelledby="guide-steps-title">
      <div className="section-head">
        <div>
          <h2 id="guide-steps-title" className="text-[15px] font-semibold text-ink">
            Your first three steps
          </h2>
          <p className="section-note mt-0.5">
            {agent
              ? `For ${agent.name} on ${OS_LABEL[os]}.`
              : unsure
                ? "For an agent you have not identified yet."
                : "Pick an agent above to see its exact setup path."}
          </p>
        </div>
      </div>

      <ol className="mt-4 divide-y divide-rule">
        <li className="py-5 first:pt-0">
          <p className="t-mono text-[11px] font-medium text-accent-text">01 · INSTALL</p>
          <h3 className="mt-1 text-[14px] font-semibold text-ink">Install LiteSPM</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            Requires Node.js 22.22.2+ on 22.x, 24.15.0+ on 24.x, or 26+ and npm. Signed binaries are available if you prefer to install without Node.js.
          </p>
          <div className="mt-3">
            <CommandCopy command="npm install -g litespm" label="Install the CLI" note={`Run this in ${terminalName(os)}.`} />
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            One-off option: <code className="t-mono text-ink">npx --yes litespm@latest setup</code>. Here <code className="t-mono text-ink">--yes</code> only accepts npm&rsquo;s download prompt; LiteSPM still asks before writing.
          </p>
        </li>

        <li className="py-5">
          <p className="t-mono text-[11px] font-medium text-accent-text">02 · CONNECT</p>
          <h3 className="mt-1 text-[14px] font-semibold text-ink">Connect your agent</h3>
          <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
            The wizard shows the target file and planned change, makes a backup, then waits for your approval before it writes.
          </p>
          {path ? (
            <div className="mt-3 rounded-panel border border-rule bg-sunken px-4 py-3">
              <p className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">File for {agent!.name}</p>
              <p className="t-mono mt-1 break-all text-[12.5px] text-ink">{path}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
                {agent!.format === "extension"
                  ? "TypeScript extension; opens the /marketplace command."
                  : <>{agent!.format.toUpperCase()}; bridge entry under <code className="t-mono text-ink-2">{agent!.keyPath}</code>.</>}
              </p>
            </div>
          ) : agent ? (
            <p className="mt-3 rounded-panel border border-rule bg-sunken px-4 py-3 text-[12px] leading-relaxed text-ink-2">
              Choose a system to show its path.
            </p>
          ) : (
            <p className="mt-3 rounded-panel border border-rule bg-sunken px-4 py-3 text-[12px] leading-relaxed text-ink-2">
              Choose your agent in the wizard; LiteSPM shows its exact file before any change.
            </p>
          )}
          <div className="mt-3">
            <CommandCopy
              command="litespm"
              label="Open the setup wizard"
              note="To choose a host directly, use litespm setup --agent <agent-id>. Review and approve before LiteSPM writes."
            />
          </div>
        </li>

        <li className="py-5 last:pb-0">
          <p className="t-mono text-[11px] font-medium text-accent-text">03 · DISCOVER</p>
          <h3 className="mt-1 text-[14px] font-semibold text-ink">Sync the catalog</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            Download and verify the package list once, then search locally or browse it on the web.
          </p>
          <div className="mt-3">
            <CommandCopy command="litespm catalog sync" label="Fetch and verify the catalog" />
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            Search from your terminal with <code className="t-mono text-ink">litespm search github</code>, or <Link href="/explore/" className="link">browse the catalog</Link> and review an install path.
          </p>
        </li>
      </ol>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-3">
        Your answers stay in this tab. They are not saved or sent anywhere.
      </p>

      <details data-setup-details className="mt-5 rounded-panel border border-rule bg-surface">
        <summary className="min-h-[44px] cursor-pointer px-4 py-3 text-[13px] font-medium text-ink hover:bg-hover">
          Requirements, setup details and recovery
        </summary>
        <div className="space-y-6 border-t border-rule p-4 sm:p-5">
          <section aria-labelledby="guide-requirements">
            <h3 id="guide-requirements" className="text-[13px] font-semibold text-ink">Requirements</h3>
            <ul className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-ink-2">
              <li>A terminal. On Windows use PowerShell or Windows Terminal; on macOS use Terminal; on Linux use your preferred terminal.</li>
              <li>Node.js and npm are needed for the npm install. See <a href="https://nodejs.org/en/download" target="_blank" rel="noopener noreferrer" className="link">nodejs.org</a>; npm ships with Node.js. You can instead use the signed <a href="https://github.com/sarv-projects/LiteSPM/releases/latest" target="_blank" rel="noopener noreferrer" className="link">GitHub release binaries</a>.</li>
              <li>No account or sign-in is required. <Link href="/privacy/" className="link">Privacy details</Link> explain what stays on your machine.</li>
            </ul>
          </section>

          <section aria-labelledby="guide-behavior">
            <h3 id="guide-behavior" className="text-[13px] font-semibold text-ink">What setup changes</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              LiteSPM checks for an existing bridge entry, finds or asks for the configuration file, then prints the proposed change. It backs up the file before writing and leaves other entries and formatting intact.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              Backup and local data folder: {dataRoot ? <code className="t-mono text-ink-2">{dataRoot}</code> : ALL_DATA_ROOTS}.
            </p>
          </section>

          <section aria-labelledby="guide-trouble">
            <h3 id="guide-trouble" className="text-[13px] font-semibold text-ink">If something goes wrong</h3>
            <div className="mt-3">
              <CommandCopy command="litespm doctor" label="Check the local setup" note="Reports storage, database, catalog and host configuration status." />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              Read the output before sharing it: it may contain home paths, host names or environment values. Remove tokens, keys and anything private.
            </p>
            <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-ink-2">
              <li><strong className="font-semibold text-ink">No host is configured.</strong> Run <code className="t-mono text-ink">litespm host list</code>, then <code className="t-mono text-ink">litespm host setup &lt;agent-id&gt;</code>.</li>
              <li><strong className="font-semibold text-ink">The listing is not installable.</strong> Choose a package page marked as installable; a descriptive listing alone does not mean it has an artifact LiteSPM can install.</li>
              <li><strong className="font-semibold text-ink">A plugin source cannot be fetched.</strong> LiteSPM needs a pinned source from its publisher. If that is missing, it stops before writing.</li>
            </ul>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CommandCopy command="litespm restore" label="Restore the config backup" note="Restore the copy taken before LiteSPM edited the file." />
              <CommandCopy command="litespm uninstall" label="Remove bridge entries" note="Prints the changes before applying them." />
            </div>
          </section>
        </div>
      </details>

      <p className="mt-5 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
        Need more context? Read <Link href="/how-it-works/" className="link">how LiteSPM works</Link> or visit <Link href="/support/" className="link">Support</Link>.
      </p>
    </section>
  );
}

/**
 * The builder: the two questions, and the guide they produce.
 */
export function SetupGuide({ agents }: { agents: GuideAgent[] }) {
  const [agentId, setAgentId] = useState<string>(UNSURE_AGENT);
  const [os, setOs] = useState<GuideOS>("unsure");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(needle) || agent.id.toLowerCase().includes(needle)
    );
  }, [agents, query]);

  const agent = agents.find((a) => a.id === agentId) ?? null;

  return (
    <div>
      <fieldset>
        <legend
          id="get-started-agent-legend"
          className="text-[14px] font-semibold text-ink"
        >
          Which agent do you use?
        </legend>
        <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
          The guide works before you choose. Pick a specific profile when you need its exact file path.
        </p>

        <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[13px] text-ink-2 md:min-h-0">
          <input
            type="radio"
            name="get-started-agent"
            value={UNSURE_AGENT}
            checked={agentId === UNSURE_AGENT}
            onChange={() => setAgentId(UNSURE_AGENT)}
            className="h-4 w-4 shrink-0 accent-ink"
          />
          <span className="text-ink">Not sure / just exploring</span>
        </label>

        <details data-agent-picker className="mt-2 rounded-panel border border-rule bg-surface">
          <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-[13px] font-medium text-ink hover:bg-hover">
            {agent ? `Change agent · ${agent.name}` : `Choose a specific agent (${agents.length} profiles)`}
          </summary>
          <div className="border-t border-rule p-3">
            <label htmlFor="get-started-agent-search" className="block text-[12px] text-ink-2">
              Search the {agents.length} profiles
            </label>
            <input
              id="get-started-agent-search"
              type="search"
              name="agent-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="claude, codex, opencode…"
              autoComplete="off"
              className="field mt-1 w-full max-w-sm"
            />
            <p className="mt-1.5 text-[12px] text-ink-3" role="status">
              Showing {filtered.length} of {agents.length}
            </p>
            <div
              role="group"
              aria-labelledby="get-started-agent-legend"
              tabIndex={0}
              className="mt-2 max-h-[240px] overflow-y-auto rounded-panel border border-rule bg-surface"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-ink-2">
                  No agent matches “{query.trim()}”. Clear the search or keep the general guide.
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {filtered.map((row) => (
                    <li key={row.id}>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-ink-2 transition-colors duration-state ease-out hover:bg-hover hover:text-ink md:min-h-0">
                        <input
                          type="radio"
                          name="get-started-agent"
                          value={row.id}
                          checked={agentId === row.id}
                          onChange={() => setAgentId(row.id)}
                          className="h-4 w-4 shrink-0 accent-ink"
                        />
                        <span className="min-w-0 truncate text-ink">{row.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      </fieldset>

      <OSSelect value={os} onChange={setOs} />

      <p className="mt-5 max-w-prose text-[12px] leading-relaxed text-ink-3">
        Your answers stay in this tab. They are not saved or sent anywhere.
      </p>

      <Guide agent={agent} os={os} unsure={agentId === UNSURE_AGENT} />
    </div>
  );
}
