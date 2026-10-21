import catalogData from "../../../data/catalog.json";
import type { Listing } from "../../../lib/telemetry";
import { hostEntryCount, hostIdentity, HOST_IDENTITIES } from "../../../lib/hostIdentity";
import { HOSTS, bridgeSnippet, hostPath } from "../../../lib/hosts";
import { hostNote } from "../../../lib/hostNotes";
import { vendorName } from "../../../lib/vendorNames";
import { discontinuedNotice } from "../../../lib/lifecycle";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
 * Every host the catalog names has a page. That used to be true only of the
 * fifty hosts with a compiled-in MCP configuration adapter: the other
 * twenty-nine — a skills directory and no MCP config — were listed on
 * `/agents/`, appeared in Explore's "Works with" list, and 404'd when a
 * reader followed them. A name the site publishes must lead somewhere, so the
 * param list is the whole identity registry (`HOST_IDENTITIES`), and a host
 * without an adapter gets the page that tells the truth about it: LiteSPM
 * installs skills into it, and writes no configuration file for it.
 */
export function generateStaticParams() {
  return HOST_IDENTITIES.map((identity) => ({ id: identity.id }));
}

/** The param list above is exhaustive over the registry: an unknown id is a
 *  404, never a request-time render (there is no server under `output:
 *  "export"` to fall back to). */
export const dynamicParams = false;

/** Meta descriptions are truncated by search engines and previews around 155
 *  characters; cutting at a word boundary beats a hard slice mid-word. */
function clamp(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 60 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, "")}…`;
}

/**
 * Every route used to inherit the one `metadata` block in `app/layout.tsx`, so
 * all sixty pages shipped the same `<title>` and the same `og:url` — sharing a
 * product link previewed as the homepage. Each agent page now names its own
 * host, and the description is the same sourced sentence the page shows.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const identity = hostIdentity(id);
  if (!identity) return {};

  const name = vendorName(identity.id, identity.name);
  const gone = discontinuedNotice(identity.id);
  const note = hostNote(identity.id);

  // A discontinued host says so in the title, so the status survives being
  // pasted somewhere without the page around it.
  const title = gone ? `${name} (discontinued)` : name;
  const description = clamp(
    gone
      ? `${gone.notice} LiteSPM's adapter for ${name}: the config file it writes and the one entry it adds.`
      : identity.adapter
        ? note
          ? `${note.summary} LiteSPM writes a single bridge entry into ${name}'s own configuration.`
          : `Where ${name} keeps its MCP configuration, and the single bridge entry LiteSPM adds to it.`
        : `${name} takes agent skills. LiteSPM installs skills into it, and writes no MCP configuration file for it.`
  );

  return {
    title,
    description,
    alternates: { canonical: `/agents/${identity.id}/` },
    openGraph: {
      type: "article",
      // Not templated by Next: an OpenGraph title is used verbatim.
      title: `${title} · LiteSPM`,
      description,
      url: `/agents/${identity.id}/`,
    },
  };
}

/**
 * Reprints a bridge entry with arrays of plain values kept on one line.
 *
 * `JSON.stringify(..., 2)` puts each array element on its own line, which is
 * right for data and wrong for this card: `["bridge","stdio","--host","cursor"]`
 * was rendering eight lines tall inside a file card, and the card is the main
 * object on the page. Objects still nest normally.
 *
 * Returns the input untouched when it is not parseable as JSON, so a TOML (or
 * otherwise non-JSON) snippet cannot be broken by this.
 */
function reformatEntry(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const scalar = (value: unknown, depth: number): string => {
    const pad = "  ".repeat(depth);
    const inner = `${pad}  `;
    if (Array.isArray(value)) {
      const flat = value.every((v) => v === null || typeof v !== "object");
      if (flat) return `[${value.map((v) => scalar(v, depth + 1)).join(", ")}]`;
      return `[\n${value.map((v) => inner + scalar(v, depth + 1)).join(",\n")}\n${pad}]`;
    }
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const body = entries
        .map(([k, v]) => `${inner}${k}: ${scalar(v, depth + 1)}`)
        .join(",\n");
      return `{\n${body}\n${pad}}`;
    }
    return JSON.stringify(value);
  };

  return scalar(parsed, 0);
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = hostIdentity(id);
  // Unreachable while `generateStaticParams` is exhaustive; kept so a future
  // param source can never render half of this page.
  if (!identity) notFound();

  const items = catalogData as unknown as Listing[];
  // `hostNotes.ts` carries sourced prose for the hand-written adapters and the
  // other hosts people actually search for; every other host gets the plain
  // description of what we can honestly say about it, rather than invented copy.
  const note = hostNote(identity.id);
  const skillsSupported = Boolean(identity.skill);

  // Counted with the same rule Explore's host filter uses (`lib/hostIdentity`):
  // every row that names this host through any of its catalog spellings,
  // counted once per row. The figure here, the figure on the host's `/agents/`
  // row and the figure its Explore link opens are one measurement.
  const count = hostEntryCount(items, identity.id);

  // The adapter, when this host has one. Twenty-nine of the seventy-nine
  // hosts have none: they take skills and have no MCP configuration file, so
  // there is no bridge entry to show them.
  const adapter = identity.adapter ? HOSTS.find((h) => h.id === identity.adapter?.id) : undefined;

  // `bridgeSnippet` leads with the target path as a comment line. The file
  // card already shows that path as its heading, so the card body is the
  // entry alone — which also keeps the JSON copy valid JSON.
  //
  // The default printer puts every argument on its own line, so a four-word
  // command grew the card to ~280px of mostly whitespace. Arrays of plain
  // values are printed on one line instead. Anything that is not JSON (a
  // TOML host) skips the re-print entirely and renders as sent.
  const rawSnippet = adapter
    ? bridgeSnippet(adapter, "litespm", "linux").replace(/^# .*\n/, "")
    : "";
  const snippet = rawSnippet ? reformatEntry(rawSnippet) : "";

  const props: AgentDetailViewProps = {
    id: identity.id,
    // Display name: the vendor's own spelling when the registry row disagrees
    // (Auggie CLI, Xum, Kimchi Coding, …). It is also the host's canonical
    // Explore filter value: the filter resolves every spelling of a host to
    // one identity (`lib/hostIdentity`), so the link under the count opens
    // exactly the count above it whichever spelling is on screen.
    name: vendorName(identity.id, identity.name),
    registryName: identity.name,
    interfaceLabel: note?.interface ?? "Agent host",
    website: note?.website,
    summary: note?.summary,
    source: note?.source,
    filePath: adapter ? hostPath(adapter, "linux") : "",
    snippet,
    format: adapter ? adapter.kind : "json",
    // `projectPath` is emitted from the Go adapter together with project
    // scope support, so its presence is what the fact list keys on.
    repoConfigPath: adapter?.projectPath,
    skillsSupported,
    /**
     * True when the host takes skills and has no MCP configuration adapter.
     * The page then says what LiteSPM does for it — install skills — instead
     * of showing a config file and a bridge entry it does not have.
     */
    skillsOnly: !adapter,
    count,
    docsHref: adapter?.docsUrl ?? note?.website,
    capabilities: note?.capabilities,
    // Present only for a vendor that has ended the product. The page is still
    // built so an old link works; it says so instead of implying the agent is
    // current.
    discontinued: discontinuedNotice(identity.id) ?? undefined,
  };

  return <AgentDetailRoute {...props} />;
}
