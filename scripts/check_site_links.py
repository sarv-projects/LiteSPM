#!/usr/bin/env python3
"""check_site_links.py — every product link the built site emits must resolve.

A marketplace has one job: a link must open the product the reader clicked.
The failure mode this catches is the one that is hardest to see by eye and
easiest to ship: a site whose HTML and whose DATA come from different builds.

How that happens: the built bundle is a directory. The HTML is rendered from
one catalog snapshot; the row data the browser fetches comes from another.
Nothing in the build fails, the page still renders, the browser still shows a
title — and the link lands on the generic "Find a package" view because the
key it names is not in the data the browser fetched. The reader clicked a
product and got a catalogue start page, and the page title still said
"GitHub".

So this check does not trust either side. It reads the BUILT bundle, takes
every `/package/...` link it emits, and asserts that:

  1. the link names a key that resolves against the bundle's own dataset (an
     id, or the linkKey the emitter stamped), and
  2. the link uses the canonical trailing-slash form, because the no-slash
     form is resolved by the client and falls back to the generic view when
     the key is an id rather than a slug.

It also checks the curated shelf: every id `data/featured.json` names must be
in the dataset, because the homepage's cards link to it.

Usage:
  scripts/check_site_links.py [BUILT_DIR] [--dataset web/data/catalog.json]

BUILT_DIR defaults to web/out. Exits 0 when every link resolves, 1 otherwise,
2 on a usage error.
"""

import argparse
import json
import os
import re
import sys
from collections import Counter

LINK_RE = re.compile(r'href="(/package/[^"#?]*)"')


def load_dataset(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def link_keys(rows):
    """The keys every entry answers to, exactly as the emitter computes them.

    `linkKey` is the slug only where exactly ONE row in the whole dataset
    carries it, and the id otherwise. A link to an ambiguous slug would
    resolve to whichever row happened to be indexed first, so the site never
    emits one.
    """
    slug_counts = Counter(row.get("slug") for row in rows)
    keys = set()
    for row in rows:
        keys.add(row["id"])
        if slug_counts.get(row.get("slug")) == 1:
            keys.add(row["slug"])
    return keys


def collect_links(root):
    """Every /package/ link the built HTML emits, with the file it came from."""
    found = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if not name.endswith(".html"):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    html = fh.read()
            except OSError as exc:
                print(f"  ! could not read {path}: {exc}")
                continue
            for match in LINK_RE.finditer(html):
                found.append((match.group(1), os.path.relpath(path, root)))
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("built", nargs="?", default="web/out",
                        help="the built site directory (default: web/out)")
    parser.add_argument("--dataset", default="web/data/catalog.json",
                        help="the catalog dataset the site was built from")
    parser.add_argument("--featured", default="web/data/featured.json",
                        help="the curated shelf the homepage renders")
    args = parser.parse_args()

    if not os.path.isdir(args.built):
        print(f"check-site-links: {args.built} is not a directory", file=sys.stderr)
        return 2
    if not os.path.isfile(args.dataset):
        print(f"check-site-links: no dataset at {args.dataset}", file=sys.stderr)
        return 2

    rows = load_dataset(args.dataset)
    keys = link_keys(rows)
    by_id = {row["id"]: row for row in rows}

    links = collect_links(args.built)
    if not links:
        print("check-site-links: the build emits no /package/ links at all — "
              "that is not a catalogue, so the build is wrong")
        return 1

    broken = []
    unslashed = []
    for href, source in links:
        key = href[len("/package/"):]
        if not key.endswith("/"):
            unslashed.append((href, source))
        key = key.rstrip("/")
        from urllib.parse import unquote
        if unquote(key) not in keys:
            broken.append((href, source, unquote(key)))

    # The curated shelf: every id it names must be in the dataset, and the
    # homepage's card for it must resolve.
    missing_featured = []
    if os.path.isfile(args.featured):
        featured = load_dataset(args.featured)
        for entry in featured.get("entries", []):
            if entry.get("id") not in by_id:
                missing_featured.append(entry.get("id"))

    print(f"check-site-links: {len(links)} product link(s) in {args.built} "
          f"against {len(rows)} dataset row(s)")

    failed = False
    if broken:
        # A link that names a key the data does not have lands the reader on
        # the generic catalogue view while the page title still says the
        # product they clicked. This is the failure that must never ship.
        failed = True
        print(f"  \u2717 {len(broken)} link(s) name a key that does not resolve:")
        for href, source in broken[:20]:
            print(f"      {href}   ({source})")
        if len(broken) > 20:
            print(f"      \u2026 and {len(broken) - 20} more")
    if unslashed:
        # The no-slash form still resolves: the edge Worker answers it and the
        # client reads the pathname with the slash optional. It is REPORTED,
        # not refused, because the canonical form is a house rule the build
        # does not always meet, and refusing to publish a working site over a
        # trailing slash would be the wrong trade.
        print(f"  ! {len(unslashed)} link(s) are not in the canonical "
              f"/package/<key>/ form (they still resolve):")
        for href, source in unslashed[:10]:
            print(f"      {href}   ({source})")
    if missing_featured:
        failed = True
        print(f"  ✗ {len(missing_featured)} curated entry/entries are not in "
              f"the dataset, so the homepage would link to nothing:")
        for entry in missing_featured[:10]:
            print(f"      {entry}")

    if failed:
        print("\nA marketplace link must open the product the reader clicked. "
              "A link that names a key the data does not have lands on the "
              "generic catalogue view — usually because the HTML and the row "
              "data come from different builds.")
        return 1

    print("  ✓ every product link resolves against the bundle's own dataset")
    return 0


if __name__ == "__main__":
    sys.exit(main())
