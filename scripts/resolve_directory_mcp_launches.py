#!/usr/bin/env python3
"""Resolve directory MCP rows against the publisher manifests in the registry.

Several directory feeds (punkpeye/awesome-mcp-servers, mcpmarket.com,
mcpservers.org) publish a repository link but no launch line. The MCP Registry
carries the publisher's own server.json: a package (npx/uvx/docker) or a remote
endpoint, keyed by the repository the publisher declared. This pass copies that
launch line onto a directory row only when the evidence is exact:

  * the directory row is still `discovery_only`;
  * its publisher login and repository slug equal the registry row's GitHub
    owner and repository name (dots/underscores canonicalized the same way the
    feed parser canonicalizes slugs);
  * the registry row actually carries a launch line and a published version.

Nothing is invented: a row with no exact registry match is left alone. The
copied values are recorded under `resolvedFrom` so the dataset says where they
came from, and the row's own publisher provenance is not rewritten.

Usage:
  python scripts/resolve_directory_mcp_launches.py --check
  python scripts/resolve_directory_mcp_launches.py --write
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
import tempfile
from typing import Any, Iterable

REGISTRY_SOURCE = "builtin:mcp-registry"
DIRECTORY_SOURCES = (
    "feed:punkpeye-awesome-mcp-servers",
    "feed:mcpmarket-com",
    "feed:mcpservers-org",
)
DISCOVERY_VALUES = (None, "", "discovery_only")


def canonical_repo_name(name: str | None) -> str:
    """Match the slug canonicalization used by build_full_catalog.py."""
    value = (name or "").lower().replace(".", "-").replace("_", "-")
    value = re.sub(r"[^a-z0-9-]+", "-", value)
    return value.strip("-")


def github_parts(url: Any) -> tuple[str, str] | tuple[None, None]:
    if not isinstance(url, str):
        return None, None
    match = re.search(r"github\.com/([^/]+)/([^/#?]+)", url.lower())
    if not match:
        return None, None
    repo = re.sub(r"\.git$", "", match.group(2))
    return match.group(1), canonical_repo_name(repo)


def registry_index(rows: Iterable[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    """Best launch-bearing registry row per exact (owner, repository) key."""
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        if row.get("kind") != "mcp" or row.get("source") != REGISTRY_SOURCE:
            continue
        if row.get("installability") in DISCOVERY_VALUES:
            continue
        if not (row.get("command") or row.get("url")):
            continue
        if not row.get("version") or not row.get("transport"):
            # The release builder refuses a verified MCP row without a version
            # and a transport, so promoting one would only move the failure.
            continue
        owner, repo = github_parts(row.get("repository"))
        if not owner or not repo:
            continue
        key = (owner, repo)
        current = index.get(key)
        if current is None:
            index[key] = row
            continue
        # Prefer a package launch over a hosted endpoint when both exist: it is
        # the same publisher artifact and does not depend on a third party's
        # endpoint staying up.
        if row.get("command") and not current.get("command"):
            index[key] = row
    return index


def resolve_directory_launches(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Copy exact registry launches onto directory rows, in place.

    Returns a report with per-source counts and the evidence for every row that
    changed. The function is deterministic and idempotent: a row already above
    `discovery_only` is never touched.
    """
    index = registry_index(rows)
    report: dict[str, Any] = {
        "schema": "litespm.directory-launch-resolutions/v1",
        "registryRows": len(index),
        "considered": 0,
        "resolved": 0,
        "existingResolved": 0,
        "repositoryBackfilled": 0,
        "skippedNoVersion": 0,
        "bySource": {},
        "byLaunch": collections.Counter(),
        "resolutions": [],
    }
    for row in rows:
        if row.get("kind") != "mcp" or row.get("source") not in DIRECTORY_SOURCES:
            continue
        if row.get("installability") not in DISCOVERY_VALUES:
            # Idempotent backfill: a row resolved by an earlier run keeps the
            # registry listing id in `resolvedFrom`, but the directory feed
            # itself never carried the repository. Copy the same evidence's
            # repository onto it so the detail page links to the real source.
            resolved = row.get("resolvedFrom")
            if isinstance(resolved, dict):
                source = str(row.get("source"))
                launch = "endpoint" if row.get("url") else "command"
                report["existingResolved"] += 1
                report["byLaunch"][launch] += 1
                report["bySource"][source] = report["bySource"].get(source, 0) + 1
                report["resolutions"].append(
                    {
                        "id": row.get("id"),
                        "name": row.get("name"),
                        "source": source,
                        "registryListingId": resolved.get("listingId"),
                        "repository": resolved.get("repository"),
                        "launch": launch,
                        "alreadyResolved": True,
                    }
                )
                if not row.get("repository"):
                    listing_id = resolved.get("listingId")
                    match = next((candidate for candidate in index.values()
                                  if candidate.get("id") == listing_id), None)
                    if match is not None and match.get("repository"):
                        row["repository"] = match["repository"]
                        report["repositoryBackfilled"] = report.get("repositoryBackfilled", 0) + 1
            continue
        report["considered"] += 1
        owner = str((row.get("publisher") or {}).get("name") or "").lower()
        key = (owner, canonical_repo_name(str(row.get("slug") or "")))
        match = index.get(key)
        if match is None:
            continue
        if not match.get("version") or not match.get("transport"):
            report["skippedNoVersion"] += 1
            continue

        launch = "endpoint" if match.get("url") else "command"
        row["url"] = match.get("url")
        row["transport"] = match.get("transport")
        row["command"] = match.get("command")
        row["args"] = list(match.get("args") or []) if match.get("command") else None
        row["runtime"] = match.get("runtime")
        row["version"] = match.get("version")
        row["installability"] = "metadata_verified"
        # The feed's cloud/house emoji is a claim about hosting, not a
        # transport. Once a publisher launch line exists it would contradict it.
        row.pop("upstreamTransportHint", None)
        if match.get("repository"):
            row["repository"] = match.get("repository")
        row["resolvedFrom"] = {
            "listingId": match.get("id"),
            "repository": match.get("repository"),
            "source": REGISTRY_SOURCE,
            "evidence": "publisher-login+repository-slug",
        }

        report["resolved"] += 1
        report["byLaunch"][launch] += 1
        source = str(row.get("source"))
        report["bySource"][source] = report["bySource"].get(source, 0) + 1
        report["resolutions"].append(
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "source": source,
                "registryListingId": match.get("id"),
                "repository": match.get("repository"),
                "launch": launch,
            }
        )
    report["byLaunch"] = dict(report["byLaunch"])
    report["bySource"] = dict(sorted(report["bySource"].items()))
    return report


