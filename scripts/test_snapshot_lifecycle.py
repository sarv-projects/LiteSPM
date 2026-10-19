"""Snapshot-lifecycle test for the catalog producer's completion step (K004).

`snapshot_store.py`'s own self-test (run it: `python3 scripts/snapshot_store.py`)
proves the *store* rules: a fresh snapshot starts `partial`, `mark_ingested`
promotes it to `healthy` with `completedAt` + `itemCount`, promotions are
byte-stable, and nothing is ever fabricated. What it cannot prove is the
*producer* half: that `build_full_catalog.py` actually calls the completion
step for every snapshot the build parsed.

That was the K004 defect: completion ran over one URL per source, so
record-level snapshots (skills.sh download records, Wayback page replays,
pagination documents) stayed `partial` forever even though the build consumed
them. This test pins the fixed behaviour of the run ledger
(`_consume` / `attribute_rows` / `finalize_consumed_snapshots`):

  1. a consumed, recorded snapshot is promoted to healthy with the rows it
     actually contributed;
  2. a navigation document consumed with zero rows is promoted with 0;
  3. a consumed URL with NO recording is reported as missing and never gets
     an entry fabricated for it;
  4. re-running the finalization is a byte-stable no-op;
  5. a recorded snapshot the run never consumed stays `partial`;
  6. superseding a recorded URL archives the replaced fetch as immutable,
     oldest-first history (record + bytes exactly as they stood) instead of
     destroying it, and a never-recorded URL has no history either.

It also drives the producer's OWN parse path (the skills.sh block, the source
whose records were stuck `partial`) against a temp snapshot store with the
network replaced by canned bytes, so the property is proved end to end and not
only against the ledger's own API.

Run: python3 scripts/test_snapshot_lifecycle.py
"""

import contextlib
import io
import os
import sys
import tempfile
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_full_catalog as producer  # noqa: E402
import snapshot_store  # noqa: E402


def test_every_parsed_snapshot_is_completed() -> int:
    """The producer's own parse path completes every snapshot it parses.

    K004's complaint was that the build parsed snapshots and left them
    `partial` (138 skills.sh records never reached `healthy`). This drives
    the real skills.sh block -- the source whose records were stuck -- against
    a temp snapshot store with the network replaced by canned bytes, and pins
    the property the row asks for:

      * the per-skill record the block parsed is `healthy` with the one row
        it contributed;
      * the navigation documents it parsed (the sitemap index and the
        sub-sitemap) are `healthy` with 0 rows -- they enumerated URLs, not
        rows;
      * a recorded snapshot the run never parsed stays `partial`.

    The last one is the honesty half: completion is earned by a parse, never
    stamped onto a recording.
    """
    checks = 0

    def ok(cond, msg):
        nonlocal checks
        if not cond:
            raise AssertionError(msg)
        checks += 1

    index_url = "https://skills.sh/sitemap.xml"
    sub_url = "https://www.skills.sh/sitemap-skills-1.xml"
    page_url = "https://www.skills.sh/acme/demo-repo/demo-skill"
    cold_url = "https://www.skills.sh/acme/cold-repo/cold-skill"

    index_body = ("<?xml version='1.0' encoding='UTF-8'?>"
                  "<sitemapindex><sitemap><loc>" + sub_url +
                  "</loc></sitemap></sitemapindex>").encode("utf-8")
    sub_body = ("<?xml version='1.0' encoding='UTF-8'?><urlset><url><loc>"
                + page_url + "</loc></url></urlset>").encode("utf-8")
    page_body = (b"<html><head><script type=\"application/ld+json\">"
                 b"{\"@type\":\"SoftwareApplication\",\"description\":"
                 b"\"A demo skill published on its listing page.\"}"
                 b"</script></head><body></body></html>")

    responses = {index_url: index_body, sub_url: sub_body, page_url: page_body}

    def fake_http_get(url, timeout, etag=None, source_id=None):
        body = responses.get(url)
        if body is None:
            raise OSError(f"no canned response for {url}")
        return 200, {}, body

    with tempfile.TemporaryDirectory() as root:
        # A recording the run will never parse: it is in no sitemap, so the
        # run never opens it. It must stay `partial` forever.
        snapshot_store.write_snapshot(root, cold_url, "feed:skills-sh", None,
                                      200, b"{}")

        with mock.patch.dict(os.environ,
                             {"LITESPM_SOURCE_SNAPSHOT_DIR": root}), \
                mock.patch.object(producer, "_http_get",
                                  side_effect=fake_http_get):
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                producer.build_full_catalog(only_source=producer.FEED_SKILLSH[1])
        log = buffer.getvalue()

        ok("skills.sh: +1 rows" in log,
           f"the canned listing page produced no row:\n{log}")

        _, meta = snapshot_store.load_snapshot(root, page_url)
        snap = meta["snapshot"]
        ok(snap["status"] == "healthy",
           f"the parsed per-skill record is not healthy: {snap.get('status')!r}")
        ok(snap.get("itemCount") == 1,
           f"the per-skill record must carry the 1 row it produced, got "
           f"{snap.get('itemCount')!r}")
        ok(bool(snap.get("completedAt")),
           "the completed per-skill record carries no completedAt")

        for nav_url, label in ((index_url, "sitemap index"),
                               (sub_url, "sub-sitemap")):
            _, meta = snapshot_store.load_snapshot(root, nav_url)
            nav = meta["snapshot"]
            ok(nav["status"] == "healthy" and nav.get("itemCount") == 0,
               f"the {label} was not completed with 0 rows: {nav!r}")

        _, meta = snapshot_store.load_snapshot(root, cold_url)
        ok(meta["snapshot"]["status"] == "partial",
           "a recording the run never parsed was promoted (completion is "
           "earned by a parse, never stamped)")

    return checks


