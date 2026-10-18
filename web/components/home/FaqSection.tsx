import type { ReactNode } from "react";
import Link from "next/link";
import { HOSTS } from "../../lib/hosts";
import type { ProvenanceStats } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/**
 * The questions a buyer asks, in the order they ask them: what is this, will it
 * work with my agent, where did the data come from, can I undo it, and how do I
 * check any of it myself.
 *
 * Every answer is written in plain English. One carries a nested `<details>` for
 * the signing detail, which is genuinely optional and genuinely wanted by
 * whoever wants it; nothing else is longer than it needs to be, and no sentence
 * exists to defend the page's own method.
 *
 * Every number is passed in from a build-time derivation over the real
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
          A package manager for AI agents — and the catalog it installs from. It sets an agent up
          once, with one entry in that agent&rsquo;s own config file, and from then on you install,
          update and remove capabilities by name instead of editing config by hand.
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
          names the file it reads. The catalog lists more agents than that, because publishers say
          which agents their tools work with, and those listings are indexed on the
          publisher&rsquo;s word. LiteSPM will not edit the config of a host it has no adapter for.
        </>
      ),
    },
    {
      q: "Where did a listing come from?",
      a: (
        <>
          One of two places: the publisher&rsquo;s own listing, or a community list. Right now
          that&rsquo;s {formatCount(provenance.vendorManifest)} from publishers and{" "}
          {formatCount(provenance.awesomeList)} from community lists. The two are not equally
          reliable, so every row says which one it came from.
        </>
      ),
    },
    {
      q: "Who publishes it, and did you check them?",
      a: (
        <>
          The publisher&rsquo;s own name and a link to them. A <em>from publisher manifest</em>{" "}
          badge means the row was parsed from that publisher&rsquo;s own listing; it says where the
          data came from, not that anyone vetted the software.
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
      q: "How much has LiteSPM read?",
      a: (
        <>
          Every entry says which, in two grades: <em>LiteSPM-parsed</em> means the listing was read
          in full, <em>Discovery only</em> means it was indexed but not parsed. Most are still
          Discovery only — {formatCount(provenance.discoveryOnly)} of {formatCount(provenance.total)}
          .
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
            Every answer above comes from the entry&rsquo;s own page. Open any one of them and you
            can see where it came from, what command it runs, how much was read, and which version
            the publisher gave — and where something is missing, the entry says{" "}
            <span className="absent">not published</span>.
          </p>
          <details className="group mt-3 border-t border-rule pt-3">
            <summary className="flex min-h-[32px] w-full cursor-pointer items-start justify-between gap-4 text-left">
              <span className="text-[12.5px] font-medium text-ink-2 group-open:text-ink">
                The catalog is signed
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
                LiteSPM verifies a signature chain from the release pointer down to the individual
                listing before it will search or install a row, and refuses an unsigned origin.{" "}
                <code className="t-mono">litespm catalog sync</code> does the verifying.
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
      q: "How current is the catalog?",
      a: (
        <>
          The listings are a fixed snapshot, dated in the header — the catalog release this page
          was built from. It does not change underneath you while you read, and this site never
          updates your machine by itself. To move to a newer release, run{" "}
          <code className="t-mono">litespm catalog sync</code>.
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
        Where the data comes from, how much of it was read, and what happens on your machine. Every
        number here is counted from the catalog, not estimated.
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
