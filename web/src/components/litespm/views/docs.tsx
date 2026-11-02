"use client";

import * as React from "react";
import { ArrowRight, BookOpen, Cable, CheckCircle2, CircleDot, Lock, Package, RotateCcw, Search, ShieldCheck, Terminal, Undo2, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { useApp } from "@/lib/litespm/router";
import { CodeBlock } from "../code-block";
import { InstallBar } from "../install-bar";

const SECTIONS: Array<{ id: string; label: string; icon: React.ElementType }> = [
  { id: "introduction", label: "Introduction", icon: BookOpen },
  { id: "getting-started", label: "Getting started", icon: Terminal },
  { id: "commands", label: "Command reference", icon: Wrench },
  { id: "install-flow", label: "How an install works", icon: CheckCircle2 },
  { id: "hosts", label: "Agent hosts", icon: Cable },
  { id: "inside-agent", label: "Inside your agent", icon: CircleDot },
  { id: "security", label: "Security model", icon: ShieldCheck },
  { id: "publishing", label: "Publishing to the catalog", icon: Package },
  { id: "troubleshooting", label: "Troubleshooting", icon: RotateCcw },
];

const COMMANDS: Array<{ cmd: string; description: string; example?: string }> = [
  { cmd: "litespm", description: "Open the setup and management wizard. Finds agents on your machine, shows the exact file it will touch, and asks before writing." },
  { cmd: "litespm search <text>", description: "Search the local catalog. Marks which results are installable and which are discovery-only, before you run anything.", example: "litespm search postgres" },
  { cmd: "litespm install <id>", description: "Install a server, skill or plugin. Resolves the listing, plans the change, previews it, and asks before writing.", example: "litespm install neon --agent claude-code" },
  { cmd: "litespm install remove <id>", description: "Remove one install. Strips only the nodes LiteSPM wrote and keeps anything you edited." },
  { cmd: "litespm list", description: "What is installed, by agent and kind. --drifted shows entries changed since install." },
  { cmd: "litespm skills add <source>", description: "Install skills from a GitHub repository, Git URL, skill URL or local folder. Discovers skills, lets you choose, previews destinations, and asks before writing.", example: "litespm skills add https://github.com/anthropics/skills" },
  { cmd: "litespm skills use <src>@<skill>", description: "Print a skill's prompt without installing anything.", example: "litespm skills use anthropics/skills@pdf" },
  { cmd: "litespm restore <id>", description: "Roll a config back to its exact previous bytes — not a re-merge." },
  { cmd: "litespm copy --from A --to B", description: "Port one agent's setup to another host." },
  { cmd: "litespm host list", description: "Every supported host and the config file it writes." },
  { cmd: "litespm host detect", description: "Which of the supported hosts are on this machine." },
  { cmd: "litespm host setup <host>", description: "Connect one host: writes the bridge entry with preview and backup.", example: "litespm host setup codex" },
  { cmd: "litespm doctor", description: "Check the install and repair it." },
  { cmd: "litespm catalog sync", description: "Download or refresh the local catalog." },
  { cmd: "litespm bridge stdio --host <id>", description: "Run the MCP bridge a connected agent talks to.", example: "litespm bridge stdio --host codex" },
  { cmd: "litespm approve", description: "Mint a single-use token so an agent can prepare a plan you approve interactively." },
  { cmd: "litespm help", description: "The full command reference." },
];

const INSTALL_FLAGS = [
  "--help, -h", "--version, -v", "--scope, -s", "--workspace, -w", "--host",
  "--agent, -a", "--all-detected", "--env", "--force, -f", "--frozen",
  "--dry-run", "--allow-partial",
];

export function DocsView({ section }: { section: string }) {
  const navigate = useApp((s) => s.navigate);
  const active = SECTIONS.some((s) => s.id === section) ? section : "introduction";

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
                <button
                  type="button"
                  onClick={() => navigate(`#/docs/${item.id}`)}
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
                </button>
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
          {active === "inside-agent" && <InsideAgent />}
          {active === "security" && <Security />}
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
  const navigate = useApp((s) => s.navigate);
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
          { value: "69,376", label: "listings in the catalog" },
          { value: "50", label: "agent hosts for MCP" },
          { value: "26,554", label: "one-command installs" },
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
        Three kinds of capability can be installed: <strong className="text-foreground">MCP
        servers</strong> (48,418 listings — a service your agent calls tools on),{" "}
        <strong className="text-foreground">agent skills</strong> (20,320 listings — a{" "}
        <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">SKILL.md</code> folder of
        instructions), and <strong className="text-foreground">plugins</strong> (638 listings — a
        publisher&apos;s bundle of skills and servers).
      </P>

      <P>
        The catalog is browsable right here — search all listings by kind, category, publisher,
        runtime or host, and copy the install command for anything you pick. Head to{" "}
        <button
          type="button"
          onClick={() => navigate("#/explore")}
          className="font-medium text-brand hover:underline"
        >
          Explore
        </button>{" "}
        to start, or read the{" "}
        <button
          type="button"
          onClick={() => navigate("#/docs/getting-started")}
          className="font-medium text-brand hover:underline"
        >
          quickstart
        </button>{" "}
        first.
      </P>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Lock className="h-4 w-4 text-brand" /> The honesty rules
        </p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
          <li>• No account, no telemetry, no proxy — credentials stay in your environment.</li>
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
        Running <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm</code> with
        no arguments opens the setup wizard. It finds the agents on your machine, shows the exact
        file it will touch, and asks before writing. You can skip agent connection and open the
        manager directly.
      </P>

      <CodeBlock
        title="the four commands that cover the loop"
        code={`litespm catalog sync        # download the catalog
litespm search postgres     # find something
litespm install <id>        # install it
litespm list                # see what is installed`}
      />

      <P>
        From the menu you can also hand a GitHub repository, Git URL, skill URL or local folder to
        the interactive skills installer. It discovers skills, lets you choose skills and agent
        targets, previews destinations, and asks before it writes.
      </P>

      <div className="rounded-xl border border-brand/25 bg-brand-soft/60 p-4">
        <p className="text-[13px] font-semibold">Qwen Code note</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          For Qwen Code, restart the CLI after setup, then use{" "}
          <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">/marketplace</code> to
          browse through the connected LiteSPM MCP server.
        </p>
      </div>
    </DocSection>
  );
}

