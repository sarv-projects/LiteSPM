import type { Metadata } from "next";
import { LiteSPMApp } from "@/components/litespm/app";
import { getPackageDetail } from "@/server/litespm/package-detail";

interface Props {
  params: Promise<{ slug?: string[] }>;
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
      const resp = await getPackageDetail(key);
      if (resp.found && resp.detail) {
        const title = `${resp.detail.name} — LiteSPM`;
        const description =
          resp.detail.summary ||
          `Install ${resp.detail.name} into 50 supported AI agent hosts with LiteSPM.`;
        return {
          title,
          description,
          openGraph: {
            title,
            description,
            type: "article",
            url: `https://lite-spm-nine.vercel.app/package/${encodeURIComponent(key)}`,
          },
          twitter: {
            card: "summary_large_image",
            title,
            description,
          },
        };
      }
    } catch {}
    return {
      title: "Package Details · LiteSPM",
      description: "View package details and installation instructions.",
    };
  }

  if (section === "marketplace") {
    return {
      title: "Marketplace - LiteSPM",
      description:
        "Search installable MCP servers, agent skills and plugins, and copy the exact litespm install command.",
    };
  }

  if (section === "explore") {
    return {
      title: "Explore MCP Servers, Skills & Plugins · LiteSPM",
      description: "Search 69k+ listings across 50 agent hosts.",
    };
  }

  if (section === "agents") {
    return {
      title: "Supported Agent Hosts · LiteSPM",
      description: "Explore 50 agent hosts supported by LiteSPM.",
    };
  }

  if (section === "agent" && slug.length > 1) {
    return {
      title: `${slug[1]} · Supported Agent Host · LiteSPM`,
      description: `Configure MCP servers and skills for ${slug[1]} with LiteSPM.`,
    };
  }

  if (section === "insights") {
    return {
      title: "Catalog Insights & Analytics · LiteSPM",
      description: "Real-time statistics, distributions, and trust metrics.",
    };
  }

  if (section === "docs") {
    return {
      title: "Documentation · LiteSPM",
      description: "Guides, tutorials, and references for the LiteSPM package manager.",
    };
  }

  if (section === "publish") {
    return {
      title: "Publish a Listing · LiteSPM",
      description: "Submit your MCP server, skill, or plugin to the LiteSPM catalog.",
    };
  }

  if (section === "compare") {
    return {
      title: "Compare Packages · LiteSPM",
      description: "Compare capabilities, permissions, and compatibility side by side.",
    };
  }

  return {
    title: "LiteSPM — The package manager for AI agents",
  };
}

export default function CatchAllPage() {
  return <LiteSPMApp />;
}
