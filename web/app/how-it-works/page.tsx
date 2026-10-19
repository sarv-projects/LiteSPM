import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { WalkthroughFrame } from "./WalkthroughFrame";
import { bridgeSnippet, getHost } from "../../lib/hosts";
import { REPO_URL } from "../../lib/site";

/**
 * `/how-it-works`.
 *
 * The product's story, told with the things a reader can check: the command
 * that runs, the exact entry that lands in a configuration file, the file the
 * skill is copied into, and the command that takes it back out.
 *
 * The page is a **Server Component**. Everything on it is either prose or a
 * code block, so there is nothing here for a browser to run — the walkthrough
 * frame is a `<details>` and a `<video>` element, and the rest is text. The
 * snippets are produced by `lib/hosts.ts`, the same generated registry the
 * entry pages read, so the entry printed here is the entry the binary
 * writes, in each host's own shape and under each host's own key.
 *
 * The one thing this page cannot show yet is a recording of the product. It
 * says so, in the frame and in the caption, and carries the script instead.
 */
export const metadata: Metadata = {
  title: "How it works",
  description:
    "What LiteSPM does to your machine, in order: the command, the configuration entry it adds, the file a skill lands in, and the command that puts everything back.",
  alternates: { canonical: "/how-it-works/" },
  openGraph: { title: "How it works · LiteSPM Market", url: "/how-it-works/" },
};

