#!/usr/bin/env python3
"""Fail before a deploy bundle can exceed Cloudflare Pages' published limits.

Nothing checked this. `scripts/audit-pages-dist.sh` verified the release tree's
digest chain and scanned for leaked source, but neither it nor CI counted the
files or measured the largest asset — so a change that pushed the bundle past a
limit would upload, fail at `wrangler deploy`, and report it as a CDN problem
rather than as an asset budget that was quietly spent.

The numbers below are read from Cloudflare's own limits page, not assumed:

  https://developers.cloudflare.com/pages/platform/limits/
  (last updated 2026-09-05)

  Free plan   20,000 files per site        25 MiB per asset
  Paid plan  100,000 files per site        25 MiB per asset
              (the higher count needs PAGES_WRANGLER_MAJOR_VERSION=4)

Also worth keeping in view, because it is what rules out one obvious idea:
**builds time out after 20 minutes.** Emitting a static page per catalog entry
(69,376 of them) would blow that long before it approached either file limit.

This script answers "how much of the budget is spent" as well as "is it over",
so the answer is visible before it becomes a failure. `--plan paid` checks
against the 100,000-file ceiling instead.

**It also fails before the budget is spent, not only after.** Checking only the
hard limit means the last safe build and the first rejected one are the same
build: `wrangler deploy` refuses an over-limit upload and reports it as a CDN
problem, which is the exact misdiagnosis this script exists to prevent. The
catalog grew ~12x in a single release, and the largest shard now sits at
**80% of the per-asset ceiling**, so "next release will probably fit" is not a
plan. `--headroom` (default 0.90) fails once a limit is that close, naming how
much room is left and what to do; `--headroom 1.0` restores the old
over-the-line-only behaviour.

Usage: scripts/check_pages_limits.py <bundle-dir> [--plan free|paid] [--headroom 0.90]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

DOCS = "https://developers.cloudflare.com/pages/platform/limits/"
DOCS_DATE = "2026-09-05"

MAX_FILES = {"free": 20_000, "paid": 100_000}
MAX_ASSET_BYTES = 25 * 1024 * 1024
BUILD_TIMEOUT_MINUTES = 20
DEFAULT_HEADROOM = 0.90


def _stale_release_hint(root: str, name: str) -> str | None:
    """Explain an oversized asset that belongs to a release this bundle never ships.

    `web/out` is a Next.js export, not an upload root: it carries whatever the
    gitignored `web/public/v1` tree last held, while `deploy-pages.sh` deletes that
    exported copy (`rm -rf "$PAGES_DIR/v1"`) and re-materializes only the release the
    pointer names. Auditing the export therefore reports releases that cannot reach
    the CDN, and the honest answer is "wrong directory", not "shard this file".
    """
    parts = name.split("/")
    if len(parts) < 3 or parts[0] != "v1" or parts[1] != "releases":
        return None
    offender = parts[2]
    try:
        with open(os.path.join(root, "v1", "current.json"), encoding="utf-8") as handle:
            declared = json.load(handle).get("releaseId")
    except (OSError, ValueError):
        return None
    if not declared or declared == offender:
        return None
    return (
        f"\nNote: this bundle's pointer names {declared!r}, but the oversized asset is in\n"
        f"{offender!r} — a release this bundle does not ship. An export directory such as\n"
        f"`web/out` keeps whatever the gitignored `web/public/v1` tree last held, while\n"
        f"`scripts/deploy-pages.sh` drops that copy (`rm -rf \"$PAGES_DIR/v1\"`) and rebuilds it\n"
        f"from the pointer. If that is what happened here, audit the directory the deploy uploads."
    )


def main() -> int:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("bundle", help="directory to measure (the Pages upload root)")
    parser.add_argument("--plan", choices=sorted(MAX_FILES), default="free")
    parser.add_argument(
        "--headroom",
        type=float,
        default=DEFAULT_HEADROOM,
        help=(
            "fraction of a limit at which to fail early rather than wait for "
            f"wrangler to reject the upload (default {DEFAULT_HEADROOM}; 1.0 = only fail when over)"
        ),
    )
    args = parser.parse_args()

    if not 0 < args.headroom <= 1:
        print(f"--headroom must be in (0, 1]; got {args.headroom}")
        return 2

    root = args.bundle
    if not os.path.isdir(root):
        print(f"usage: {os.path.basename(__file__)} <bundle-dir>  ({root!r} is not a directory)")
        return 2

    file_limit = MAX_FILES[args.plan]
    files: list[tuple[int, str]] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            path = os.path.join(dirpath, name)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            files.append((size, os.path.relpath(path, root)))

    if not files:
        print(f"FAIL {root} contains no files — refusing to call an empty bundle compliant")
        return 1

    count = len(files)
    largest_size, largest_name = max(files)
    total = sum(size for size, _ in files)

    over = []
    near = []
    if count > file_limit:
        over.append(
            f"{count:,} files exceeds the {args.plan}-plan limit of {file_limit:,} "
            f"(over by {count - file_limit:,})"
        )
    elif count > file_limit * args.headroom:
        near.append(
            f"{count:,} files is {count / file_limit * 100:.1f}% of the {args.plan}-plan limit of "
            f"{file_limit:,} — {file_limit - count:,} file(s) of headroom left"
        )
    if largest_size > MAX_ASSET_BYTES:
        over.append(
            f"largest asset {largest_name!r} is {largest_size / 1048576:.2f} MiB, over the "
            f"{MAX_ASSET_BYTES / 1048576:.0f} MiB per-asset limit"
        )
    elif largest_size > MAX_ASSET_BYTES * args.headroom:
        near.append(
            f"largest asset {largest_name!r} is {largest_size / 1048576:.2f} MiB — "
            f"{largest_size / MAX_ASSET_BYTES * 100:.1f}% of the "
            f"{MAX_ASSET_BYTES / 1048576:.0f} MiB per-asset limit, only "
            f"{(MAX_ASSET_BYTES - largest_size) / 1048576:.2f} MiB of headroom left"
        )

    problems = [f"OVER: {p}" for p in over] + [
        f"nearly out of room: {p}" for p in near
    ]

    print(f"Cloudflare Pages limits ({DOCS}, as of {DOCS_DATE}):")
    print(f"  files : {count:,} / {file_limit:,}  ({count / file_limit * 100:.1f}% of the plan)")
    print(
        f"  asset : {largest_size / 1048576:.2f} MiB / {MAX_ASSET_BYTES / 1048576:.0f} MiB "
        f"({largest_size / MAX_ASSET_BYTES * 100:.1f}%)  largest: {largest_name}"
    )
    print(f"  total : {total / 1048576:.1f} MiB across {count:,} files (no documented cap)")
    print(f"  build : {BUILD_TIMEOUT_MINUTES} min per build (a build that emits a page per")
    print(f"          catalog entry will hit this long before either limit above)")

    if problems:
        print(f"\nFAIL {len(problems)} Pages budget problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        hint = _stale_release_hint(root, largest_name) if largest_size > MAX_ASSET_BYTES else None
        if hint:
            print(hint)
        if over:
            print(
                "\nShard or drop the offending assets before deploying; `wrangler deploy` would "
                "reject the upload and report it without naming the budget."
            )
        else:
            print(
                "\nNothing here is over a limit yet — `wrangler deploy` would still accept this "
                "bundle. It fails now because the budget is nearly spent and the next catalog "
                "growth may not fit. Re-run with `--headroom 1.0` to check only the hard limits."
            )
        return 1

    print(f"\nOK {root} is inside the {args.plan}-plan limits")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # `| head` closes the pipe mid-report. Python turns that into a
        # traceback by default, which would read as a failure in a CI log.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
