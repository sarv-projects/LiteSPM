import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { WalkthroughFrame } from "./WalkthroughFrame";
import { CapabilityTypes } from "../../components/home/CapabilityTypes";

export const metadata: Metadata = {
  title: "How LiteSPM works",
  description:
    "Find agent tools and skills, connect your agent, and manage installations from your computer with LiteSPM.",
  alternates: { canonical: "/how-it-works/" },
  openGraph: { title: "How LiteSPM works · LiteSPM", url: "/how-it-works/" },
};

function Command({ children }: { children: string }) {
  return (
    <pre
      tabIndex={0}
      className="on-dark mt-3 overflow-x-auto rounded-panel bg-dark px-4 py-3 font-mono text-[12.5px] leading-relaxed text-dark-ink"
    >
      <code>{children}</code>
    </pre>
  );
}

/**
 * The walkthrough is the SAME three moments the home page shows, in the same
 * order and with the same titles.
 *
 * It used to be four — "discover" was a numbered step of its own, and the
 * catalog sync was a fifth thing to run before installing. So this page said
 * four steps while the home page said three, and a reader who clicked through
 * had to re-learn the shape of the product. Browsing is not a step in an
 * install (there is nothing to run, and nothing is changed), and the catalog
 * sync is currently a separate first-time operation, so the prose names it
 * alongside the install step. The home page carries the rationale
 * for three (`components/home/HowItWorks.tsx`).
 */
const STEPS = [
  {
    number: "01",
    title: "Connect your coding agent",
    description:
      "Run LiteSPM locally and choose the agent you use. The interactive setup reads the adapter's own config path, shows you the file it found, and backs it up before writing a single bridge entry. Every other server, comment and line of formatting is left alone.",
    command: "npx --yes litespm@latest setup",
  },
  {
    number: "02",
    title: "Find and install a capability",
    description:
      "Search by task, provider or name. Each package page shows the agent targets and the exact installation command. On your first use, run setup and sync the catalog, then use the command shown on the package page.",
    command: "npx --yes litespm@latest install <id>",
  },
  {
    number: "03",
    title: "Manage or remove installed tools",
    description:
      "See what LiteSPM manages, remove one entry, or roll a config file back to the copy taken before the first edit. Removal takes out only the entry LiteSPM owns and leaves the rest of the file as it was.",
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
            LiteSPM brings agent tools and skills into one marketplace and package manager.
            Find a capability, choose your agent, and follow the install path from your computer.
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
              Three steps to extend your agent
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
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{step.description}</p>
                {step.command && <Command>{step.command}</Command>}
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <WalkthroughFrame />
          </div>

          <p className="mt-4 max-w-[72ch] text-[14px] leading-relaxed text-ink-2">
            Connect your agent, sync the catalog, and choose a package. LiteSPM shows the install
            command and destination so you can keep track of what changed in your workspace.
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
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
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
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
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
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                Plugins can bundle tools and skills. LiteSPM reads a pinned source and shows
                the components and configuration changes in the install plan.
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
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                The public website helps you discover packages. The CLI handles supported
                changes on your computer, without requiring a LiteSPM account.
              </p>
            </article>
            <article className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold text-ink">Traceable changes</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                Managed installations are recorded, so you can inspect what LiteSPM added
                and use the relevant removal or restore workflow.
              </p>
            </article>
            <article className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold text-ink">Source transparency</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                Each listing identifies its source. Source attribution and declared
                compatibility are not security audits or guarantees of safe operation.
              </p>
            </article>
          </div>
          <p className="mt-5 text-[14px] leading-relaxed text-ink-2">
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
        {/* The kinds, in plain language, on the page that is about what
            LiteSPM installs. It used to sit on the home page, ahead of the
            search — the home page now carries the search and the install, and
            this page carries the explanation. */}
        <CapabilityTypes />

      <SiteFooter />
    </div>
  );
}
