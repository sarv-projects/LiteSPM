import type { ReactNode } from "react";
import Link from "next/link";
import { HOSTS } from "../../lib/hosts";
import type { ProvenanceStats } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/**
 * The questions the catalog can actually answer, asked in the order a person
 * asks them: what is this, will it work with my agent, what is it touching, can
 * I undo it, and how do I check any of that myself.
 *
 * Two audiences, two depths. Each answer leads with the plain version anyone
 * can use; the one answer that used to open with `publisher.provenance` and
 * Sigstore bundles keeps that detail behind its own `<details>`, labelled as
 * the reviewer's view. Every fact survives — only the first sentence changed
 * audience.
 *
 * Every number below is passed in from a build-time derivation over the real
 * rows (`deriveProvenance`) or read from the compiled-in host registry
 * (`HOSTS`), never typed. Where the honest answer is "not published", the
 * entry says so in those words.
 *
 * Native `<details>`/`<summary>`, not a hand-rolled button: the previous
 * markup was a `<dl>` whose `<dd>` only mounted while open, so before any
 * interaction the document carried ten `<dt>`s and zero `<dd>`s — an invalid
 * list that strips the term/definition relationship — and an answer could not
 * be reached by in-page find until its row was clicked. `name="faq"` keeps
 * the one-open-at-a-time behaviour the old state implemented; the expanded
 * state is exposed by `<summary>` itself, and the marker CSS lives in
 * globals.css.
 */
export function FaqSection({ provenance }: { provenance: ProvenanceStats }) {
  const FAQS: Array<{ q: string; a: ReactNode }> = [
    {
      q: "What is LiteSPM?",
      a: (
        <>
          A package manager for AI agents, and the catalog it installs from. It connects to an
          agent host once, writes a single version-pinned entry into that host&rsquo;s config, and
          resolves individual capabilities through that entry.
        </>
      ),
    },
    {
      q: "Which agents are supported?",
      a: (
        <>
          <Link href="/agents/" className="link">
            {formatCount(HOSTS.length)} agent hosts
          </Link>{" "}
          have built-in config adapters that LiteSPM can write directly; each host&rsquo;s page
          names the file it reads. The catalog lists more hosts than that — publishers declare
          which agents their own tools work with, and those entries are indexed as that claim.
          LiteSPM will not edit the config of a host it has no adapter for.
        </>
      ),
    },
    {
      q: "Where did a listing come from?",
      a: (
        <>
          One of two places: the publisher&rsquo;s own listing, or a community list. Right now
          that&rsquo;s {formatCount(provenance.vendorManifest)} from publishers and{" "}
          {formatCount(provenance.awesomeList)} from community lists. Both are useful, but they
          are not the same kind of evidence, so every row says which one it came from.
        </>
      ),
    },
    {
      q: "Who publishes it, and did you check them?",
      a: (
        <>
          The publisher&rsquo;s own name and a link to them. A <em>from publisher manifest</em>{" "}
          badge means the row was parsed from that publisher&rsquo;s own listing — it records
          where the data came from, not that anyone reviewed the software.
        </>
      ),
    },
    {
      q: "What can it access?",
      a: (
        <>
          You get the exact command it runs and the file LiteSPM would change, before anything is
          written. What it can reach once it is running is not something the catalog can see.
        </>
      ),
    },
    {
      q: "How far was it actually checked?",
      a: (
        <>
          Every entry says how far it was read: <em>Discovery only</em> or{" "}
          <em>LiteSPM-parsed</em>. Most entries are still Discovery only —{" "}
          {formatCount(provenance.discoveryOnly)} of {formatCount(provenance.total)}.
        </>
      ),
    },
    {
      q: "What version is it?",
      a: (
        <>
          The version the publisher gave, on {formatCount(provenance.versioned)} of{" "}
          {formatCount(provenance.total)} entries. Where there isn&rsquo;t one, the page says{" "}
          <span className="absent">not published</span>.
        </>
      ),
    },
    {
      q: "How can I verify any of this myself?",
      a: (
        <>
          <p>
            Every claim above is a field on the entry&rsquo;s own record. Open any entry and you
            can see where it came from, what command it runs, how far the reading went, and which
            version the publisher gave — and where a field is missing, the entry says{" "}
            <span className="absent">not published</span>.
          </p>
          <details className="group mt-3 border-t border-rule pt-3">
            <summary className="flex min-h-[32px] w-full cursor-pointer items-start justify-between gap-4 text-left">
              <span className="text-[12.5px] font-medium text-ink-2 group-open:text-ink">
                The reviewer&rsquo;s view: exact field names and the signed release chain
              </span>
              <span
                aria-hidden="true"
                className="t-mono mt-px shrink-0 text-[11px] text-ink-3 tabular-nums"
              >
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="mt-2 space-y-2 text-[12.5px]">
              <p>
                Every entry records who published it and where the row was read from — the
                publisher&rsquo;s own manifest, or a third-party list. That mark is about
                provenance, not security: it is not a review of the code. The command an entry
                starts, and its version, are the publisher&rsquo;s own.
              </p>
              <p>
                The catalog is signed. LiteSPM verifies a signature chain from the release
                pointer down to the individual listing before it will search or install a row,
                and refuses an unsigned origin. This page is static HTML and verifies nothing
                itself — <code className="t-mono">litespm catalog sync</code> is what does, and it
                can be told to require a signature.
              </p>
            </div>
          </details>
        </>
      ),
    },
    {
      q: "Do my API keys leave my machine?",
      a: (
        <>
          No. Credentials stay in your operating system&rsquo;s native vault, and search runs
          entirely in your browser. The site fetches only public files: the release manifest and
          the catalog rows from its own origin, and the publisher marks a row displays — GitHub
          avatars and site favicons, loaded from GitHub&rsquo;s and Google&rsquo;s icon services.
          Nothing you type is sent anywhere.
        </>
      ),
    },
    {
      q: "Is this page's data live?",
      a: (
        <>
          The listings are a fixed catalog snapshot baked into the build. The index pages and the{" "}
          {formatCount(HOSTS.length)} agent pages are pre-rendered, so they read with JavaScript
          off; opening one entry is the exception, because that lookup runs in your browser. Only
          the release manifest is fetched on load — the header says whether that fetch succeeded.
        </>
      ),
    },
  ];

  return (
    <section className="shell band" aria-labelledby="faq-title">
      <p className="kicker">Trust</p>
      <h2 id="faq-title" className="band-title mt-2">
        Questions about the catalog
      </h2>
      <p className="band-sub">
        Where the data comes from, how far it was checked, and what happens on your machine. Every
        number here is counted from the rows at build time.
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
