#!/usr/bin/env python3
"""Assert that the site's catalog, the release stats and the pointer agree.

`web/README.md` §7 records this as a truthfulness gap: the builders *print*
row counts and nothing asserts them against each other, so `data/catalog.json`
can drift away from the release it claims to describe while every build stays
green. That is not hypothetical — the 2026-10-08 audit's finding F33 was
exactly this shape (a dirty 46,166-row dataset beside a checked-in 5,825-row
release), and it was only caught by a human reading two numbers side by side.

These three files are written by two different programs in two different
languages (Python for the dataset, Go for the pointer), which is precisely why
nothing until now compared them:

  web/data/catalog.json       the row set the site searches        (Python)
  web/data/release.json       the stats the site displays          (Python)
  web/public/v1/current.json  the pointer every client verifies    (Go)

Exits 0 when they agree, 1 with one line per disagreement otherwise. No
network, no dependencies beyond the standard library.

Usage: scripts/check_catalog_coherence.py [--root <dir>]

`--root` exists so the failure path can actually be exercised: a check that has
never been seen to fail is not evidence. Point it at a copy of the tree with one
number changed and it must exit 1.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter

DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_parser = argparse.ArgumentParser(add_help=True)
_parser.add_argument("--root", default=DEFAULT_ROOT, help="repository root to check")
ROOT = os.path.abspath(_parser.parse_args().root)

CATALOG = os.path.join(ROOT, "web", "data", "catalog.json")
RELEASE = os.path.join(ROOT, "web", "data", "release.json")
POINTER = os.path.join(ROOT, "web", "public", "v1", "current.json")


def load(path: str):
    if not os.path.exists(path):
        fail(f"{os.path.relpath(path, ROOT)} is missing")
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as err:
        fail(f"{os.path.relpath(path, ROOT)} is not valid JSON: {err}")


PROBLEMS: list[str] = []


def fail(message: str) -> None:
    PROBLEMS.append(message)


def main() -> int:
    rows = load(CATALOG)
    release = load(RELEASE)
    pointer = load(POINTER)

    if not isinstance(rows, list):
        print(f"FAIL {os.path.relpath(CATALOG, ROOT)} is not a JSON array")
        return 1

    total = len(rows)
    by_kind = Counter(r.get("kind") for r in rows)

    # --- the release stats describe the dataset that is actually on disk -----
    for key in ("itemCount", "totalCapabilities"):
        value = release.get(key)
        if value is not None and value != total:
            fail(f"release.json {key}={value} but catalog.json holds {total} rows")

    # The three per-kind counts must both sum to the total and match the rows.
    kind_keys = {"mcpServersCount": "mcp", "agentSkillsCount": "skill", "pluginsCount": "plugin"}
    present = {k: v for k, v in kind_keys.items() if release.get(k) is not None}
    if present:
        for key, kind in present.items():
            if release[key] != by_kind.get(kind, 0):
                fail(
                    f"release.json {key}={release[key]} but catalog.json holds "
                    f"{by_kind.get(kind, 0)} {kind} row(s)"
                )
        summed = sum(release[k] for k in present)
        if summed != total:
            fail(
                f"release.json per-kind counts sum to {summed}, not {total} "
                f"(kinds: {dict(by_kind)})"
            )

    # --- the pointer names the same release the stats describe --------------
    if pointer.get("itemCount") != total:
        fail(
            f"v1/current.json itemCount={pointer.get('itemCount')} but catalog.json "
            f"holds {total} rows"
        )
    if release.get("releaseId") and pointer.get("releaseId") != release.get("releaseId"):
        fail(
            f"v1/current.json releaseId={pointer.get('releaseId')!r} but release.json "
            f"names {release.get('releaseId')!r}"
        )
    if release.get("sequence") is not None and pointer.get("sequence") != release.get("sequence"):
        fail(
            f"v1/current.json sequence={pointer.get('sequence')} but release.json "
            f"names {release.get('sequence')}"
        )

    # --- our own generated fields must not send the user to another tool ----
    #
    # `installHint` is a field WE write (`scripts/build_full_catalog.py`), so it
    # is a statement of ours. When it named `npx skills add …` the site shipped a
    # copyable command telling users to install with a competitor's CLI, and it
    # survived a generator fix because the tracked artifact was stale -- the
    # generator is not diff-gated, so nothing caught it. This check is the
    # missing gate.
    #
    # Scoped deliberately to `installHint` ONLY. The 12 upstream `summary`
    # values that also mention `npx skills` are publisher-authored text: quoting
    # a publisher is provenance, and rewriting it would falsify the record. The
    # distinction is whose sentence it is, so the check must not be widened.
    FOREIGN_INSTALLERS = ("npx skills", "npx add-mcp", "claude plugin install")
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        hint = row.get("installHint")
        if not isinstance(hint, str) or not hint:
            continue
        # A host's own plugin command is an honest fallback, not a leak: the
        # marketplace is the host's, and LiteSPM cannot install plugins at all
        # (it fails closed with LPSM-ARTIFACT-UNAVAILABLE), so handing over the
        # upstream command is the correct behaviour -- provided the site says
        # why, which AddSteps does.
        if hint.startswith("/plugin install"):
            continue
        if any(foreign in hint.lower() for foreign in FOREIGN_INSTALLERS):
            fail(
                f"catalog.json item {index} ({row.get('id')}) has an installHint naming "
                f"another tool's installer: {hint!r}. installHint is our own field and must "
                f"install with LiteSPM itself -- fix the emitter in "
                f"scripts/build_full_catalog.py and re-run the producer"
            )
            continue
        if not hint.startswith("litespm "):
            fail(
                f"catalog.json item {index} ({row.get('id')}) has an installHint that is "
                f"neither a `litespm …` command nor a host plugin command: {hint!r}"
            )

    if PROBLEMS:
        print(f"FAIL catalog coherence — {len(PROBLEMS)} disagreement(s):")
        for problem in PROBLEMS:
            print(f"  - {problem}")
        print(
            "\nThese files are written by different programs; re-run the producer and "
            "`litespm catalog build` rather than editing one to match the other."
        )
        return 1

    kinds = " + ".join(f"{by_kind[k]:,} {k}" for k in ("mcp", "skill", "plugin") if by_kind.get(k))
    print(
        f"OK catalog coherence — {total:,} rows ({kinds or 'no kinds'}), "
        f"release {release.get('releaseId')} sequence {release.get('sequence')}, "
        f"pointer agrees"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
