import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * "Why LiteSPM" — four benefits, each one a fact the product can be held to.
 *
 * These used to sit as a row of five small paragraphs at the bottom of the
 * install panel, where nobody reads them: a reader who is already scrolling
 * past the commands is not deciding anything. They are the answer to the
 * question a company buyer asks — *why this and not a hand-written config* —
 * so they get their own section, between the agent story and the FAQ.
 *
 * Every benefit names something checkable:
 *
 *  - **multi-agent control** — one ledger, every agent;
 *  - **previewed, backed-up edits** — a plan, an approval, a copy;
 *  - **local-first** — no account, no cookie, no telemetry, no host service;
 *  - **the CLI, and `/marketplace` where the agent supports it** — the two
 *    surfaces that actually exist, named as they are.
 *
 * Nothing here is a comparison with a named competitor, and nothing here is a
 * security claim: the accent is the brand's colour, not a verdict on a
 * capability, and this site does not audit what it lists.
 */

interface Benefit {
  id: string;
  title: string;
  body: React.ReactNode;
}

const BENEFITS: Benefit[] = [
  {
    id: "agents",
    title: "One toolkit across your agents",
    body: "Browse supported MCP servers, skills, and plugins for the agents you already use.",
  },
  {
    id: "preview",
    title: "Review before you change anything",
    body: "See the setup before you approve it. LiteSPM backs up the configuration changes it manages.",
  },
  {
    id: "local",
    title: "Your setup stays yours",
    body: "Browse without an account. LiteSPM runs on your computer and keeps installation history there.",
  },
  {
    id: "surfaces",
    title: "Fits the way you work",
    body: <>Use LiteSPM from the terminal or browse from supported agents with <code className="t-mono">/marketplace</code>.</>,
  },
];

export function WhyLiteSPM() {
  return (
    <section className="shell band" aria-labelledby="why-title">
      <p className="kicker">Why LiteSPM</p>
      <h2 id="why-title" className="band-title mt-2">
        A simpler way to extend your agents
      </h2>
      <p className="band-sub">
        Discover capabilities, manage supported installations, and keep changes traceable
        without editing every agent's configuration by hand.
      </p>

      <ul className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit.id}>
            <DiscoveryCard density="roomy" className="h-full">
              <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                {benefit.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{benefit.body}</p>
            </DiscoveryCard>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[13px] text-ink-3">
        Free and Apache-2.0.{" "}
        <Link href="/explore/" className="link">
          Explore the marketplace
        </Link>{" "}
        first, if you would rather look before you install.
      </p>
    </section>
  );
}
