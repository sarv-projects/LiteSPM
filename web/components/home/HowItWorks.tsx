"use client";

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
 * top of it, the three kinds of capability it can carry underneath.
 *
 * It used to say "one bridge, two kinds", with plugins deliberately left off
 * because the binary could not install them and a third exit would have
 * advertised an install the CLI refused. Plugins have installed since 0.6.0
 * (from a publisher's pinned source), so all three exits are real and the
 * figure draws all three — `BridgeDiagram` marks each kind installable or
 * not from the same predicate the installer uses.
 */

interface Step {
  n: string;
  title: string;
  plain: string;
}

const STEPS: Step[] = [
  { n: "01", title: "Choose your agent", plain: "Pick the agent you already use and the setup you want." },
  { n: "02", title: "Find what helps", plain: "Browse by task, then see the setup for your chosen agent." },
  { n: "03", title: "Review and manage", plain: "Check the changes before you approve, and remove tools later." },
];

export function HowItWorks() {
  return (
    <section className="shell band" aria-labelledby="how-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="kicker">How LiteSPM works</p>
          <h2 id="how-title" className="band-title mt-2">
            From discovery to local installation
          </h2>
          <p className="band-sub">
            Connect your agent, install supported capabilities, and manage what LiteSPM changes.
          </p>
        </div>
        <Link href="/how-it-works/" className="btn">
          How LiteSPM works
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
            </DiscoveryCard>
          ))}
        </ol>

        <div className="rounded-card border border-rule bg-surface p-3 sm:p-5">
          <p className="mb-3 t-mono text-[11px] uppercase tracking-wider text-ink-3">
            One setup for the agents you use
          </p>
          <BridgeDiagram />
        </div>
      </div>
    </section>
  );
}
