import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";
export const metadata: Metadata = { title: "What\u2019s new", description: "Release notes for LiteSPM.", alternates: { canonical: "/changelog/" } };
export default function Page() { return <InfoPage title={"What\u2019s new"} lede={"Release notes for LiteSPM."}>
<InfoSection title={"0.6.0 \u00b7 22 October 2026"}><p>Plugin installation from pinned sources, explicit agent targeting for skills, and improved installation previews and catalog sync.</p></InfoSection>
<InfoSection title={"0.5.0 \u00b7 19 October 2026"}><p>Improvements to package management and agent configuration. See the complete release record for details.</p></InfoSection>
<InfoSection title={"0.4.1 \u00b7 15 October 2026"}><p>Maintenance release. The full changelog preserves the changes and migration details for each version.</p></InfoSection>
<InfoSection title={"Full release history"}><p><a className="link" href="https://github.com/sarv-projects/LiteSPM/blob/main/CHANGELOG.md">Read the complete changelog</a> and <a className="link" href="https://github.com/sarv-projects/LiteSPM/releases">download a release</a>.</p></InfoSection>
</InfoPage>; }
