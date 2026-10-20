import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";

export const metadata: Metadata = {
  title: "How LiteSPM works",
  description:
    "Discover AI agent capabilities in the LiteSPM marketplace, connect your coding agent, install supported packages locally, and manage them from one place.",
  alternates: { canonical: "/how-it-works/" },
  openGraph: { title: "How LiteSPM works · LiteSPM Market", url: "/how-it-works/" },
};

function Command({ children }: { children: string }) {
  return (
    <pre
      tabIndex={0}
      className="mt-3 overflow-x-auto rounded-panel bg-dark px-4 py-3 font-mono text-[12.5px] leading-relaxed text-dark-ink"
    >
      <code>{children}</code>
    </pre>
  );
}

const STEPS = [
  {
    number: "01",
    title: "Discover a capability",
    description:
      "Search the marketplace by task, provider, or package name. Each listing shows its source, compatibility information, and whether LiteSPM has a supported installation path.",
  },
  {
    number: "02",
    title: "Connect your coding agent",
    description:
      "Run LiteSPM locally and choose the agent you use. The interactive setup can identify configuration locations and show changes before writing them.",
    command: "npx --yes litespm@latest setup",
  },
  {
    number: "03",
    title: "Sync the catalog and install",
    description:
      "Fetch the catalog once, then copy a package's exact install command from its marketplace page. LiteSPM checks the selected package and supported target configuration.",
    command: "npx --yes litespm@latest catalog sync",
  },
  {
    number: "04",
    title: "Manage what you installed",
    description:
      "View the locally recorded installation, remove entries managed by LiteSPM, or restore a saved configuration when necessary.",
    command: "litespm list",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" tabIndex={-1} className="flex-1">
        <section className="shell band">
          <p className="kicker">How it works</p>
          <h1 className="mt-2 max-w-[23ch] text-[30px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[40px]">
            From discovery to installation, without the config-file hassle.
          </h1>
          <p className="band-sub max-w-[72ch]">
            LiteSPM combines a public marketplace with a local package manager for AI coding
            agents. Find a capability, check whether it fits your setup, and install it using
            the LiteSPM CLI. Your agent configuration stays on your machine.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/explore/" className="btn btn-solid btn-lg">Explore the marketplace</Link>
            <Link href="/get-started/" className="btn btn-lg">Get LiteSPM</Link>
          </div>
        </section>

        <section className="shell band border-t border-rule" aria-labelledby="walkthrough-title">
          <div className="max-w-[72ch]">
            <p className="kicker">The workflow</p>
            <h2 id="walkthrough-title" className="band-title mt-2">
              Four steps to extend your agent
            </h2>
            <p className="band-sub">
              Browse on the web. Install and manage locally. No marketplace account required.
            </p>
          </div>
          <ol className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
            {STEPS.map((step) => (
              <li key={step.number} className="rounded-card border border-rule bg-surface p-5">
                <span className="t-mono text-[11px] font-semibold text-accent-text">{step.number}</span>
                <h3 className="mt-2 text-[17px] font-semibold tracking-tight text-ink">{step.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.description}</p>
                {step.command && <Command>{step.command}</Command>}
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-[72ch] text-[12.5px] leading-relaxed text-ink-3">
            First-time setup and catalog sync are separate operations in the current CLI.
            Package pages provide the exact installation command. Catalog skills may install
            into detected skill targets, while MCP servers and eligible plugins support
            explicit host selection.
          </p>
        </section>

        <section className="shell band border-t border-rule" aria-labelledby="types-title">
          <p className="kicker">What you can add</p>
          <h2 id="types-title" className="band-title mt-2">
            Tools, skills, and plugins for different workflows
          </h2>
          <p className="band-sub">
            Each package type extends your agent in a different way. Availability depends on
            the published package source and your agent's supported integrations.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className="rounded-card border border-rule bg-surface p-5">
              <span className="meta-kind meta-kind-mcp">MCP server</span>
              <h3 className="mt-3 text-[16px] font-semibold text-ink">Connect to external tools</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
                Give your agent access to supported services, databases, repositories, and
                workflows through the Model Context Protocol. LiteSPM registers eligible
                server connections in supported agent configurations.
              </p>
              <Link href="/explore/?kind=mcp" className="mt-4 inline-block text-[13px] font-medium text-accent-text hover:underline">
                Browse MCP servers →
              </Link>
            </article>
            <article className="rounded-card border border-rule bg-surface p-5">
              <span className="meta-kind meta-kind-skill">Skill</span>
              <h3 className="mt-3 text-[16px] font-semibold text-ink">Add reusable workflows</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
                Skills package instructions and supporting resources that your agent can use
                for specific tasks. LiteSPM installs supported skills into an agent's skills directory.
              </p>
              <Link href="/explore/?kind=skill" className="mt-4 inline-block text-[13px] font-medium text-accent-text hover:underline">
                Browse skills →
              </Link>
            </article>
            <article className="rounded-card border border-rule bg-surface p-5">
              <span className="meta-kind meta-kind-plugin">Plugin</span>
              <h3 className="mt-3 text-[16px] font-semibold text-ink">Extend agent functionality</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
                Plugins can bundle multiple capabilities. LiteSPM supports installation for
                some plugins with pinned sources and compatible manifests; others are listed
                for discovery only.
              </p>
              <Link href="/explore/?kind=plugin" className="mt-4 inline-block text-[13px] font-medium text-accent-text hover:underline">
                Browse plugins →
              </Link>
            </article>
          </div>
        </section>

        <section className="shell band border-t border-rule" aria-labelledby="control-title">
          <h2 id="control-title" className="band-title">Your setup stays under your control</h2>
          <p className="band-sub max-w-[72ch]">
            LiteSPM keeps managed installation records locally, backs up affected agent
            configurations, and provides removal and restoration commands.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold text-ink">Local installation</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                The public website helps you discover packages. The CLI handles supported
                changes on your computer, without requiring a LiteSPM account.
              </p>
            </article>
            <article className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold text-ink">Traceable changes</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                Managed installations are recorded, so you can inspect what LiteSPM added
                and use the relevant removal or restore workflow.
              </p>
            </article>
            <article className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold text-ink">Source transparency</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                Each listing identifies its source. Source attribution and declared
                compatibility are not security audits or guarantees of safe operation.
              </p>
            </article>
          </div>
          <p className="mt-5 text-[13px] text-ink-2">
            Learn more in the <Link href="/security/" className="link">security guide</Link> and{" "}
            <Link href="/get-started/" className="link">installation guide</Link>.
          </p>
        </section>

        <section className="shell band border-t border-rule pb-16">
          <h2 className="band-title">Find your next capability</h2>
          <p className="band-sub">Explore the marketplace, then install the packages that fit your workflow.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/explore/" className="btn btn-solid btn-lg">Browse marketplace</Link>
            <Link href="/agents/" className="btn btn-lg">See supported agents</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
