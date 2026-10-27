"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Short homepage summary; the detailed commands and technical caveats live on `/how-it-works/`. */

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

      <ol className="mt-7 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="border-t border-rule pt-4">
            <div className="flex items-baseline gap-3">
              <span className="t-mono text-[12px] font-medium tracking-wider text-accent-text">
                {step.n}
              </span>
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">{step.title}</h3>
            </div>

            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.plain}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
