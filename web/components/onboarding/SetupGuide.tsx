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
 *      state and are gone when the tab closes. The page says "browser
 *      preferences" because that is exactly what they are — a preference that
 *      changes which sentences this page shows you.
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
  format: "json" | "toml";
  /** The key the bridge entry is written under, in the host's own spelling. */
  keyPath: string;
  /** The user-scope configuration file, per platform. */
  paths: { windows: string; macos: string; linux: string };
}

/** The agent answer that is not an agent: "I do not know yet". */
const UNSURE_AGENT = "unsure";

function pathFor(agent: GuideAgent, os: GuideOS): string {
  if (os === "windows") return agent.paths.windows;
  if (os === "macos") return agent.paths.macos;
  return agent.paths.linux;
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
 * The guide itself. Split out so the state lives in one place and the prose
 * reads as a document rather than as a conditional expression.
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
    <div className="mt-9">
      <div className="section-head">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Your guide</h2>
          <p className="section-note mt-0.5">
            {agent
              ? `For ${agent.name} on ${OS_LABEL[os]}.`
              : unsure
                ? "For an agent you have not identified yet."
                : "Pick an agent above to see its file."}
          </p>
        </div>
      </div>

      {/* ---- 1. what this does, and what it does not --------------------- */}
      <section className="mt-5" aria-labelledby="guide-what">
        <h3 id="guide-what" className="text-[14px] font-semibold text-ink">
          What happens when you run this
        </h3>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          LiteSPM is a command-line tool, and every command below runs in your terminal.
        </p>
        {agent && path ? (
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
            When you run the setup, LiteSPM will add <strong className="font-semibold text-ink">one</strong>{" "}
            entry — named <code className="t-mono text-ink">litespm</code> — to {agent.name}&rsquo;s
            configuration file. It backs the file up first, prints the lines it is about to change,
            and waits for you to approve them. Everything else in the file survives: your other
            servers, your comments, your formatting.
          </p>
        ) : (
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
            When you run the setup, LiteSPM adds <strong className="font-semibold text-ink">one</strong>{" "}
            entry — named <code className="t-mono text-ink">litespm</code> — to the configuration file
            of the agent you pick. It backs the file up first, prints the lines it is about to
            change, and waits for you to approve them. Everything else in the file survives: your
            other servers, your comments, your formatting.
          </p>
        )}
        {agent && path ? (
          <div className="mt-3 rounded-panel border border-rule bg-sunken px-4 py-3">
            <p className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">
              The file LiteSPM will edit
            </p>
            <p className="t-mono mt-1 min-h-[20px] break-all text-[12.5px] text-ink">{path}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
              {agent.format.toUpperCase()}. The entry goes under{" "}
              <code className="t-mono text-ink-2">{agent.keyPath}</code>.
              {os === "unsure" ? " That is the documented path; where it lives depends on your platform." : ""}
              {os === "windows" && agent.paths.windows === agent.paths.linux
                ? " Windows and Unix use the same file name, in different folders."
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      {/* ---- 2. prerequisites -------------------------------------------- */}
      <section className="mt-7" aria-labelledby="guide-before">
        <h3 id="guide-before" className="text-[14px] font-semibold text-ink">
          Before you start
        </h3>
        <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-2">
          <li>
            <strong className="font-semibold text-ink">A terminal.</strong>{" "}
            {terminalName(os)} is enough. Nothing else is required, and there is no account to create.
          </li>
          <li>
            <strong className="font-semibold text-ink">Node.js 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+, and npm</strong> — only
            if you install through npm. Both come from{" "}
            <a
              href="https://nodejs.org/en/download"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              nodejs.org
            </a>
            ; npm ships with it, and its own{" "}
            <a
              href="https://docs.npmjs.com/downloading-and-installing-node-js-and-npm"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              install guide
            </a>{" "}
            covers the two commands. The npm package downloads the binary for your platform and
            checks its signature before it installs anything. You can also download a binary
            directly from{" "}
            <a
              href="https://github.com/sarv-projects/LiteSPM/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              GitHub releases
            </a>{" "}
            without installing Node.js.
          </li>
          <li>
            <strong className="font-semibold text-ink">Nothing else.</strong> No account, no
            telemetry, no analytics, and no sign-in. What LiteSPM stores is on your disk, and the{" "}
            <Link href="/privacy/" className="link">
              privacy page
            </Link>{" "}
            says exactly where.
          </li>
        </ul>
      </section>

      {/* ---- 3. install ---------------------------------------------------- */}
      <section className="mt-7" aria-labelledby="guide-install">
        <h3 id="guide-install" className="text-[14px] font-semibold text-ink">
          Step 1: Install LiteSPM
        </h3>
        <div className="mt-3">
          <CommandCopy
            command="npm install -g litespm"
            label="Install the CLI"
            note="Run this in your terminal."
          />
        </div>
        <p className="mt-2.5 max-w-prose text-[12.5px] leading-relaxed text-ink-3">
          You can also run <code className="t-mono text-ink">npx --yes litespm@latest setup</code>
          without permanently installing the npm command. The same platform binaries are published on the{" "}
          <a
            href="https://github.com/sarv-projects/LiteSPM/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            GitHub releases page
          </a>{" "}
          if you would rather not use npm. Check that it worked:
        </p>
        <div className="mt-2">
          <CommandCopy command="litespm version" label="Print the installed version" />
        </div>
      </section>

      {/* ---- 4. the wizard -------------------------------------------------- */}
      <section className="mt-7" aria-labelledby="guide-setup">
        <h3 id="guide-setup" className="text-[14px] font-semibold text-ink">
          Step 2: Connect your agent
        </h3>
        <div className="mt-3">
          <CommandCopy
            command="litespm"
            label="Open the setup wizard"
            note="The same step, without the prompts, is: litespm setup --agent <agent-id>"
          />
        </div>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">What to expect, in order:</p>
        <ol className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-2">
          <li>
            It checks which agent hosts already carry the LiteSPM bridge. If one of them does, it
            says so and opens the management menu instead of offering to set up again.
          </li>
          <li>
            It finds your agent&rsquo;s configuration file and shows you the path. If it cannot
            find one, it asks you for it, and writes to that path or to nothing at all.
          </li>
          <li>
            It prints the lines it is about to change, and asks{" "}
            <code className="t-mono text-ink">Write this change? [Y/n]</code>. Nothing is written
            until you answer yes.
          </li>
          <li>
            It copies the file into a <code className="t-mono text-ink">backups</code> folder
            inside LiteSPM&rsquo;s data folder and then applies the change.
          </li>
        </ol>
        <p className="mt-2.5 max-w-prose text-[12.5px] leading-relaxed text-ink-3">
          The data folder is {dataRoot ? <code className="t-mono text-ink-2">{dataRoot}</code> : ALL_DATA_ROOTS}.
        </p>
      </section>

      {/* ---- 5. the catalog -------------------------------------------------- */}
      <section className="mt-7" aria-labelledby="guide-catalog">
        <h3 id="guide-catalog" className="text-[14px] font-semibold text-ink">
          Step 3: Download the catalog
        </h3>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          LiteSPM keeps a local copy of the catalog. This downloads it from the catalog origin
          (this site, by default) and verifies every file against its published digest.
        </p>
        <div className="mt-3">
          <CommandCopy command="litespm catalog sync" label="Fetch and verify the catalog" />
        </div>
        <p className="mt-2.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Then search it, or browse the same catalog in your browser on the{" "}
          <Link href="/explore/" className="link">
            Explore page
          </Link>
          . A row the site marks{" "}
          <span className="meta-avail meta-avail-blocked">Not installable</span> is a row the
          command will refuse, and it will tell you why.
        </p>
        <div className="mt-2">
          <CommandCopy command="litespm search github" label="Search the catalog you synced" />
        </div>
      </section>

      {/* ---- 6. when it goes wrong ------------------------------------------- */}
      <section className="mt-7" aria-labelledby="guide-trouble">
        <h3 id="guide-trouble" className="text-[14px] font-semibold text-ink">
          If something goes wrong
        </h3>
        <div className="mt-3">
          <CommandCopy
            command="litespm doctor"
            label="Check the local setup"
            note="Reports storage, the database, the catalog and each host configuration as PASS, WARN or FAIL, with a recommendation."
          />
        </div>
        <p className="mt-2.5 max-w-prose text-[13px] leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">Read the output before you share it.</strong>{" "}
          It can contain your home path, your host names and environment values. Take out tokens,
          keys and anything else you would not put in a public issue.
        </p>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
          The three most common failures:
        </p>
        <ul className="mt-2 space-y-2.5 text-[13px] leading-relaxed text-ink-2">
          <li>
            <strong className="font-semibold text-ink">No host is set up</strong> (
            <code className="t-mono text-ink-2">LPSM-INSTALL-TARGET-UNAVAILABLE</code>). The install
            had nowhere to write. Run <code className="t-mono text-ink">litespm host list</code> to
            see which hosts are configured, and{" "}
            <code className="t-mono text-ink">litespm host setup &lt;agent-id&gt;</code> to set one
            up.
          </li>
          <li>
            <strong className="font-semibold text-ink">The entry is refused</strong> (
            <code className="t-mono text-ink-2">LPSM-NOT-INSTALLABLE</code>). That catalog row names
            a capability but publishes no artifact to install. Nothing is wrong with your machine —
            pick an entry the site marks as installable.
          </li>
          <li>
            <strong className="font-semibold text-ink">The plugin cannot be fetched</strong> (
            <code className="t-mono text-ink-2">LPSM-ARTIFACT-UNAVAILABLE</code>). Its publisher
            ships no pinned source LiteSPM can install from, so nothing was written.
          </li>
        </ul>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
          To put things back the way they were:
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CommandCopy
            command="litespm restore"
            label="Roll a config file back to its backup"
            note="Byte for byte, from the copy LiteSPM took before it edited the file."
          />
          <CommandCopy
            command="litespm uninstall"
            label="Remove the bridge entries"
            note="Prints what it deliberately left behind, and the command that removes each thing."
          />
        </div>
      </section>

      {/* ---- 7. next --------------------------------------------------------- */}
      <section className="mt-7" aria-labelledby="guide-next">
        <h3 id="guide-next" className="text-[14px] font-semibold text-ink">
          Next
        </h3>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-2">
          Find something worth installing:{" "}
          <Link href="/explore/" className="link">
            Explore the catalog
          </Link>
          . If you would rather know what the tool does before you run it, read{" "}
          <Link href="/how-it-works/" className="link">
            how it works
          </Link>
          . If something goes wrong that this page does not cover, the{" "}
          <Link href="/support/" className="link">
            support page
          </Link>{" "}
          says where to report it.
        </p>
      </section>
    </div>
  );
}

/**
 * The builder: the two questions, and the guide they produce.
 */
export function SetupGuide({ agents }: { agents: GuideAgent[] }) {
  const [agentId, setAgentId] = useState<string>("");
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
          Which coding agent do you use?
        </legend>
        <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
          LiteSPM supports {agents.length} agent hosts. Start typing to narrow the list.
        </p>

        <label htmlFor="get-started-agent-search" className="mt-3 block text-[12px] text-ink-2">
          Search the list
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

        {/*
          The list is a scroll region, so it is focusable and named: a keyboard
          reader can reach the box itself and scroll it, and the box announces
          what it holds. Fifty radios are too many to print flat, and a page
          that scrolls past two thousand pixels of list before the guide is a
          page nobody reaches the guide on.
        */}
        <div
          role="group"
          aria-labelledby="get-started-agent-legend"
          tabIndex={0}
          className="mt-2 max-h-[320px] overflow-y-auto rounded-panel border border-rule bg-surface"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-ink-2">
              No agent matches “{query.trim()}”. Clear the box to see all {agents.length}, or choose
              “Not sure” below.
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

        <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[13px] text-ink-2 md:min-h-0">
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
      </fieldset>

      <OSSelect value={os} onChange={setOs} />

      <p className="mt-5 max-w-prose text-[12px] leading-relaxed text-ink-3">
        Your answers stay in this tab. They are not saved or sent anywhere.
      </p>

      <Guide agent={agent} os={os} unsure={agentId === UNSURE_AGENT} />
    </div>
  );
}