/** The config path and the entry, split out of the registry's own snippet. */
function entryFor(hostId: string): { path: string; body: string; format: string } {
  const host = getHost(hostId);
  const lines = bridgeSnippet(host, "litespm", "linux").split("\n");
  return {
    path: (lines[0] ?? "").replace(/^#\s*/, ""),
    body: lines.slice(1).join("\n"),
    format: host.kind,
  };
}

const CLAUDE = entryFor("claude-code");
const CODEX = entryFor("codex");
const OPENCODE = entryFor("opencode");

/** A code block in the site's dark plane, with a label above it. */
function CodeBlock({
  label,
  code,
  language,
}: {
  label: string;
  code: string;
  language: string;
}) {
  return (
    <div className="on-dark overflow-hidden rounded-panel bg-dark">
      <div className="flex items-center justify-between gap-2 border-b border-dark-rule px-3 py-2">
        <span className="t-mono truncate text-[11px] text-dark-ink-2">{label}</span>
        <span className="t-mono shrink-0 text-[10.5px] uppercase tracking-wider text-dark-ink-2">
          {language}
        </span>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[12px] leading-relaxed text-dark-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A titled block inside a section. */
function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h3>
      <div className="mt-1.5 space-y-2 text-[13px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main id="main" tabIndex={-1} className="flex-1">
        {/* ---- opener ---------------------------------------------------- */}
        <section className="shell band">
          <p className="kicker">How it works</p>
          <h1 className="mt-2 max-w-[20ch] text-[30px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[40px]">
            Find a useful capability. Preview the change. Keep control of your setup.
          </h1>
          <p className="band-sub">
            LiteSPM is the command that changes your machine; this site is the catalogue it reads.
            Between the two there is a fixed sequence — find it, see what it will do, approve it,
            install it, and take it back out — and every step of it is something you can look at
            before you agree to it.
          </p>
        </section>

        {/* ---- the walkthrough -------------------------------------------- */}
        <section className="shell band border-t border-rule" aria-labelledby="walkthrough-title">
          <div className="max-w-[72ch]">
            <h2 id="walkthrough-title" className="band-title">
              The walkthrough
            </h2>
            <p className="band-sub">
              One install, from an empty terminal to a change you can undo. This is the sequence
              the recording covers, and the order the rest of this page follows.
            </p>
          </div>

          <div className="mt-7 max-w-[72ch]">
            <WalkthroughFrame
              title="Install a capability, end to end"
              placeholder="The real recording has not been made. A product recording needs a real machine, a real agent, a real install and a real removal — and a mock-up of a terminal would be the one thing on this site nobody could check."
              captions={[
                {
                  time: "00:00",
                  text: "An empty terminal. Nothing has been installed and no agent has been configured.",
                },
                {
                  time: "00:12",
                  text: "`litespm` opens the setup wizard. It lists the agent hosts it knows about, with the ones it found on this machine first.",
                },
                {
                  time: "00:31",
                  text: "It shows the configuration file it found, and the one entry it is about to add — the file itself is not touched yet.",
                },
                {
                  time: "00:48",
                  text: "`Write this change? [Y/n]`. Only a yes writes. The file is copied into `backups/` first, and the copy is what `litespm restore` puts back.",
                },
                {
                  time: "01:10",
                  text: "`litespm install <id>` builds a plan: the entry, the version it resolved to, the hosts it will touch, and the effect it will have.",
                },
                {
                  time: "01:34",
                  text: "The plan waits for an approval recorded on a terminal. The approval is bound to that plan, so it cannot be replayed against a different change.",
                },
                {
                  time: "01:58",
                  text: "The install runs. For a skill, the files are copied into the agent's own skills directory; for an MCP server, one named entry is spliced into the host's configuration.",
                },
                {
                  time: "02:20",
                  text: "`litespm list` shows what is installed, from where, and where it landed — a local record, on this machine.",
                },
                {
                  time: "02:44",
                  text: "`litespm install remove <id>` takes the entry back out, and `litespm restore` rolls a configuration file back to the copy taken before it was edited.",
                },
              ]}
              transcript={`The recording opens on an empty terminal. Nothing is installed, no agent is configured, and the only thing on the machine is the CLI.

\`litespm\` starts the setup wizard. It reads each adapter's setup state and lists the agent hosts it knows about — fifty of them — with the hosts whose configuration file it found on this machine shown first. Nothing is written during this step.

You pick your agent. The wizard shows the configuration file it resolved for that agent, and the single entry it is going to add to it. If it cannot resolve a path, it offers to take one from you, and it writes to exactly the path you agree to or it writes nothing.

The wizard prints the lines it is about to change and asks \`Write this change? [Y/n]\`. Until you answer yes, the file is untouched. After yes, the file is copied into a backups folder inside LiteSPM's data directory, and then the change is applied — one entry, named litespm, and nothing else in the file is rewritten.

\`litespm install <id>\` is the install path. It resolves the entry against the catalog you synced, builds a plan, and prints the plan: which version it resolved to, which hosts it will write to, and what the capability will be able to do. The plan waits for an approval that has to be recorded on a terminal, and the approval is bound to the plan's hash, so an approval for one change cannot be replayed for another.

When the install runs, a skill's files are copied into the agent's own skills directory and a ledger row records the source, the digest and the destination. An MCP server is registered as one named entry in the host's configuration file, spliced in at its own byte offset so the rest of the file survives. \`litespm list\` prints what is installed, from where, and where it landed. It is a local record: there is no account and nothing is sent anywhere.

Removal is the same in reverse. \`litespm install remove <id>\` takes out the entry LiteSPM wrote, \`litespm restore\` rolls a configuration file back to the copy taken before it was edited, and \`litespm uninstall\` removes the bridge entries and then prints, with the command that does each one, what it deliberately left behind.`}
            />
          </div>
        </section>

        {/* ---- one skill, three agents ------------------------------------ */}
        <section className="shell band border-t border-rule" aria-labelledby="skill-title">
          <div className="max-w-[72ch]">
            <h2 id="skill-title" className="band-title">
              One skill, three agents
            </h2>
            <p className="band-sub">
              A skill is a folder with a <code className="t-mono">SKILL.md</code> in it — written
              instructions your agent reads. Install it once and it works in every agent you
              actually use: LiteSPM copies it into each host&rsquo;s own skills directory and writes
              down where it went, so you can take it back out later.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-card border border-rule bg-surface p-5">
              <p className="kicker">Before — by hand</p>
              <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-ink">
                Three folders, three layouts, no record
              </h3>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2">
                <li>Find the repository the skill lives in, and work out which folder inside it is the skill.</li>
                <li>Copy it into each agent&rsquo;s skills directory — each under a different path, none of them the same.</li>
                <li>Nothing records where it came from, so updating it means finding it again, and removing it means remembering what you copied.</li>
              </ul>
            </div>

            <div className="rounded-card border border-rule bg-surface p-5">
              <p className="kicker">After — one command</p>
              <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-ink">
                The same skill, in every agent, recorded
              </h3>
              <div className="mt-3">
                <CodeBlock
                  label="Install one skill into three agents"
                  language="shell"
                  code="litespm skills add anthropics/skills --skill docx --agent claude-code --agent codex --agent opencode"
                />
              </div>
              <div className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
                <p className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Where it lands
                </p>
                <p className="t-mono break-all text-[12px] text-ink">~/.claude/skills/docx/</p>
                <p className="t-mono break-all text-[12px] text-ink">~/.codex/skills/docx/</p>
                <p className="t-mono break-all text-[12px] text-ink">~/.config/opencode/skills/docx/</p>
                <p className="mt-2">
                  Each destination gets a ledger row: the source, the digest, the time.{" "}
                  <code className="t-mono text-ink">litespm skills list</code> shows them and{" "}
                  <code className="t-mono text-ink">litespm skills remove</code> takes them out — and
                  only the directories the ledger names are ever deleted.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- the site and the command ------------------------------------ */}
        <section className="shell band border-t border-rule" aria-labelledby="split-title">
          <div className="max-w-[72ch]">
            <h2 id="split-title" className="band-title">
              The website catalogues, the CLI changes your machine
            </h2>
            <p className="band-sub">
              Two different things, and the difference matters when you are deciding whether to
              trust one of them.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">This website</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                A catalogue. It reads the published catalog release and shows you what exists, where
                each row was built from, and whether the command can install it. It runs none of the
                code it lists, it does not look at your machine, and it installs nothing — it is a
                static export with no server behind it.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                It also publishes no popularity figure, because no upstream source exposes one. There
                is no star count here and no estimate of one.
              </p>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                The <code className="t-mono">litespm</code> command
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                The part that changes things. It reads the same catalog from the same origin, and
                then it edits files on your disk: one entry in your agent&rsquo;s configuration file,
                a folder of skill files, a row in a local ledger, and a backup of everything it
                touched.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                It has no account, no telemetry and no analytics. It contacts the network when a
                command needs something — a catalog sync, a fetch, a self-update — and for nothing
                else.
              </p>
            </div>
          </div>
        </section>

        {/* ---- three steps --------------------------------------------------- */}
        <section className="shell band border-t border-rule" aria-labelledby="steps-title">
          <div className="max-w-[72ch]">
            <h2 id="steps-title" className="band-title">
              Three steps, with the substance
            </h2>
            <p className="band-sub">
              The command, the change it makes, and the command that undoes it. Those three things
              are the whole product.
            </p>
          </div>

          <ol className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <li className="rounded-card border border-rule bg-surface p-5">
              <span className="t-mono text-[12px] font-medium tracking-wider text-accent-text">01</span>
              <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-ink">The command</h3>
              <div className="mt-3">
                <CodeBlock label="Install one entry" language="shell" code="litespm install <id>" />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                It resolves the entry against the catalog you synced, builds a plan, and prints it:
                the version it resolved to, the hosts it will write to, and the effect the capability
                will have. The plan then waits for an approval recorded on a terminal. Nothing is
                written before that approval.
              </p>
            </li>

            <li className="rounded-card border border-rule bg-surface p-5">
              <span className="t-mono text-[12px] font-medium tracking-wider text-accent-text">02</span>
              <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-ink">
                The config diff
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                One entry, named <code className="t-mono text-ink">litespm</code>, in the host&rsquo;s
                own file, under the host&rsquo;s own key. The file is copied into{" "}
                <code className="t-mono text-ink">backups/</code> before it is edited, and the rest
                of it is spliced in rather than rewritten.
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    {CLAUDE.path} · Claude Code
                  </p>
                  <div className="mt-1">
                    <CodeBlock label="Claude Code" language={CLAUDE.format} code={CLAUDE.body} />
                  </div>
                </div>
                <div>
                  <p className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    {CODEX.path} · Codex
                  </p>
                  <div className="mt-1">
                    <CodeBlock label="Codex" language={CODEX.format} code={CODEX.body} />
                  </div>
                </div>
                <div>
                  <p className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    {OPENCODE.path} · OpenCode
                  </p>
                  <div className="mt-1">
                    <CodeBlock label="OpenCode" language={OPENCODE.format} code={OPENCODE.body} />
                  </div>
                </div>
              </div>
            </li>

            <li className="rounded-card border border-rule bg-surface p-5">
              <span className="t-mono text-[12px] font-medium tracking-wider text-accent-text">03</span>
              <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-ink">
                The uninstall
              </h3>
              <div className="mt-3">
                <CodeBlock
                  label="Take it back out"
                  language="shell"
                  code={"litespm install remove <id>\nlitespm restore\nlitespm uninstall"}
                />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                The first takes out the entry LiteSPM wrote. The second rolls a configuration file
                back to the copy taken before it was edited, byte for byte. The third removes the
                bridge entries and then prints, with the command that does each one, what it
                deliberately left behind: servers you installed, skills it copied, and the backups.
              </p>
            </li>
          </ol>
        </section>

        {/* ---- the three kinds ------------------------------------------------ */}
        <section className="shell band border-t border-rule" aria-labelledby="kinds-title">
          <div className="max-w-[72ch]">
            <h2 id="kinds-title" className="band-title">
              An MCP server, a skill, a plugin
            </h2>
            <p className="band-sub">
              Three kinds of thing, and they are not interchangeable. One of them LiteSPM cannot
              install.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-card border border-rule bg-surface p-5">
              <span className="meta-kind meta-kind-mcp">MCP server</span>
              <h3 className="mt-2.5 text-[15px] font-semibold tracking-tight text-ink">
                A program your agent connects to
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                It gives your agent tools to call. LiteSPM registers it in your agent&rsquo;s
                configuration as one named entry, using the launch line or the endpoint the
                publisher published. A remote server is registered by that endpoint — nothing is
                downloaded to your machine. A local one is fetched from the published package, and
                the copy is content-addressed.
              </p>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <span className="meta-kind meta-kind-skill">Skill</span>
              <h3 className="mt-2.5 text-[15px] font-semibold tracking-tight text-ink">
                Instructions your agent reads
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                A folder with a <code className="t-mono text-ink">SKILL.md</code> in it. It is not a
                program, but it is a prompt surface: the text was written by somebody else, and your
                agent will follow it. LiteSPM copies the folder into the host&rsquo;s skills
                directory and records the copy in a ledger. The installer refuses{" "}
                <code className="t-mono text-ink">http://</code>,{" "}
                <code className="t-mono text-ink">file:</code> and{" "}
                <code className="t-mono text-ink">ftp://</code> sources, symlinks, and an overwrite
                without <code className="t-mono text-ink">--force</code>.
              </p>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <span className="meta-kind meta-kind-plugin">Plugin</span>
              <h3 className="mt-2.5 text-[15px] font-semibold tracking-tight text-ink">
                A bundle — and LiteSPM does not install it
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                A plugin is several of these packaged together. The catalog carries each
                plugin&rsquo;s published source descriptor, but there is no plugin artifact source
                wired, so an install fails closed with{" "}
                <code className="t-mono text-ink">LPSM-ARTIFACT-UNAVAILABLE</code> rather than
                installing half a bundle. The catalog lists plugins so you can read what they are;
                the install path for them does not exist yet.
              </p>
            </div>
          </div>
        </section>

        {/* ---- trust --------------------------------------------------------- */}
        <section className="shell band border-t border-rule" aria-labelledby="trust-title">
          <div className="max-w-[72ch]">
            <h2 id="trust-title" className="band-title">
              What you can check
            </h2>
            <p className="band-sub">
              Five things this tool does that you can verify, and one thing it does not do at all.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-card border border-rule bg-surface p-5">
              <Sub title="A backup before every write">
                <p>
                  The configuration file is copied into <code className="t-mono text-ink">backups/</code>{" "}
                  before it is edited, and only the entry LiteSPM owns is touched.{" "}
                  <code className="t-mono text-ink">litespm restore</code> puts the file back exactly
                  as it was.
                </p>
              </Sub>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <Sub title="A preview before the change">
                <p>
                  The setup prints the lines it is about to change and asks{" "}
                  <code className="t-mono text-ink">Write this change? [Y/n]</code>. An install
                  prints a plan and waits for an approval.
                </p>
              </Sub>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <Sub title="Records on your disk">
                <p>
                  What was installed, from where and when is written to a local ledger. There is no
                  account, so there is nothing held on our side — and no install count, because
                  nothing counts installs.
                </p>
              </Sub>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <Sub title="An approval that binds">
                <p>
                  The approval is recorded against the plan&rsquo;s hash and consumed by it, so an
                  approval for one change cannot be replayed against another.
                </p>
              </Sub>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <Sub title="An uninstall that means it">
                <p>
                  Removal is driven by the ledger, so only what LiteSPM wrote is taken out. Anything
                  you edited yourself is left alone, and the command prints what it left behind.
                </p>
              </Sub>
            </div>
            <div className="rounded-card border border-rule bg-surface p-5">
              <Sub title="What it does not do">
                <p>
                  LiteSPM does not audit the code publishers upload. A badge that says a row came
                  from a publisher&rsquo;s own manifest means that and nothing more — it is not a
                  security review. And third-party code is not sandboxed: it runs with your
                  permissions, on your machine, once you approve it.
                </p>
              </Sub>
            </div>
          </div>

          <p className="mt-6 max-w-[72ch] text-[13px] leading-relaxed text-ink-2">
            The security boundaries are written down in full on the{" "}
            <Link href="/security/" className="link">
              security page
            </Link>
            , and the policy itself lives in the repository&rsquo;s{" "}
            <a
              href={`${REPO_URL}/blob/main/SECURITY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              SECURITY.md
            </a>
            .
          </p>
        </section>

        {/* ---- close ---------------------------------------------------------- */}
        <section className="shell band border-t border-rule" aria-labelledby="close-title">
          <div className="max-w-[72ch]">
            <h2 id="close-title" className="band-title">
              Two ways on
            </h2>
            <p className="band-sub">
              Read the catalogue first, or set the tool up and pick something from it.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/explore/" className="btn btn-lg btn-solid">
                Explore the catalog
              </Link>
              <Link href="/get-started/" className="btn btn-lg">
                Get started
              </Link>
            </div>
          </div>
        </section>

        <p className="shell pb-16 text-[12px] leading-relaxed text-ink-3">
          This page is part of the source.{" "}
          <a
            href={`${REPO_URL}/blob/main/web/app/how-it-works/page.tsx`}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            Read web/app/how-it-works/page.tsx on GitHub
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
