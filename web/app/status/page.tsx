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
      lede="Check whether the live catalog endpoint responds now, and when the catalog data was last refreshed."
      sourcePath="web/app/status/page.tsx"
    >
      <InfoSection title="Live endpoint check">
        <div className="rounded-panel border border-rule bg-sunken px-4 py-4">
          <HealthProbe />
        </div>
        <p>The live result is a point-in-time endpoint check. The refresh date below describes the catalog data, not site uptime.</p>
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
