import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";

export const metadata: Metadata = {
  title: "LiteSPM Trust Center",
  description: "Check what LiteSPM changes, where catalog entries come from, and how to review its boundaries.",
  alternates: { canonical: "/trust/" },
};

export default function TrustPage() {
  return (
    <InfoPage
      title="Trust Center"
      lede="Use these pages to verify what runs locally, how an install is reviewed, and what a catalog listing does and does not prove."
      sourcePath="web/app/trust/page.tsx"
    >
      <InfoSection title="Changes stay reviewable">
        <p>
          LiteSPM runs on your machine. It shows the target and proposed change, asks before writing,
          and backs up host configuration first. Managed installs can be listed, removed or restored
          through the CLI. <a className="link" href="/how-it-works/">See the workflow</a> and the
          <a className="link" href="/security/"> security policy</a> for implementation details.
        </p>
      </InfoSection>

      <InfoSection title="Sources and compatibility are separate evidence">
        <p>
          Each catalog page identifies where its listing was found and links to the publisher source
          when available. Compatibility means the listing has a setup path for an agent; it is not a
          code review, security audit or sandbox. Review the publisher&rsquo;s instructions and the
          permissions it requests before installing.
        </p>
      </InfoSection>

      <InfoSection title="Data, availability and legal terms">
        <ul className="list-disc space-y-2 pl-5">
          <li><a className="link" href="/privacy/">Privacy</a> explains what the site stores in this browser and what the CLI sends.</li>
          <li><a className="link" href="/status/">Catalog availability</a> reports a live endpoint check separately from the data refresh date.</li>
          <li><a className="link" href="/terms/">Terms of use</a> and the <a className="link" href="https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE">Apache-2.0 license</a> set out legal terms.</li>
        </ul>
      </InfoSection>
    </InfoPage>
  );
}
