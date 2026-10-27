import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";

export const metadata: Metadata = {
  title: "LiteSPM roadmap",
  description: "Current product direction and open areas of work for LiteSPM.",
  alternates: { canonical: "/roadmap/" },
};

export default function RoadmapPage() {
  return (
    <InfoPage
      title="LiteSPM roadmap"
      lede="What works today and the areas the project is exploring next. Priorities can change; no delivery dates are promised here."
      sourcePath="web/app/roadmap/page.tsx"
    >
      <InfoSection title="Available today">
        <p>
          Browse MCP servers, skills and plugins, check their source and setup path, and install
          supported entries with the local CLI. The installer previews changes and manages only
          the entries and files it owns. See <a className="link" href="/how-it-works/">how it works</a>
          and <a className="link" href="/security/">the security guide</a> for the boundaries.
        </p>
      </InfoSection>

      <InfoSection title="Areas of focus">
        <ul className="list-disc space-y-2 pl-5">
          <li>Make duplicate and similarly named catalog entries easier to compare without hiding their sources.</li>
          <li>Expand install-source coverage when publishers provide enough detail to verify a setup path.</li>
          <li>Keep task discovery, agent setup guidance and catalog freshness clear as the catalog changes.</li>
        </ul>
      </InfoSection>

      <InfoSection title="Longer-term direction">
        <p>
          Explore more agent integrations and stronger package provenance. Any isolation work depends
          on what each agent runtime supports; installing a package does not sandbox its code.
          These are areas to investigate, not release commitments.
        </p>
      </InfoSection>

      <InfoSection title="Help shape the work">
        <p>
          <a className="link" href="https://github.com/sarv-projects/LiteSPM/issues">Share a use case or follow an issue on GitHub</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