def load_catalog(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list):
        raise ValueError(f"{path}: expected a JSON array of catalog rows")
    return rows


def write_catalog(path: str, rows: list[dict[str, Any]]) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".catalog-", suffix=".json", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(rows, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def print_report(report: dict[str, Any]) -> None:
    print(f"Registry launch rows available: {report['registryRows']}")
    print(f"Directory discovery rows considered: {report['considered']}")
    print(f"Resolved with an exact owner+repository match: {report['resolved']}")
    if report["existingResolved"]:
        print(f"Already resolved by an earlier run: {report['existingResolved']}")
    for source, count in report["bySource"].items():
        print(f"  {source}: {count}")
    for launch, count in sorted(report["byLaunch"].items()):
        print(f"  {launch}: {count}")
    if report["repositoryBackfilled"]:
        print(f"Repository backfilled from recorded evidence: {report['repositoryBackfilled']}")
    if report["skippedNoVersion"]:
        print(f"Skipped (registry row had no version): {report['skippedNoVersion']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--catalog",
        default=os.path.join(os.path.dirname(__file__), "..", "web", "data", "catalog.json"),
        help="catalog.json to enrich (default: web/data/catalog.json)",
    )
    parser.add_argument("--write", action="store_true", help="write the enriched catalog in place")
    parser.add_argument("--check", action="store_true", help="report only; never write (default)")
    parser.add_argument("--report", default="", help="optional path for the JSON resolution report")
    args = parser.parse_args(argv)

    path = os.path.abspath(args.catalog)
    try:
        rows = load_catalog(path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"resolve_directory_mcp_launches: {exc}", file=sys.stderr)
        return 2

    report = resolve_directory_launches(rows)
    print_report(report)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
    if args.write:
        write_catalog(path, rows)
        print(f"Wrote {path}")
    else:
        print("Check only: no file was written. Pass --write to apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
