import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { WalkthroughFrame } from "./WalkthroughFrame";

export const metadata: Metadata = {
  title: "How LiteSPM works",
  description:
    "Discover AI agent capabilities in the LiteSPM marketplace, connect your coding agent, install supported packages locally, and manage them from one place.",
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
 * sync is part of installing rather than a separate ceremony, so both belong
 * in the prose of the step they serve. The home page carries the rationale
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
      "Search the marketplace by task, provider or package name, then copy the package's exact install command from its page. Each listing shows its source, compatibility, and whether LiteSPM has a supported installation path. The first install fetches the verified catalog; after that LiteSPM resolves the package against it locally and refuses anything it cannot install, with the reason.",
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
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.description}</p>
                {step.command && <Command>{step.command}</Command>}
              </li>
            ))}
          </ol>

          {/* The walkthrough frame is the shape the recording will publish in:
              captions and transcript in the HTML today, the video when a real
              machine, a real install and a real removal have been recorded. */}
          <div className="mt-8 max-w-[72ch]">
            <WalkthroughFrame
              title="The three-step walkthrough"
              captions={[
                { time: "00:00", text: "Open Explore and describe what you want the agent to do." },
                { time: "00:12", text: "Pick the agent you use and the scope: this project or the whole machine." },
                { time: "00:24", text: "Review the exact configuration change LiteSPM prints, then approve it." },
                { time: "00:38", text: "Run litespm list, and see the package, its agent, scope and version." },
              ]}
              transcript={
                "The recording starts in the marketplace, not in a terminal: a search for a task, not for a package name.\n\n" +
                "It then picks an agent and a scope, and shows the preview LiteSPM prints before it writes: the file, the entry, and the diff. Nothing is written until the human approves.\n\n" +
                "Finally it runs litespm list, which reports what LiteSPM manages, which agent it is registered with, and how to remove it."
              }
              placeholder="A real recording needs a real machine, a real install and a real removal. Until that exists, this frame carries the same beats as captions and a transcript rather than a mock-up of a terminal."
            />
          </div>

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
