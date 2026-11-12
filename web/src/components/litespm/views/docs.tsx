"use client";

import * as React from "react";
import { ArrowRight, BookOpen, Cable, Layers, CheckCircle2, CircleDot, HelpCircle, Lock, Package, RotateCcw, Scale, Search, ShieldCheck, Terminal, Undo2, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatFull } from "@/lib/litespm/format";
import { CodeBlock } from "../code-block";
import { InstallBar } from "../install-bar";
import { NavLink } from "../nav-link";
import facts from "@/lib/litespm/site-facts.json";
import { EVIDENCE_LABEL, IN_AGENT, type InAgentEntry } from "@/lib/litespm/in-agent";
import type { CatalogStatsResponse } from "@/lib/litespm/types";

const SECTIONS: Array<{ id: string; label: string; icon: React.ElementType }> = [
  { id: "introduction", label: "Introduction", icon: BookOpen },
  { id: "getting-started", label: "Getting started", icon: Terminal },
  { id: "commands", label: "Command reference", icon: Wrench },
  { id: "install-flow", label: "How an install works", icon: CheckCircle2 },
  { id: "hosts", label: "Agent hosts", icon: Cable },
  { id: "in-agent-marketplace", label: "In-agent marketplace", icon: CircleDot },
  { id: "agent-compatibility", label: "Agent compatibility", icon: Layers },
  { id: "security", label: "Security model", icon: ShieldCheck },
  { id: "methodology", label: "How we rank and label", icon: Scale },
  { id: "publishing", label: "Publishing to the catalog", icon: Package },
  { id: "troubleshooting", label: "Troubleshooting & FAQ", icon: HelpCircle },
];

type CommandGroup = "Discover" | "View" | "Install & manage" | "Connect" | "Recover" | "System";

const COMMANDS: Array<{ cmd: string; description: string; example?: string; group: CommandGroup }> = [
  { group: "Discover", cmd: "litespm search <text>", description: "Search the local catalog through its on-disk full-text index. Marks which results are installable and which are discovery-only, before you run anything. --json prints the litespm-search/v1 document; --limit <n> caps the rows (1-500).", example: "litespm search postgres" },
  { group: "Discover", cmd: "litespm skills find [<query>]", description: "Search the local catalog index for skills. --owner <org> narrows the results to one publisher." },
  { group: "Discover", cmd: "litespm agent list|resolve <id>", description: "List the coding agents in the ACP registry with the launch strategy for this OS, or resolve one agent's executable, arguments, environment and archive digest." },
  { group: "Discover", cmd: "litespm catalog sync", description: "Download or refresh the local catalog on demand: every digest in the pointer, manifest and listings chain is verified before the local copy is replaced. From 0.6.1 it also builds the on-disk search index from the verified files, and the catalog syncs itself (see Getting started), so you only need this command to refresh right now. Searching never touches the network." },

  { group: "View", cmd: "litespm list", description: "What is installed, by agent and kind. --drifted shows entries changed since install; --json is the stable machine-readable form." },
  { group: "View", cmd: "litespm inventory [mcp|skills|plugins]", description: "Emit one stable litespm.inventory/v1 record per deployment, with placement, origin, install id, config path, digests and drift state." },
  { group: "View", cmd: "litespm capabilities list|search|describe|refresh", description: "Refresh the tools an installed MCP server exposes, then list, search or describe them. describe prints one tool's input schema." },
  { group: "View", cmd: "litespm invoke <capability-id>", description: "Call one discovered capability from the terminal through the same policy-checked path the bridge uses. Pass JSON with --arguments." },

  { group: "Install & manage", cmd: "litespm install <id>", description: "Install a server, skill or plugin. Resolves the listing, plans the change, previews it, and asks before writing. --dry-run prints the plan and stops; --frozen installs the version pinned in litespm.lock.", example: "litespm install neon --agent claude-code" },
  { group: "Install & manage", cmd: "litespm install remove <id>", description: "Remove one install. Strips only the nodes LiteSPM wrote and keeps anything you edited." },
  { group: "Install & manage", cmd: "litespm skills add <source>", description: "Install skills from a GitHub repository, Git URL, skill URL or local folder. Discovers skills, lets you choose, previews destinations, and asks before writing.", example: "litespm skills add https://github.com/anthropics/skills" },
  { group: "Install & manage", cmd: "litespm init [name]", description: "Scaffold a SKILL.md in the current directory. The generated file parses under the same loader `skills add` uses.", example: "litespm init my-skill" },
  { group: "Install & manage", cmd: "litespm skills use <source>[@<skill>]", description: "Print a skill's prompt without installing anything. It configures no host and launches no agent.", example: "litespm skills use anthropics/skills@pdf" },
  { group: "Install & manage", cmd: "litespm skills list", description: "The skills ledger: every skill LiteSPM copied, its source and its destination. Filter with -g or -a <agent>." },
  { group: "Install & manage", cmd: "litespm skills update [<name>...]", description: "Re-copy skills from each ledger row's recorded source. No arguments updates everything; --dry-run previews the writes." },
  { group: "Install & manage", cmd: "litespm skills remove [<name>|<source>]", description: "Ledger-scoped removal. Only directories the ledger names are deleted; --all removes every ledger entry." },
  { group: "Install & manage", cmd: "litespm skills adopt <name>", description: "Take ownership of a skill already in an agent's skills tree. Nothing is reinstalled or rewritten — only the ledger changes." },
  { group: "Install & manage", cmd: "litespm adopt <name> --host <id>", description: "Take ownership of an MCP server already in a host's config. Writes nothing to that config; removal restores the node and keeps later edits.", example: "litespm adopt sequential-thinking --host claude-code" },
  { group: "Install & manage", cmd: "litespm copy --from A --to B", description: "Port one agent's MCP servers and skills to another host through the canonical entry model, with a plan before any write." },
  { group: "Install & manage", cmd: "litespm lock", description: "Resolve litespm.yml into a deterministic litespm.lock. --check catches drift in CI; --sbom emits CycloneDX or SPDX; --verify re-checks the lock digest." },
  { group: "Install & manage", cmd: "litespm import <format> <path>", description: "Plan an import from skills-lock.json, server.json, a marketplace manifest or plugin.json into litespm.yml. Nothing is written without --apply." },

  { group: "Connect", cmd: "litespm", description: "Open the setup and management wizard. Finds agents on your machine, shows the exact file it will touch, and asks before writing. Its menu can update the catalog, find and install, remove, list, or connect another agent." },
  { group: "Connect", cmd: "litespm setup [--agent <host-id>]", description: "Connect one agent, or use --all for every detected host. Each host is previewed and backed up separately before it is written.", example: "litespm setup --agent codex" },
  { group: "Connect", cmd: "litespm host list|detect|setup|remove", description: "List every supported adapter and the file it writes, detect the ones on this machine, connect one (this also installs the agent's in-agent marketplace command), or remove LiteSPM's entry. host remove <id> removes that command too. In-agent marketplace commands ship in the repository's next release (0.6.1); npm currently serves 0.6.0.", example: "litespm host detect" },
  { group: "Connect", cmd: "litespm marketplace", description: "Open the browser marketplace on this machine: MCP Servers, Skills, Plugins and Installed, with live search. --no-open prints the URL instead." },
  { group: "Connect", cmd: "litespm marketplace rows --json", description: "Print the marketplace view model as JSON - the one thing every in-agent popup renders. Narrow it with --query <text>, --host <id>, --kind mcp|skill|plugin|installed, --limit <n> and --installable (0.6.1, unreleased)." },
  { group: "Connect", cmd: "litespm bridge stdio --host <id>", description: `Run the ${facts.bridgeTools}-tool MCP bridge a connected agent talks to. The bridge speaks stdio and forwards to the local daemon.`, example: "litespm bridge stdio --host codex" },
  { group: "Connect", cmd: "litespm daemon serve", description: "Run the single-writer background supervisor and local IPC engine in the foreground. Recovery runs before the listener binds." },
  { group: "Connect", cmd: "litespm auth login|status|logout", description: "Run the OAuth 2.0 PKCE loopback flow, report stored provider credentials, or revoke one. Tokens stay in the OS vault." },
  { group: "Connect", cmd: "litespm grant <capability-id>", description: "Grant an agent permission to invoke one discovered tool. The grant is bound to the tool's schema fingerprint; grant list and grant revoke manage existing grants." },
  { group: "Connect", cmd: "litespm approve <plan-id>", description: "Show a stored install plan, record your approval on yes, and print the single-use token an agent passes to request_install. The agent cannot approve for you." },

  { group: "Recover", cmd: "litespm restore <id>", description: "Roll a config back to its exact previous bytes — not a re-merge. Refuses when a sibling entry or a node LiteSPM owns has been edited." },
  { group: "Recover", cmd: "litespm doctor", description: "Check the install: state database, operation journal, CAS, secrets, host registrations, backups, runtimes and disk space. --repair previews and applies the fixes it can." },
  { group: "Recover", cmd: "litespm audit", description: "Scan the published catalog and the local receipt chain. --ci exits non-zero on errors; --sarif writes a SARIF 2.1.0 report." },
  { group: "Recover", cmd: "litespm uninstall", description: "Remove LiteSPM's bridge entry from every agent config it wrote, with a backup, and list the installs and skills it left behind." },

  { group: "System", cmd: "litespm self-update", description: "Replace this binary with a newer signed release. Every interactive run performs the same check automatically, with a short cooldown window." },
  { group: "System", cmd: "litespm version", description: "Print the binary version, protocol version and platform. Also available as --version or -v." },
  { group: "System", cmd: "litespm help [command]", description: "The full command reference, a per-command detail page, or help concepts for the vocabulary." },
];

