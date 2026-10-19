#!/usr/bin/env python3
"""Builder parity harness (K009, first half): what do the Go builder and the
Python producer disagree on?

Decision D4 (REMEDIATION-PLAN.md) asks whether the Go builder
(`internal/catalogbuild`) may become the production publisher instead of the
Python producer (`scripts/build_full_catalog.py`). The answer needs a
MEASUREMENT, not an opinion, and this harness is that measurement.

What it does, in order:

  1. builds the Go release from the COMMITTED dataset into a temp directory
     (`go run ./cmd/litespm catalog build --materialize --out <tmp>`), so the
     tree it reads is the tree the deploy would publish, built from the same
     bytes the producer wrote;
  2. reads the Go builder's listings and version records out of that tree;
  3. reads the Python producer's dataset (web/data/catalog.json -- the file
     the producer wrote);
  4. compares them ROW BY ROW on the fields both sides own: id, kind, name,
     summary, version, installability, source, publisher, url and transport;
  5. prints one machine-readable line:

         BUILDER_PARITY {"compared": N, "identical": N, "differing": N, "examples": [...]}

     and exits non-zero when a difference is NOT explained by a declared field
     ownership split (see DECLARED_SPLITS below).

MEASUREMENT ONLY. This harness changes nothing: it writes only into a temp
directory, it never cuts a release, and it does not decide which builder
publishes. The cutover is a separate, human-approved step (the ADR).

The two sides do not store the same shape, so a few fields are compared
through a declared mapping. Those mappings ARE the ownership split the ADR
has to cite, and they are listed in DECLARED_SPLITS with the reason each one
exists. A difference that is not one of them is a real disagreement: one side
is publishing a value the other does not have, and the ADR has to say who owns
it.

Run: python3 scripts/test_builder_parity.py
"""

import json
import os
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATASET = os.path.join(REPO_ROOT, "web", "data", "catalog.json")
DEFAULT_POINTER = os.path.join(REPO_ROOT, "web", "public", "v1", "current.json")

# The fields both builders own. Every one of them is compared on every row.
COMPARED_FIELDS = (
    "id",
    "kind",
    "name",
    "summary",
    "version",
    "installability",
    "source",
    "publisher",
    "url",
    "transport",
)

# How many differing rows are reported in the machine-readable line. The line
# stays one line long whatever the corpus size.
MAX_EXAMPLES = 20

# DECLARED_SPLITS: the shape differences between the two builders, each with
# the reason it exists. A difference that matches one of these is explained
# (the two sides publish the same information in different containers); any
# other difference is unexplained and fails the harness.
#
#   publisher-url-fallback
#       The dataset keeps the publisher's URL and the skill's source URL in
#       two fields (`publisher.url` and `skillSource`); the release publishes
#       ONE publisher URL and falls back to `skillSource` when `publisher.url`
#       is empty. The publisher NAME is compared directly (both own it); the
#       URL is compared against the fallback rule rather than field to field.
#
#   runtime-carries-transport
#       The dataset carries `transport` and `url` as row fields; the release
#       carries them inside the version record's component runtime, and a row
#       with no proven launch line has NO runtime at all (an honest absence,
#       not an empty string). The transport and the endpoint are therefore
#       compared through the runtime that carries them, and a row without a
#       runtime must not carry one on either side.
#
#   version-list
#       The dataset carries one version string; the release carries a list of
#       version summaries. The comparison reads the first entry, and an empty
#       list is the honest "no version published".
#
#   installability-default
#       A row with no `installability` is discovery_only on both sides (the
#       release maps the empty class to it).
DECLARED_SPLITS = (
    "publisher-url-fallback",
    "runtime-carries-transport",
    "version-list",
    "installability-default",
)


def iter_json_array(path):
    """Yield the elements of a JSON array one at a time.

    The dataset is ~54 MB and the release shards are ~20 MB each; decoding
    them whole would hold two full object graphs in memory at once. The
    standard library's incremental decoder walks the array element by
    element, so only one row is live at a time.
    """
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    decoder = json.JSONDecoder()
    start = text.find("[")
    if start < 0:
        raise ValueError(f"{path} is not a JSON array")
    index = start + 1
    length = len(text)
    while True:
        while index < length and text[index] in " \t\r\n,":
            index += 1
        if index >= length or text[index] == "]":
            return
        element, index = decoder.raw_decode(text, index)
        yield element


