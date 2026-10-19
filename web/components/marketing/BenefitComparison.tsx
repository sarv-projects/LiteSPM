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
    text: "Find the agent's config file. There is one per agent, and each host keeps it somewhere else.",
  },
  {
    text: "Work out the shape that host expects for a server entry, and write it yourself.",
  },
  {
    text: "Do it again for every other agent you use — the entry is per agent, not per capability.",
  },
  {
    text: "Nothing records what you changed, so nothing can put it back when the entry turns out to be wrong.",
  },
];

const WITH_LITESPM: PanelStep[] = [
  {
    cmd: "litespm install <id>",
    text: "One command finds your agents, builds a plan, and shows the exact lines it will add to each agent's own config file.",
  },
  {
    text: "Nothing is written until you approve that plan. The file is copied to a backup first.",
  },
  {
    text: "The edit adds one entry and leaves your other servers, comments and formatting alone — and the install is recorded in a ledger on your machine.",
  },
  {
    cmd: "litespm install remove <id>",
    text: "Takes the entry back out. A restore rolls the whole file back to the copy it took before the first edit.",
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
        The catalog is the easy part. The lifecycle is the product.
      </h2>
      <p className="band-sub">
        Every directory has a list of tools. What changes is everything between &ldquo;I want this
        one&rdquo; and &ldquo;it is running on my machine&rdquo; — done once per agent, with a
        preview before it happens and a way back afterwards.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Adding a tool by hand" note="today" steps={BY_HAND} tone="plain" />
        <Panel
          title="Adding a tool with LiteSPM"
          note="the same task"
          steps={WITH_LITESPM}
          tone="accent"
        />
      </div>
    </section>
  );
}
