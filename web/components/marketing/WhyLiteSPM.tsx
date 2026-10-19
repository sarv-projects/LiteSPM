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
  /** The command, when the benefit is a command. */
  cmd?: string;
}

const BENEFITS: Benefit[] = [
  {
    id: "agents",
    title: "One control surface, every agent you use",
    body: (
      <>
        Claude Code, Codex, OpenCode, Cursor, Cline and the rest are configured from the same
        command and recorded in the same ledger. A capability is installed once and lands in the
        agents you chose — not once per agent, by hand.
      </>
    ),
    cmd: "litespm install <id> --agent claude-code,codex",
  },
  {
    id: "preview",
    title: "Every edit is previewed and backed up",
    body: (
      <>
        An install is a plan before it is a write. You see the exact lines it will add, you approve
        them, and the file is copied first. Undo takes out the one entry LiteSPM wrote and leaves
        the rest of the file alone.
      </>
    ),
    cmd: "litespm restore <file>",
  },
  {
    id: "local",
    title: "Local-first, and free of accounts",
    body: (
      <>
        No account, no cookie, no analytics, no telemetry, no host service. Your configs, your
        catalog and your install history are files on your disk. The website you are reading
        installs nothing, and it cannot read your machine.
      </>
    ),
  },
  {
    id: "surfaces",
    title: "The terminal, and the agent itself",
    body: (
      <>
        Everything is a command, so it scripts, so it fits CI. Where the agent supports it, the
        same capability list is available from inside the agent with{" "}
        <code className="t-mono">/marketplace</code> — the bridge, not a second implementation.
      </>
    ),
  },
];

export function WhyLiteSPM() {
  return (
    <section className="shell band" aria-labelledby="why-title">
      <p className="kicker">Why LiteSPM</p>
      <h2 id="why-title" className="band-title mt-2">
        What you get that a config file does not give you
      </h2>
      <p className="band-sub">
        The catalog is the same idea everywhere. These four are the reasons to run it through
        LiteSPM instead of editing the file yourself.
      </p>

      <ul className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit.id}>
            <DiscoveryCard density="roomy" className="h-full">
              <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                {benefit.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{benefit.body}</p>
              {benefit.cmd && (
                <code className="t-mono mt-3 block text-[12.5px] text-ink-3">$ {benefit.cmd}</code>
              )}
            </DiscoveryCard>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[13px] text-ink-3">
        Free and Apache-2.0.{" "}
        <Link href="/explore/" className="link">
          Browse what is in the catalog
        </Link>{" "}
        first, if you would rather look before you install.
      </p>
    </section>
  );
}
