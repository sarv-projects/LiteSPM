#!/usr/bin/env python3
"""Retry the repositories that still have unresolved skills.sh rows.

The first pass hit GitHub's tarball rate limit near the end. This pass
re-reads only the repositories with unresolved rows, largest first, using
the same `HEAD` tarball the page advertises and more retries. New trees use
`/tree/HEAD/` for now; `scripts/fix_skills_sh_refs.py` rewrites them to the
repository's real default branch before the catalog is published.

Usage:
  python scripts/retry_skills_sh_sources.py --min-skills 10
  python scripts/retry_skills_sh_sources.py --all
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import time

sys.path.insert(0, "scripts")

import build_full_catalog as producer
import resolve_skills_sh_sources as resolver
import snapshot_store

CATALOG = "web/data/catalog.json"
INDEX = "web/data/skills-sh-sources.json"
WORKERS = 4


def scan_head(repo: str) -> dict:
    data, reason = resolver.download_tarball(repo, "HEAD")
    if data is None:
        return {"error": reason}
    return resolver.scan_tarball(data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-skills", type=int, default=1,
                        help="only retry repositories with at least this many unresolved rows")
    parser.add_argument("--limit-repos", type=int, default=0,
                        help="stop after this many repositories (0 = all)")
    parser.add_argument("--all", action="store_true",
                        help="retry every unresolved repository")
    parser.add_argument("--max-mb", type=int, default=30,
                        help="per-repository tarball cap in MiB")
    args = parser.parse_args()
    resolver.MAX_TARBALL = args.max_mb * 1024 * 1024

    rows = json.load(open(CATALOG, encoding="utf-8"))
    data = json.load(open(INDEX, encoding="utf-8"))
    sources = data.get("sources") or {}
    root = snapshot_store.default_root()

    targets: dict[str, list[tuple[str, str]]] = {}
    for row in rows:
        if row.get("source") != "feed:skills-sh":
            continue
        if row["id"] in sources:
            continue
        page_url = row.get("skillSource") or ""
        if "skills.sh/" not in page_url:
            continue
        try:
            page, _ = snapshot_store.load_snapshot(root, page_url)
        except Exception:
            continue
        command = resolver.install_source(page)
        if command is None:
            continue
        repo, name = command
        targets.setdefault(repo, []).append((row["id"], name))
    if not args.all:
        targets = {
            repo: wanted for repo, wanted in targets.items()
            if len(wanted) >= args.min_skills
        }
    ordered = sorted(targets.items(), key=lambda item: -len(item[1]))
    if args.limit_repos:
        ordered = ordered[: args.limit_repos]
    print(f"retry rows: {sum(len(v) for _, v in ordered)}, "
          f"repositories: {len(ordered)}", flush=True)

    scanned: dict[str, dict] = {}
    started = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(scan_head, repo): repo for repo, _ in ordered}
        for n, future in enumerate(concurrent.futures.as_completed(futures), 1):
            repo = futures[future]
            scanned[repo] = future.result()
            if n % 25 == 0:
                print(f"  {n}/{len(ordered)} repos, "
                      f"{time.time() - started:.0f}s", flush=True)

    by_id = {row["id"]: row for row in rows}
    added = 0
    for repo, wanted in ordered:
        result = scanned.get(repo) or {}
        skills = result.get("skills") or {}
        for row_id, command_name in wanted:
            key = producer.sanitize_skill_name(command_name)
            record = skills.get(key) if key else None
            if record is None:
                continue
            directory = record["path"]
            source = (f"{repo}/tree/HEAD/{directory}" if directory else repo)
            if not producer.skill_source_parses_git(source):
                continue
            sources[row_id] = {
                "source": source,
                "repo": repo,
                "skill": record["name"],
                "path": directory,
            }
            row = by_id.get(row_id)
            if row is not None:
                row["skillSource"] = source
                if isinstance(row.get("publisher"), dict):
                    row["publisher"]["url"] = source
                row["installability"] = producer.METADATA_VERIFIED
            added += 1
    print(f"resolved {added} additional rows in {time.time() - started:.0f}s")
    data["sources"] = sources
    data["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
        f.write("\n")
    print(f"wrote {INDEX} and {CATALOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
