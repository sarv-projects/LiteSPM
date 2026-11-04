import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getDataset } from "@/server/litespm/dataset";

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
      return NextResponse.json({ items: [] });
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
          installable:
            row.installability !== undefined &&
            row.installability !== "discovery_only" &&
            !(row.kind === "mcp" && !row.transport) &&
            !(row.kind === "plugin" && !(row.artifact?.pinned && row.artifact?.type === "git-tree")),
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
