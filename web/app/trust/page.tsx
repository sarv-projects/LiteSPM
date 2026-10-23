import type { Metadata } from "next";
import { InfoPage, InfoSection } from "../../components/layout/InfoPage";
export const metadata: Metadata = { title: "Your tools. Your machine. Your control.", description: "Understand what LiteSPM changes and how to stay in control.", alternates: { canonical: "/trust/" } };
export default function Page() { return <InfoPage title={"Your tools. Your machine. Your control."} lede={"Understand what LiteSPM changes and how to stay in control."}>
<InfoSection title={"Data and privacy"}><p>The CLI keeps its inventory and configuration changes locally. Read the <a className="link" href="/privacy/">Privacy Policy</a> for the website and CLI data-handling details.</p></InfoSection>
<InfoSection title={"Preview and recovery"}><p>Installation shows the target agent, scope and planned changes before approval. Configuration writes are backed up. Use litespm list to find an install, litespm install remove to remove managed entries, and litespm restore to restore a configuration backup. Review the commands before applying them to a shared configuration.</p></InfoSection>
<InfoSection title={"Package sources"}><p>Each package links to its source. A marketplace listing identifies where it was discovered; source ownership and security review are separate facts. Review third-party packages and the access they request before installing.</p></InfoSection>
<InfoSection title={"Security and disclosure"}><p>Read the <a className="link" href="/security/">Security Policy</a> for installation protections and the vulnerability disclosure process.</p></InfoSection>
<InfoSection title={"License and terms"}><p>LiteSPM is open source under <a className="link" href="https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE">Apache-2.0</a>. See the <a className="link" href="/terms/">Terms of Use</a>.</p></InfoSection>
</InfoPage>; }
