import type { Metadata } from "next";
import Link from "next/link";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { REPO_URL } from "../../lib/site";

const ISSUES_URL = `${REPO_URL}/issues`;
const NEW_LISTING_URL = `${ISSUES_URL}/new?template=new-listing.yml`;
const PULLS_URL = `${REPO_URL}/pulls`;

export const metadata: Metadata = {
  title: "Submit a listing",
  description:
    "How a server, skill or plugin gets into the LiteSPM catalog, what gets it installed, and what the catalog will never promise in exchange.",
  alternates: { canonical: "/submit/" },
  openGraph: { title: "Submit a listing · LiteSPM", url: "/submit/" },
};

/**
 * The page a publisher lands on when they want their thing listed.
 *
 * It exists because every peer in this space sells or accepts submissions and
 * LiteSPM accepted none — and because the honest answer to "how do I get
 * listed?" is the same answer as "how do I become installable?", which is a
 * question about the publisher's own artifact, not about us. Nothing here
 * promises a review, a badge, a position or a time: the catalog is built from
 * recorded sources and every row faces the same verification.
 */
export default function SubmitPage() {
  return (
    <InfoPage
      title="Submit a listing"
      lede="There is no upload form, and there is nothing to buy. A listing enters the catalog when its publisher ships something the catalog can read and verify — so submitting is a matter of making that artifact exist and pointing us at it."
      sourcePath="web/app/submit/page.tsx"
    >
      <InfoSection title="What can be submitted">
        <Facts>
          <Fact label="An MCP server">
            Publish the launch line a client would run — the command, its arguments, and which
            transports its endpoint speaks. The catalog reads that from the version record, and a
            server with no command and no endpoint is listed but cannot be installed.
          </Fact>
          <Fact label="An agent skill">
            Ship a <code>SKILL.md</code> with a name and a description in its frontmatter, in a
            repository the installer can clone. That file is what the verification probes, and it
            is the whole contract: no name in the listing that disagrees with the name in the
            file.
          </Fact>
          <Fact label="A plugin">
            Publish a source pinned to a specific commit, whose own manifest names the servers and
            skills it contains. A tree that floats on a branch is refused rather than installed
            half-understood.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="Suggest a new listing">
        <p>
          Point us to a published source and include the details needed to check it: an MCP
          command or endpoint and transport, the path to a skill's <code>SKILL.md</code>, or a
          plugin's pinned commit and manifest. The form asks for type-specific installation and
          verification information.
        </p>
        <a className="btn btn-solid mt-4 inline-flex" href={NEW_LISTING_URL}>
          New listing
        </a>
        <p className="mt-3">
          An issue requests review; it does not add a listing automatically. LiteSPM does not sell
          placement or verification. A listing is not an endorsement.
        </p>
      </InfoSection>

      <InfoSection title="How it gets in">
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-ink-2">
          <li>
            The artifact exists: a repository, a registry entry, or a page the catalog's sources
            read. The catalog is built from recorded sources; an issue can ask us to review a
            published source, but it cannot replace the artifact itself.
          </li>
          <li>
            The next catalog build picks it up from that source and publishes the row with its
            publisher, its source and what it can install.
          </li>
          <li>
            The row becomes installable when the build can verify it: a cloneable source, a{" "}
            <code>SKILL.md</code> that answers, names that agree. Until then it is listed, with
            that said plainly on its page.
          </li>
        </ol>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          If your entry is in the catalog and something about it is wrong — a dead source, a name
          that changed, a project that has moved —{" "}
          <a className="link" href={ISSUES_URL}>
            open an issue
          </a>{" "}
          with the listing id from its page. That is the same channel as a bug report, and it gets
          the same treatment.
        </p>
      </InfoSection>

      <InfoSection title="What the catalog does not sell">
        <Facts>
          <Fact label="No position">
            Nothing is ranked by popularity, because no source publishes install counts. A
            listing's order is a documented rule over three facts the reader can check on its own
            page — not a payment.
          </Fact>
          <Fact label="No badge for sale">
            A publisher marker means the entry was read from the publisher's own manifest. It
            cannot be bought, and it is not a security review.
          </Fact>
          <Fact label="No endorsement">
            Being listed means the catalog found and read the entry. It does not mean LiteSPM
            hosts it, reviewed it, or would run it — see the{" "}
            <Link className="link" href="/security/">
              security policy
            </Link>
            .
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="Changing something you already shipped">
        <p>
          A version bump, a renamed skill or a moved repository is picked up by the next build
          from the same source. If the source has moved entirely — a new owner, a new URL —{" "}
          <a className="link" href={PULLS_URL}>
            open a pull request
          </a>{" "}
          against the source list in{" "}
          <code className="t-mono">scripts/build_full_catalog.py</code>, which is where every
          source the catalog reads is declared, with its host allowlist.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
