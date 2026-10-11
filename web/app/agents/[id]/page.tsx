import catalogData from "../../../data/catalog.json";
import type { Listing } from "../../../lib/telemetry";
import { matchesHost } from "../../../lib/catalog";
import { HOSTS, SKILL_TARGETS, bridgeSnippet, hostPath } from "../../../lib/hosts";
import { hostNote } from "../../../lib/hostNotes";
import { notFound } from "next/navigation";
import type { AgentDetailViewProps } from "./AgentDetailView";
import AgentDetailRoute from "./AgentDetailRoute";

/**
 * This page is a **Server Component on purpose**, the same way
 * `app/agents/page.tsx` is: `data/catalog.json` (~31 MB) is imported here and
 * is the only place it is ever imported from on this route, so the import
 * lands in the build-time server bundle and never in a browser chunk. What
 * crosses the client boundary is `AgentDetailViewProps` — the resolved host
 * record, the bridge snippet, and the catalog count — serialized beside the
 * prerendered HTML it describes.
 *
 * Every id in `lib/hosts.ts` is a static param, so the file card, the command
 * and the counts are all derived at build time and an id outside the registry
 * has no page at all.
 */
export function generateStaticParams() {
  return HOSTS.map((host) => ({ id: host.id }));
}

/** The param list above is exhaustive over the registry: an unknown id is a
 *  404, never a request-time render (there is no server under `output:
 *  "export"` to fall back to). */
export const dynamicParams = false;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const host = HOSTS.find((h) => h.id === id);
  // Unreachable while `generateStaticParams` is exhaustive; kept so a future
  // param source can never render half of this page.
  if (!host) notFound();

  const items = catalogData as unknown as Listing[];
  // `hostNotes.ts` carries prose only for the hand-written adapters; every
  // other host gets the plain description rather than invented copy.
  const note = hostNote(host.id);
  const skillsSupported = SKILL_TARGETS.some((t) => t.id === host.id);

  // Counted with the same key Explore's host filter matches on (`host.name`),
  // so the number here is the number the Explore link below it reports.
  const count = items.filter((item) => matchesHost(item, host.name)).length;

  // `bridgeSnippet` leads with the target path as a comment line. The file
  // card already shows that path as its heading, so the card body is the
  // entry alone — which also keeps the JSON copy valid JSON.
  const snippet = bridgeSnippet(host, "litespm", "linux").replace(/^# .*\n/, "");

  const props: AgentDetailViewProps = {
    id: host.id,
    name: host.name,
    interfaceLabel: note?.interface ?? "Agent host",
    website: note?.website,
    summary: note?.summary,
    source: note?.source,
    filePath: hostPath(host, "linux"),
    snippet,
    format: host.kind,
    // `projectPath` is emitted from the Go adapter together with project
    // scope support, so its presence is what the fact list keys on.
    projectPath: host.projectPath,
    skillsSupported,
    count,
    docsUrl: host.docsUrl,
  };

  return <AgentDetailRoute {...props} />;
}
