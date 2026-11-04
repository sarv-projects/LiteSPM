import type { MetadataRoute } from "next";
import { getDataset } from "@/server/litespm/dataset";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://lite-spm-nine.vercel.app";
  const now = new Date();

  // Core primary routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/agents`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/insights`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/publish`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  try {
    const dataset = await getDataset();

    // Index popular agent hosts
    for (const host of dataset.hosts.slice(0, 30)) {
      routes.push({
        url: `${baseUrl}/agents/${encodeURIComponent(host.id)}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // Index top verified installable packages (up to top 500 to keep sitemap lightning fast and high quality)
    const topPackages = dataset.rows
      .filter((r) => r.installability !== "discovery_only" || (r.artifact?.pinned && r.kind === "plugin") || Boolean(r.url))
      .slice(0, 500);

    for (const pkg of topPackages) {
      routes.push({
        url: `${baseUrl}/package/${encodeURIComponent(pkg.linkKey || pkg.slug || pkg.id)}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (e) {
    console.error("Failed to augment sitemap with catalog packages", e);
  }

  return routes;
}
