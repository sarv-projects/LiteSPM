import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { LiteSPMApp } from "@/components/litespm/app";
import { parsePath } from "@/lib/litespm/route";
import { displayPackageName } from "@/lib/litespm/format";
import facts from "@/lib/litespm/site-facts.json";
import type { PackageDetailData } from "@/lib/litespm/types";
import { getPackageDetail } from "@/server/litespm/package-detail";
import { HOSTS } from "@/server/litespm/hosts";

interface Props {
  params: Promise<{ slug?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** The one canonical origin; `metadataBase` in layout.tsx is the same value. */
const ORIGIN = "https://lite-spm-nine.vercel.app";

/** First path segments the app renders. Anything else is a real 404, not the home page. */
const KNOWN_SECTIONS = new Set([
  "marketplace",
  "explore", // redirected to /marketplace by next.config.ts; kept so a bypassed redirect still renders
  "package",
  "agents",
  "agent",
  "docs",
  "publish",
  "insights",
  "bundles",
  "compare",
]);

// generateMetadata and the page both need the row; resolve it once per request.
const packageDetail = cache((key: string) => getPackageDetail(key));

const listings = `${Math.floor(facts.listings / 1000)}k+`;

export const DOC_SECTIONS_META: Record<string, { title: string; description: string }> = {
  introduction: {
    title: "Introduction · LiteSPM Documentation",
    description: "Overview of LiteSPM, the package manager for AI agents, and how it connects to agent hosts.",
  },
  "getting-started": {
    title: "Getting Started · LiteSPM Documentation",
    description: "Install LiteSPM via npm, configure your first agent host, and verify your environment.",
  },
  commands: {
    title: "Command Reference · LiteSPM Documentation",
    description: "Complete CLI reference for litespm search, install, skills, adopt, host, and bridge commands.",
  },
  "install-flow": {
    title: "How an Install Works · LiteSPM Documentation",
    description: "Learn how LiteSPM plans, previews, approves, backs up, and records every capability install.",
  },
  hosts: {
    title: "Supported Agent Hosts · LiteSPM Documentation",
    description: "Configuration formats, default paths, and integration mechanics for 52 AI agent hosts.",
  },
  "in-agent-marketplace": {
    title: "In-Agent Marketplace · LiteSPM Documentation",
    description: "Using /marketplace inside Pi Agent, OpenCode, Claude Code, Grok Build, Cursor, and Cline.",
  },
  "agent-compatibility": {
    title: "Agent Compatibility Matrix · LiteSPM Documentation",
    description: "Detailed breakdown of popup commands, prompt bridges, and unsupported agent environments.",
  },
  security: {
    title: "Security Model · LiteSPM Documentation",
    description: "Cryptographic SHA-256 validation, human approval gates, zero telemetry, and rollback ledgers.",
  },
  methodology: {
    title: "Ranking & Quality Methodology · LiteSPM Documentation",
    description: "How LiteSPM scores, normalizes, and labels listings, publishers, and verified metadata.",
  },
  publishing: {
    title: "Publishing to the Catalog · LiteSPM Documentation",
    description: "Guidelines and schema requirements for listing MCP servers, skills, and plugins in LiteSPM.",
  },
  troubleshooting: {
    title: "Troubleshooting & FAQ · LiteSPM Documentation",
    description: "Solutions for common agent connection issues, bridge timeouts, and ledger recovery.",
  },
};

function pageMeta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: `${ORIGIN}${path}` },
    openGraph: { title, description, url: `${ORIGIN}${path}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length === 0) {
    return { title: "LiteSPM — The package manager for AI agents" };
  }

  const section = slug[0];

  if (section === "package" && slug.length > 1) {
    const key = slug.slice(1).join("/");
    try {
      const resp = await packageDetail(key);
      if (resp.found && resp.detail) {
        const title = `${displayPackageName(resp.detail.name)} — LiteSPM`;
        const description =
          resp.detail.summary ||
          `Install ${resp.detail.name} into supported AI agent hosts with LiteSPM.`;
        return {
          ...pageMeta(title, description, `/package/${encodeURIComponent(key)}`),
          openGraph: {
            title,
            description,
            type: "article",
            url: `${ORIGIN}/package/${encodeURIComponent(key)}`,
          },
        };
      }
    } catch {}
    return {
      title: "Package Details · LiteSPM",
      description: "View package details and installation instructions.",
    };
  }

  switch (section) {
    case "marketplace":
    case "explore":
      return pageMeta(
        "Marketplace — MCP servers, skills & plugins · LiteSPM",
        `Search ${listings} MCP servers, agent skills and plugins, then copy the exact litespm install command. One catalog, ${facts.hosts} agent hosts.`,
        "/marketplace",
      );
    case "agents":
      return pageMeta(
        "Supported Agent Hosts · LiteSPM",
        `${facts.hosts} agent hosts for MCP servers and ${facts.skillTargets} targets for skills, and which ones get an in-agent marketplace command.`,
        "/agents",
      );
    case "agent":
      if (slug.length > 1) {
        const hostId = slug[1]!;
        const host = HOSTS.find((h) => h.id === hostId || h.id.toLowerCase() === hostId.toLowerCase());
        if (!host) {
          return { title: "Agent not found · LiteSPM", robots: { index: false } };
        }
        return pageMeta(
          `${host.name} · Supported Agent Host · LiteSPM`,
          `Configure MCP servers and skills for ${host.name} (${host.kind.toUpperCase()} config) with LiteSPM.`,
          `/agent/${encodeURIComponent(host.id)}`,
        );
      }
      break;
    case "insights":
      return pageMeta(
        "Catalog Insights & Analytics · LiteSPM",
        "Statistics, distributions and trust metrics, measured over the same rows the marketplace serves.",
        "/insights",
      );
    case "docs": {
      const docSlug = slug.length > 1 ? slug[1]! : "introduction";
      const docMeta = DOC_SECTIONS_META[docSlug];
      if (!docMeta) {
        return { title: "Documentation not found · LiteSPM", robots: { index: false } };
      }
      return pageMeta(
        docMeta.title,
        docMeta.description,
        slug.length > 1 ? `/docs/${encodeURIComponent(docSlug)}` : "/docs",
      );
    }
    case "bundles":
      return pageMeta(
        "Bundles — curated MCP servers and skills · LiteSPM",
        "Curated sets of MCP servers and skills for common jobs, each with a difficulty level and one litespm install command per item. Every item is installable.",
        "/bundles",
      );
    case "publish":
      return pageMeta(
        "Publish a Listing · LiteSPM",
        "Submit your MCP server, skill, or plugin to the LiteSPM catalog.",
        "/publish",
      );
    case "compare":
      return pageMeta(
        "Compare Packages · LiteSPM",
        "Compare capabilities, permissions, and compatibility side by side.",
        "/compare",
      );
  }

  return { title: "Page not found · LiteSPM", robots: { index: false } };
}

export default async function CatchAllPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const section = slug?.[0];

  // Unknown paths are a real 404 (status + not-found.tsx), not a 200 home page.
  if (section && !KNOWN_SECTIONS.has(section)) notFound();
  if ((section === "package" || section === "agent") && (slug?.length ?? 0) < 2) notFound();

  // Validate agent hosts against the canonical HOSTS registry
  if (section === "agent" && slug && slug.length > 1) {
    const hostId = slug[1]!;
    const hostExists = HOSTS.some((h) => h.id === hostId || h.id.toLowerCase() === hostId.toLowerCase());
    if (!hostExists) notFound();
  }

  // Validate docs section slugs against the known documentation registry
  if (section === "docs" && slug && slug.length > 1) {
    const docSlug = slug[1]!;
    if (!DOC_SECTIONS_META[docSlug]) notFound();
  }

  let packageInitial: PackageDetailData | undefined;
  if (section === "package" && slug && slug.length > 1) {
    // An unknown package key is a 404 for crawlers and link-checkers too.
    const resp = await packageDetail(slug.slice(1).join("/")).catch(() => null);
    if (resp && !resp.found) notFound();
    // Hand the row to the client so the first HTML holds the page itself,
    // not a skeleton waiting for /api/litespm/package. The JSON round trip
    // hands over exactly what that API route would have serialized.
    if (resp?.found && resp.detail) {
      packageInitial = JSON.parse(JSON.stringify(resp.detail)) as PackageDetailData;
    }
  }

  // Resolve the route on the server so the first response is the right page.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) query.set(key, value[0]);
  }
  const initialRoute = parsePath(`/${(slug ?? []).join("/")}`, query.toString());

  // Generate structured schema JSON-LD for packages or guides
  let jsonLd: Record<string, unknown> | null = null;
  if (section === "package" && packageInitial) {
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: packageInitial.name,
      description: packageInitial.summary,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Cross-platform (Windows, macOS, Linux)",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: {
        "@type": "Organization",
        name: packageInitial.publisher.name,
        url: packageInitial.publisher.url || undefined,
      },
    };
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <LiteSPMApp initialRoute={initialRoute} initialPackage={packageInitial} />
    </>
  );
}