def python_fields(row):
    """The compared fields, read the way the PRODUCER wrote them."""
    publisher = row.get("publisher") or {}
    installability = row.get("installability") or ""
    return {
        "id": row.get("id") or "",
        "kind": row.get("kind") or "",
        "name": row.get("name") or "",
        "summary": row.get("summary") or "",
        "version": row.get("version") or "",
        "installability": installability or "discovery_only",
        "source": row.get("source") or "",
        "publisher": publisher.get("name") or "",
        "url": row.get("url") or "",
        "transport": row.get("transport") or "",
        # Not compared: the context the declared splits need.
        "_publisher_url": publisher.get("url") or "",
        "_skill_source": row.get("skillSource") or "",
        "_command": row.get("command") or "",
    }


def go_fields(listing, version_record):
    """The compared fields, read the way the BUILDER published them."""
    versions = listing.get("versions") or []
    version = versions[0].get("version", "") if versions else ""
    installability = listing.get("installability") or ""
    runtime = None
    for component in (version_record or {}).get("components") or []:
        if component.get("runtime"):
            runtime = component["runtime"]
            break
    source = listing.get("source") or {}
    publisher_claim = listing.get("publisherClaim") or {}
    return {
        "id": listing.get("id") or "",
        "kind": listing.get("kind") or "",
        "name": listing.get("name") or "",
        "summary": listing.get("summary") or "",
        "version": version,
        "installability": installability or "discovery_only",
        "source": source.get("sourceId") or "",
        "publisher": publisher_claim.get("name") or "",
        "url": (runtime or {}).get("endpoint") or "",
        "transport": (runtime or {}).get("type") or "",
        # Not compared: the context the declared splits need.
        "_publisher_url": publisher_claim.get("url") or "",
        "_command": ((runtime or {}).get("command") or ""),
    }


def read_release_tree(out_dir, release_id):
    """Read the builder's listings and version records out of the tree.

    Returns (listings_by_id, versions_by_listing_id). The shards are read one
    at a time so the whole tree is never resident at once.
    """
    release_dir = os.path.join(out_dir, "v1", "releases", release_id)
    listings = {}
    versions = {}
    for name in sorted(os.listdir(release_dir)):
        if name == "listings.json" or name.startswith("listings-"):
            for listing in iter_json_array(os.path.join(release_dir, name)):
                listings[listing.get("id") or ""] = listing
        elif name == "versions.json" or name.startswith("versions-"):
            for record in iter_json_array(os.path.join(release_dir, name)):
                versions[record.get("listingId") or ""] = record
    return listings, versions


def run_go_builder(out_dir, dataset, pointer):
    """Build the release with the Go builder; return (release_id, output)."""
    command = [
        "go", "run", "./cmd/litespm", "catalog", "build",
        "--materialize",
        "--dataset", dataset,
        "--out", out_dir,
        "--prev", pointer,
    ]
    try:
        completed = subprocess.run(
            command, cwd=REPO_ROOT, capture_output=True, text=True)
    except FileNotFoundError:
        raise SystemExit(
            "the Go toolchain is not on PATH, so the Go builder cannot be "
            "measured against the Python producer")
    if completed.returncode != 0:
        raise SystemExit(
            "the Go builder failed, so there is nothing to compare:\n"
            + (completed.stdout or "")
            + (completed.stderr or ""))
    release_id = ""
    for line in (completed.stdout or "").splitlines():
        if "Release:" in line:
            release_id = line.split("Release:")[1].strip().split()[0]
    if not release_id:
        raise SystemExit(
            "the Go builder did not report a release id:\n" + (completed.stdout or ""))
    return release_id, completed.stdout


