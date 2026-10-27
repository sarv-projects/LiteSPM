import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Code2, ShieldCheck, Terminal } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { REPO_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: "Developer docs",
  description: "Install LiteSPM, connect an agent, manage skills, and integrate the LiteSPM bridge.",
  alternates: { canonical: "/docs/" },
  openGraph: { title: "Developer docs · LiteSPM", url: "/docs/" },
};

function Code({ children }: { children: string }) {
  return <pre className="docs-code"><code>{children}</code></pre>;
}

const NAV = [
  { id: "quickstart", label: "Quick start" },
  { id: "agents", label: "Connect an agent" },
  { id: "packages", label: "Install a package" },
  { id: "skills", label: "Manage skills" },
  { id: "bridge", label: "MCP bridge" },
  { id: "security", label: "Security" },
  { id: "publish", label: "Publish a listing" },
];

export default function DeveloperDocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" tabIndex={-1} className="shell docs-layout flex-1">
        <aside className="docs-sidebar">
          <p className="kicker">Documentation</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">Build with LiteSPM</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            Install the CLI, connect an agent, and manage the skills in your workspace.
          </p>
          <a className="docs-source-link" href="/docs/litespm-guide.md" download>Download offline guide</a>
          <nav className="docs-toc" aria-label="On this page">
            {NAV.map((item) => <a key={item.id} href={"#" + item.id}>{item.label}</a>)}
          </nav>
          <a className="docs-source-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source on GitHub <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </aside>
        <div className="docs-content">
          <section id="quickstart" className="docs-section">
            <div className="docs-section-heading"><Terminal aria-hidden="true" /><div><p className="kicker">01 · Start here</p><h2>Quick start</h2></div></div>
            <p>Use Node.js 22.22.2+ on 22.x, 24.15.0+ on 24.x, or 26+ for the npm installer. Signed binaries are also available for Linux, macOS and Windows on supported x64 and arm64 platforms.</p>
            <p>Install the LiteSPM command line tool, then open its interactive setup.</p>
            <Code>{`npm install -g litespm
litespm`}</Code>
            <p><code>npx --yes</code> can replace the global install when you prefer a one-off run. That <code>--yes</code> accepts npm&rsquo;s download prompt; LiteSPM still previews changes and asks before writing.</p>
            <p>Choose an agent on your computer. LiteSPM shows the configuration file it will update and backs it up before writing the bridge entry.</p>
            <p>Sync the package catalog before your first search:</p>
            <Code>{`litespm catalog sync
litespm search github`}</Code>
          </section>
          <section id="agents" className="docs-section">
            <div className="docs-section-heading"><BookOpen aria-hidden="true" /><div><p className="kicker">02 · Host setup</p><h2>Connect an agent</h2></div></div>
            <p>Use the setup wizard for an interactive host picker, or choose a host ID directly from the agent profile.</p>
            <Code>{`litespm host list
litespm host setup codex
litespm doctor`}</Code>
            <p>LiteSPM adds its bridge entry to the selected host configuration. The <Link href="/agents/" className="link">agent profiles</Link> show the relevant file path and configuration format.</p>
          </section>
          <section id="packages" className="docs-section">
            <div className="docs-section-heading"><Code2 aria-hidden="true" /><div><p className="kicker">03 · Marketplace installs</p><h2>Install a package</h2></div></div>
            <p>Open a package page, choose an agent listed for that package, and copy the install command. The command includes the package ID and selected target.</p>
            <Code>{`npx --yes litespm@latest catalog sync
npx --yes litespm@latest install <catalog-id> --host codex`}</Code>
            <p>Run the catalog sync once before your first install. Package pages generate the exact command for each package and agent, so use that command when the package ID or target differs.</p>
          </section>
          <section id="skills" className="docs-section">
            <div className="docs-section-heading"><Code2 aria-hidden="true" /><div><p className="kicker">04 · Package workflow</p><h2>Manage skills</h2></div></div>
            <p>Add a skill from a repository or local folder. Pick an agent and a project or machine-wide destination.</p>
            <Code>{`litespm skills add anthropics/skills --skill frontend-design --agent codex --scope project
litespm skills list
litespm skills remove frontend-design --scope project`}</Code>
            <ul>
              <li><code>--scope project</code> stores the skill with the current repository.</li>
              <li><code>--scope global</code> stores it in your user-level skills folder.</li>
              <li><code>--agent</code> selects one or more agent targets by ID.</li>
            <li><code>--yes</code> is an explicit approval for non-interactive use; review the source and destination before using it.</li>
            </ul>
            <p>LiteSPM records the files it writes so a managed skill can be listed, updated, and removed later.</p>
          </section>
          <section id="bridge" className="docs-section">
            <div className="docs-section-heading"><Code2 aria-hidden="true" /><div><p className="kicker">05 · Integration</p><h2>MCP bridge</h2></div></div>
            <p>The LiteSPM bridge exposes catalog and install-management tools to a connected agent over the Model Context Protocol.</p>
            <Code>{`litespm bridge stdio --host codex`}</Code>
            <p>Host-specific configuration formats and paths are listed on each <Link href="/agents/" className="link">agent profile</Link>. The bridge command accepts the host ID that LiteSPM uses for that profile.</p>
          </section>
          <section id="security" className="docs-section">
            <div className="docs-section-heading"><ShieldCheck aria-hidden="true" /><div><p className="kicker">06 · Safe installs</p><h2>Review before you install</h2></div></div>
            <p>Skills can influence an agent’s behavior. Read the package instructions and source before adding them to an agent workspace. LiteSPM shows the destination and requires approval before it writes.</p>
            <p>Use <code>litespm list</code> to inspect managed entries. Remove individual skills with <code>litespm skills remove</code>, or remove the bridge from a host with <code>litespm uninstall</code>.</p>
            <Link href="/security/" className="btn mt-4">Read the security guide <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </section>
          <section id="publish" className="docs-section">
            <div className="docs-section-heading"><BookOpen aria-hidden="true" /><div><p className="kicker">07 · Catalog publishing</p><h2>Publish a listing</h2></div></div>
            <p>Use the listing request form to suggest a public MCP server, agent skill, or plugin. Include the published source and the details a reviewer needs to verify how it installs.</p>
            <ul>
              <li><strong>MCP server:</strong> command and arguments, or endpoint and transport; include required environment variables and authentication details.</li>
              <li><strong>Agent skill:</strong> repository path to <code>SKILL.md</code> and any supporting files or setup requirements.</li>
              <li><strong>Plugin:</strong> pinned commit, manifest path, and the MCP servers or skills it contains.</li>
            </ul>
            <p>List agent hosts, operating systems, and runtime requirements only when you know them. The request opens a GitHub issue for review; submission does not publish a listing automatically.</p>
            <Link href="/submit/" className="btn btn-solid mt-4">Open the listing guide <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
