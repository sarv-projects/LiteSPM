import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { HealthProbe } from "./HealthProbe";
import release from "../../data/release.json";

export const metadata: Metadata = {
  title: "Catalog status",
  description: "Check LiteSPM catalog availability and the date of its latest refresh.",
  alternates: { canonical: "/status/" },
  openGraph: { title: "Catalog status · LiteSPM", url: "/status/" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function updatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.getUTCDate() + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear();
}

export default function StatusPage() {
  return (
    <InfoPage title="Catalog status" lede="Check catalog availability and see when package information was last refreshed.">
      <InfoSection title="Catalog availability">
        <div className="rounded-panel border border-rule bg-sunken px-4 py-3.5">
          <HealthProbe />
        </div>
        <p>Run this check any time to confirm that LiteSPM can reach the catalog source.</p>
      </InfoSection>

      <InfoSection title="Catalog information">
        <Facts>
          <Fact label="Last refreshed">{updatedLabel(String(release.createdAt ?? ""))}</Fact>
          <Fact label="Listings">{Number(release.itemCount ?? release.totalCapabilities ?? 0).toLocaleString()}</Fact>
          <Fact label="MCP servers">{Number(release.mcpServersCount ?? 0).toLocaleString()}</Fact>
          <Fact label="Skills">{Number(release.agentSkillsCount ?? 0).toLocaleString()}</Fact>
          <Fact label="Plugins">{Number(release.pluginsCount ?? 0).toLocaleString()}</Fact>
        </Facts>
      </InfoSection>
    </InfoPage>
  );
}
