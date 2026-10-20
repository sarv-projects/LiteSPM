import type { ReactNode } from "react";
import Link from "next/link";
import { HOSTS } from "../../lib/hosts";
import { formatCount } from "../../lib/format";
/**
 * The questions someone asks before they install anything, in the order a
 * first-time visitor asks them.
 *
 * The order is the point: "what is this?" first, then "can I do it from
 * here?" — the answer to which is *no* — and only then the vocabulary, the
 * agent list, the account, the provenance, the risks and the undo. The old
 * order put the vocabulary second and the "can I install from this website?"
 * question fifth, behind three technical ones, which is how a reader who
 * never found the answer came to believe the site could install things.
 *
 * Answers are short and in the customer's words. Provenance counts, read-depth
 * grades and version coverage are not here. They describe how the catalog is
 * built, which belongs on the catalog statistics page, not in a FAQ someone
 * reads while deciding whether to use this.
 *
 * The one number is read from the compiled-in host registry (`HOSTS`), never
 * typed.
 *
 * Native `<details>`/`<summary>`, not a hand-rolled button: the previous markup
 * was a `<dl>` whose `<dd>` only mounted while open, so before any interaction
 * the document carried ten `<dt>`s and zero `<dd>`s, an invalid list that strips the
 * term/definition relationship, and an answer could not be reached by
 * in-page find until its row was clicked. `name="faq"` keeps the
 * one-open-at-a-time behaviour; the expanded state is exposed by `<summary>`
 * itself, and the marker CSS lives in globals.css.
 */
export function FaqSection() {
  const FAQS: Array<{ q: string; a: ReactNode }> = [
    {
      q: "What is LiteSPM?",
      a: (
        <>
          LiteSPM helps you discover, install, and manage supported MCP servers, skills, and plugins
          across AI coding agents. Installations and configuration changes run locally.
        </>
      ),
    },
    {
      q: "Can I install from this website?",
      a: (
        <>
          Choose a package in the marketplace and copy its LiteSPM command. Run that command
          in your terminal; the website cannot access or change your local configuration.
        </>
      ),
    },
    {
      q: "What is an MCP server, and what is a skill?",
      a: (
        <>
          An <strong className="font-medium text-ink">MCP server</strong> is a small program your
          agent connects to and calls — one for Postgres, one for your browser, one for your issue
          tracker. A <strong className="font-medium text-ink">skill</strong> is a folder of
          instructions the agent reads when it needs them: a workflow, a house style, a document
          format. No program, no process — just files in the directory the agent already uses.
        </>
      ),
    },
    {
      q: "Which agents work with it?",
      a: (
        <>
          <Link href="/agents/" className="link">
            {formatCount(HOSTS.length)} agent hosts
          </Link>{" "}
          have a built-in adapter, including Claude Code, Codex, Cursor, OpenCode, Cline and Pi. Use
          one of them, or all of them, from the same command.
        </>
      ),
    },
    {
      q: "Do I need an account?",
      a: (
        <>
          No LiteSPM marketplace account is required. The CLI is free and open source.
          Individual integrations may require their own sign-in or API credentials.
        </>
      ),
    },
    {
      q: "How do you decide what to publish?",
      a: (
        <>
          Listings identify their originating registry, publisher manifest, or catalog feed so
          you can review the original source before installation.
        </>
      ),
    },
    {
      q: "Is anything here security-checked?",
      a: (
        <>
          Source information and compatibility labels are not security audits. Review third-party
          code, permissions, and requested access before using a package.
        </>
      ),
    },
    {
      q: "What can go wrong?",
      a: (
        <>
          Third-party capabilities may access files, external services, or sensitive data depending
          on how they run. Check the publisher, documentation, and required access before installing.
        </>
      ),
    },
    {
      q: "What does it change on my computer?",
      a: (
        <>
          Depending on the package, LiteSPM may register a server in your agent configuration or
          copy skill files into an agent directory. It maintains local installation records
          and backups for supported configuration changes.
        </>
      ),
    },
    {
      q: "How do I undo it?",
      a: (
        <>
          <code className="t-mono">litespm restore</code> puts a config file back the way it was.{" "}
          <code className="t-mono">litespm install remove</code> takes out a tool LiteSPM
          installed.
        </>
      ),
    },
    {
      q: "Do my API keys leave my machine?",
      a: (
        <>
          Browsing the public catalog does not require your API keys. Some integrations need
          credentials and may communicate with external services. Their privacy and
          credential handling depend on the integration you choose.
        </>
      ),
    },
    {
      q: "What about plugins?",
      a: (
        <>
          LiteSPM can install a subset of plugins with supported pinned sources and manifests.
          Other plugins are available for discovery but cannot be installed through LiteSPM yet.
        </>
      ),
    },
  ];

  return (
    <section className="shell band" aria-labelledby="faq-title">
      <p className="kicker">Questions</p>
      <h2 id="faq-title" className="band-title mt-2">
        Before you install
      </h2>
      <p className="band-sub">
        Answers about compatibility, installation, privacy, and managing your setup.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-x-10 md:grid-cols-2">
        {FAQS.map((item) => (
          <details key={item.q} name="faq" className="group border-b border-rule py-4">
            <summary className="flex min-h-[44px] w-full cursor-pointer items-start justify-between gap-4 text-left">
              <span className="text-[13px] font-semibold leading-snug text-ink">{item.q}</span>
              <span
                aria-hidden="true"
                className="t-mono mt-px shrink-0 text-[11px] text-ink-3 tabular-nums"
              >
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{item.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
