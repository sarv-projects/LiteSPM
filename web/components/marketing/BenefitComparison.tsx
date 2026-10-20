import React from "react";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * "What LiteSPM changes" — the before/after, side by side.
 *
 * The argument this page has to make is not "we have a bigger catalog". Every
 * directory has a catalog, and a bigger one is a number rather than a reason.
 * The argument is the **lifecycle**: the part between "I want this tool" and
 * "it is running on my machine", which is the part that is painful, repeated
 * per agent, and — in every other tool — has no way back.
 *
 * So the two panels are the same task done twice. The left one is what the
 * task is today, in the words a reader would use; the right one is the same
 * task with the lifecycle in place. Neither panel invents a screen: the right
 * one names commands the binary dispatches today and states the guarantees
 * the CLI actually keeps (a plan before a write, a backup before an edit, a
 * ledger of what was written, a removal that touches only its own line).
 *
 * The left panel deliberately does **not** print a config path. Which file an
 * agent uses is a fact for that agent's own page, and the point of the
 * contrast is the *shape* of the work, not the path of one file.
 */

interface PanelStep {
  /** The command, when there is one. */
  cmd?: string;
  /** What happens. */
  text: string;
}

const BY_HAND: PanelStep[] = [
  {
    text: "Locate each agent's configuration file.",
  },
  {
    text: "Learn the configuration format and add the integration manually.",
  },
  {
    text: "Repeat the process for every agent you use.",
  },
  {
    text: "Track your edits and backups if you need to undo them.",
  },
];

const WITH_LITESPM: PanelStep[] = [
  {
    cmd: "litespm install <id>",
    text: "Install supported packages into configured agents using exact catalog commands.",
  },
  {
    text: "Review host setup changes and keep a backup of managed configuration files.",
  },
  {
    text: "LiteSPM records what it manages in a local installation ledger.",
  },
  {
    cmd: "litespm install remove <installId>",
    text: "Remove LiteSPM-managed entries or restore a saved configuration.",
  },
];

function Panel({
  title,
  note,
  steps,
  tone,
}: {
  title: string;
  note: string;
  steps: PanelStep[];
  tone: "plain" | "accent";
}) {
  return (
    <DiscoveryCard density="roomy" className="h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h3>
        <span
          className={`t-mono rounded-chip border px-1.5 py-0.5 text-[10.5px] font-medium ${
            tone === "accent"
              ? "border-accent/40 bg-accent-wash text-accent-text"
              : "border-rule bg-sunken text-ink-3"
          }`}
        >
          {note}
        </span>
      </div>

      <ol className="mt-4 flex-1 space-y-3">
        {steps.map((step, index) => (
          <li key={step.text} className="flex gap-3">
            <span
              aria-hidden="true"
              className="t-mono mt-px w-5 shrink-0 text-[11px] tabular-nums text-ink-3"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 text-[13.5px] leading-relaxed text-ink-2">
              {step.cmd && (
                <code className="t-mono mb-1 block text-[12.5px] text-ink">$ {step.cmd}</code>
              )}
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </DiscoveryCard>
  );
}

export function BenefitComparison() {
  return (
    <section className="shell band" aria-labelledby="changes-title">
      <p className="kicker">What LiteSPM changes</p>
      <h2 id="changes-title" className="band-title mt-2">
        Spend less time configuring agents.
      </h2>
      <p className="band-sub">
        Adding capabilities across multiple coding agents shouldn't require repeating the same setup.
        LiteSPM helps you install supported packages and track managed changes.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Without LiteSPM" note="Manual setup" steps={BY_HAND} tone="plain" />
        <Panel
          title="With LiteSPM"
          note="Managed setup"
          steps={WITH_LITESPM}
          tone="accent"
        />
      </div>
    </section>
  );
}
