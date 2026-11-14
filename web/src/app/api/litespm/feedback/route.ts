import { NextRequest, NextResponse } from "next/server";

import { db, databaseConfigured } from "@/lib/db";
import { clientIp, rateLimit } from "@/server/litespm/rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/server/litespm/request-body";

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
    const body = (await readJsonBody(request, 16 * 1024)) as {
      kind?: string;
      name?: string;
      email?: string;
      listing?: string;
      message?: string;
    };
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    const rawListing = typeof body.listing === "string" ? body.listing.trim() : "";
    const rawMessage = typeof body.message === "string" ? body.message.trim() : "";

    const errors: Record<string, string> = {};
    if (rawName.length < 2) errors.name = "Tell us your name.";
    else if (rawName.length > 200) errors.name = "That name is too long.";
    if (rawEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) errors.email = "A reachable email address is required (maximum 320 characters).";
    if (rawMessage.length < 10) errors.message = "A little more detail helps (10+ characters).";
    else if (rawMessage.length > 4000) errors.message = "That is longer than we can store.";
    if (rawListing.length > 300) errors.listing = "That listing reference is too long.";

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const kind = KINDS.has(body.kind ?? "") ? body.kind! : "general";
    const name = rawName;
    const email = rawEmail;
    const listing = rawListing || null;
    const message = rawMessage;

    if (!databaseConfigured()) {
      const issueTitle = encodeURIComponent(`[Publish/Feedback] ${listing || kind}: ${name}`);
      const issueBody = encodeURIComponent(
        `### Submission Details\n\n- **Kind:** ${kind}\n- **Name:** ${name}\n- **Email:** ${email}\n- **Listing:** ${listing || "None"}\n\n### Details\n${message}\n\n---\n*Submitted via LiteSPM web form (storage unconfigured fallback)*`
      );
      const fallbackUrl = `https://github.com/sarv-projects/LiteSPM/issues/new?title=${issueTitle}&body=${issueBody}`;
      return NextResponse.json({
        ok: true,
        id: `gh_${Date.now().toString(36)}`,
        fallback: true,
        fallbackUrl,
        message: "Database storage is not active on this deployment. Please click to open your pre-filled submission on GitHub Issues.",
      });
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
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ errors: { form: "Request body is too large." } }, { status: 413 });
    }
    console.error("litespm feedback failed", error);
    return NextResponse.json(
      { errors: { form: "Unable to process submission. Please verify your entries and try again." } },
      { status: 400 },
    );
  }
}
