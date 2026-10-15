import type { ReactNode } from "react";
import { HOSTS } from "../../lib/hosts";
import type { ProvenanceStats } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/** Derived from the adapter table, so the copy cannot drift from the data. */
const HOST_NAMES = `${HOSTS.slice(0, -1).map((h) => h.name).join(", ")}, and ${HOSTS[HOSTS.length - 1].name}`;

/**
 * The questions the catalog can actually answer, asked in the order a person
 * asks them: what is this, will it work with my agent, what is it touching, can
 * I undo it, and how do I check any of that myself.
 *
 * This absorbed the separate "Know what you're adding" strip, which printed the
 * same five answers as five dense cards on the landing page. Collapsed behind a
 * question, the same content costs one line until someone wants it — which is
 * the difference between showing your evidence and making a visitor read it.
 *
 * Every number below is passed in from a build-time derivation over the real
 * rows (`deriveProvenance`), never typed. Where the honest answer is "not
 * published", the entry says so in those words.
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
          A local package manager and federated catalog for agent capabilities. It connects to each
          agent host once, writes a single version-pinned bridge entry into that host&rsquo;s config,
          and resolves individual capabilities at runtime.
        </>
      ),
    },
    {
      q: "Which agents are supported?",
      a: (
        <>
          {HOST_NAMES} have compiled-in config adapters that LiteSPM can write directly. The catalog
          names more hosts than that, because publishers declare compatibility themselves; those
          entries are indexed but LiteSPM will not edit that host&rsquo;s config for you.
        </>
      ),
    },
    {
      q: "Where did a listing come from?",
      a: (
        <>
          Two kinds of source, and it&rsquo;s worth not confusing them: we read it from the
          publisher&rsquo;s own listing, or it turned up in a community list. Right now that&rsquo;s{" "}
          {formatCount(provenance.vendorManifest)} from publishers and{" "}
          {formatCount(provenance.awesomeList)} from community lists. Both are worth having — you just
          shouldn&rsquo;t mistake one for the other.
        </>
      ),
    },
    {
      q: "Who publishes it, and did you check them?",
      a: (
        <>
          The publisher&rsquo;s own name and a link to them. A{" "}
          <em>from publisher manifest</em> badge means the row was parsed from that publisher&rsquo;s
          own listing — it records where the data came from, not that anyone reviewed the software.
          Nobody audited them, and we didn&rsquo;t either.
        </>
      ),
    },
    {
      q: "What can it access?",
      a: (
        <>
          You get the exact command it runs and the file LiteSPM would change, before anything is
          written. What it can reach once it&rsquo;s running is something no catalog can see — so we
          don&rsquo;t pretend to tell you.
        </>
      ),
    },
    {
      q: "How far was it actually checked?",
      a: (
        <>
          The catalog grades how much was read: <em>Discovery only</em> or <em>LiteSPM-parsed</em>.
          Most entries are still Discovery only — {formatCount(provenance.discoveryOnly)} of{" "}
          {formatCount(provenance.total)} — and every entry says which it is rather than rounding up.
        </>
      ),
    },
    {
      q: "What version is it?",
      a: (
        <>
          The version the publisher gave, on {formatCount(provenance.versioned)} of{" "}
          {formatCount(provenance.total)} entries. Where there isn&rsquo;t one, the page says{" "}
          <span className="absent">not published</span> instead of guessing.
        </>
      ),
    },
    {
      q: "How can I verify any of this myself?",
      a: (
        <>
          Every claim above is a field you can look at. Provenance is{" "}
          <code className="t-mono">publisher.provenance</code>; identity is{" "}
          <code className="t-mono">publisher.name</code>,{" "}
          <code className="t-mono">publisher.url</code> and{" "}
          <code className="t-mono">publisher.verified</code> — a provenance flag, not a security
          review. What it runs is <code className="t-mono">command</code>,{" "}
          <code className="t-mono">args</code> and <code className="t-mono">installHint</code>; how
          far we got is <code className="t-mono">installability</code>; and{" "}
          <code className="t-mono">version</code> is the publisher&rsquo;s own.
          <br />
          <br />
          The release itself is chained: the pointer at{" "}
          <code className="t-mono">/v1/current.json</code> is signed with a keyless Sigstore bundle,
          and the client verifies pointer → <code className="t-mono">manifest.json</code> → listings
          before it trusts a row. The digest this build shipped with is in{" "}
          <code className="t-mono">data/release.json</code> and stamped on the lazy row request as{" "}
          <code className="t-mono">?v=…</code>, so a CDN cannot answer a newer build with older rows
          than the HTML beside them. This page does not verify signatures — it is static HTML — and{" "}
          <code className="t-mono">litespm catalog sync</code> is what does, refusing an unsigned
          origin under <code className="t-mono">LITESPM_REQUIRE_CATALOG_SIGNATURE=1</code>.
        </>
      ),
    },
    {
      q: "Do my API keys leave my machine?",
      a: (
        <>
          No. Credentials are held in your operating system&rsquo;s native vault. This site is a
          static export — it fetches the release manifest{" "}
          <code className="t-mono">/v1/current.json</code>, and the catalog rows{" "}
          <code className="t-mono">/data/catalog.json</code> only once you search, filter or open an
          entry. Both are same-origin public files, and search runs entirely in your browser.
        </>
      ),
    },
    {
      q: "Is this page's data live?",
      a: (
        <>
          The listings are a fixed catalog snapshot baked into the build, so every listing is
          pre-rendered and reachable without JavaScript. Only the release manifest is fetched on load
          — and the header states plainly whether that fetch succeeded. The rows themselves arrive on
          demand, never as a script on first paint, which is why this page stays a few hundred
          kilobytes instead of megabytes.
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
        Ten answers, including the ones whose honest answer is &ldquo;not published yet&rdquo;. Every
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
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
