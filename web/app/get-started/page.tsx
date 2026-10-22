import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { SetupGuide, type GuideAgent } from "../../components/onboarding/SetupGuide";
import { HOSTS, hostPath } from "../../lib/hosts";
import { vendorName } from "../../lib/vendorNames";
import { REPO_URL } from "../../lib/site";
import { DeveloperZone } from "../../components/home/DeveloperZone";

/**
 * `/get-started`.
 *
 * A **read-only** setup guide. It asks two questions — which coding agent,
 * which operating system — and prints the commands, the file that will be
 * edited, and the way back. It installs nothing, detects nothing, verifies
 * nothing, and asks for no account, no key and no upload.
 *
 * The agent rows are resolved here, on the server, from `lib/hosts.ts` — the
 * same generated registry the entry pages and `/compare/` read. That is the
 * point of building them here rather than in the browser: the guide cannot
 * print a configuration path the binary would refuse to write, because it is
 * printing the registry's own value. The Windows path is the registry's
 * documented one where the registry has one, and the documented Unix form
 * where it does not — the same rule the rest of the site follows, so the
 * guide never guesses a location.
 *
 * The catalogue itself is not imported: this page needs the fifty adapter
 * rows, not the 69,376 capabilities, and the dataset never enters this
 * route's bundle.
 */
export const metadata: Metadata = {
  title: "Get started",
  description:
    "Pick your coding agent and your system for the exact commands, the configuration file LiteSPM edits, and the way back.",
  alternates: { canonical: "/get-started/" },
  openGraph: { title: "Get started · LiteSPM", url: "/get-started/" },
};

function guideAgents(): GuideAgent[] {
  return HOSTS.map((host) => ({
    id: host.id,
    name: vendorName(host.id, host.name),
    format: host.kind,
    keyPath: host.keyPath,
    paths: {
      windows: hostPath(host, "win"),
      macos: hostPath(host, "mac"),
      linux: hostPath(host, "linux"),
    },
  }));
}

export default function GetStartedPage() {
  const agents = guideAgents();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main id="main" tabIndex={-1} className="shell flex-1 pb-16 pt-8">
        <div className="max-w-[72ch]">
          <p className="kicker">Get started</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Get started</h1>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-2">
            Pick your agent and your system. This page prints the commands to run, the file
            LiteSPM will edit, and the way back. Every command runs in your own terminal.
          </p>
        </div>

        <div className="mt-8 max-w-[72ch]">
          <SetupGuide agents={agents} />
        </div>

        <div className="mt-10 max-w-[72ch] border-t border-rule pt-6">
          <h2 className="text-[15px] font-semibold text-ink">Elsewhere on this site</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-[13px] text-ink-2 sm:grid-cols-2">
            <li>
              <Link href="/how-it-works/" className="link touch-link">
                How it works
              </Link>
              <span className="block text-[12px] text-ink-3">
                What the tool does, the exact files, and the way back.
              </span>
            </li>
            <li>
              <Link href="/explore/" className="link touch-link">
                Explore the catalog
              </Link>
              <span className="block text-[12px] text-ink-3">
                Every capability, and which ones the command can install.
              </span>
            </li>
            <li>
              <Link href="/support/" className="link touch-link">
                Support
              </Link>
              <span className="block text-[12px] text-ink-3">
                Where a report goes, and what to put in it.
              </span>
            </li>
            <li>
              <Link href="/security/" className="link touch-link">
                Security
              </Link>
              <span className="block text-[12px] text-ink-3">
                Permissions, secrets, and what a config write can change.
              </span>
            </li>
          </ul>
        </div>

        <p className="mt-10 max-w-[72ch] text-[12px] leading-relaxed text-ink-3">
          Something missing?{" "}
          <a
            href={`${REPO_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            Open an issue
          </a>{" "}
          and tell us which step did not work.
        </p>
      </main>

      {/* The command list lives with the setup it belongs to. It was a block
          on the home page, under a "developer zone" heading. */}
      <div className="bg-sunken">
        <DeveloperZone />
      </div>

      <SiteFooter />
    </div>
  );
}
