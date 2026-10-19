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
          A package manager for AI coding agents. It connects to your agent once, then installs and
          removes tools for you — with a preview before anything changes, and a way back
          afterwards.
        </>
      ),
    },
    {
      q: "Can I install from this website?",
      a: (
        <>
          No. This site is for finding and comparing. Installs run in your terminal, and LiteSPM
          shows you the change before it makes it.
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
          No, and there is nothing to sign up for. LiteSPM is free and Apache-2.0, and it runs on
          your machine. An individual server may need its own credentials, which stay in your
          keychain.
        </>
      ),
    },
    {
      q: "How do you decide what to publish?",
      a: (
        <>
          Every row records where it was read from: the publisher&rsquo;s own manifest, or a
          third-party list. The label on a card says which one it was — and that is a statement
          about the source, never a review of the software.
        </>
      ),
    },
    {
      q: "Is anything here security-checked?",
      a: (
        <>
          No. We index listings, we do not audit code. A publisher or source label tells you where
          the data came from, not that anyone reviewed the software.
        </>
      ),
    },
    {
      q: "What can go wrong?",
      a: (
        <>
          An install can put a tool in front of your agent that behaves badly, and LiteSPM does not
          run what it lists. Read the source on the entry page, keep the preview on, and remove it
          with one command if it misbehaves.
        </>
      ),
    },
    {
      q: "What does it change on my computer?",
      a: (
        <>
          One config file per agent, and it backs the file up first. It adds a single entry for
          itself and leaves your other servers, comments and formatting alone.
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
          No. Credentials stay in your operating system&rsquo;s keychain, and search runs in your
          browser. The only outside requests are public images: GitHub avatars and Google favicons
          for the publisher marks on a row.
        </>
      ),
    },
    {
      q: "What about plugins?",
      a: (
        <>
          You can browse them, but you cannot install them yet. LiteSPM refuses the install rather
          than doing half of it.
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
        What LiteSPM does to your machine, and what it does not do.
      </p>

      <div className="mt-7 grid gap-x-10 md:grid-cols-2">
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
