"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiscoveryCard } from "../ui/DiscoveryCard";
import { BridgeDiagram } from "./BridgeDiagram";

/**
 * "How it works" — three steps, and the substance in each one.
 *
 * It used to be five: point, find, check, add, manage. Five steps is a
 * manual, and a reader who has to hold five steps in their head before they
 * can start is a reader who does not start. The three below are the three
 * moments the product actually has: **point it at an agent**, **see the
 * change before it happens**, **take it back**.
 *
 * Each card carries the command that does the step, in the open rather than
 * behind a disclosure — the command *is* the explanation, and a reader who
 * cannot see it has to go and find it. The technical detail stays one
 * `<details>` deeper for the reader who wants it, so the beginner and the
 * expert are the same page.
 *
 * The figure on the right is the bridge: one local process, every agent on
 * top of it, the two kinds of capability it can carry underneath. It says
 * "one bridge, two kinds" — not three, because LiteSPM cannot install
 * plugins, and a diagram that showed a third exit would be advertising an
 * install the binary refuses.
 */

interface Step {
  n: string;
  title: string;
  plain: string;
  cmd: string;
  technical: React.ReactNode;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Point it at your agent",
    plain: "It finds the agents on this machine and asks which one to wire up.",
    cmd: "litespm setup",
    technical: (
      <>
        <p>
          The wizard reads each adapter&rsquo;s own config path, shows you the file it found, and
          backs it up before it writes. It adds a single{" "}
          <code className="t-mono">litespm</code> bridge entry and leaves every other server,
          comment and line of formatting alone.
        </p>
        <p className="mt-2">
          <code className="t-mono">litespm host setup &lt;agent&gt;</code> is the same step with no
          prompts. An install with no host set up is refused rather than left guessing which
          config file to edit.
        </p>
      </>
    ),
  },
  {
    n: "02",
    title: "See the change, then approve it",
    plain: "An install is a plan first: the exact lines it will add, and what it will run.",
    cmd: "litespm install <id>",
    technical: (
      <>
        <p>
          The plan carries the file to write, the lines to add, and the launch line for the
          capability. Nothing is written until the plan is approved, and the file is copied to a
          backup directory first.
        </p>
        <p className="mt-2">
          A row LiteSPM cannot install is refused rather than half-done: a plugin, or an entry
          with no published command or endpoint, fails closed with a reason.
        </p>
      </>
    ),
  },
  {
    n: "03",
    title: "Take it back",
    plain: "One command removes the entry it wrote, and a restore puts the whole file back.",
    cmd: "litespm install remove <id>",
    technical: (
      <>
        <p>
          The removal takes out the one entry LiteSPM owns and leaves the rest of the file
          exactly as it was.{" "}
          <code className="t-mono">litespm restore</code> rolls a config file back to the copy
          taken before the first edit, and{" "}
          <code className="t-mono">litespm uninstall</code> removes the bridge entry from a host.
        </p>
        <p className="mt-2">
          Every decision — what was approved, what was written, what was removed — is recorded
          against the plan that asked for it, in a ledger on your machine.
        </p>
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section className="shell band" aria-labelledby="how-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="kicker">How LiteSPM works</p>
          <h2 id="how-title" className="band-title mt-2">
            Three steps, and a way back
          </h2>
          <p className="band-sub">
            Point it at an agent, see the change before it happens, and take it back whenever you
            want. The whole lifecycle fits on one screen.
          </p>
        </div>
        <Link href="/how-it-works/" className="btn">
          The full walkthrough
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-start">
        <ol className="space-y-4">
          {STEPS.map((step) => (
            <DiscoveryCard as="li" key={step.n} density="roomy">
              <div className="flex items-baseline gap-3">
                <span className="t-mono text-[12px] font-medium tracking-wider text-accent-text">
                  {step.n}
                </span>
                <h3 className="text-[17px] font-semibold tracking-tight text-ink">{step.title}</h3>
              </div>

              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.plain}</p>

              <code className="t-mono mt-3 block rounded-panel border border-rule bg-sunken px-3 py-2 text-[12.5px] text-ink">
                $ {step.cmd}
              </code>

              <details className="group mt-3 border-t border-rule pt-2">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[36px]">
                  How this works technically
                  <span
                    aria-hidden="true"
                    className="text-ink-3 transition-transform duration-panel ease-out group-open:rotate-90"
                  >
                    →
                  </span>
                </summary>
                <div className="pb-1 text-[12.5px] leading-relaxed text-ink-3">{step.technical}</div>
              </details>
            </DiscoveryCard>
          ))}
        </ol>

        <div className="rounded-card border border-rule bg-surface p-3 sm:p-5">
          <p className="mb-3 t-mono text-[11px] uppercase tracking-wider text-ink-3">
            one local bridge
          </p>
          <BridgeDiagram />
        </div>
      </div>
    </section>
  );
}
