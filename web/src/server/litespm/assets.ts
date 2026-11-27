import { existsSync, readFileSync } from "node:fs";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface AssetsBinding {
  fetch: (input: RequestInfo | URL) => Promise<Response>;
}

function getAssetsBinding(): AssetsBinding | undefined {
  try {
    const ctx = getCloudflareContext();
    const env = ctx?.env as { ASSETS?: AssetsBinding } | undefined;
    return env?.ASSETS;
  } catch {
    return undefined;
  }
}

/**
 * Read a file from the local filesystem when present (Node.js dev/build),
 * falling back to Cloudflare Workers Static Assets (`env.ASSETS.fetch`).
 */
export async function readLocalOrAssetBytes(
  relAssetPath: string,
  localCandidates: string[] = [],
): Promise<Buffer | null> {
  for (const candidate of localCandidates) {
    try {
      if (existsSync(candidate)) {
        return readFileSync(candidate);
      }
    } catch {
      // Ignore fs errors in restricted runtimes and try ASSETS binding.
    }
  }

  const assets = getAssetsBinding();
  if (!assets) return null;

  const normalized = relAssetPath.replace(/^\/+/, "");
  const res = await assets.fetch(new Request(`https://assets.local/${normalized}`));
  if (!res.ok) return null;

  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

/**
 * Read and parse a JSON file from local disk or Cloudflare Workers ASSETS.
 */
export async function readLocalOrAssetJson<T>(
  relAssetPath: string,
  localCandidates: string[] = [],
): Promise<T> {
  const bytes = await readLocalOrAssetBytes(relAssetPath, localCandidates);
  if (!bytes) {
    throw new Error(`Asset not found: ${relAssetPath}`);
  }
  return JSON.parse(bytes.toString("utf8")) as T;
}
