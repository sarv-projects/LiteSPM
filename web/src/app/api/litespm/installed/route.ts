import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

/**
 * Local install inventory for the marketplace's "Installed" tab.
 *
 * The catalog is online, but installs live on this machine. The CLI owns that
 * truth (`litespm list --json`), so this route invokes it read-only and returns
 * its document. A deployed site has no local CLI: the route then answers
 * `available: false` and the page tells the reader to run the command locally
 * instead of pretending the list is empty.
 */
export async function GET() {
  const bin = process.env.LITESPM_BIN?.trim() || "litespm";
  try {
    const { stdout } = await execFileAsync(bin, ["list", "--json"], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    const report = JSON.parse(stdout) as unknown;
    return NextResponse.json({ available: true, report });
  } catch {
    return NextResponse.json({
      available: false,
      reason: "litespm_cli_unavailable",
      command: "litespm list --json",
    });
  }
}
