import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const candidates = [
    path.join(process.cwd(), "public", "install.ps1"),
    path.join(process.cwd(), "web", "public", "install.ps1"),
    path.join(process.cwd(), "..", "scripts", "install.ps1"),
    path.join(process.cwd(), "scripts", "install.ps1"),
  ];

  let content = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        content = fs.readFileSync(c, "utf-8");
        break;
      } catch {
        // try next
      }
    }
  }

  if (!content) {
    return new NextResponse("Write-Error 'LiteSPM installer temporarily unavailable'; exit 1\n", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
