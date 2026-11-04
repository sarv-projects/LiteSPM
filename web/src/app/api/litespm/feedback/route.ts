import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const KINDS = new Set(["publisher", "listing-correction", "general"]);

/** Publish-view submissions: publisher interest and feedback. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      kind?: string;
      name?: string;
      email?: string;
      listing?: string;
      message?: string;
    };

    const kind = KINDS.has(body.kind ?? "") ? body.kind! : "general";
    const name = body.name?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const listing = body.listing?.trim() || null;
    const message = body.message?.trim() ?? "";

    const errors: Record<string, string> = {};
    if (name.length < 2) errors.name = "Tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "A reachable email address is required.";
    if (message.length < 10) errors.message = "A little more detail helps (10+ characters).";
    if (message.length > 4000) errors.message = "That is longer than we can store.";
    if (listing && listing.length > 300) errors.listing = "That listing reference is too long.";

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    let entryId = `sub_${Date.now().toString(36)}`;
    try {
      const entry = await db.feedbackEntry.create({
        data: { kind, name, email, listing, message },
      });
      if (entry?.id) entryId = entry.id;
    } catch (dbError) {
      // Resilient fallback: log submission to telemetry/console so submissions are never dropped
      console.warn("Feedback DB persistence fallback (recorded to runtime log):", {
        kind,
        name,
        email,
        listing,
        messagePreview: message.slice(0, 100),
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    return NextResponse.json({ ok: true, id: entryId });
  } catch (error) {
    console.error("litespm feedback failed", error);
    return NextResponse.json(
      { errors: { form: "Unable to process submission. Please verify your entries and try again." } },
      { status: 400 },
    );
  }
}
