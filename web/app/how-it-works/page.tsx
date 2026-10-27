import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { WalkthroughFrame } from "./WalkthroughFrame";
import { CapabilityTypes } from "../../components/home/CapabilityTypes";
import { BridgeDiagram } from "../../components/home/BridgeDiagram";

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

/** Detailed workflow and copyable commands for the three stages summarized on the homepage. */
const STEPS = [
  {
    number: "01",
    title: "Connect your coding agent",
    description:
      "Run LiteSPM locally and choose the agent you use. The interactive setup reads the adapter's own config path, shows you the file it found, and backs it up before writing a single bridge entry. Every other server, comment and line of formatting is left alone.",
    command: "npm install -g litespm\nlitespm",
  },
  {
    number: "02",
    title: "Find and install a capability",
    description:
      "Search by task, provider or name. Sync the catalog once, then use the exact package command for your agent. LiteSPM shows the changes and waits for approval before it writes.",
    command: "litespm catalog sync\nlitespm install <catalog-id> --host <agent-id>",
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
          <ol className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
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

        <CapabilityTypes />

        <section className="shell band border-t border-rule" aria-labelledby="bridge-title">
          <p className="kicker">Where changes happen</p>
          <h2 id="bridge-title" className="band-title mt-2">The website stays read-only. LiteSPM runs locally.</h2>
          <p className="band-sub max-w-[72ch]">
            The CLI connects supported agents to the packages you choose. It shows the destination
            and changes first, waits for your approval, and records what it manages on your machine.
          </p>
          <div className="mt-6 max-w-[760px] rounded-card border border-rule bg-surface p-3 sm:p-5">
            <BridgeDiagram />
          </div>
          <p className="mt-5 max-w-[72ch] text-[14px] leading-relaxed text-ink-2">
            A source label and a compatible host do not mean a package has been security audited.
            Review packages before use; see the <Link href="/security/" className="link">security guide</Link>.
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