const INSTALL_FLAGS = [
  "--help, -h", "--version, -v", "--scope, -s", "--workspace, -w", "--host",
  "--agent, -a", "--all-detected", "--env", "--force, -f", "--frozen",
  "--dry-run", "--allow-partial",
];

export function DocsView({ section }: { section: string }) {
  // Old ids keep working: /docs/inside-agent -> the in-agent marketplace page.
  const alias: Record<string, string> = { faq: "troubleshooting", "inside-agent": "in-agent-marketplace" };
  const resolved = alias[section] ?? section;
  const active = SECTIONS.some((s) => s.id === resolved) ? resolved : "introduction";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar nav */}
        <nav aria-label="Documentation sections" className="lg:sticky lg:top-20 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Documentation
          </p>
          <ul className="mt-3 space-y-0.5">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={`/docs/${item.id}`}
                  aria-current={active === item.id ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                    active === item.id
                      ? "bg-brand-soft text-brand"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="min-w-0 max-w-[72ch]">
          {active === "introduction" && <Introduction />}
          {active === "getting-started" && <GettingStarted />}
          {active === "commands" && <Commands />}
          {active === "install-flow" && <InstallFlow />}
          {active === "hosts" && <Hosts />}
          {active === "in-agent-marketplace" && <InAgentMarketplace />}
          {active === "agent-compatibility" && <AgentCompatibility />}
          {active === "security" && <Security />}
          {active === "methodology" && <Methodology />}
          {active === "publishing" && <Publishing />}
          {active === "troubleshooting" && <Troubleshooting />}
        </div>
      </div>
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article>
      <h1 className="text-[clamp(1.7rem,3.2vw,2.2rem)] font-semibold tracking-[-0.03em]">{title}</h1>
      <div className="mt-5 space-y-5">{children}</div>
    </article>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Introduction() {
  const [stats, setStats] = React.useState<{ all?: number; installable?: number; hosts?: number } | null>(null);

  React.useEffect(() => {
    fetch("/api/litespm/stats")
      .then((r) => r.json())
      .then((data: Partial<CatalogStatsResponse>) => {
        setStats({
          // The headline figure: unique listings (see "How we rank and label").
          all: data.counts?.uniqueListings,
          installable: data.installable,
          hosts: data.hosts,
        });
      })
      .catch(() => {});
  }, []);

  const totalListings = formatFull(stats?.all ?? facts.listings);
  const installableCount = stats?.installable ? formatFull(stats.installable) : "—";
  const hostsCount = String(stats?.hosts ?? facts.hosts);

  return (
    <DocSection title="Introduction">
      <P>
        LiteSPM is <strong className="text-foreground">the package manager for AI agents</strong>.
        Find MCP servers, skills and plugins once, and install them into every coding agent you
        use. LiteSPM writes each agent&apos;s own config, backs it up first, and keeps a ledger of
        what it changed so you can take it back out.
      </P>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { value: totalListings, label: "unique listings" },
          { value: hostsCount, label: "agent hosts for MCP" },
          { value: installableCount, label: "one-command installs" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-4 py-3.5 text-center">
            <div className="text-[22px] font-semibold tabular-nums text-brand">{stat.value}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <P>
        &quot;Listings&quot; always means unique listings: catalog rows left after exact duplicates are
        removed. The marketplace result count is lower, because it merges same-name listings; the{" "}
        <NavLink to="/docs/methodology" className="font-medium text-brand hover:underline">
          counts explained
        </NavLink>{" "}
        page says where each number comes from.
      </P>

      <P>
        Three kinds of capability can be installed: <strong className="text-foreground">MCP
        servers</strong> (services your agent calls tools on),{" "}
        <strong className="text-foreground">agent skills</strong> (portable{" "}
        <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">SKILL.md</code> folders of
        instructions), and <strong className="text-foreground">plugins</strong> (curated bundles
        of skills and servers).
      </P>

      <P>
        The catalog is browsable right here — one search over every listing, with tabs for MCP
        servers, skills, plugins and what is installed, filters for goal, host, category and
        publisher, and a copy button for the install command. Head to the{" "}
        <NavLink to="/marketplace" className="font-medium text-brand hover:underline">
          marketplace
        </NavLink>{" "}
        to start, or read the{" "}
        <NavLink to="/docs/getting-started" className="font-medium text-brand hover:underline">
          quickstart
        </NavLink>{" "}
        first.
      </P>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Lock className="h-4 w-4 text-brand" /> The honesty rules
        </p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
          <li>• No account required, no credential proxying — credentials stay in your environment or OS vault.</li>
          <li>• Nothing is written without a preview, and every write is backed up first.</li>
          <li>• Discovery-only listings say so, before you try to install them.</li>
          <li>• Every catalog field links to its verified upstream source — nothing on this site is synthesized.</li>
        </ul>
      </div>
    </DocSection>
  );
}

function GettingStarted() {
  return (
    <DocSection title="Getting started">
      <P>
        LiteSPM ships as an npm package that downloads the signed binary for your platform. Node
        22.22.2+ is required.
      </P>
      <InstallBar command="npm install -g litespm" label="npm" />

      <P>
        Upgrade later with{" "}
        <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">npm update -g litespm</code>{" "}
        or <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm self-update</code>.
        Every interactive run also checks the signed release channel, with a short cooldown
        window that keeps a burst of commands to one check.
      </P>

      <P>
        Running <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm</code> with
        no arguments opens the setup wizard. It finds the agents on your machine, shows the exact
        file it will touch, and asks before writing. You can skip agent connection and open the
        manager directly.
      </P>

      <CodeBlock
        title="the commands that cover the loop"
        code={`litespm search postgres     # find something
litespm install <id>        # install it
litespm list                # see what is installed
litespm catalog sync        # optional: refresh the catalog right now`}
      />

      <h2 className="pt-2 text-[17px] font-semibold">The local catalog syncs itself</h2>
      <P>
        You do not have to download the catalog as a separate first step. The first command that
        needs it — bare <C>litespm</C>, <C>search</C>, <C>install</C>, <C>marketplace rows</C>,{" "}
        <C>skills find</C> or <C>lock</C> — downloads it in the foreground and prints progress on
        stderr. After that, a run that finds the last check older than 6 hours starts a detached{" "}
        <C>litespm catalog sync --auto</C> and never waits for it. The check stamp, lock and log
        (<C>catalog-autosync.json</C>, <C>catalog-sync.lock</C>, <C>catalog-sync.log</C>) live under
        the LiteSPM data root. Set <C>LITESPM_NO_AUTO_SYNC=1</C> to turn it off (it is also off when{" "}
        <C>CI</C> is set); <C>litespm catalog sync</C> still works on demand. Every download is
        digest-verified, and a failed sync leaves the previous catalog in place.
      </P>
      <P>
        The sync also builds a local SQLite full-text search index from the verified files, so a
        search no longer loads the whole release. On the maintainers&apos; Linux measurements a warm
        search went from 2.6–3.4 s at about 475 MB of memory to 0.3–0.8 s (whole process) at about
        33 MB. The index is rebuilt whenever it does not match the catalog on disk. On Windows the
        background sync starts without opening a console window.
      </P>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="text-[13px] font-semibold">Availability</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Automatic sync and the search index are part of the repository&apos;s next release,{" "}
          <strong className="text-foreground">0.6.1</strong>. The version on npm is{" "}
          <strong className="text-foreground">{facts.npmVersion}</strong>, where you run{" "}
          <C>litespm catalog sync</C> yourself before the first search.
        </p>
      </div>

      <P>
        From the menu you can also hand a GitHub repository, Git URL, skill URL or local folder to
        the interactive skills installer. It discovers skills, lets you choose skills and agent
        targets, previews destinations, and asks before it writes.
      </P>

      <div className="rounded-xl border border-brand/25 bg-brand-soft/60 p-4">
        <p className="text-[13px] font-semibold">Then open the marketplace inside your agent</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm setup</code> (or{" "}
          <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm host setup &lt;id&gt;</code>)
          connects the agent <em>and</em> installs a marketplace command for it. Pi, OpenCode, Claude
          Code and GitHub Copilot CLI get an interactive popup; most other agents get a prompt
          command. See{" "}
          <NavLink to="/docs/in-agent-marketplace" className="font-medium text-brand hover:underline">
            the in-agent marketplace
          </NavLink>{" "}
          and the{" "}
          <NavLink to="/docs/agent-compatibility" className="font-medium text-brand hover:underline">
            compatibility table
          </NavLink>
          .
        </p>
      </div>    </DocSection>
  );
}

function Commands() {
  return (
    <DocSection title="Command reference">
      <P>
        Every shipped command, grouped by what you are trying to do. The install flags below are the
        flags the published npm binary actually accepts — verified against the registry, not the
        source tree.
      </P>

      <div className="space-y-2.5">
        {COMMANDS.map((command, index) => {
          const previous = index > 0 ? COMMANDS[index - 1] : undefined;
          return (
            <React.Fragment key={command.cmd}>
              {(!previous || previous.group !== command.group) && (
                <h2 className="pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground first:pt-0">
                  {command.group}
                </h2>
              )}
              <div className="rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-brand/30">
                <p className="font-mono text-[12.5px] font-semibold text-brand">{command.cmd}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {command.description}
                </p>
                {command.example && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 px-3 py-2 font-mono text-[11.5px] text-foreground/90">
                    <code>$ {command.example}</code>
                  </pre>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <h2 className="pt-3 text-[17px] font-semibold">Install flags</h2>
      <P>
        Accepted by <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm install</code>{" "}
        in the current release (0.6.0):
      </P>
      <div className="flex flex-wrap gap-1.5">
        {INSTALL_FLAGS.map((flag) => (
          <span
            key={flag}
            className="rounded-full border border-border/60 bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
          >
            {flag}
          </span>
        ))}
      </div>
      <P>
        <span className="text-muted-foreground/70">
          Source: npm dist-tags.latest cross-read against the git tag of the same version.
        </span>
      </P>
    </DocSection>
  );
}

function InstallFlow() {
  return (
    <DocSection title="How an install works">
      <P>Five steps, in order, every time:</P>
      <ol className="space-y-3">
        {[
          { title: "Plan", body: "Resolve the listing, the version and the target hosts." },
          { title: "Preview", body: "Show the exact file and directory changes that will be made." },
          { title: "Approve", body: "A human says yes. From an agent, a single-use token from litespm approve." },
          { title: "Back up and apply", body: "One transaction, with the previous file preserved." },
          { title: "Record", body: "The ledger keeps what was written, so list, restore and install remove know exactly what LiteSPM owns." },
        ].map((step, i) => (
          <li key={step.title} className="flex gap-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[12px] font-bold text-brand">
              {i + 1}
            </span>
            <div>
              <p className="text-[14px] font-semibold">{step.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <P>
        Existing entries are left alone. Removal strips only the nodes LiteSPM wrote and keeps
        anything you edited — the ledger is the boundary of ownership.
      </P>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Undo2 className="h-4 w-4 text-brand" /> Undo is a command
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">restore</code> puts a
          config back to its exact previous bytes;{" "}
          <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">install remove</code>{" "}
          takes out only what LiteSPM wrote.
        </p>
      </div>
    </DocSection>
  );
}

function Hosts() {
  return (
    <DocSection title="Agent hosts">
      <P>
        LiteSPM supports <strong className="text-foreground">{facts.hosts} agent hosts</strong> for local stdio
        MCP servers and <strong className="text-foreground">{facts.skillTargets} targets</strong> for skills. The MCP
        set includes Claude Code, Claude Desktop, OpenAI Codex, OpenCode, Cline, Pi, Grok Build, Cursor,
        Visual Studio Code, Zed, Gemini CLI, GitHub Copilot and AiderDesk.
      </P>
      <P>
        <strong className="text-foreground">{facts.remoteHosts} of the {facts.hosts}</strong> hosts document a native remote (URL)
        entry. The other {facts.hosts - facts.remoteHosts} — {facts.localOnlyHostNames.join(", ")} — support local stdio only and
        refuse a remote install with <code className="font-mono text-brand">LPSM-HOST-REMOTE-UNSUPPORTED</code>.
        There is no relay: LiteSPM does not write a URL shape a host cannot read, and it does not run
        a hidden proxy process on the host&apos;s behalf.
      </P>
      <P>
        Each host has its own verified integration. Configuration rules (surgical JSONC merging, TOML round-tripping, and platform path discovery) are derived directly from each agent vendor&apos;s official documentation. Every host gets the exact same plan preview, pre-write backup, and byte-exact ledger.
      </P>

      <CodeBlock
        title="host commands"
        code={`litespm host list              # every supported host and the file it writes
litespm host detect            # which of them are on this machine
litespm host setup <host-id>   # connect one
litespm install <id> --agent <host>   # target any of them`}
      />

      <NavLink
        to="/agents"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
      >
        Browse all {facts.hosts} agent profiles <ArrowRight className="h-3.5 w-3.5" />
      </NavLink>
    </DocSection>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">{children}</code>;
}

const EVIDENCE_STYLE: Record<InAgentEntry["evidence"], string> = {
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  validated: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-400",
  "load-verified": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  unverified: "border-border bg-muted/50 text-muted-foreground",
  "n/a": "",
};

function EvidenceChip({ entry }: { entry: InAgentEntry }) {
  if (entry.evidence === "n/a") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        EVIDENCE_STYLE[entry.evidence],
      )}
    >
      {EVIDENCE_LABEL[entry.evidence]}
    </span>
  );
}

function ReleaseNote() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <p className="text-[13px] font-semibold">Availability</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        In-agent marketplace commands are part of the repository&apos;s next release,{" "}
        <strong className="text-foreground">0.6.1</strong>. The version published on npm is{" "}
        <strong className="text-foreground">{facts.npmVersion}</strong>, which does not install them.
        Update with <C>npm update -g litespm</C> once 0.6.1 is published.
      </p>
    </div>
  );
}

function InAgentMarketplace() {
  const popups = IN_AGENT.filter((e) => e.kind === "popup");
  const prompts = IN_AGENT.filter((e) => e.kind === "prompt");
  return (
    <DocSection title="The in-agent marketplace">
      <P>
        <C>litespm setup</C> and <C>litespm host setup &lt;id&gt;</C> do two things for an agent:
        they register the LiteSPM bridge so the agent can call LiteSPM&apos;s {facts.bridgeTools} MCP
        tools, and they install a <strong className="text-foreground">marketplace command</strong>{" "}
        inside the agent, so you can browse and install without leaving it. What the command looks
        like depends on what the agent lets an extension do.
      </P>
      <ReleaseNote />

      <h2 className="pt-2 text-[17px] font-semibold">Popups — interactive, no model turn</h2>
      <P>
        A popup is a real view inside the agent: you search, move through the list and pick a row.
        It does not spend a model turn. Every popup renders the same view model,{" "}
        <C>litespm marketplace rows --json</C>, so they show the same thing. That command reads
        the catalog <strong className="text-foreground">synced on your machine</strong> (kept fresh
        by the automatic background sync, or refresh it with <C>litespm catalog sync</C>) merged
        with your install ledger. It does not call this
        website, and nothing you type in a popup is sent here; the two list the same signed release,
        but your local copy is only as new as your last sync.
      </P>
      <div className="space-y-2">
        {popups.map((entry) => (
          <div key={entry.agent} className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold">{entry.agent}</p>
              <EvidenceChip entry={entry} />
            </div>
            <p className="mt-1.5 font-mono text-[12.5px] text-brand">{entry.invoke}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Installed as: {entry.mechanism}.{entry.note ? ` ${entry.note}` : ""}
            </p>
          </div>
        ))}
      </div>

      <CodeBlock
        title="the view model every popup renders"
        code={`litespm marketplace rows --json
litespm marketplace rows --json --query postgres
litespm marketplace rows --json --kind mcp --host claude-code
litespm marketplace rows --json --kind installed`}
      />
      <P>
        <C>--kind</C> takes <C>mcp</C>, <C>skill</C>, <C>plugin</C> or <C>installed</C>;{" "}
        <C>--host</C> limits rows to one agent; <C>--query</C> filters by text. The same command is
        handy in scripts.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">Prompt commands — your agent&apos;s model drives LiteSPM</h2>
      <P>
        Where an agent has no way to draw a view, LiteSPM installs a prompt: a command, workflow or
        skill file. Running it asks the agent&apos;s own model to use the LiteSPM MCP tools —
        search, plan, show you the plan — on your behalf. That costs a model turn and the answer is
        text, not a popup. It still cannot approve for you: an install proceeds only with a
        single-use token from <C>litespm approve</C>.
      </P>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {prompts.map((entry) => (
          <li key={entry.agent} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-[12.5px]">
            <span className="font-medium">{entry.agent}</span>
            <span className="text-muted-foreground"> — {entry.mechanism}</span>
            {entry.invoke !== "prompt command" && (
              <span className="ml-1 font-mono text-[11.5px] text-brand">{entry.invoke}</span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="pt-2 text-[17px] font-semibold">Removing it</h2>
      <P>
        <C>litespm host remove &lt;id&gt;</C> removes the bridge entry <em>and</em> the marketplace
        command for that agent. Anything you edited yourself is kept.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">Older MCP prompt</h2>
      <P>
        The bridge also publishes an MCP prompt named <C>marketplace</C>. Only agents that turn MCP
        prompts into slash commands show it (OpenCode lists it as <C>/litespm:marketplace</C>); Qwen
        Code 0.14.4 does not, so use <C>/mcp</C> there to confirm the <C>litespm</C> server and its{" "}
        {facts.bridgeTools} tools. For an agent that isn&apos;t listed above, see{" "}
        <NavLink to="/docs/agent-compatibility" className="font-medium text-brand hover:underline">
          agent compatibility
        </NavLink>
        .
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">The {facts.bridgeTools} bridge tools</h2>
      <P>
        Whatever command you use, the agent reaches LiteSPM through one MCP server named{" "}
        <C>litespm</C> with these tools. Only <C>request_install</C> changes your machine, and only
        with a valid approval token; <C>adopt_capability</C> records ownership in the ledger without
        touching your config.
      </P>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {[
          ["search_catalog", "Search the catalog"],
          ["get_extension", "Read one listing"],
          ["prepare_install", "Build an install plan (nothing is written)"],
          ["request_install", "Run a plan you approved"],
          ["list_installed", "What LiteSPM owns, plus detected external items"],
          ["load_skill", "Read an installed skill"],
          ["read_skill_resource", "Read a file inside an installed skill"],
          ["search_capabilities", "Find tools exposed by installed servers"],
          ["describe_capability", "Show one tool's input schema"],
          ["invoke_capability", "Call a granted tool"],
          ["adopt_capability", "Take ownership of a server already in your config"],
          ["get_invocation", "Look up an invocation by id"],
          ["cancel_invocation", "Cancel an invocation by id"],
        ].map(([name, what]) => (
          <div key={name} className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <code className="font-mono text-[12px] text-brand">{name}</code>
            <p className="text-[12px] text-muted-foreground">{what}</p>
          </div>
        ))}
      </div>

      <CodeBlock title="run the bridge for a host" code={`litespm bridge stdio --host codex`} />
    </DocSection>
  );
}

function AgentCompatibility() {
  const rows: Array<{ title: string; blurb: string; kind: InAgentEntry["kind"] }> = [
    { title: "Popup", blurb: "Interactive view inside the agent. No model turn.", kind: "popup" },
    { title: "Prompt command", blurb: "A command, workflow or skill. The agent's model drives LiteSPM's MCP tools.", kind: "prompt" },
    { title: "Not possible", blurb: "No UI extension API (or the product is gone), so LiteSPM installs no marketplace command.", kind: "none" },
  ];
  return (
    <DocSection title="Agent compatibility">
      <P>
        Which marketplace command each agent gets. The MCP bridge itself works with all{" "}
        {facts.hosts} registry hosts; this table is only about the in-agent marketplace command.
        &ldquo;Verified&rdquo; means exercised end to end; &ldquo;validated&rdquo; means checked
        against the named version&apos;s contract; &ldquo;loads&rdquo; means the agent loads the
        extension but behaviour was not fully exercised; &ldquo;unverified&rdquo; means written from
        documentation and not run yet.
      </P>
      <ReleaseNote />
      {rows.map((group) => (
        <section key={group.kind} aria-labelledby={`compat-${group.kind}`}>
          <h2 id={`compat-${group.kind}`} className="pt-2 text-[17px] font-semibold">
            {group.title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{group.blurb}</p>
          <div className="mt-2.5 overflow-x-auto rounded-xl border border-border/70 bg-card">
            <table className="w-full min-w-[34rem] text-left text-[12.5px]">
              <caption className="sr-only">{group.title} agents</caption>
              <thead className="border-b border-border/60 bg-muted/30 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Agent</th>
                  <th scope="col" className="px-3 py-2 font-medium">{group.kind === "none" ? "Why" : "How you open it"}</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {IN_AGENT.filter((e) => e.kind === group.kind).map((entry) => (
                  <tr key={entry.agent} className="border-b border-border/40 last:border-0 align-top">
                    <th scope="row" className="px-3 py-2.5 font-medium">{entry.agent}</th>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {group.kind === "none" ? (
                        entry.note
                      ) : (
                        <>
                          <span className="font-mono text-[12px] text-foreground">{entry.invoke}</span>
                          <span className="block text-[11.5px]">
                            {entry.mechanism}
                            {entry.note ? ` · ${entry.note}` : ""}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <EvidenceChip entry={entry} />
                      {entry.evidence === "n/a" && group.kind !== "none" && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <P>
        An agent that isn&apos;t in this table still gets the MCP bridge and every{" "}
        <C>litespm</C> command; it just has no marketplace command inside it. Use{" "}
        <C>litespm marketplace</C> in a terminal, or this website.
      </P>
    </DocSection>
  );
}

function Security() {
  return (
    <DocSection title="Security model">
      <div className="space-y-3">
        {[
          { title: "Your machine, your keys", body: "No account required, no credential proxying. Credentials stay in the environment or the OS vault. LiteSPM never sees them." },
          { title: "Nothing is written without a preview", body: "You see the change first, and the file is backed up before it is touched." },
          { title: "Fail-closed remote installs", body: "A host with no vendor-documented URL entry object is refused with a clear error, never written in a guessed shape." },
          { title: "Pinned plugin sources", body: "A plugin installs from the pinned commit its publisher ships. LiteSPM fetches that commit, verifies it, and installs what the plugin's own manifest declares. A plugin with no fetchable pinned source is refused with the reason." },
          { title: "Single-use approval tokens", body: "From an agent, litespm approve <plan-id> records your approval and mints a one-shot token — the agent can prepare a plan but cannot approve it for you." },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border/70 bg-card p-4">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0 text-brand" /> {item.title}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
      <P>
        The full policy and threat model live in{" "}
        <a
          href="https://github.com/sarv-projects/LiteSPM/blob/main/SECURITY.md"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand hover:underline"
        >
          SECURITY.md
        </a>{" "}
        in the repository.
      </P>
    </DocSection>
  );
}

function Publishing() {
  return (
    <DocSection title="Publishing to the catalog">
      <P>
        The catalog is generated from publisher-published data — LiteSPM indexes listings directly from official specifications and public repositories. Where your listing can appear depends on its kind:
      </P>
      <div className="space-y-2.5">
        {[
          {
            title: "MCP servers",
            body: "Publish to your GitHub repository or the official MCP specification. Verified metadata and a live endpoint make the listing installable rather than discovery-only.",
          },
          {
            title: "Agent skills",
            body: "Host your SKILL.md folder in a public repository — GitHub works. Skills install through the content-addressed ledger from the source they were published in.",
          },
          {
            title: "Plugins",
            body: "A plugin ships a manifest declaring its skills and MCP servers, plus a version-pinned git source. LiteSPM fetches the pinned commit, verifies it, and installs what the manifest declares.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border/70 bg-card p-4">
            <p className="text-[13.5px] font-semibold">{item.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
      <NavLink
        to="/publish"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
      >
        Submit your listing for review <ArrowRight className="h-3.5 w-3.5" />
      </NavLink>
    </DocSection>
  );
}

function Troubleshooting() {
  return (
    <DocSection title="Troubleshooting & FAQ">
      <P>The usual first stop for diagnostics and environment repair is the doctor:</P>
      <CodeBlock
        title="diagnostics"
        code={`litespm doctor        # inspect host configs and repair connections
litespm list --drifted  # inspect entries changed outside LiteSPM
litespm catalog sync    # refresh the local catalog now (it also syncs itself)`}
      />
      <div className="mt-8 space-y-3">
        {[
          {
            q: "Do I need to run catalog sync myself?",
            a: "Not from 0.6.1. The first command that needs the catalog downloads it in the foreground with progress on stderr, and later runs start a detached background sync at most every 6 hours without waiting for it. Set LITESPM_NO_AUTO_SYNC=1 (or run under CI) to disable that; 'litespm catalog sync' still works on demand. On the npm 0.6.0 release there is no automatic sync, so run 'litespm catalog sync' once before your first search. If a sync keeps failing, the background log is catalog-sync.log in the LiteSPM data root.",
          },
          {
            q: "Why are some packages marked 'Installable' while others are 'Discovery-Only'?",
            a: "LiteSPM operates on a strict zero-guesswork safety standard. To automatically install an MCP server, LiteSPM requires a verified runtime contract: either an exact streamable remote URL (HTTP/SSE) or a confirmed local execution command (command + args). When community packages only provide a repository link or documentation without standardized launch parameters, LiteSPM refuses to guess (such as guessing between npx, python, or uvx). These tools remain in the catalog so you can discover them and visit their source code, but one-click automated installation is paused until verified launch details exist.",
          },
          {
            q: "What does 'Discovery only' mean on a listing?",
            a: "The catalog has this row's metadata but no verified source or launch line LiteSPM can use. For a server, that means no publishable remote endpoint and no publisher-declared package the installer can start; for a skill, it means no GitHub source whose SKILL.md the build actually read. The detail page links only to the source the catalog recorded; it does not guess a repository.",
          },
          {
            q: "Why do some plugins require the --allow-partial flag?",
            a: "Plugins can bundle both portable components (universal MCP servers and agent skills) and host-specific extras (such as IDE-specific extension commands, editor hooks, or subagents). LiteSPM installs all portable servers and skills into any supported agent, but pauses on unsupported extras by default so you aren't surprised by missing features. Adding --allow-partial confirms that you want LiteSPM to install all portable components while skipping non-portable host extras. The source must still be commit-pinned; --allow-partial does not bypass pinning.",
          },
          {
            q: "Why do plugins require a version-pinned source?",
            a: "To ensure reproducible builds, cryptographic security, and byte-exact rollbacks, LiteSPM requires plugins to pin to a specific git commit hash. Floating branches (such as main or latest) can change at any time without notice. If a plugin points to a floating ref or a local directory, LiteSPM refuses it and tells you the publisher must publish an immutable tag or commit SHA. There is no CLI flag that bypasses this check.",
          },
          {
            q: "A host refuses a remote (URL) install",
            a: `${facts.remoteHosts} of the ${facts.hosts} supported agent hosts document a native remote URL entry. ${facts.hosts - facts.remoteHosts} hosts (${facts.localOnlyHostNames.join(", ")}) support local stdio processes only; they refuse a remote install with LPSM-HOST-REMOTE-UNSUPPORTED. LiteSPM does not write an unsupported URL shape and does not run a hidden proxy on the host's behalf.`,
          },
          {
            q: "What does it mean when entries show as 'drifted'?",
            a: "A drifted entry means the configuration file was modified outside of LiteSPM after the initial install (such as by manual editing or by another tool). Running 'litespm list --drifted' shows exactly what changed. LiteSPM respects your manual changes: if you later run 'litespm install remove', LiteSPM only cleans up the specific lines it originally added and leaves your custom edits untouched.",
          },
          {
            q: "litespm install says unknown flag",
            a: "Your installed CLI version is older than the flag being used (the repository can be ahead of npm: the in-agent marketplace commands and `marketplace rows` belong to the unreleased 0.6.1). Run 'npm update -g litespm' (or 'litespm self-update') to update to the latest release. This site's command reference and install flags are checked against the version npm serves as latest, not against an unreleased build.",
          },
        ].map((item) => (
          <details key={item.q} className="group rounded-xl border border-border/70 bg-card transition-colors hover:border-border">
            <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-3.5 text-[13.5px] font-semibold text-foreground">
              <Search className="h-3.5 w-3.5 text-brand" />
              {item.q}
            </summary>
            <p className="px-4 pb-4 pt-1 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </DocSection>
  );
}

/* ------------------------------------------------------------------------ */
/* How we rank and label                                                    */
/* ------------------------------------------------------------------------ */

/** Max points per LiteSPM Score component. scripts/check-installable-first.mjs
 *  compares these to rankScoreBreakdown() in server/litespm/ranking.ts. */
const SCORE_PARTS: Array<{ part: string; max: number; how: string }> = [
  { part: "Editorial recognition", max: 35, how: "The tool is a known flagship of the agent ecosystem (official MCP reference servers, top-vendor servers, Anthropic's official skills): 35. A notable second tier or a re-publication of a flagship name by another publisher: 22. A first-party namespace such as @microsoft/… or io.github.supabase/…: 12." },
  { part: "Vendor authority", max: 18, how: "A tier-1 ecosystem vendor publisher or namespace: 14. A tier-2 recognised vendor: 8. A verified publisher adds 4, capped at 18." },
  { part: "Proven installability", max: 15, how: "litespm_tested 15, runtime_verified 12, metadata_verified 7, discovery_only 2." },
  { part: "Record quality", max: 12, how: "Endpoint URL 3, tool schemas 3, README 2, executable command 2, version 2." },
  { part: "Description substance", max: 5, how: "120+ characters 5, 60+ 4, 25+ 2, 10+ 1." },
  { part: "GitHub stars", max: 15, how: "Log scale, only when a source publishes stars." },
];

const SOURCE_NOTE: Record<string, string> = {
  "builtin:mcp-registry": "Official MCP Registry API",
  "feed:skills-sh": "skills.sh directory",
  "feed:punkpeye-awesome-mcp-servers": "awesome-mcp-servers list",
  "feed:mcpmarket-com": "MCP Market directory",
  "feed:voltagent-awesome-agent-skills": "awesome-agent-skills list",
  "feed:mcpservers-org": "MCPServers.org directory",
  "feed:modelcontextprotocol-servers": "modelcontextprotocol/servers list",
  "git:claude-plugins-official": "Claude Code plugins directory (vendor marketplace)",
  "git:knowledge-work-plugins": "Knowledge Work plugins (vendor marketplace)",
  "git:cursor-plugins": "Cursor plugins (vendor marketplace)",
  "git:openai-plugins": "OpenAI Codex plugins (vendor marketplace)",
  "git:xai-plugin-marketplace": "xAI plugin marketplace (vendor marketplace)",
  "git:anthropics-skills": "Anthropic Agent Skills (vendor marketplace)",
};

const LEVELS: Array<{ id: string; label: string; meaning: string }> = [
  { id: "litespm_tested", label: "LiteSPM tested", meaning: "Covered by a LiteSPM acceptance record." },
  { id: "runtime_verified", label: "Runtime verified", meaning: "The launch line was observed to start." },
  { id: "metadata_verified", label: "Metadata verified", meaning: "An upstream manifest supplied the version and the launch or source data (command and args for a local server, an endpoint for a remote one). Nothing was run." },
  { id: "discovery_only", label: "Discovery only", meaning: "Searchable metadata with no proven artifact. LiteSPM will not try to install it." },
];

function Methodology() {
  const [stats, setStats] = React.useState<CatalogStatsResponse | null>(null);
  React.useEffect(() => {
    fetch("/api/litespm/stats")
      .then((r) => r.json())
      .then((data: CatalogStatsResponse) => setStats(data))
      .catch(() => {});
  }, []);

  const counts = stats?.counts;
  const n = (value: number | undefined) => (value === undefined ? "…" : formatFull(value));
  const levelCount = (id: string) => counts?.byInstallability?.[id] ?? 0;

  return (
    <DocSection title="How we rank and label">
      <P>
        Every figure and label on this site is derived from the catalog rows themselves or from a
        rule written down here. This page says what each signal means, where it comes from, and
        what LiteSPM does not show.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">Order of results</h2>
      <P>
        Search and &quot;Top ranked&quot; put <strong className="text-foreground">installable
        listings first</strong>, then discovery-only listings, each group in score order (for a
        text search, text relevance first and score second). A discovery-only listing is never
        hidden by this, it just comes after the listings LiteSPM can install. The{" "}
        <strong className="text-foreground">Installable only</strong> switch removes them. Sorting
        by name, kind or publisher is left exactly as chosen.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">The LiteSPM Score (0 to 100)</h2>
      <P>
        An editorial reputation score computed from each row&apos;s own fields. It measures
        recognition and trustworthiness of the tool, not popularity.
      </P>
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[34rem] text-left text-[12.5px]">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Component</th>
              <th className="px-3 py-2 font-medium">Max</th>
              <th className="px-3 py-2 font-medium">How points are earned</th>
            </tr>
          </thead>
          <tbody>
            {SCORE_PARTS.map((row) => (
              <tr key={row.part} className="border-b border-border/40 align-top last:border-0">
                <td className="px-3 py-2 font-medium">{row.part}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{row.max}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        The maximums add up to exactly 100. A junk penalty of 40 to 45 points applies to records
        that are parse artifacts rather than tools (names that start with a symbol, HTTP-header
        fragments, a bare &quot;@word&quot;). Ties are broken by name, with artifact names last.
        Fields the catalog does not publish earn nothing: in this release no row carries a GitHub
        star count and none carries a README, so those components are zero for every listing
        rather than estimated.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">Installability levels</h2>
      <P>
        Each listing carries one level, and it is provenance, not a feature flag. Counts below are
        unique listings in this release.
      </P>
      <ul className="space-y-2">
        {LEVELS.map((level) => (
          <li key={level.id} className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="flex flex-wrap items-baseline gap-2 text-[13px] font-semibold">
              {level.label} <C>{level.id}</C>
              <span className="ml-auto font-mono text-[12px] font-normal tabular-nums text-muted-foreground">
                {n(counts ? levelCount(level.id) : undefined)}
              </span>
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{level.meaning}</p>
          </li>
        ))}
      </ul>
      <P>
        The level is not the same as &quot;installable&quot;. A listing is{" "}
        <strong className="text-foreground">installable</strong> only when LiteSPM can build an
        install plan for it: it is not discovery-only, and a local MCP server has a published
        command, a remote one has an endpoint, a skill has a source to copy from, and a plugin has
        a pinned git commit to fetch. The &quot;Installable only&quot; switch, the hero count and
        the bundles all use that one rule. Today {n(counts?.installable)} of {n(counts?.uniqueListings)}{" "}
        unique listings qualify and {n(counts?.discoveryOnly)} do not.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">What &quot;Not inspected&quot; means</h2>
      <P>
        For a skill, the detail page shows whether it carries scripts, makes network calls or
        needs credentials. LiteSPM reads the catalog&apos;s declarative metadata, not the
        skill&apos;s files, so those fields say &quot;Not inspected&quot; unless the publisher
        declared otherwise. It is the absence of an audit, not a clean bill of health: review the
        source before you use a skill.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold" id="counts">Where each count comes from</h2>
      <P>Three different numbers describe the size of the catalog. They answer different questions.</P>
      <ul className="space-y-2">
        <li className="rounded-xl border border-border/70 bg-card px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <strong className="font-mono text-[14px] text-foreground">{n(counts?.catalogRows)}</strong>{" "}
          <strong className="text-foreground">catalog rows</strong>: every row in the release file,
          before any merging. This is the release&apos;s own item count.
        </li>
        <li className="rounded-xl border border-border/70 bg-card px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <strong className="font-mono text-[14px] text-foreground">{n(counts?.uniqueListings)}</strong>{" "}
          <strong className="text-foreground">unique listings</strong>: rows left after exact
          duplicates are removed. This is what the banner, the home page and the introduction call
          &quot;listings&quot;.
        </li>
        <li className="rounded-xl border border-border/70 bg-card px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <strong className="font-mono text-[14px] text-foreground">{n(counts?.distinctTools)}</strong>{" "}
          <strong className="text-foreground">distinct tools</strong>: distinct names after
          lower-casing and dropping punctuation. Search results show this one, because it merges
          same-name listings.
        </li>
      </ul>

      <h2 className="pt-2 text-[17px] font-semibold">How duplicates are merged</h2>
      <P>
        Two steps. First, <strong className="text-foreground">exact duplicates</strong> are
        removed: rows with the same source identity (the same kind, repository, path, revision and
        name, or the same discovery key) count once. Second, search{" "}
        <strong className="text-foreground">collapses same-name listings</strong>: one tool
        published by several publishers, or as both an MCP server and a skill, appears as one
        result, and every listing keeps its own page. The result that stays is the first in the
        current order, so an installable listing wins over a discovery-only one of the same name,
        and otherwise the higher score wins.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">Where the catalog comes from</h2>
      <P>
        Release {stats?.release?.releaseId ?? "…"} is built from these sources and nothing else.
        Counts are unique listings per source.
      </P>
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[30rem] text-left text-[12.5px]">
          <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Id</th>
              <th className="px-3 py-2 text-right font-medium">Listings</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.sources ?? []).map(([id, count]) => (
              <tr key={id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2">{SOURCE_NOTE[id] ?? id}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{id}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatFull(count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        A <strong className="text-foreground">verified publisher</strong> badge means the publisher
        identity came from the vendor&apos;s own manifest (the registry or a vendor plugin
        marketplace). A publisher taken from a list or directory entry is a claim and carries no
        badge. A listing reaches metadata verified only when a manifest or source record supplies
        its launch or source data.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">What we deliberately do not show</h2>
      <P>
        There are <strong className="text-foreground">no download or install counts</strong>.
        LiteSPM has no telemetry, by design, so it has nothing to count, and no upstream source
        publishes a count we could repeat honestly. There are no star counts for the same reason,
        and no health lights: LiteSPM does not check whether an installed server is running. A
        number that is not on this site is a number we do not have.
      </P>

      <h2 className="pt-2 text-[17px] font-semibold">Reporting a wrong listing</h2>
      <P>
        If a listing&apos;s name, publisher, level or launch line is wrong, use the{" "}
        <NavLink to="/publish" className="font-medium text-brand hover:underline">
          publish and feedback form
        </NavLink>{" "}
        and choose &quot;A listing&apos;s data is wrong&quot;. If you publish the package, the same
        form is the way to get a record fixed.
      </P>
    </DocSection>
  );
}
