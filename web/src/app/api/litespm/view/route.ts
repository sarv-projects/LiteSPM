import { NextRequest, NextResponse } from "next/server";

import { db, databaseConfigured } from "@/lib/db";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/server/litespm/request-body";

export const dynamic = "force-dynamic";

/** Record one package view. Idempotent per linkKey — increments a counter. */
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const limit = rateLimit(`view:${ip}`, 120, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many view records. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    if (!databaseConfigured()) {
      // View counts are best-effort analytics, not a write the reader needs
      // to see fail. A 503 here shows up as a console error on every package
      // page; return an explicit skipped result instead.
      return NextResponse.json({ ok: false, skipped: "database_not_configured" });
    }

    const body = (await readJsonBody(request, 8_192)) as { linkKey?: string; kind?: string; name?: string };
    const linkKey = body.linkKey?.trim();
    if (!linkKey) {
      return NextResponse.json({ error: "linkKey is required" }, { status: 400 });
    }
    if (linkKey.length > 300) {
      return NextResponse.json({ error: "linkKey is too long" }, { status: 400 });
    }
    const kind = ["mcp", "skill", "plugin"].includes(body.kind ?? "") ? body.kind! : "mcp";
    const name = (body.name?.trim() || linkKey).slice(0, 200);

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
          kind,
          name,
          views: 1,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    }
    // View counts are analytics, not part of the read path. A configured
    // database that is unreachable must not turn every package page into a
    // console error; skip the write and keep the page successful.
    console.warn("litespm view skipped", error);
    return NextResponse.json({ ok: false, skipped: "database_unavailable" });
  }
}