def main() -> int:
    checks = 0

    def ok(cond, msg):
        nonlocal checks
        if not cond:
            raise AssertionError(msg)
        checks += 1

    record_url = "https://skills.sh/acme/demo-skill/demo"
    nav_url = "https://skills.sh/sitemap-skills-1.xml"
    never_url = "https://example.org/never/recorded"
    record_body = b'<script type="application/ld+json">{}</script>'

    with tempfile.TemporaryDirectory() as root:
        # Two recordings, both fresh: the store marks them `partial`.
        snapshot_store.write_snapshot(
            root, record_url, "feed:skills-sh", None, 200, record_body)
        snapshot_store.write_snapshot(
            root, nav_url, "feed:skills-sh", None, 200, b"<urlset></urlset>")

        _, meta = snapshot_store.load_snapshot(root, record_url)
        ok(meta["snapshot"]["status"] == "partial", "fresh record starts partial")
        ok("completedAt" not in meta["snapshot"],
           "fresh partial record carries no completedAt (completion is earned, not stamped)")

        # The run parses both, attributes one row to the record, and also
        # "consumes" a URL it never managed to record (fetch failed after
        # parse -- the honest anomaly: report it, never fabricate).
        producer._reset_run_ledger()
        producer._consume(record_url, "feed:skills-sh")
        producer._consume(nav_url, "feed:skills-sh")
        producer.attribute_rows(record_url, 1)
        producer.attribute_rows(record_url, 0)  # accumulation stays 1
        producer._consume(never_url, "feed:skills-sh")

        promoted, rows, unchanged, missing = producer.finalize_consumed_snapshots(root)
        ok(promoted == 2, f"both consumed recordings promoted, got {promoted}")
        ok(rows == 1, f"attributed rows reported as 1, got {rows}")
        ok(missing == 1, f"consumed-without-recording reported, got {missing}")
        ok(not os.path.exists(snapshot_store.snapshot_dir(root, never_url)),
           "no snapshot entry fabricated for a URL that was never recorded")

        _, meta = snapshot_store.load_snapshot(root, record_url)
        snap = meta["snapshot"]
        ok(snap["status"] == "healthy", "consumed record promoted to healthy")
        ok(snap.get("itemCount") == 1, f"itemCount 1, got {snap.get('itemCount')!r}")
        ok(bool(snap.get("completedAt")), "completedAt set on promotion")

        _, meta = snapshot_store.load_snapshot(root, nav_url)
        nav = meta["snapshot"]
        ok(nav["status"] == "healthy" and nav.get("itemCount") == 0,
           "navigation document promoted with itemCount 0")

        # Byte-stable re-run: nothing changed, nothing rewritten.
        meta_path = os.path.join(snapshot_store.snapshot_dir(root, record_url),
                                 snapshot_store.META_FILE)
        before = open(meta_path, "rb").read()
        promoted2, rows2, unchanged2, missing2 = producer.finalize_consumed_snapshots(root)
        ok((promoted2, rows2, unchanged2, missing2) == (0, 0, 2, 1),
           "second finalization is a no-op with the same anomaly report")
        ok(open(meta_path, "rb").read() == before, "healthy record byte-stable across re-runs")

        # A recording the run never consumed must stay partial.
        cold_url = "https://skills.sh/acme/cold/cold"
        snapshot_store.write_snapshot(root, cold_url, "feed:skills-sh", None, 200, b"{}")
        producer._reset_run_ledger()
        promoted3, _, _, missing3 = producer.finalize_consumed_snapshots(root)
        ok((promoted3, missing3) == (0, 0), "nothing consumed, nothing promoted")
        _, meta = snapshot_store.load_snapshot(root, cold_url)
        ok(meta["snapshot"]["status"] == "partial",
           "unconsumed recording stays partial (a parse that never ran is not health)")

        # A failure log is still the destination for failures (contract held
        # by the store self-test; assert the file exists and is append-only
        # JSONL here so this test alone is still self-contained).
        snapshot_store.log_failure(root, never_url, "fetch", "connection refused")
        with open(os.path.join(root, snapshot_store.FAILURES_FILE), encoding="utf-8") as f:
            lines = f.read().splitlines()
        ok(len(lines) == 1 and "connection refused" in lines[0], "failure logged, not snapshotted")

        # Immutable per-fetch history: superseding a recorded URL preserves the
        # fetch it replaces instead of overwriting it in place. The finalized
        # record promoted above is archived exactly as it stood.
        snapshot_store.write_snapshot(
            root, record_url, "feed:skills-sh", None, 200, b'{"files": [{}]}')
        entries = snapshot_store.list_history(root, record_url)
        ok(len(entries) == 1, f"superseded fetch archived once, got {len(entries)}")
        entry1, archived = entries[0]
        ok(archived["snapshot"]["status"] == "healthy"
           and archived["snapshot"].get("itemCount") == 1,
           "history keeps the finalized record exactly as it stood")
        body1, rec1 = snapshot_store.load_history_entry(root, record_url, entry1)
        ok(body1 == record_body,
           "history replays the bytes that were actually fetched")
        ok(rec1["snapshot"]["contentDigest"] == snapshot_store.digest_bytes(record_body),
           "history digest matches the archived bytes")
        cur_body, cur = snapshot_store.load_snapshot(root, record_url)
        ok(cur_body == b'{"files": [{}]}' and cur["snapshot"]["status"] == "partial",
           "current record is the newest fetch, fresh and partial again")

        # A second supersede keeps both fetches, ordered oldest first; a URL
        # the run never recorded has no history either (never fabricated).
        snapshot_store.write_snapshot(
            root, record_url, "feed:skills-sh", None, 200, b'{"files": [2]}')
        entries = snapshot_store.list_history(root, record_url)
        ok(len(entries) == 2, f"both superseded fetches kept, got {len(entries)}")
        ok(snapshot_store.load_history_entry(root, record_url, entries[0][0])[0]
           == record_body,
           "history entries stay ordered oldest-first")
        ok(len(snapshot_store.list_history(root, never_url)) == 0,
           "a URL never recorded has no history (never fabricated)")

    # The producer's own parse path (not just the ledger API): every snapshot
    # the run parses is completed, and one it never parses stays `partial`.
    checks += test_every_parsed_snapshot_is_completed()

    print(f"SNAPSHOT LIFECYCLE TEST OK ({checks} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
