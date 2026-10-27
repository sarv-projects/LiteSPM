import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { REPO_URL } from "../../lib/site";

/** Contact routes requests to existing project channels; diagnostics and disclosure details live on Support and Security. */
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Where to report a bug, a security vulnerability, or a wrong catalog row, and what to include so the report can be acted on.",
  alternates: { canonical: "/contact/" },
  openGraph: { title: "Contact · LiteSPM", url: "/contact/" },
};

const ISSUES_URL = `${REPO_URL}/issues`;
const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

export default function ContactPage() {
  return (
    <InfoPage
      title="Contact"
      lede="Choose the right place for your report. For troubleshooting steps and diagnostics, use Support."
      sourcePath="web/app/contact/page.tsx"
    >
      <InfoSection title="Choose a route">
        <Facts>
          <Fact label="A bug or a request">
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="link">
              Open an issue
            </a>{" "}
            in the LiteSPM repository.
          </Fact>
          <Fact label="A vulnerability">
            Use the{" "}
            <a href={ADVISORY_URL} target="_blank" rel="noopener noreferrer" className="link">
              private security advisory
            </a>{" "}
            form, not a public issue. See the <a className="link" href="/security/">security policy</a> for
            what to include and how reports are handled.
          </Fact>
          <Fact label="A wrong catalog row">
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="link">
              Open an issue
            </a>{" "}
            with the entry URL and what is wrong. Each entry page names its source.
          </Fact>
          <Fact label="Something in an MCP server, skill or plugin">
            Contact the project that publishes it; LiteSPM indexes these projects but does not
            maintain their packages.
          </Fact>
          <Fact label="A listing to add">
            <a href="/submit/" className="link">Use the listing request form</a> to send a source for review.
          </Fact>
          <Fact label="Troubleshooting">
            <a href="/support/" className="link">Support and troubleshooting</a> has diagnostic commands and
            guidance on what to include in a report.
          </Fact>
        </Facts>
      </InfoSection>
    </InfoPage>
  );
}
