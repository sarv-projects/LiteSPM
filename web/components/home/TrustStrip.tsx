"use client";

import React from "react";
import type { ProvenanceStats } from "../../lib/landing";
import { formatCount } from "../../lib/format";

/**
 * "Know what you're adding." — the trust strip.
 *
 * Every sentence here is checked against a field the dataset actually carries.
 * Where the honest answer is "not published", the card says so in those words
 * instead of implying a capability the catalog does not have; where a number
 * exists, the number is computed from the rows at build time and printed with
 * its unit. The technical expander names the exact field, so a reader can go
 * verify the claim rather than take the paragraph on faith.
 */
export function TrustStrip({ provenance }: { provenance: ProvenanceStats }) {
  const cards: Array<{ title: string; plain: React.ReactNode }> = [
    {
      title: "Where it came from",
      plain: (
        <>
          Two kinds of source: we read it from the maker&rsquo;s own listing, or it turned up in a
          community list. Both are worth having — you just shouldn&rsquo;t mistake one for the other.
          Right now that&rsquo;s {formatCount(provenance.vendorManifest)} from makers and{" "}
          {formatCount(provenance.awesomeList)} from lists.
        </>
      ),
    },
    {
      title: "Who publishes it",
      plain: (
        <>
          The maker&rsquo;s own name and a link to them. When you see <em>from the maker</em>, we
          copied it out of their listing — nobody audited them, and we didn&rsquo;t audit them
          either.
        </>
      ),
    },
    {
      title: "What it can access",
      plain: (
        <>
          You get the exact command it runs and the file LiteSPM would change. What it can reach once
          it&rsquo;s running is something no catalog knows, so we don&rsquo;t pretend to tell you.
        </>
      ),
    },
    {
      title: "Whether we checked it",
      plain: (
        <>
          Four levels, from <em>we found it</em> to <em>we ran it</em>. Most entries are still in the
          first two — {formatCount(provenance.discoveryOnly)} of them — and we&rsquo;d rather show
          you that than round it up.
        </>
      ),
    },
    {
      title: "What version",
      plain: (
        <>
          The version the maker published, on {formatCount(provenance.versioned)} of{" "}
          {formatCount(provenance.total)} entries. Where there isn&rsquo;t one, the page says{" "}
          <span className="absent">not published</span> instead of guessing.
        </>
      ),
    },
  ];

  return (
    <section className="shell band" aria-labelledby="trust-title">
      <div className="rounded-card border border-rule bg-surface p-5 sm:p-7">
        <p className="kicker">Trust</p>
        <h2 id="trust-title" className="band-title mt-2">
          Know what you&rsquo;re adding.
        </h2>
        <p className="band-sub">
          Five questions, answered on every entry page — including the ones whose honest answer is
          &ldquo;not published yet&rdquo;.
        </p>

        <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <li key={card.title} className="border-t border-rule pt-3">
              <h3 className="text-[14px] font-semibold tracking-tight text-ink">{card.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{card.plain}</p>
            </li>
          ))}
        </ul>

        <details className="group mt-7 border-t border-rule pt-2">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[40px]">
            Technical provenance
            <span
              aria-hidden="true"
              className="text-ink-3 transition-transform duration-panel ease-out group-open:rotate-90"
            >
              →
            </span>
          </summary>
          <dl className="spec-list pb-2">
            <div>
              <dt>fields</dt>
              <dd>
                The names behind the five cards above, for anyone who wants to check the claim:
                <code className="t-mono"> publisher.provenance</code> (source),{" "}
                <code className="t-mono">publisher.name</code>,{" "}
                <code className="t-mono">publisher.url</code> and{" "}
                <code className="t-mono">publisher.verified</code> (who — a provenance flag, not a
                security review), <code className="t-mono">command</code>,{" "}
                <code className="t-mono">args</code> and <code className="t-mono">installHint</code>{" "}
                (what it runs), <code className="t-mono">installability</code> (how far we got), and{" "}
                <code className="t-mono">version</code>.
              </dd>
            </div>
            <div>
              <dt>sha256</dt>
              <dd>
                The release manifest digest is a sha256 over <code className="t-mono">manifest.json</code>;
                the client verifies pointer → manifest → listings before a row is trusted.
              </dd>
            </div>
            <div>
              <dt>manifestDigest</dt>
              <dd>
                <code className="t-mono">data/release.json → manifestDigest</code> — the digest this
                build shipped with, shown in the release chip at the top of the page.
              </dd>
            </div>
            <div>
              <dt>datasetDigest</dt>
              <dd>
                <code className="t-mono">data/release.json → datasetDigest</code> — stamped on the
                lazy row request as <code className="t-mono">?v=…</code>, so a CDN cannot answer a
                newer build with older rows than the HTML beside them.
              </dd>
            </div>
            <div>
              <dt>signature</dt>
              <dd>
                The published release pointer is signed with a keyless Sigstore bundle;
                <code className="t-mono"> litespm catalog sync</code> verifies it and refuses an
                unsigned origin when <code className="t-mono">LITESPM_REQUIRE_CATALOG_SIGNATURE=1</code>.
                This page does not verify signatures — it is static HTML.
              </dd>
            </div>
            <div>
              <dt>byte-parity</dt>
              <dd>
                <code className="t-mono">/data/catalog.json</code> and its shards are generated at
                build time from <code className="t-mono">web/data/catalog.json</code>, so the rows
                you fetch on demand are the rows this page was built from.
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}
