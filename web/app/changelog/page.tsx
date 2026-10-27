import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";

export const metadata: Metadata = {
  title: "LiteSPM release notes",
  description: "Highlights from recent LiteSPM releases and links to the complete release history.",
  alternates: { canonical: "/changelog/" },
};

export default function ChangelogPage() {
  return (
    <InfoPage
      title="Release notes"
      lede="Recent changes to LiteSPM. The repository changelog and release pages carry the complete record."
      sourcePath="web/app/changelog/page.tsx"
    >
      <InfoSection title="0.6.0 · 22 October 2026">
        <ul className="list-disc space-y-2 pl-5">
          <li>Install plugins from pinned publisher sources.</li>
          <li>Choose explicit agent targets when installing skills.</li>
          <li>Review clearer install plans and catalog synchronization.</li>
        </ul>
      </InfoSection>

      <InfoSection title="Earlier releases">
        <p>
          <a className="link" href="https://github.com/sarv-projects/LiteSPM/blob/main/CHANGELOG.md">Read the complete changelog</a>,
          including fixes and migration details, or browse the{" "}
          <a className="link" href="https://github.com/sarv-projects/LiteSPM/releases">release downloads</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
