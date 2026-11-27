import { NextResponse } from "next/server";
import path from "node:path";
import { readLocalOrAssetBytes } from "@/server/litespm/assets";

export async function GET() {
  let content = "";
  try {
    const bytes = await readLocalOrAssetBytes("install.sh", [
      path.join(process.cwd(), "public", "install.sh"),
    ]);
    if (bytes) content = bytes.toString("utf8");
  } catch {
    /* retain explicit 500 response */
  }

  if (!content) {
    return new NextResponse("#!/bin/sh\necho 'LiteSPM installer temporarily unavailable'; exit 1;\n", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
