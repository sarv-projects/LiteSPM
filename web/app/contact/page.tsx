import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { REPO_URL } from "../../lib/site";

/**
 * `/contact`.
 *
 * The site had no contact route at all, which left a reader who found a wrong
 * catalog row, a bug or a vulnerability with nowhere to go. This page points at
 * the channels that already exist and are already staffed — the repository's
 * issue tracker, and the private advisory route `SECURITY.md` defines — rather
 * than inventing an address nobody reads.
 *
 * The response-time line is the one the security policy actually commits to
 * ("We will acknowledge within 7 days"); nothing else here promises a reply,
 * because nothing else in the repository does.
 */
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Where to report a bug, a security vulnerability, or a wrong catalog row, and what to include so the report can be acted on.",
  alternates: { canonical: "/contact/" },
  openGraph: { title: "Contact · LiteSPM Market", url: "/contact/" },
};

const ISSUES_URL = `${REPO_URL}/issues`;
const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

export default function ContactPage() {
  return (
    <InfoPage
      title="Contact"
      lede="LiteSPM is maintained in the open, and the issue tracker is the only support channel. There is no support address, no chat and no support contract — so a report that lands in the right place is the fastest path there is."
      sourcePath="web/app/contact/page.tsx"
    >
      <InfoSection title="Where a report goes">
        <Facts>
          <Fact label="A bug or a request">
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="link">
              Open an issue
            </a>{" "}
            on the repository. Public, searchable, and the place fixes are tracked.
          </Fact>
          <Fact label="A vulnerability">
            Use the{" "}
            <a href={ADVISORY_URL} target="_blank" rel="noopener noreferrer" className="link">
              private security advisory
            </a>{" "}
            form, not a public issue. LiteSPM edits other tools&rsquo; configuration files and
            brokers credentials, so a public report is a working exploit for everyone until a fix
            ships. You do not need a working exploit to report one.
          </Fact>
          <Fact label="A wrong catalog row">
            Every entry page names the source its row was built from. Open an issue with the{" "}
            <em>entry&rsquo;s URL on this site</em> and what is wrong with it. If you publish the
            project: same tracker, say which entry and what should change. A row that should not be
            listed is dropped from the next catalog release.
          </Fact>
          <Fact label="Something in an MCP server, skill or plugin">
            Report it to the project that publishes it. The catalog is an index — LiteSPM is not the
            publisher of those entries, and cannot fix them.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="What to include">
        <Facts>
          <Fact label="Version">
            The output of <code>litespm version</code>, so the report can be tied to a release.
          </Fact>
          <Fact label="Environment">
            The output of <code>litespm doctor</code> — it reports storage, database, catalog and
            host-configuration health as PASS, WARN or FAIL with a recommendation, and it is the
            fastest way to rule out a broken local state.
          </Fact>
          <Fact label="The command">
            The exact command you ran, what you expected, and what happened instead.
          </Fact>
          <Fact label="Catalog reports">
            The entry&rsquo;s URL on this site, plus the source named on it. Both are printed on the
            entry page.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="Response times">
        <p>
          One maintainer, no service-level agreement. Security reports are acknowledged within seven
          days — that is the one commitment, and it is the one in the security policy. Everything
          else is read in the order it arrives.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
