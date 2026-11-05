import { NextRequest, NextResponse } from "next/server";

import { db, databaseConfigured } from "@/lib/db";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";

export const dynamic = "force-dynamic";

const KINDS = new Set(["publisher", "listing-correction", "general"]);

/** Publish-view submissions: publisher interest and feedback. */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`feedback:${clientIp(request)}`, 5, 10 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { errors: { form: "Too many submissions. Please try again later." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    if (!databaseConfigured()) {
      return NextResponse.json(
        { errors: { form: "Feedback storage is not configured on this deployment." } },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      kind?: string;
      name?: string;
      email?: string;
      listing?: string;
      message?: string;
    };

    const kind = KINDS.has(body.kind ?? "") ? body.kind! : "general";
    const name = body.name?.trim().slice(0, 200) ?? "";
    const email = body.email?.trim().slice(0, 320) ?? "";
    const listing = body.listing?.trim().slice(0, 300) || null;
    const message = body.message?.trim().slice(0, 4000) ?? "";

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
      // Never print the submission body: name, email and message are PII.
      // Keep the error and the generated id so an operator can correlate it
      // with the user's report without copying their contact details to logs.
      console.warn("Feedback DB persistence failed", {
        kind,
        entryId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
      return NextResponse.json(
        { errors: { form: "Feedback could not be saved. Please try again shortly." } },
        { status: 503 },
      );
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
