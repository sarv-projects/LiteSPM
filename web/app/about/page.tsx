import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";
export const metadata: Metadata = { title: "Built for people who use AI agents", description: "LiteSPM brings discovery, installation and management into one place.", alternates: { canonical: "/about/" } };
export default function Page() { return <InfoPage title={"Built for people who use AI agents"} lede={"LiteSPM brings discovery, installation and management into one place."}>
<InfoSection title={"Why LiteSPM"}><p>Agent tools are spread across registries, repositories and incompatible configuration formats. LiteSPM helps you find a useful addition, choose your agent and review the change before installing.</p></InfoSection>
<InfoSection title={"Maintainer"}><p>LiteSPM is maintained by <a className="link" href="https://github.com/sarv-projects">Sarvesh Bhattacharyya</a>, with contributions from the open-source community.</p></InfoSection>
<InfoSection title={"Open development"}><p>Read the <a className="link" href="/roadmap/">roadmap</a>, follow the <a className="link" href="/changelog/">changelog</a>, or <a className="link" href="https://github.com/sarv-projects/LiteSPM">contribute on GitHub</a>.</p></InfoSection>
</InfoPage>; }
