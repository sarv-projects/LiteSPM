import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";

export const metadata: Metadata = {
  title: "About LiteSPM",
  description: "Why LiteSPM exists, who maintains it, and how to follow its open development.",
  alternates: { canonical: "/about/" },
};

export default function AboutPage() {
  return (
    <InfoPage
      title="About LiteSPM"
      lede="An open-source package manager for finding, installing and managing capabilities across AI agents."
      sourcePath="web/app/about/page.tsx"
    >
      <InfoSection title="Why it exists">
        <p>
          MCP servers, agent skills and plugins are spread across registries and repositories, while
          each agent has its own setup format. LiteSPM gives those capabilities a shared catalog and
          a local install path that shows the target and planned change before writing.
        </p>
      </InfoSection>

      <InfoSection title="Maintainer and contributors">
        <p>
          LiteSPM is maintained by <a className="link" href="https://github.com/sarv-projects">Sarvesh Bhattacharyya</a>,
          with contributions from the open-source community. Development happens in the public{" "}
          <a className="link" href="https://github.com/sarv-projects/LiteSPM">GitHub repository</a>.
        </p>
      </InfoSection>

      <InfoSection title="Follow the project">
        <p>
          Browse the <a className="link" href="/roadmap/">roadmap</a>, see shipped changes in the{" "}
          <a className="link" href="/changelog/">release notes</a>, or suggest a catalog listing
          through the <a className="link" href="/submit/">listing guide</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
