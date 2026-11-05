#!/usr/bin/env python3
"""Refresh the Python-owned release stats after an in-place catalog edit.

`web/data/release.json` carries the digest and per-kind counts of the
dataset the site serves. A migration that changes rows must update those
values or `scripts/check_catalog_coherence.py` reports a stale release. The
signed release identity (`releaseId`, `sequence`, `manifestDigest`,
`createdAt`) is deliberately left untouched: a production publish still
requires a new release cut, but a local rebuild stays self-consistent.

Usage: python scripts/refresh_catalog_stats.py
"""

from __future__ import annotations

import hashlib
import json
import time

CATALOG = "web/data/catalog.json"
RELEASE = "web/data/release.json"


def main() -> int:
    with open(CATALOG, "rb") as f:
        raw = f.read()
    digest = hashlib.sha256(raw).hexdigest()
    rows = json.loads(raw.decode("utf-8"))
    counts = {"mcp": 0, "skill": 0, "plugin": 0}
    for row in rows:
        kind = row.get("kind")
        if kind in counts:
            counts[kind] += 1
    release = json.load(open(RELEASE, encoding="utf-8"))
    release.update({
        "itemCount": len(rows),
        "totalCapabilities": len(rows),
        "mcpServersCount": counts["mcp"],
        "agentSkillsCount": counts["skill"],
        "pluginsCount": counts["plugin"],
        "datasetDigest": f"sha256:{digest}",
        "statsUpdatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    with open(RELEASE, "w", encoding="utf-8") as f:
        json.dump(release, f, indent=2)
        f.write("\n")
    print(f"{RELEASE}: {len(rows)} rows, sha256:{digest[:12]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