function Commands() {
  return (
    <DocSection title="Command reference">
      <P>
        Every command with what it does. The install flags below are the flags the published npm
        binary actually accepts — verified against the registry, not the source tree.
      </P>

      <div className="space-y-2.5">
        {COMMANDS.map((command) => (
          <div
            key={command.cmd}
            className="rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-brand/30"
          >
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
        ))}
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
  const navigate = useApp((s) => s.navigate);
  return (
    <DocSection title="Agent hosts">
      <P>
        LiteSPM supports <strong className="text-foreground">50 agent hosts</strong> for MCP servers
        and <strong className="text-foreground">81 targets</strong> for skills. The MCP set includes
        Claude Code, OpenAI Codex, OpenCode, Cline, Pi, Grok Build, Cursor, Zed, Gemini CLI, GitHub
        Copilot and AiderDesk.
      </P>
      <P>
        All <strong className="text-foreground">50 of the 50</strong> hosts run any MCP server.
        46 hosts support direct native remote URLs, while the other four (codestudio, iflow-cli, mux,
        and zcode) connect through LiteSPM&apos;s built-in stdio-to-remote relay bridge. As a universal
        package manager, LiteSPM guarantees 100% host coverage across every supported agent.
      </P>
      <P>
        Each host has its own verified adapter. Configuration rules (surgical JSONC merging, TOML round-tripping, and platform path discovery) are derived directly from each agent vendor&apos;s official documentation. Every host gets the exact same plan preview, pre-write backup, and byte-exact ledger.
      </P>

      <CodeBlock
        title="host commands"
        code={`litespm host list      # every supported host and the file it writes
litespm host detect    # which of them are on this machine
litespm host setup     # connect one
litespm install <id> --agent <host>   # target any of them`}
      />

      <button
        type="button"
        onClick={() => navigate("#/agents")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
      >
        Browse all 50 agent profiles <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </DocSection>
  );
}

function InsideAgent() {
  return (
    <DocSection title="Inside your agent">
      <P>
        With a host configured, <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">/marketplace</code>{" "}
        in your agent reaches the same catalog and the same install path through the LiteSPM
        bridge. An agent can search, prepare a plan, and ask you to approve it — it cannot approve
        for you.
      </P>
      <CodeBlock
        title="run the bridge for a host"
        code={`litespm bridge stdio --host codex`}
      />
      <P>
        The agent sees one MCP server (<span className="font-mono text-[12px]">litespm</span>) whose
        tools resolve at runtime. Approvals still route through you: a single-use token from{" "}
        <code className="rounded bg-muted/60 px-1 font-mono text-[12px]">litespm approve</code> is
        the only way an install proceeds from inside an agent.
      </P>
    </DocSection>
  );
}

function Security() {
  return (
    <DocSection title="Security model">
      <div className="space-y-3">
        {[
          { title: "Your machine, your keys", body: "No account, no telemetry, no proxy. Credentials stay in the environment or the OS vault. LiteSPM never sees them." },
          { title: "Nothing is written without a preview", body: "You see the change first, and the file is backed up before it is touched." },
          { title: "Fail-closed remote installs", body: "A host with no vendor-documented URL entry object is refused with a clear error, never written in a guessed shape." },
          { title: "Pinned plugin sources", body: "A plugin installs from the pinned commit its publisher ships. LiteSPM fetches that commit, verifies it, and installs what the plugin's own manifest declares. A plugin with no fetchable pinned source is refused with the reason." },
          { title: "Single-use approval tokens", body: "From an agent, litespm approve mints a one-shot token — the agent can prepare a plan but cannot approve it for you." },
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
  const navigate = useApp((s) => s.navigate);
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
      <button
        type="button"
        onClick={() => navigate("#/publish")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
      >
        Submit your listing for review <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </DocSection>
  );
}

function Troubleshooting() {
  return (
    <DocSection title="Troubleshooting">
      <P>The usual first stop is the doctor:</P>
      <CodeBlock title="diagnostics" code={`litespm doctor        # check the install and repair it
litespm list --drifted  # entries changed since install
litespm catalog sync  # refresh a stale catalog`} />
      <div className="space-y-2.5">
        {[
          {
            q: "litespm install says unknown flag",
            a: "Your binary is older than the flag. npm update -g litespm gets the current release; the flags this site documents are the flags the published binary accepts.",
          },
          {
            q: "A host refuses a remote install",
            a: "That host publishes no URL entry object, so LiteSPM refuses fail-closed rather than writing a shape the host would silently ignore. Use a stdio-capable listing, or a host whose docs publish the remote entry.",
          },
          {
            q: "A listing is discovery-only",
            a: "The publisher has not provided a source or connection command. Nothing can be prepared until they do — the entry page links the publisher for exactly this.",
          },
          {
            q: "Entries show as drifted",
            a: "The config changed outside LiteSPM since install. list --drifted shows which; your edits are kept and never stripped by remove.",
          },
        ].map((item) => (
          <details key={item.q} className="group rounded-xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[13.5px] font-semibold">
              <Search className="h-3.5 w-3.5 text-brand" />
              {item.q}
            </summary>
            <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </DocSection>
  );
}