def compare(python_rows, go_rows):
    """Compare the two sides row by row; return the parity measurement."""
    compared = identical = differing = 0
    examples = []
    only_python = []
    only_go = []
    for row_id, python_row in python_rows.items():
        go_row = go_rows.get(row_id)
        if go_row is None:
            only_python.append(row_id)
            continue
        compared += 1
        differences = []
        declared = []
        for field in COMPARED_FIELDS:
            if python_row[field] != go_row[field]:
                differences.append({
                    "field": field,
                    "python": python_row[field],
                    "go": go_row[field],
                })
        # The publisher URL: the release publishes ONE publisher URL, the
        # dataset keeps `publisher.url` and `skillSource` apart. The declared
        # split says the builder publishes the first non-empty of the two, so
        # anything else is a real disagreement.
        expected_publisher_url = (python_row["_publisher_url"]
                                  or python_row["_skill_source"])
        if go_row["_publisher_url"] != expected_publisher_url:
            differences.append({
                "field": "publisher.url",
                "python": expected_publisher_url,
                "go": go_row["_publisher_url"],
            })
        # A row with no proven launch line has no runtime, so the release
        # publishes no transport for it. The dataset's transport is dropped by
        # design (the split), not lost -- so it is explained, not a difference.
        if (not python_row["_command"] and not python_row["url"]
                and python_row["transport"] and not go_row["transport"]):
            declared.append({
                "field": "transport",
                "python": python_row["transport"],
                "go": go_row["transport"],
                "split": "runtime-carries-transport",
            })
            differences = [d for d in differences if d["field"] != "transport"]
        if differences:
            differing += 1
            if len(examples) < MAX_EXAMPLES:
                examples.append({
                    "id": row_id,
                    "differences": differences,
                    "declared": declared,
                })
        else:
            identical += 1
    for row_id in go_rows:
        if row_id not in python_rows:
            only_go.append(row_id)
    return {
        "compared": compared,
        "identical": identical,
        "differing": differing,
        "examples": examples,
        "onlyInPython": only_python[:MAX_EXAMPLES],
        "onlyInGo": only_go[:MAX_EXAMPLES],
        "onlyInPythonCount": len(only_python),
        "onlyInGoCount": len(only_go),
    }


def main():
    dataset = os.environ.get("LITESPM_PARITY_DATASET") or DEFAULT_DATASET
    pointer = os.environ.get("LITESPM_PARITY_POINTER") or DEFAULT_POINTER
    if not os.path.isfile(dataset):
        print(f"PARITY FAILED: the dataset {dataset} does not exist")
        return 1

    with tempfile.TemporaryDirectory(prefix="litespm-parity-") as workdir:
        out_dir = os.path.join(workdir, "release")
        release_id, build_output = run_go_builder(out_dir, dataset, pointer)
        listings, versions = read_release_tree(out_dir, release_id)

        go_rows = {}
        for row_id, listing in listings.items():
            go_rows[row_id] = go_fields(listing, versions.get(row_id))

        python_rows = {}
        for row in iter_json_array(dataset):
            fields = python_fields(row)
            python_rows[fields["id"]] = fields

    measurement = compare(python_rows, go_rows)
    line = {
        "compared": measurement["compared"],
        "identical": measurement["identical"],
        "differing": measurement["differing"],
        "examples": measurement["examples"],
    }
    print("BUILDER_PARITY " + json.dumps(line))

    # The two sides must publish the same ROWS, not just agree on the ones
    # they share: a row only one side has is a row the other cannot serve.
    if measurement["onlyInPythonCount"] or measurement["onlyInGoCount"]:
        print(f"PARITY FAILED: {measurement['onlyInPythonCount']} row(s) only the "
              f"producer has, {measurement['onlyInGoCount']} row(s) only the "
              f"builder has")
        for row_id in measurement["onlyInPython"]:
            print(f"  only in the producer: {row_id}")
        for row_id in measurement["onlyInGo"]:
            print(f"  only in the builder: {row_id}")
        return 1

    if measurement["differing"]:
        print(f"PARITY FAILED: {measurement['differing']} row(s) disagree on a "
              f"field both builders own")
        for example in measurement["examples"]:
            for difference in example["differences"]:
                print(f"  {example['id']} {difference['field']}: "
                      f"producer={difference['python']!r} "
                      f"builder={difference['go']!r}")
        return 1

    print(f"PARITY OK: {measurement['identical']} of {measurement['compared']} "
          f"rows agree on {', '.join(COMPARED_FIELDS)}")
    print(f"  Go release: {release_id} (built from {os.path.relpath(dataset, REPO_ROOT)})")
    sources = sorted({row["source"] for row in python_rows.values() if row["source"]})
    print(f"  Sources carried by the corpus: {', '.join(sources)}")
    print(f"  Declared field ownership splits: {', '.join(DECLARED_SPLITS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
