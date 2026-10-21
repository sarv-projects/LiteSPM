import React from "react";
import { Blocks, BookOpen, Puzzle } from "lucide-react";
import { DiscoveryCard } from "../ui/DiscoveryCard";

/**
 * "Tools, skills and plugins" — the one section a first-time visitor needs and
 * the site did not have.
 *
 * The catalog's three kinds are the product's vocabulary, and a reader who
 * cannot tell them apart cannot use the search. Each card names the thing in
 * plain language first, then the protocol name it maps to, because some readers
 * arrive knowing "MCP" and others arrive knowing only the job.
 *
 * The cards link into Explore filtered by kind, so the explanation is also a
 * doorway rather than a glossary entry. The accent colour is read from the
 * same `--mcp`/`--skill`/`--plugin` variables the catalog rows use, so the
 * three kinds stay recognisable across the site.
 */
const TYPES = [
  {
    kind: "mcp",
    href: "/explore/?kind=mcp",
    icon: Blocks,
    color: "var(--mcp)",
    eyebrow: "Tools / MCP",
    title: "Connect your agent to apps and live data",
    body: "Servers that give an agent tools it can call: repositories, design files, databases, browsers and APIs.",
    examples: "GitHub · Figma · Postgres",
  },
  {
    kind: "skill",
    href: "/explore/?kind=skill",
    icon: BookOpen,
    color: "var(--skill)",
    eyebrow: "Skills",
    title: "Teach your agent a repeatable way to work",
    body: "Instructions and workflows an agent loads when a task matches: design review, testing, research, writing.",
    examples: "UI design · Testing · Research",
  },
  {
    kind: "plugin",
    href: "/explore/?kind=plugin",
    icon: Puzzle,
    color: "var(--plugin)",
    eyebrow: "Plugins",
    title: "Install a complete extension in one step",
    body: "A published package that can bundle skills and MCP configuration, installed through the same preview and approval.",
    examples: "Skills + tools + host setup",
  },
];

export function CapabilityTypes() {
  return (
    <section className="shell band" aria-labelledby="capability-types-title">
      <div className="max-w-2xl">
        <p className="kicker">What you can install</p>
        <h2 id="capability-types-title" className="band-title mt-2">
          Tools, skills and plugins — what is the difference?
        </h2>
        <p className="band-sub">
          All three install with the same command, the same preview and the same undo. They differ
          in what they add to your agent.
        </p>
      </div>

      <ul className="mt-7 grid gap-3 md:grid-cols-3">
        {TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <li key={type.kind} className="flex">
              <DiscoveryCard href={type.href} density="roomy" className="h-full w-full">
                <span
                  aria-hidden="true"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-chip border border-rule bg-sunken"
                  style={{ color: type.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
                  {type.eyebrow}
                </span>
                <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight text-ink">
                  {type.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{type.body}</p>
                <span className="mt-auto pt-4 text-[12px] text-ink-3">{type.examples}</span>
              </DiscoveryCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
