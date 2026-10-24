"use client";

import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { availabilityOf } from "../../lib/availability";
import { feasibilityFor } from "../../lib/installFeasibility";
import { WEBSITE_CATALOG_SYNC_COMMAND, WEBSITE_SETUP_COMMAND, websiteInstallCommandFor } from "../../lib/installCommand";
import { TabList } from "../ui/TabList";
import { CopyButton } from "./CopyButton";
import { DarkCmd } from "./DarkCmd";
import { ManageInstall, installMarkKey } from "./ManageInstall";
import { ManualSetup } from "./ManualSetup";

/**
 * The two ways to take the third step. "Command" is the CLI line the reader
 * types; "Prompt" is the same install handed to the agent through the bridge
 * instead. Shown when the same installability gate used by the catalog allows installation.
 * Pinned plugins may be supported; other plugin listings remain discovery only.
 */
const MODES = [
  { id: "command", label: "Command" },
  { id: "prompt", label: "Prompt" },
] as const;
type Mode = (typeof MODES)[number]["id"];

/**
 * Scroll a section into view and hand it focus, without a `#hash` link —
 * the detail view only exists after `?slug=` resolves in the browser, so a
 * fragment href would point at ids the prerendered HTML never contains.
 * Reduced-motion readers get an instant cut, per ARCH/25 §5.3.
 */
/** Smooth-in, instant-under-reduced-motion, then hand the section focus. */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

/** A command line on the dark surface now lives in `./DarkCmd`, shared with
 *  the management panel. */

export interface AddStepsProps {
  item: Listing;
  /** The agent the reader picked (`litespm-agent`); null when unset. */
  agent: AgentChoice | null;
  /** Scrolls to the "Will it work with what I use?" selector. */
  onChooseAgent: () => void;
}

/**
 * Question five of the package page — "How do I add it?" — and the only place
 * on this route that tells a reader to run something.
 *
 * ARCH/25 §7.3 shapes it as a state that reflects the selected agent plus a
 * three-step guided flow, because a static page cannot detect whether LiteSPM
 * is installed in a browser. The two states therefore speak about the one
 * signal that actually exists — the agent choice stored in this browser — and
 * never about a local installation:
 *
 *   installable + selected  → "You chose <agent>" + a primary action that
 *                             takes you to the install command;
 *   installable + unset     → the default any-agent install command, with
 *                             Copy, before the agent pick — the command
 *                             genuinely completes without a choice (the CLI
 *                             resolves its targets itself: detected agent
 *                             skills trees for a skill, every registered
 *                             bridge host for an MCP server), so the pick is
 *                             an upgrade to the rest of the page, never a
 *                             gate in front of the command;
 *   otherwise               → the CLI's fail-closed status, without an install
 *                             command for an entry it cannot install.
 *
 * The installable state offers that third step two ways — the CLI command, or
 * a prompt the reader pastes into the agent; both end in the same
 * `request_install` with a human approval between the plan and the write.
 *
 * The generic host-setup block (agent × OS config path + raw snippet) lives in
 * the single `ManualSetup` disclosure below the panel — never above the fold,
 * and nowhere else on the page.
 */
