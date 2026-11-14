import type { MetadataRoute } from "next";
import { availabilityOf } from "@/server/litespm/availability";
import { getDataset } from "@/server/litespm/dataset";

const SITE_ORIGIN = "https://lite-spm-nine.vercel.app";

const DOC_SECTIONS = [
  "introduction",
  "getting-started",
  "commands",
  "install-flow",
  "hosts",
  "in-agent-marketplace",
  "agent-compatibility",
  "security",
  "methodology",
  "publishing",
  "troubleshooting",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_ORIGIN;
  let releaseDate = new Date("2026-11-05T00:00:00Z");

  try {
    const ds = await getDataset();
    if (ds.release?.createdAt) {
      releaseDate = new Date(ds.release.createdAt);
    }
  } catch {}

  // Core primary routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: releaseDate,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/marketplace`,
      lastModified: releaseDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/bundles`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/agents`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/insights`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/publish`,
      lastModified: releaseDate,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Documentation sections are real, linkable pages.
  for (const id of DOC_SECTIONS) {
    routes.push({
      url: `${baseUrl}/docs/${id}`,
      lastModified: releaseDate,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  try {
    const dataset = await getDataset();

    // Index popular agent hosts
    for (const host of dataset.hosts) {
      routes.push({
        url: `${baseUrl}/agent/${encodeURIComponent(host.id)}`,
        lastModified: releaseDate,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // The 500 best-ranked listings `litespm install` can actually complete,
    // by the one shared availability rule (not a local copy of it).
    const topPackages = dataset.rows
      .filter((r) => availabilityOf(r).installable)
      .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
      .slice(0, 500);

    for (const pkg of topPackages) {
      routes.push({
        url: `${baseUrl}/package/${encodeURIComponent(pkg.linkKey || pkg.slug || pkg.id)}`,
        lastModified: releaseDate,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (e) {
    console.error("Failed to augment sitemap with catalog packages", e);
  }

  return routes;
}
