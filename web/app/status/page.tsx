import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { HealthProbe } from "./HealthProbe";
import release from "../../data/release.json";

export const metadata: Metadata = {
  title: "Catalog availability",
  description: "Check catalog availability and see when package information was last refreshed.",
  alternates: { canonical: "/status/" },
  openGraph: { title: "Catalog availability · LiteSPM", url: "/status/" },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function updatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.getUTCDate() + " " + MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear();
}

export default function StatusPage() {
  return (
    <InfoPage
      title="Catalog availability"
      lede="Check that the package catalog is available and see when its information was last refreshed."
    >
      <InfoSection title="Live availability">
        <div className="rounded-panel border border-rule bg-sunken px-4 py-4">
          <HealthProbe />
        </div>
        <p>Browse the catalog to find packages and review setup paths for your agent.</p>
      </InfoSection>

      <InfoSection title="Package information">
        <Facts>
          <Fact label="Last refreshed">{updatedLabel(String(release.createdAt ?? ""))}</Fact>
          <Fact label="Available types">MCP servers · agent skills · plugins</Fact>
        </Facts>
      </InfoSection>
    </InfoPage>
  );
}
