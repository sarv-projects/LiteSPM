import { NextRequest, NextResponse } from "next/server";

import { getDataset } from "@/server/litespm/dataset";
import { availabilityOf } from "@/server/litespm/availability";
import { hostsNamedBy } from "@/server/litespm/identity";
import { classifyListing, GOAL_LABELS } from "@/server/litespm/taxonomy";

export const dynamic = "force-dynamic";

export interface CompareColumn {
  linkKey: string;
  name: string;
  kind: "mcp" | "skill" | "plugin";
  summary: string;
  category: string;
  goalLabel: string;
  publisher: string;
  publisherVerified: boolean;
  source: string;
  installable: boolean;
  availabilityLabel: string;
  installCommand: string;
  transport: string | null;
  runtime: string | null;
  url: string | null;
  version: string | null;
  hosts: string[];
  hostCount: number;
  pinned: boolean;
  artifactRepo: string | null;
  artifactRef: string | null;
  rankScore: number;
  typeSpecificHint: string;
  toolsCount: number;
}

export async function GET(request: NextRequest) {
  try {
    const keysParam = request.nextUrl.searchParams.get("keys") ?? "";
    const keys = keysParam
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 4);

    if (keys.length === 0) {
      return NextResponse.json({ columns: [] });
    }

    const dataset = await getDataset();
    const columns: CompareColumn[] = [];

    for (const key of keys) {
      const decoded = decodeURIComponent(key).trim();
      const row = dataset.byKey.get(decoded) ?? dataset.byId.get(decoded);
      if (!row) continue;
      const availability = availabilityOf(row);
      const hosts = hostsNamedBy(row);
      columns.push({
        linkKey: row.linkKey ?? row.slug,
        name: row.name,
        kind: row.kind,
        summary: row.summary ?? "",
        category: row.category ?? "",
        goalLabel: GOAL_LABELS[classifyListing(row)] ?? "",
        publisher: row.publisher?.name ?? "",
        publisherVerified: Boolean(row.publisher?.verified),
        source: row.source ?? "",
        installable: availability.installable,
        availabilityLabel: availability.label,
        installCommand: `litespm install ${row.id}`,
        transport: row.transport ?? null,
        runtime: row.runtime ?? null,
        url: row.url ?? null,
        version: row.version ?? null,
        hosts: hosts.slice(0, 8).map((h) => h.name),
        hostCount: hosts.length,
        pinned: Boolean(row.artifact?.pinned),
        artifactRepo: row.artifact?.repo ?? null,
        artifactRef: row.artifact?.ref ?? null,
        rankScore: row.rankScore ?? 0,
        toolsCount: row.tools?.length ?? 0,
        typeSpecificHint:
          row.kind === "mcp"
            ? `${row.transport || "stdio"} transport · ${row.url ? "Remote URL" : "Local process"}`
            : row.kind === "skill"
            ? (row.readme?.includes("TRIGGER") || row.summary?.includes("TRIGGER")
                ? "Trigger & skip rules defined"
                : "Declarative agent skill")
            : (row.artifact?.pinned
                ? "Pinned immutable manifest"
                : "Unpinned — not installable"),
      });
    }

    return NextResponse.json({ columns });
  } catch (error) {
    console.error("litespm compare failed", error);
    return NextResponse.json({ error: "Failed to compare packages" }, { status: 500 });
  }
}
