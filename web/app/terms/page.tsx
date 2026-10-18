import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { REPO_URL } from "../../lib/site";

/**
 * `/terms`.
 *
 * A "terms" page for a no-account, no-payment, Apache-2.0 catalog has one
 * honest job: say what actually binds a reader. That is the license (including
 * its warranty disclaimer, which is the whole reason to link it rather than
 * paraphrase it), plus the two things a catalog listing must never be mistaken
 * for — a security review and a compatibility test. The `verified`,
 * `metadata_verified` and host-list distinctions here match `STATUS.md`,
 * `SECURITY.md` ("What we do not claim") and the badge copy in the UI.
 */
export const metadata: Metadata = {
  title: "Terms",
  description:
    "The license, the warranty disclaimer, what a catalog listing does and does not mean, and what happens when you install someone else's capability.",
  alternates: { canonical: "/terms/" },
  openGraph: { title: "Terms · LiteSPM Market", url: "/terms/" },
};

const ISSUES_URL = `${REPO_URL}/issues`;

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms"
      lede="There is no account to create and nothing to accept. What actually applies is below: the license, the warranty, and what a listing on this site does and does not mean."
      sourcePath="web/app/terms/page.tsx"
    >
      <InfoSection title="License">
        <p>
          LiteSPM is Apache-2.0.{" "}
          <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="link">
            The repository&rsquo;s LICENSE
          </a>{" "}
          is the license, and the npm package carries the same one. You can read, fork, modify,
          self-host and redistribute it under those terms.
        </p>
        <p>
          That license also holds the warranty disclaimer: the software is provided on an{" "}
          <em>as is</em> basis, without warranties or conditions of any kind, express or implied.
          Nothing on this site adds a warranty to it.
        </p>
      </InfoSection>

      <InfoSection title="What a listing means">
        <p>
          The catalog is an index of things other people publish. Every entry names the source its
          row was built from, and its page shows that source, the publisher&rsquo;s own words, and
          the snapshot the row came from. LiteSPM does not host, review or audit those projects.
        </p>
        <Facts>
          <Fact label="Badges">
            A badge such as <code>metadata_verified</code> says where the row came from — the
            publisher&rsquo;s own manifest rather than a third-party list. It is not a security
            review, and the UI says so wherever the badge appears.
          </Fact>
          <Fact label="Host lists">
            The hosts shown on an entry are publisher-declared, or derived from what the host can
            technically install. They are not the result of running the capability against every
            host.
          </Fact>
          <Fact label="No popularity data">
            No star, download or install counts appear anywhere, because no upstream source
            publishes them. An earlier build estimated them; that was wrong and was removed.
          </Fact>
          <Fact label="Inclusion">
            A listing is not an endorsement, a recommendation, or a claim that something works. It
            means an upstream source named it and this build indexed it.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="Installing what is listed">
        <p>
          Installing an MCP server, a skill or a plugin runs code someone else wrote, with your
          permissions, on your machine. Read the project before you install it. A skill is a set of
          instructions your agent will follow, which makes it a prompt surface as much as a code
          one.
        </p>
        <p>
          The installer refuses what it can: <code>http://</code>, <code>file:</code> and{" "}
          <code>ftp://</code> sources, symlinks, non-regular files, and overwriting an existing
          skill without <code>--force</code>. Those refusals are the extent of the protection — they
          are not a review of what you are about to run.
        </p>
      </InfoSection>

      <InfoSection title="Publishers, marks and corrections">
        <p>
          Icons, avatars and agent logos identify the projects they belong to and stay their
          owners&rsquo; property. If you publish something listed here and want a row corrected,
          clarified or removed,{" "}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="link">
            open an issue
          </a>{" "}
          with the entry&rsquo;s URL. A row that should not be listed is dropped from the next
          catalog release.
        </p>
      </InfoSection>

      <InfoSection title="Availability">
        <p>
          The site and the catalog are served as they are. There is no account, no paid tier, no
          uptime commitment and no support contract. The release id printed on the site is the date
          its dataset was built, not a version of this page; these pages ship with the source and
          change when it does.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
