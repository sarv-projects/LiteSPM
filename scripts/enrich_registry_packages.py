#!/usr/bin/env python3
"""Reclassify the committed catalog from the live MCP Registry.

The registry's ``server.json`` publishes two launch shapes:

  * ``remotes[]``  -- a hosted endpoint (already handled by the builder);
  * ``packages[]`` -- a package locator (npm / PyPI / OCI) plus a ``stdio``
    transport. The builder used to discard these, so every local server in
    the catalog was ``discovery_only``.

This script applies the same ``package_launch`` rule the builder now uses to
an existing ``web/data/catalog.json``, and records the publisher's
``repository`` URL so the web layer stops reconstructing one from the
listing id. It is idempotent and only changes rows the registry still
serves.

Usage:
  python scripts/enrich_registry_packages.py --dry-run
  python scripts/enrich_registry_packages.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse

sys.path.insert(0, "scripts")

import build_full_catalog as producer

CATALOG = "web/data/catalog.json"
PAGE_LIMIT = 100


def fetch_page(cursor: str | None) -> dict:
    # Replay the producer's own recorded registry pages. This is the exact
    # data the committed catalog was built from, it needs no network when
    # the snapshots are present, and a missing page is fetched through the
    # producer's retrying snapshot layer rather than a bare urllib call.
    url = f"{producer.REGISTRY_API}?limit={PAGE_LIMIT}"
    if cursor:
        url += "&" + urllib.parse.urlencode({"cursor": cursor})
    body = producer._obtain_bulk(
        url, producer.REGISTRY_SOURCE, 30, False,
        "MCP registry page", attempts=4, fatal=False)
    if body is None:
        raise RuntimeError(f"registry page unavailable: {url}")
    return json.loads(body.decode("utf-8"))


def latest_servers() -> dict[str, dict]:
    """name -> latest server.json document, from every registry page."""
    latest: dict[str, dict] = {}
    cursor = None
    pages = 0
    seen_cursors = set()
    while True:
        payload = fetch_page(cursor)
        for element in payload.get("servers") or []:
            srv = producer.registry_server_of(element)
            name = srv.get("name")
            if not isinstance(name, str):
                continue
            meta = producer.registry_official_meta(element, srv)
            is_latest = producer.registry_latest_flag(meta.get("isLatest"))
            current = latest.get(name)
            if current is None:
                latest[name] = element
                continue
            cur_srv = producer.registry_server_of(current)
            cur_latest = producer.registry_latest_flag(
                producer.registry_official_meta(current, cur_srv).get("isLatest"))
            if is_latest and not cur_latest:
                latest[name] = element
            elif is_latest == cur_latest and \
                    producer.registry_version_key(srv.get("version")) > \
                    producer.registry_version_key(cur_srv.get("version")):
                latest[name] = element
        pages += 1
        cursor = (payload.get("metadata") or {}).get("nextCursor")
        if not cursor or cursor in seen_cursors:
            break
        seen_cursors.add(cursor)
        if pages % 25 == 0:
            print(f"  registry: {pages} pages, {len(latest)} servers", flush=True)
        time.sleep(0.05)
    print(f"  registry: {pages} pages, {len(latest)} latest servers")
    return latest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=CATALOG)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.apply and not args.dry_run:
        parser.error("choose --dry-run or --apply")

    rows = json.load(open(args.catalog, encoding="utf-8"))
    registry_rows = {
        row["id"]: row for row in rows
        if row.get("source") == producer.REGISTRY_SOURCE
    }
    print(f"catalog rows: {len(rows)}, registry rows: {len(registry_rows)}")
    latest = latest_servers()

    counts = {
        "scanned": 0,
        "package_launch": 0,
        "repository": 0,
        "still_discovery": 0,
        "missing_registry": 0,
    }
    by_type: dict[str, int] = {}
    for name, element in latest.items():
        srv = producer.registry_server_of(element)
        item_id = producer.canonical_id("mcp", producer.REGISTRY_SOURCE, name)
        row = registry_rows.get(item_id)
        if row is None:
            continue
        counts["scanned"] += 1
        if srv.get("repository") and isinstance(srv["repository"], dict):
            repo_url = srv["repository"].get("url")
            if isinstance(repo_url, str) and repo_url:
                if row.get("repository") != repo_url:
                    row["repository"] = repo_url
                    counts["repository"] += 1
        if row.get("installability") == producer.DISCOVERY_ONLY:
            launch = producer.package_launch(
                srv.get("packages"), srv.get("version"))
            if launch is not None:
                command, argv, transport, runtime = launch
                row["command"] = command
                row["args"] = argv
                row["transport"] = transport
                row["runtime"] = runtime
                row["installability"] = producer.METADATA_VERIFIED
                counts["package_launch"] += 1
                pkg_types = {
                    str(p.get("registryType") or "").strip().lower()
                    for p in (srv.get("packages") or [])
                    if isinstance(p, dict)
                }
                for pkg_type in pkg_types:
                    by_type[pkg_type] = by_type.get(pkg_type, 0) + 1
            else:
                counts["still_discovery"] += 1
    counts["missing_registry"] = len(registry_rows) - counts["scanned"]

    print(json.dumps({"counts": counts, "package_types": by_type}, indent=2))
    if args.apply:
        with open(args.catalog, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2)
            f.write("\n")
        print(f"wrote {args.catalog}")
    else:
        print("dry run: nothing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
