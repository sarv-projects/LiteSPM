import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Record one package view. Idempotent per linkKey — increments a counter. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { linkKey?: string; kind?: string; name?: string };
    const linkKey = body.linkKey?.trim();
    if (!linkKey) {
      return NextResponse.json({ error: "linkKey is required" }, { status: 400 });
    }
    const existing = await db.packageView.findUnique({ where: { linkKey } });
    if (existing) {
      await db.packageView.update({
        where: { linkKey },
        data: { views: { increment: 1 }, lastViewedAt: new Date() },
      });
    } else {
      await db.packageView.create({
        data: {
          linkKey,
          kind: body.kind ?? "mcp",
          name: body.name ?? linkKey,
          views: 1,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("litespm view failed", error);
    return NextResponse.json({ error: "Failed to record the view" }, { status: 500 });
  }
}
