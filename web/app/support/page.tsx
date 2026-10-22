import type { Metadata } from "next";
import Link from "next/link";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { REPO_URL } from "../../lib/site";
import { FaqSection } from "../../components/home/FaqSection";

/**
 * `/support`.
 *
 * The site already treats the repository's issue tracker as the only support
 * channel (`/contact/` says so, and the triage table there decides which
 * tracker a report belongs in). This page is the practical half of that: how
 * to write a report that can actually be acted on, and what to run before you
 * send one.
 *
 * Nothing here invents a channel. There is no support address, no chat, no
 * forum and no response-time promise beyond the one the security policy
 * actually commits to. The one commitment in the repository is the
 * acknowledgement of a security report within seven days, and it is quoted
 * here as a security commitment, not as a support SLA.
 */
export const metadata: Metadata = {
  title: "Support",
  description:
    "Where a report goes, what to put in it so it can be acted on, and the diagnostics to run before you send one.",
  alternates: { canonical: "/support/" },
  openGraph: { title: "Support · LiteSPM", url: "/support/" },
};

const ISSUES_URL = `${REPO_URL}/issues`;
const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

export default function SupportPage() {
  return (
    <InfoPage
      title="Support"
      lede="LiteSPM is maintained in the open, and the issue tracker is the only support channel. This page is the practical half of that: what to put in a report so it can be acted on, and what to run before you send one."
      sourcePath="web/app/support/page.tsx"
    >
      <InfoSection title="Where a report goes">
        <Facts>
          <Fact label="A bug or a request">
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="link">
              Open an issue
            </a>{" "}
            on the repository. Public, searchable, and the place fixes are tracked. The{" "}
            <Link href="/contact/" className="link">
              contact page
            </Link>{" "}
            has the full triage table — which of the four kinds of report belongs where.
          </Fact>
          <Fact label="A question">
            The same tracker. There is no chat, no email address and no support contract, so a
            question is answered fastest as an issue with the specifics filled in — the command you
            ran, what you expected, and what happened instead.
          </Fact>
          <Fact label="A vulnerability">
            Not a public issue. Use the{" "}
            <a href={ADVISORY_URL} target="_blank" rel="noopener noreferrer" className="link">
              private security advisory
            </a>{" "}
            instead — LiteSPM edits other tools&rsquo; configuration files and brokers credentials,
            so a public report is a working exploit for everyone until a fix ships. You do not need
            a working exploit to report one. The{" "}
            <Link href="/security/" className="link">
              security page
            </Link>{" "}
            has the rest of the policy.
          </Fact>
          <Fact label="A wrong catalog row">
            An issue, with the entry&rsquo;s URL on this site and what is wrong with it. Every entry
            page names the source its row was built from; include it. If you publish the project,
            say which entry and what should change.
          </Fact>
          <Fact label="Something inside an MCP server, skill or plugin">
            The project that publishes it. The catalog is an index — LiteSPM is not the publisher of
            those entries and cannot fix them.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="How to report a good bug">
        <p>
          A report is a description of something that happened, not a verdict about the software.
          These seven lines are the difference between a report someone can act on this week and
          one that has to be asked about.
        </p>
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            <strong className="font-semibold text-ink">One sentence in the title:</strong> what you
            did, and what happened. &ldquo;Install refused a skill on Codex&rdquo; beats
            &ldquo;install broken&rdquo;.
          </li>
          <li>
            <strong className="font-semibold text-ink">What you expected</strong>, and what
            happened instead — including the exact wording of any error, with its code.
          </li>
          <li>
            <strong className="font-semibold text-ink">The exact command</strong> you ran, copied
            rather than retyped, and its output.
          </li>
          <li>
            <strong className="font-semibold text-ink">The version and the platform:</strong> the
            output of <code>litespm version</code>, and your operating system.
          </li>
          <li>
            <strong className="font-semibold text-ink">The agent you were setting up</strong>, and
            the configuration file involved. Replace your home directory with <code>~</code>.
          </li>
          <li>
            <strong className="font-semibold text-ink">The entry&rsquo;s URL</strong> on this site,
            if the report is about a catalog entry. It names the source the row was built from.
          </li>
          <li>
            <strong className="font-semibold text-ink">One problem per report.</strong> Three
            problems in one issue is three issues, and they get fixed at different speeds.
          </li>
        </ol>
      </InfoSection>

      <InfoSection title="The diagnostics to include">
        <Facts>
          <Fact label="litespm version">
            The version, so a report can be tied to a release. It is also the first line of the
            security policy&rsquo;s list of what to include.
          </Fact>
          <Fact label="litespm doctor">
            Reports storage, the database, the catalog and each host configuration as PASS, WARN or
            FAIL, with a recommendation. It is the fastest way to rule out a broken local state
            before writing a report about it.
          </Fact>
          <Fact label="litespm host list">
            Which agent hosts are configured, and which are not. It answers the &ldquo;is my agent
            set up?&rdquo; question that most install reports are really asking.
          </Fact>
          <Fact label="Before you paste anything">
            <strong className="font-semibold text-ink">
              Read the output before you share it, and take out anything secret.
            </strong>{" "}
            Diagnostics can carry your home path, your host names and environment values, and a
            pasted diagnostic is the easiest way to put a token in a public issue. Replace your home
            directory with <code>~</code>, and remove anything that looks like a key, a token or a
            URL with a credential in it. If you are unsure whether a line is sensitive, leave it out
            and say you left it out.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="What you can expect">
        <p>
          One maintainer, no service-level agreement. A security report is acknowledged within seven
          days — that is the one commitment, and it is the one in the security policy. Everything
          else is read in the order it arrives.
        </p>
        <p>
          If a report is about the site rather than the tool, the{" "}
          <Link href="/status/" className="link">
            status page
          </Link>{" "}
          says which catalog release these pages were built from, and what the site can and cannot
          measure about itself.
        </p>
      </InfoSection>
      <FaqSection />
    </InfoPage>
  );
}
