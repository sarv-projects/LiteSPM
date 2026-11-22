import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { availabilityOf } from "@/server/litespm/availability";
import { getDataset } from "@/server/litespm/dataset";
import TRENDING_DATA from "@/lib/litespm/trending-leaderboard.json";

export const dynamic = "force-dynamic";

/**
 * The most-viewed listings of this deployment, joined back onto the catalog so
 * the cards carry full data. Rows with no recorded views are absent — an empty
 * table means nobody has opened a package yet, and that is the honest answer.
 */
export async function GET() {
  try {
    const top = await db.packageView.findMany({
      orderBy: [{ views: "desc" }, { lastViewedAt: "desc" }],
      take: 12,
    });

    if (top.length === 0) {
      const fallbackItems = [
        ...TRENDING_DATA.topSkills.slice(0, 6).map((s) => ({
          linkKey: s.linkKey,
          name: s.name,
          kind: s.kind,
          summary: s.summary,
          category: "Agent Skills",
          publisher: s.repo,
          publisherVerified: true,
          installable: true,
          views: s.weeklyInstalls,
          metricLabel: `${(s.weeklyInstalls / 1000).toFixed(1)}k installs/wk (skills.sh)`,
        })),
        ...TRENDING_DATA.topMcp.slice(0, 6).map((m) => ({
          linkKey: m.linkKey,
          name: m.name,
          kind: m.kind,
          summary: m.summary,
          category: m.category,
          publisher: m.repo,
          publisherVerified: true,
          installable: true,
          views: m.stars,
          metricLabel: `${(m.stars / 1000).toFixed(1)}k stars (GitHub)`,
        })),
      ];
      return NextResponse.json({
        items: fallbackItems,
        source: "skills.sh & GitHub Stars verified leaderboard",
      });
    }

    const dataset = await getDataset();
    const items = top
      .map((view) => {
        const row = dataset.byKey.get(view.linkKey) ?? dataset.byId.get(view.linkKey);
        if (!row) return null;
        return {
          linkKey: row.linkKey ?? row.slug,
          name: row.name,
          kind: row.kind,
          summary: row.summary ?? "",
          category: row.category ?? "",
          publisher: row.publisher?.name ?? "",
          publisherVerified: Boolean(row.publisher?.verified),
          installable: availabilityOf(row).installable,
          views: view.views,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({ items });
  } catch (error) {
    console.warn("litespm trending database query failed, falling back to empty list:", error);
    return NextResponse.json({ items: [] });
  }
}
