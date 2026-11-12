/**
 * Curated bundles, resolved against the dataset.
 *
 * `data/bundles.json` is editorial (title, blurb, audience, difficulty and the
 * list of listing ids). Everything a card prints about an item - its name,
 * kind, publisher, summary and whether it installs - is read from the catalog
 * row, never restated. `scripts/check-bundles.mjs` fails the lint when an id
 * is missing or not installable, so a bundle that reaches production only
 * ever lists installable rows; an item that has gone missing is dropped here
 * rather than rendered half-empty.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { availabilityOf } from "./availability";
import { getDataset } from "./dataset";
import { HOSTS } from "./hosts";
import { hostIdsFor } from "./identity";
import type { BundleDifficulty, BundleItem, BundlesResponse } from "@/lib/litespm/types";

interface BundleFile {
  bundles: Array<{
    id: string;
    title: string;
    blurb: string;
    difficulty: BundleDifficulty;
    audience: string;
    items: string[];
  }>;
}

function readBundleFile(): BundleFile {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "bundles.json"), "utf8")) as BundleFile;
}

function clip(text: string | undefined, max = 180): string {
  const value = (text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export async function getBundles(): Promise<BundlesResponse> {
  const [dataset, file] = [await getDataset(), readBundleFile()];

  const bundles = file.bundles.map((bundle) => {
    const items: BundleItem[] = [];
    for (const id of bundle.items) {
      const row = dataset.byId.get(id);
      if (!row) continue;
      const availability = availabilityOf(row);
      items.push({
        id: row.id,
        linkKey: row.linkKey ?? row.slug,
        name: row.name,
        kind: row.kind,
        publisher: row.publisher?.name ?? "",
        verified: Boolean(row.publisher?.verified),
        summary: clip(row.summary),
        installable: availability.installable,
        availability: availability.label,
        hostIds: hostIdsFor(row),
      });
    }
    return { ...bundle, items };
  });

  return {
    bundles,
    // Agent hosts a visitor can target with `--agent <id>`: the registry's adapters.
    agents: HOSTS.map((host) => ({ id: host.id, name: host.name })),
  };
}
