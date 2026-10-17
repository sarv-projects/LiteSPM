#!/usr/bin/env python3
"""Carry each vendor plugin manifest's own `source` into web/data/catalog.json.

WHY A FOCUSED RE-RUN, NOT THE FULL PRODUCER
  `scripts/build_full_catalog.py` is a network-bound rebuild of ~69k rows from
  ~60 upstream feeds; the descriptor change touches exactly the 7 vendor plugin
  manifests in its MARKETPLACE_SOURCES table. This script replays those 7
  committed snapshots through the *same* helpers the producer uses (obtain,
  canonical_id, base_slug, manifest_is_command, manifest_artifact_descriptor),
  derives the same `plugin:{id_owner}:{base_slug(name)}` ids in the same
  first-wins order, and adds `artifact` ONLY to rows that already exist. It
  never adds, reorders or drops a row: row counts are asserted against the
  release pointer by scripts/check_catalog_coherence.py, and a focused run must
  not move them. The one definition these two paths share is the point -- two
  copies of the source table or of the id rule would be two chances to drift.

WHAT IT WRITES
  web/data/catalog.json   the same `indent=2, ensure_ascii=False` format the
                          producer writes; every byte of every row is preserved
                          except the added `artifact` field (inserted right
                          after `source`, where the producer emits it).
  web/data/release.json   ONLY the Python-owned stats: datasetDigest, the
                          per-kind counts and statsUpdatedAt. releaseId,
                          sequence, manifestDigest and createdAt belong to the
                          Go release builder (`litespm catalog build`) and are
                          never touched here -- two writers of one key is how
                          digests drift.

  A row whose manifest entry no longer exists (or whose id the producer's
  dedup would now drop) is left exactly as it was: the honest absence is no
  artifact field, never a guessed locator. Both directions of mismatch are
  listed at the end of a run.

MODES
  (default)  replay the committed snapshots; fetch only what is missing.
  --refresh  conditional re-fetch (If-None-Match), same semantics as the
             producer: unchanged content keeps the recording, changed content
             replaces it, a network failure keeps the recording and logs it.
  --verify   read-only. Report whether the files on disk are already exactly
             what a run would produce. Exits 1 with one line per disagreement.
             This is the gate that makes the check capable of failing, and it
             never writes.

Usage:
  scripts/enrich_plugin_artifacts.py [--refresh] [--verify]
                                     [--catalog <path>] [--release <path>]
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_full_catalog as producer  # noqa: E402  (path set up above)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_manifests(refresh: bool):
    """Replay (or refresh) the seven marketplace manifests, in producer order.

    Returns a list of (source-table entry, parsed manifest). Uses the
    producer's `obtain`, so replay never touches the network and --refresh
    issues the same conditional request a full build would.
    """
    out = []
    for src in producer.MARKETPLACE_SOURCES:
        body = producer.obtain(src["url"], src["source_id"], 25, refresh, src["key"])
        manifest = json.loads(body.decode("utf-8", errors="ignore"))
        out.append((src, manifest))
    return out


def iter_manifest_entries(src, manifest, seen_ids, seen_slugs, notes):
    """Yield (item_id, descriptor) exactly as the producer's plugin loop would.

    The producer builds a plugin row per manifest entry, in manifest order,
    dropping entries its id or slug dedup has already seen (first-wins). This
    mirrors those two rules verbatim -- including the slug namespace
    (`<source-key>-<base>`) -- so the join can only miss a row the producer
    itself would not have written.
    """
    entries = manifest.get("plugins", []) if isinstance(manifest, dict) else []
    for p in entries:
        if not isinstance(p, dict):
            continue
        name = (p.get("name") or "").strip()
        if not name or producer.manifest_is_command(p.get("source")):
            continue
        base = producer.base_slug(name)
        if not base:
            continue
        item_id = producer.canonical_id("plugin", src["id_owner"], base)
        slug = producer.canonical_slug(f"{src['key']}-{base}")
        if item_id in seen_ids or slug in seen_slugs:
            continue
        seen_ids.add(item_id)
        seen_slugs.add(slug)
        yield item_id, producer.manifest_artifact_descriptor(
            p.get("source"), src["repo"], notes)


def with_artifact(row, descriptor):
    """Set `artifact` immediately after `source`, the producer's key order.

    Rewriting the dict in place keeps this a one-field change: every other
    key and value round-trips untouched. Returns True when the row changed.
    """
    if row.get("artifact") == descriptor:
        return False
    out = {}
    for key, value in row.items():
        if key == "artifact":
            continue  # dropped here, re-inserted in the producer's position
        out[key] = value
        if key == "source":
            out["artifact"] = descriptor
    if "artifact" not in out:
        out["artifact"] = descriptor
    row.clear()
    row.update(out)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__.split("Usage:")[0].strip().splitlines()[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--refresh", action="store_true",
                        help="conditionally re-fetch each manifest (default: replay)")
    parser.add_argument("--verify", action="store_true",
                        help="check the on-disk files without writing; exit 1 on any disagreement")
    parser.add_argument("--catalog", default=os.path.join(ROOT, "web", "data", "catalog.json"))
    parser.add_argument("--release", default=os.path.join(ROOT, "web", "data", "release.json"))
    args = parser.parse_args()

    if args.verify and args.refresh:
        print("--verify is read-only and cannot be combined with --refresh")
        return 2

    with open(args.catalog, encoding="utf-8") as f:
        items = json.load(f)
    if not isinstance(items, list):
        print(f"FAIL {args.catalog} is not a JSON array")
        return 1

    notes = {}
    manifests = load_manifests(refresh=args.refresh)

    # Join: catalog rows first-wins by id, manifest entries first-wins in
    # source order. Both sides use the same rules the producer uses.
    row_index = {}
    for i, row in enumerate(items):
        if isinstance(row, dict) and row.get("kind") == "plugin":
            rid = row.get("id")
            if isinstance(rid, str):
                row_index.setdefault(rid, i)

    matched = {}          # row index -> (id, descriptor)
    unmatched_ids = []    # manifest ids with no catalog row (see report)
    seen_ids, seen_slugs = set(), set()
    for src, manifest in manifests:
        for item_id, descriptor in iter_manifest_entries(
                src, manifest, seen_ids, seen_slugs, notes):
            idx = row_index.get(item_id)
            if idx is None:
                unmatched_ids.append(item_id)
                continue
            matched[idx] = (item_id, descriptor)

    plugin_rows = sum(1 for r in items if isinstance(r, dict) and r.get("kind") == "plugin")
    with_descriptor = sum(1 for _, d in matched.values() if d is not None)
    pinned = sum(1 for _, d in matched.values() if d and d["pinned"])
    by_kind = {}
    for _, d in matched.values():
        if d:
            by_kind[d["declaredAs"]] = by_kind.get(d["declaredAs"], 0) + 1
    drift_rows = sorted(
        items[i].get("id") for i in sorted(row_index.values()) if i not in matched
    )

    problems = []
    changed = 0
    before_len = len(items)
    before_plugins = plugin_rows
    for idx, (item_id, descriptor) in sorted(matched.items()):
        row = items[idx]
        if descriptor is None:
            if "artifact" in row:
                problems.append(
                    f"{item_id}: manifest published no transcribable descriptor but the "
                    f"row still carries artifact={row['artifact']!r}; refuse rather than guess")
            continue
        if with_artifact(row, descriptor):
            changed += 1

    if len(items) != before_len or sum(
            1 for r in items if isinstance(r, dict) and r.get("kind") == "plugin") != before_plugins:
        problems.append("row count changed; this script must never add or drop rows")

    new_text = json.dumps(items, indent=2, ensure_ascii=False)
    new_bytes = new_text.encode("utf-8")
    digest = hashlib.sha256(new_bytes).hexdigest()

    # Stats: the Python-owned keys only (see the module docstring).
    with open(args.release, encoding="utf-8") as f:
        release = json.load(f)
    counts = {"mcp": 0, "skill": 0, "plugin": 0}
    for r in items:
        k = r.get("kind") if isinstance(r, dict) else None
        if k in counts:
            counts[k] += 1

    if args.verify:
        with open(args.catalog, "rb") as f:
            disk_bytes = f.read()
        if disk_bytes != new_bytes:
            problems.append(
                f"catalog differs from what a run would produce ({changed} row(s) would change)")
        if release.get("datasetDigest") != f"sha256:{digest}":
            problems.append(
                f"release.json datasetDigest={release.get('datasetDigest')!r} but catalog.json "
                f"digests to sha256:{digest}")
        for key, kind in (("mcpServersCount", "mcp"), ("agentSkillsCount", "skill"),
                          ("pluginsCount", "plugin")):
            if release.get(key) != counts[kind]:
                problems.append(
                    f"release.json {key}={release.get(key)!r} but catalog.json holds "
                    f"{counts[kind]} {kind} row(s)")
        for key in ("itemCount", "totalCapabilities"):
            if release.get(key) != len(items):
                problems.append(
                    f"release.json {key}={release.get(key)!r} but catalog.json holds {len(items)} rows")
        if problems:
            print(f"FAIL plugin artifact enrichment -- {len(problems)} disagreement(s):")
            for p in problems:
                print(f"  - {p}")
            return 1
        print(f"OK plugin artifact enrichment — {with_descriptor}/{plugin_rows} plugin rows carry a "
              f"descriptor ({pinned} pinned), catalog sha256:{digest[:12]}, "
              f"release.json digest agrees")
        return 0

    if problems:
        print(f"FAIL refusing to write -- {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1

    tmp = args.catalog + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new_text)
    os.replace(tmp, args.catalog)

    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    created = (
        datetime.datetime.fromtimestamp(int(epoch), datetime.timezone.utc)
        if epoch
        else datetime.datetime.now(datetime.timezone.utc)
    )
    release.update({
        "itemCount": len(items),
        "totalCapabilities": len(items),
        "mcpServersCount": counts["mcp"],
        "agentSkillsCount": counts["skill"],
        "pluginsCount": counts["plugin"],
        "datasetDigest": f"sha256:{digest}",
        "statsUpdatedAt": created.strftime("%Y-%m-%dT%H:%M:%SZ"),
    })
    with open(args.release, "w", encoding="utf-8") as f:
        json.dump(release, f, indent=2)
        f.write("\n")

    print(f"plugin rows: {plugin_rows}; matched to a manifest entry: {len(matched)}")
    print(f"  descriptors carried: {with_descriptor} ({pinned} pinned, "
          f"{with_descriptor - pinned} unpinned)")
    kinds = ", ".join(f"{k}={v}" for k, v in sorted(by_kind.items()))
    print(f"  declaredAs: {kinds}")
    if notes:
        refused = ", ".join(f"{k}={v}" for k, v in sorted(notes.items()))
        print(f"  shapes not transcribed: {refused}")
    if drift_rows:
        print(f"  catalog plugin rows with no manifest entry left ({len(drift_rows)}): "
              f"{', '.join(drift_rows)}")
    if unmatched_ids:
        print(f"  manifest entries with no catalog row, untouched ({len(unmatched_ids)}): "
              f"{', '.join(sorted(unmatched_ids))}")
    print(f"  rows changed: {changed}")
    print(f"Wrote {args.catalog} ({len(new_bytes)} bytes), sha256:{digest[:12]}")
    print(f"Updated {args.release} stats (releaseId/sequence/manifestDigest untouched)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
