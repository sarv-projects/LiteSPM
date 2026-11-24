import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  // Both scripts are tracked public artifacts and copied into standalone builds.
  // A single literal path avoids tracing the entire project/parent directory.
  let content = "";
  try { content = fs.readFileSync(path.join(process.cwd(), "public", "install.sh"), "utf-8"); } catch { /* retain explicit 500 response */ }

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
