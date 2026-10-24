import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";
export const metadata: Metadata = { title: "Where LiteSPM is going", description: "One package manager for the capabilities, connections and agents you use.", alternates: { canonical: "/roadmap/" } };
export default function Page() { return <InfoPage title={"Where LiteSPM is going"} lede={"One package manager for the capabilities, connections and agents you use."}>
<InfoSection title={"Available today"}><p>Discover MCP servers, skills and plugins. Choose an agent, review an installation plan, and manage the files and configuration LiteSPM owns.</p></InfoSection>
<InfoSection title={"Next priorities"}><p>Improve source resolution for more skill installations, consolidate duplicate listings, strengthen task-based discovery, and make agent setup easier to follow.</p></InfoSection>
<InfoSection title={"Product direction"}><p>Bring connectors and agent applications into the same management experience. Add package signing and stronger isolation where supported by the installation model. These are planned areas of work, without committed release dates.</p></InfoSection>
<InfoSection title={"Help shape the roadmap"}><p><a className="link" href="https://github.com/sarv-projects/LiteSPM/issues">Share a use case or follow an issue on GitHub</a>.</p></InfoSection>
</InfoPage>; }