export function AddSteps({ item, agent, onChooseAgent }: AddStepsProps) {
  const avail = availabilityOf(item);
  // The same availability result powers the search cards and the first-screen
  // InstallBand; a pinned plugin is not unconditionally unavailable.
  const chosenHostId = agent && agent.id !== "other" ? agent.id : null;
  const targetFeasibility = chosenHostId ? feasibilityFor(item, chosenHostId) : null;
  const invalidSelectedHost = Boolean(chosenHostId && targetFeasibility?.state !== "supported");
  const liteSPMInstallable = avail.installable && !invalidSelectedHost;	// Every kind can be targeted now: `install --host <id>` names a host for an
	// MCP server or plugin and a skills target for a skill, and the plan seals
	// that destination, so the copy cannot fan out past it. (`--host` is the
	// spelling every published release takes; `--agent` names the same thing.)
	const targeted = liteSPMInstallable && agent !== null && agent.id !== "other";

  /**
   * The install → manage transition (VS Code's extension button, as far as a
   * static page can honestly take it).
   *
   * Once the reader says the install ran, the panel's primary state becomes
   * management instead of installation: the guided flow collapses and the
   * management panel (`ManageInstall`) opens with the exact CLI commands and a
   * bridge prompt that can read the real ledger. The mark is read from
   * localStorage after mount — never during render — so the pre-rendered HTML
   * and the first client frame agree, and it is explicitly a note to self, not
   * a claim that anything was installed. The page cannot read LiteSPM's
   * ledger, so it does not pretend to; `ManageInstall` says why.
   */
  const [marked, setMarked] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  useEffect(() => {
    try {
      setMarked(Boolean(window.localStorage.getItem(installMarkKey(item.id))));
    } catch {
      // Storage can be unavailable (private mode, policy); the panel still
      // works, it just cannot remember the choice.
    }
  }, [item.id]);

  const markInstalled = () => {
    try {
      window.localStorage.setItem(installMarkKey(item.id), String(Date.now()));
    } catch {
      /* best-effort, same as the agent preference */
    }
    setMarked(true);
    setShowSteps(false);
    window.requestAnimationFrame(() => scrollToSection("pkg-manage"));
  };

  const clearMark = () => {
    try {
      window.localStorage.removeItem(installMarkKey(item.id));
    } catch {
      /* best-effort */
    }
    setMarked(false);
    setShowSteps(false);
  };


  /**
   * The prompt the Prompt tab copies. Every instruction in it is a thing the
   * binary actually does, in the order it does them: `prepare_install` returns
   * a plan carrying its own `planId`, a person runs `litespm approve <planId>`
   * on a terminal (the command refuses a non-interactive caller precisely so
   * an agent cannot approve for you), and `request_install` executes the plan
   * with the single-use token that prints. The last line is the fail-closed
   * instruction — no bridge, no install, no guessed fallback.
   */
  const prompt = [
    `Install the LiteSPM catalog entry "${item.id}" into this agent.`,
    "",
    `1. Call the LiteSPM bridge tool prepare_install with id "${item.id}" and show me the full plan it returns.`,
    "2. Stop and wait. I will run `litespm approve <planId>` in my terminal and give you the single-use token it prints.",
    "3. Call request_install with that planId and token, then tell me exactly what was written.",
    "",
    "Do not install anything before I approve the plan. If the LiteSPM bridge is not connected to this agent, say so and stop.",
  ].join("\n");

  // Which of the two equivalent routes the reader is looking at. Local state
  // only: both panels render from the row already in memory, nothing is
  // fetched by switching.
  const [mode, setMode] = useState<Mode>("command");

  /**
   * The install command, in the form the CLI accepts.
   *
   * Read from `lib/installCommand.ts` — the one module that knows whether the
   * binary takes a short term or only the exact id — so this panel and the
   * band above the fold cannot print two different commands for one entry.
   */
  const installCommand = liteSPMInstallable	    ? websiteInstallCommandFor(item, agent && agent.id !== "other" ? agent.id : null)
    : null;

  /**
   * The CTA in the state strip always lands on the install command. When the
   * reader is on the Prompt tab, "pkg-step-add" is not in the DOM yet, so the
   * tab is switched first and the scroll happens on the frame after the
   * commit — `scrollToSection` no-ops on a missing id, and a button that
   * silently does nothing is worse than one that changes a tab.
   */
  const goToInstallCommand = () => {
    if (mode === "command") {
      scrollToSection("pkg-step-add");
      return;
    }
    setMode("command");
    window.requestAnimationFrame(() => scrollToSection("pkg-step-add"));
  };

  return (
    <section id="pkg-add" aria-labelledby="pkg-add-title" tabIndex={-1} className="scroll-mt-16">
      <div className="section-head">
        <h2 id="pkg-add-title">How do I add it?</h2>
        <span className="section-note">
          {liteSPMInstallable
            ? marked
              ? "manage the install"
              : "three steps, or one prompt"
            : "setup details"}
        </span>
      </div>

      <div className="on-dark panel-dark mt-3">
        {/* ---- state: what this page can actually know ---- */}
        {liteSPMInstallable && marked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-rule pb-3.5">
            <p className="flex min-w-0 items-start gap-2 text-[13px] leading-relaxed text-dark-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-dark-signal" aria-hidden="true" />
              <span>
                Manage {item.name} with the commands below. Run <code className="t-mono">litespm list</code> to view its installation on your computer.
              </span>
            </p>
            <button
              type="button"
              className="btn shrink-0"
              onClick={() => setShowSteps((shown) => !shown)}
            >
              {showSteps ? "Hide the install steps" : "Show the install steps"}
            </button>
          </div>
        ) : !liteSPMInstallable ? (
          <div className="border-b border-dark-rule pb-3.5">
            <h3 className="text-[14px] font-semibold text-dark-ink">
              {invalidSelectedHost
                ? targetFeasibility?.state === "unknown"
                  ? "Check this agent’s setup"
                  : targetFeasibility?.state === "requires-setup"
                    ? "Review project setup"
                    : "Choose another agent"
                : "Installation information"}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-dark-ink-2">
              {invalidSelectedHost
                ? targetFeasibility?.state === "unknown"
                  ? `Choose another agent to see setup options for ${item.name}.`
                  : targetFeasibility?.state === "requires-setup"
                    ? `${agent?.label} uses project-level configuration. Review the destination before installing.`
                    : `${agent?.label} does not support this package's connection type. Choose another agent.`
                : avail.plain}
            </p>
            {invalidSelectedHost && (
              <button type="button" className="btn mt-3" onClick={onChooseAgent}>
                Choose another agent
              </button>
            )}
          </div>
        ) : targeted ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-rule pb-3.5">
            <p className="flex min-w-0 items-start gap-2 text-[13px] leading-relaxed text-dark-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-dark-signal" aria-hidden="true" />
              <span>
                Install target: <strong className="font-medium">{agent?.label}</strong>.
              </span>
            </p>
            <button
              type="button"
              className="btn btn-solid btn-lg shrink-0"
              onClick={goToInstallCommand}
            >
              {/* Not "Add X to Y": this only moves the reader down to the steps.
                  The site cannot reach a locally installed LiteSPM, so it never
                  installs anything, and a button that promises an action it
                  cannot take is the kind of label that costs trust on first use. */}
              Get the command for {agent?.label}
            </button>
          </div>
        ) : (
          <div className="border-b border-dark-rule pb-3.5">
            <p className="min-w-0 text-[13px] leading-relaxed text-dark-ink">
              {agent ? (
                <>
                  You chose{" "}
                  <strong className="font-medium text-dark-ink">&ldquo;{agent.label}&rdquo;</strong>.
                  {item.kind === "skill"
                    ? " This agent has no dedicated install target. The command will use every supported skill location on your machine."
                    : " LiteSPM will check this agent before installation."}
                </>
              ) : (
                <>
                  Without an agent choice, LiteSPM uses the skill locations and MCP hosts already set up on your machine.
                </>
              )}
            </p>
            <DarkCmd
              text={installCommand?.command ?? ""}
              label="Copy install command"
              message="Install command copied"
            />
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <button type="button" className="btn" onClick={onChooseAgent}>
                Choose your agent
              </button>
              <p className="text-[12px] leading-relaxed text-dark-ink-2">
                Choose your agent to add <code className="t-mono">--host &lt;id&gt;</code> and
                install into that agent’s configuration. Review its destination before approving.
              </p>
            </div>
          </div>
        )}

        {/* ---- the guided flow is shown only for entries the CLI can install,
             and collapses once the reader has marked the install as run ---- */}
        {liteSPMInstallable && (!marked || showSteps) && (
          <>
            <TabList
              tabs={MODES}
              active={mode}
              onChange={setMode}
              label="How to run the install"
              idPrefix="pkg-add"
              variant="dark"
              className="mt-3"
            />

            {/* Route one: the command, exactly as the CLI accepts it. */}
            <div
              role="tabpanel"
              id="pkg-add-panel-command"
              aria-labelledby="pkg-add-tab-command"
              tabIndex={0}
              hidden={mode !== "command"}
              className="mt-4"
            >
              <ol id="pkg-steps" className="space-y-5">
                <li>
                  <div className="flex items-baseline gap-3">
                    <span className="t-mono t-tabular shrink-0 text-[12px] font-medium text-dark-signal">
                      01
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-dark-ink">Connect your agent with LiteSPM</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-dark-ink-2">
                        npx obtains the CLI when needed; follow the prompts to configure your agent.
                      </p>
                    </div>
                  </div>
                  <DarkCmd
                    text={WEBSITE_SETUP_COMMAND}
                    label="Copy install command"
                    message="Install command copied"
                  />
                </li>
    
                <li>
                  <div className="flex items-baseline gap-3">
                    <span className="t-mono t-tabular shrink-0 text-[12px] font-medium text-dark-signal">
                      02
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-dark-ink">
                        Download the capability catalog
                      </h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-dark-ink-2">
                        LiteSPM needs a local copy of the published catalog before it can install
                        an exact listing ID. Sync it once before the install command.
                      </p>
                    </div>
                  </div>
                  <DarkCmd text={WEBSITE_CATALOG_SYNC_COMMAND} label="Copy catalog sync command" message="Catalog command copied" />
                </li>
    
                <li id="pkg-step-add" tabIndex={-1} className="scroll-mt-16">
                  <div className="flex items-baseline gap-3">
                    <span className="t-mono t-tabular shrink-0 text-[12px] font-medium text-dark-signal">
                      03
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-dark-ink">Add {item.name}</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-dark-ink-2">	                        {targeted
	                          ? `Targets ${agent?.label} with --host, after the target has been configured.`
	                          : item.kind === "skill"
	                            ? "Installs into every skills target detected on this machine. Choose an agent above to target exactly one."
	                            : "Uses configured MCP hosts. Configure the intended agent before running this command."}
                      </p>
                    </div>
                  </div>
                  <DarkCmd
                    text={installCommand?.command ?? ""}
                    label="Copy install command"
                    message="Install command copied"
                  />

                  {/* The exact id, when the headline command is the short
                      form: the id names this entry and nothing else, and a
                      reader who wants the install to be exact needs it in
                      reach. */}
                  {installCommand?.short && (
                    <p className="mt-2 text-[12px] leading-relaxed text-dark-ink-2">
                      The exact id, if you want it exact:{" "}
                      <code className="t-mono break-all text-dark-ink">{item.id}</code>
                    </p>
                  )}
    
                  <p className="mt-2 text-[12px] leading-relaxed text-dark-ink-2">
                    Or run <code className="t-mono text-dark-ink">/marketplace</code> inside your agent and
                    search for &ldquo;{item.name}&rdquo;.
                  </p>
    
                  {item.installHint && (
                    <div className="mt-2">
                      <p className="t-mono text-[10px] uppercase tracking-wider text-dark-ink-2">
                        {item.kind === "skill"
                          ? "Install it straight from the source repo"
                          : "The host's own command"}
                      </p>
                      {/* The label has to follow the value. For a skill this
                          field holds a `litespm skills add …` command -- ours --
                          so calling it the host's command (as this did before
                          the dataset was corrected) named the wrong tool. Only
                          skills carry this field on an installable row (443
                          plugins carry one too, but plugins never reach this
                          panel), so the fallback label stays generic. */}
                      <DarkCmd
                        text={item.installHint}
                        label={item.kind === "skill" ? "Copy LiteSPM install command" : "Copy host install command"}
                        message={item.kind === "skill" ? "LiteSPM command copied" : "Host command copied"}
                      />
                    </div>
                  )}
                </li>
              </ol>
            </div>

            {/* Route two: the same install, handed to the agent. This is the
                panel's own differentiator — a package page that can tell a
                reader's agent to install the entry it is looking at. It stays
                inside what the binary enforces: plan first, a human approves
                in a terminal, the token is single-use, and no bridge means no
                install rather than a guessed one. */}
            <div
              role="tabpanel"
              id="pkg-add-panel-prompt"
              aria-labelledby="pkg-add-tab-prompt"
              tabIndex={0}
              hidden={mode !== "prompt"}
              className="mt-4"
            >
              <h3 className="text-[14px] font-semibold text-dark-ink">Let your agent run it</h3>
              <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-dark-ink-2">
                Paste this into {targeted ? agent?.label : "the agent you connected in step 2"}. The
                bridge tools it calls exist only after steps 01 and 02 on the Command tab have been
                done once.
              </p>

              <div className="mt-2 border border-dark-rule bg-dark-2 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <pre className="t-mono min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-dark-ink select-all">
                    {prompt}
                  </pre>
                  <CopyButton
                    text={prompt}
                    label="Copy the install prompt"
                    message="Install prompt copied"
                  />
                </div>
              </div>

              <p className="mt-2.5 max-w-prose text-[12px] leading-relaxed text-dark-ink-2">
                LiteSPM builds the plan first and writes nothing until you approve it in a terminal.{" "}
                <code className="t-mono text-dark-ink">litespm approve</code> refuses to run without
                one, so an agent can&rsquo;t approve for you, and the token it prints is single-use.{" "}
                {avail.plain}
              </p>
            </div>

            {/* The install → manage hand-off. It appears under both routes, so
                whichever way the reader installed, the next step is the same
                button. It is not "Mark as installed": the page cannot know
                that, and the wording says exactly what the click does. */}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-dark-rule pt-3.5">
              <button type="button" className="btn btn-solid" onClick={markInstalled}>
                Show management commands
              </button>
              <p className="max-w-prose text-[12px] leading-relaxed text-dark-ink-2">
                After installation, use these commands to view, update or remove the package.
              </p>
            </div>
          </>
        )}

        {!liteSPMInstallable && item.kind === "plugin" && (
          <div className="mt-3">
            {item.installHint ? (
              <>
                <p className="t-mono text-[10px] uppercase tracking-wider text-dark-ink-2">
                  The host&rsquo;s own command (outside LiteSPM)
                </p>
                <DarkCmd
                  text={item.installHint}
                  label="Copy host install command"
                  message="Host command copied"
                />
              </>
            ) : (
              <p className="text-[12px] leading-relaxed text-dark-ink-2">
                The catalog doesn&rsquo;t publish a host install command for this entry.
              </p>
            )}
          </div>
        )}

      </div>

      {liteSPMInstallable && marked && <ManageInstall item={item} onClear={clearMark} />}

      <ManualSetup />
    </section>
  );
}
