"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";

const FLOW = [
  {
    title: "Choose what to add",
    command: "litespm skills add ./my-skills --skill meeting-notes --agent codex --scope project --yes",
    output: [
      "Source     ./my-skills",
      "Found      1 skill",
      "Scope      This repo only",
      "",
      "meeting-notes",
      "  → .agents/skills/meeting-notes",
      "",
      "Installation complete",
    ],
    caption: "LiteSPM finds the skill, shows its destination, then installs it in the current project.",
  },
  {
    title: "See what is installed",
    command: "litespm skills list",
    output: [
      "Skills installed by this tool (1 directory):",
      "",
      "SKILL                    HOST      DIRECTORY",
      "────────────────────────────────────────────────────────",
      "meeting-notes            codex     .agents/skills/meeting-notes",
    ],
    caption: "The inventory names the skill, target agent, and folder LiteSPM manages.",
  },
  {
    title: "Remove it when you are done",
    command: "litespm skills remove meeting-notes --scope project",
    output: [
      "✓ meeting-notes  removed /your-project/.agents/skills/meeting-notes",
      "",
      "Done: 1 removed, 0 left in place.",
      "",
      "No skills have been installed by this tool.",
    ],
    caption: "Removal clears the managed skill and updates the local install record.",
  },
];

export function WalkthroughFrame() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setStep((current) => (current + 1) % FLOW.length), 5200);
    return () => window.clearInterval(timer);
  }, [playing]);

  const current = FLOW[step];
  const move = (direction: number) => setStep((value) => (value + direction + FLOW.length) % FLOW.length);

  return (
    <section className="cli-story" aria-label="Interactive walkthrough of a sample install">
      <div className="cli-story-copy">
        <p className="kicker">Interactive walkthrough</p>
        <h3 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">
          Install it. Find it. Remove it.
        </h3>
        <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-ink-2">
          Follow a project-scope skill from its install command to its folder and back out again.
        </p>
        <ol className="cli-story-steps" aria-label="Walkthrough steps">
          {FLOW.map((item, index) => (
            <li key={item.title}>
              <button type="button" aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}>
                <span>0{index + 1}</span><span>{item.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="cli-story-proof">Example output from a project-scope skill workflow.</p>
      </div>

      <div className="cli-terminal" aria-live="polite" aria-atomic="true">
        <div className="cli-terminal-bar">
          <span className="home-window-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>Example · {current.title}</span>
          <span className="cli-step-count">0{step + 1} / 0{FLOW.length}</span>
        </div>
        <div className="cli-terminal-command"><span>$</span> {current.command}</div>
        <pre className="cli-terminal-output">{current.output.join("\n")}</pre>
        <p className="cli-terminal-caption">{current.caption}</p>
        <div className="cli-terminal-controls">
          <button type="button" onClick={() => move(-1)} aria-label="Previous walkthrough step"><ArrowLeft /></button>
          <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button type="button" onClick={() => setStep(0)} aria-label="Restart walkthrough"><RotateCcw /></button>
          <button type="button" onClick={() => move(1)} aria-label="Next walkthrough step"><ArrowRight /></button>
        </div>
      </div>
    </section>
  );
}
