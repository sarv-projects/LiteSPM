"use client";

import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { availabilityOf } from "../../lib/availability";
import { TabList } from "../ui/TabList";
import { CopyButton } from "./CopyButton";
import { DarkCmd } from "./DarkCmd";
import { ManageInstall, installMarkKey } from "./ManageInstall";
import { ManualSetup } from "./ManualSetup";

const INSTALL_COMMAND_PREFIX = "litespm install ";

/**
 * The two ways to take the third step. "Command" is the CLI line the reader
 * types; "Prompt" is the same install handed to the agent through the bridge
 * instead. Only shown for entries `litespm install` can actually complete
 * (skills and MCP servers) — a plugin never reaches this panel, so the prompt
 * can never promise a plugin install.
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
 *   installable + unset     → "No agent selected yet" + [Choose your agent];
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
  // The CLI treats an unset installability value as discovery-only. Plugins
  // also fail closed today because their artifact source is not wired.
  const installabilityEstablished =
    item.installability === "metadata_verified" ||
    item.installability === "runtime_verified" ||
    item.installability === "litespm_tested";
  // An MCP row needs a launch line as well: `install_mcp.go` refuses one with
  // neither a command nor an endpoint at LPSM-ARTIFACT-UNAVAILABLE whatever its
  // metadata says. Kept in step with `availabilityOf`, which states the same
  // rule for the badges.
  const hasLaunchLine = item.kind !== "mcp" || Boolean(item.transport);
  const liteSPMInstallable =
    item.kind !== "plugin" && installabilityEstablished && hasLaunchLine;
  const targeted = liteSPMInstallable && agent !== null && agent.hosts.length > 0;
  const avail = availabilityOf(item);

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
            : "install status"}
        </span>
      </div>

      <div className="on-dark panel-dark mt-3">
        {/* ---- state: what this page can actually know ---- */}
        {liteSPMInstallable && marked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-rule pb-3.5">
            <p className="flex min-w-0 items-start gap-2 text-[13px] leading-relaxed text-dark-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-dark-signal" aria-hidden="true" />
              <span>
                You marked this as installed in this browser. LiteSPM&rsquo;s own ledger, on your
                machine, is the source of truth — this page can&rsquo;t read it.
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
          <p className="border-b border-dark-rule pb-3.5 text-[13px] leading-relaxed text-dark-ink">
            {item.kind === "plugin" && installabilityEstablished ? (
              <>
                LiteSPM can&rsquo;t install plugins yet — there is no artifact source. Rather than
                installing half a bundle, the CLI stops with{" "}
                <code className="t-mono text-dark-ink">LPSM-ARTIFACT-UNAVAILABLE</code>.
              </>
            ) : (
              <>
                This entry&rsquo;s metadata doesn&rsquo;t establish that it&rsquo;s installable, so
                no install command is shown. The CLI refuses it with{" "}
                <code className="t-mono text-dark-ink">LPSM-NOT-INSTALLABLE</code>.
              </>
            )}
          </p>
        ) : targeted ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-rule pb-3.5">
            <p className="flex min-w-0 items-start gap-2 text-[13px] leading-relaxed text-dark-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-dark-signal" aria-hidden="true" />
              <span>
                You chose <strong className="font-medium">{agent?.label}</strong> — a pick stored in
                this browser only.
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-rule pb-3.5">
            <p className="min-w-0 text-[13px] leading-relaxed text-dark-ink">
              {agent ? (
                <>
                  You chose <strong className="font-medium text-dark-ink">&ldquo;{agent.label}&rdquo;</strong>.
                  That doesn&rsquo;t name an install target, so the steps below stay general.
                </>
              ) : (
                <>No agent selected yet. Pick one and the steps below target it; until then they work for any agent.</>
              )}
            </p>
            <button type="button" className="btn btn-solid btn-lg shrink-0" onClick={onChooseAgent}>
              Choose your agent
            </button>
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
              <ol className="space-y-5">
                <li>
                  <div className="flex items-baseline gap-3">
                    <span className="t-mono t-tabular shrink-0 text-[12px] font-medium text-dark-signal">
                      01
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-dark-ink">Install LiteSPM</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-dark-ink-2">
                        One CLI for every agent you use.
                      </p>
                    </div>
                  </div>
                  <DarkCmd
                    text="npm install -g litespm"
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
                        Connect {targeted ? agent?.label : "your agent"}
                      </h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-dark-ink-2">
                        Run the setup wizard and pick your agent. It finds that agent&rsquo;s config
                        file, adds the one LiteSPM entry, and keeps a backup of what was there.
                      </p>
                    </div>
                  </div>
                  <DarkCmd text="litespm" label="Copy setup command" message="Setup command copied" />
                </li>
    
                <li id="pkg-step-add" tabIndex={-1} className="scroll-mt-16">
                  <div className="flex items-baseline gap-3">
                    <span className="t-mono t-tabular shrink-0 text-[12px] font-medium text-dark-signal">
                      03
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-dark-ink">Add {item.name}</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-dark-ink-2">
                        {targeted
                          ? `Installs this entry for ${agent?.label}.`
                          : "Installs this entry for the agent you connected in step 2."}
                      </p>
                    </div>
                  </div>
                  <DarkCmd
                    text={`${INSTALL_COMMAND_PREFIX}${item.id}`}
                    label="Copy install command"
                    message="Install command copied"
                  />
    
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
                I ran this — show me how to manage it
              </button>
              <p className="max-w-prose text-[12px] leading-relaxed text-dark-ink-2">
                This doesn&rsquo;t check your machine. It switches this page to its management
                view and remembers the choice in this browser only.
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

        <p className="mt-5 border-t border-dark-rule pt-3 text-[12px] leading-relaxed text-dark-ink-2">
          One thing this page can&rsquo;t do: tell whether LiteSPM is installed on your machine. It
          is static, and catalog installability is not a local check.
        </p>
      </div>

      {liteSPMInstallable && marked && <ManageInstall item={item} onClear={clearMark} />}

      <ManualSetup />
    </section>
  );
}
