#!/usr/bin/env python3
"""Replace the web-only `/tree/HEAD/` ref in resolved skills.sh sources.

The skills.sh pages use `HEAD` in their browse links, and the first version
of the resolver copied that convention. `git clone --branch HEAD` does not
work, so an installed row would fail after approval. This script asks each
repository for its real default branch (`git ls-remote --symref`) and
rewrites the index and catalog. A repository with no answer is demoted to
discovery-only rather than advertised as installable.

It is a one-off repair for data produced before the resolver learned to
record the default branch; new runs write the branch directly.
"""

from __future__ import annotations

import concurrent.futures
import json
import re
import subprocess
import sys

sys.path.insert(0, "scripts")

import build_full_catalog as producer

CATALOG = "web/data/catalog.json"
INDEX = "web/data/skills-sh-sources.json"
WORKERS = 6
TREE_HEAD = "/tree/HEAD/"
TREE_RE = re.compile(r"/tree/HEAD/")


def default_ref(repo: str) -> str | None:
    try:
        proc = subprocess.run(
            ["git", "ls-remote", "--symref", f"{repo}.git", "HEAD"],
            capture_output=True, text=True, timeout=30,
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    for line in proc.stdout.splitlines():
        if line.startswith("ref: refs/heads/") and line.endswith("\tHEAD"):
            return line[len("ref: refs/heads/"):-len("\tHEAD")]
    return None


def main() -> int:
    index = json.load(open(INDEX, encoding="utf-8"))
    sources = index.get("sources") or {}
    repos = sorted({
        entry["repo"] for entry in sources.values()
        if isinstance(entry, dict) and TREE_RE.search(entry.get("source", ""))
    })
    print(f"resolved rows: {len(sources)}, repositories to repair: {len(repos)}")
    refs: dict[str, str | None] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for repo, ref in zip(repos, pool.map(default_ref, repos)):
            refs[repo] = ref
    missing = sum(1 for ref in refs.values() if not ref)
    print(f"default branches: {len(refs) - missing} found, {missing} missing")

    rows = json.load(open(CATALOG, encoding="utf-8"))
    by_id = {row["id"]: row for row in rows}
    changed = demoted = 0
    for row_id, entry in sources.items():
        if not isinstance(entry, dict):
            continue
        source = entry.get("source") or ""
        if TREE_HEAD not in source:
            continue
        ref = refs.get(entry.get("repo"))
        if not ref:
            row = by_id.get(row_id)
            if row is not None and row.get("installability") == producer.METADATA_VERIFIED:
                row["installability"] = producer.DISCOVERY_ONLY
                demoted += 1
            continue
        new_source = source.replace(TREE_HEAD, f"/tree/{ref}/")
        entry["source"] = new_source
        entry["ref"] = ref
        row = by_id.get(row_id)
        if row is not None:
            row["skillSource"] = new_source
            if isinstance(row.get("publisher"), dict):
                row["publisher"]["url"] = new_source
        changed += 1

    print(f"rewritten: {changed}, demoted (no branch): {demoted}")
    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
        f.write("\n")
    print(f"wrote {INDEX} and {CATALOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
