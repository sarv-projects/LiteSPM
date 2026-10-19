"""Offline regression checks for the remote (URL) MCP endpoint data path (B1)
and for the mcpservers.org directory feed (K003).

The Official MCP Registry's server.json declares endpoints in `remotes[]`
([{type, url}, ...]); multiple endpoints per server are the norm upstream (a
live sample carried 41 entries across 38 servers). These checks pin the
producer half of the contract, with no network and no recorded snapshots:

  * the selection rule (first `streamable-http`, else the first entry) and the
    count of rows where extra entries were dropped;
  * the publish policy (an endpoint the egress guard would later refuse is
    never published: non-https and non-loopback, credentials, fragments,
    non-default ports, non-public IP literals);
  * the honesty rules: metadata_verified only when an endpoint was actually
    published, command/args/runtime always null, version only from the
    document, and no invented launch line of any kind.

The mcpservers.org feed (K003) has one invariant of its own: the feed is
either really fetched -- a recorded snapshot per document it read, completed
with the rows it produced -- or its refusal is recorded with the stage and
the error. A row whose source is the feed must never exist without that
evidence, and a refused path must never be worked around by inventing a
document.
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_full_catalog as producer  # noqa: E402
import snapshot_store  # noqa: E402

ITEM_ID = "mcp:builtin:mcp-registry:io.github.acme-remote-mcp"


def fixture_server(remotes=None, version="2.1.0"):
    """A minimal active server.json document as the registry publishes it."""
    srv = {
        "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        "name": "io.github.acme/remote-mcp",
        "description": "Acme's hosted MCP endpoint.",
        "version": version,
    }
    if remotes is not None:
        srv["remotes"] = remotes
    return srv


def build_row(srv):
    """Run the real per-server row builder the registry block uses."""
    return producer.registry_row(
        ITEM_ID,
        srv.get("title") or srv["name"],
        "remote-mcp",
        "Developer Tools",
        srv["description"],
        "acme",
        "https://github.com/acme",
        srv,
    )


def test_mcpservers_feed_is_fetched_or_refused(ok):
    """feed:mcpservers-org: a real fetch, or a recorded refusal -- never rows
    without evidence.

    mcpservers.org's robots.txt allows /servers/*, so the origin is a
    permitted request path; it answers automation with a bot challenge
    (HTTP 403). The producer therefore probes the origin once and falls back
    to the public capture index when the origin refuses. Both branches are
    pinned here, with no network:

      * origin refuses: the refusal is recorded in failures.jsonl with the
        stage and the error, NO snapshot is written for the refused URL (a
        failed fetch never fabricates one), every document the run did read is
        recorded and completed, and the feed's rows come from the public
        capture;
      * origin serves: the page is read from the origin, its snapshot is
        completed with the row it produced, and the capture index is not
        consulted at all.
    """
    index_url = "https://mcpservers.org/sitemap.xml"
    submap_url = "https://mcpservers.org/sitemaps/servers/1.xml"
    page_url = "https://mcpservers.org/servers/acme/demo"
    cdx_root = "https://web.archive.org/cdx/search/cdx?url=mcpservers.org/servers/*"
    cdx_count_url = cdx_root + "&showNumPages=true"
    cdx_page_url = cdx_root + "&output=json&fl=original,timestamp,statuscode&page=0"
    replay_url = "https://web.archive.org/web/20260101000000id_/" + page_url

    index_body = ("<?xml version='1.0' encoding='UTF-8'?><sitemapindex><sitemap>"
                  "<loc>" + submap_url + "</loc></sitemap></sitemapindex>").encode()
    submap_body = ("<urlset><url><loc>" + page_url + "</loc></url>"
                   "<url><loc>https://mcpservers.org/es/servers/acme/demo</loc>"
                   "</url></urlset>").encode()
    cdx_body = json.dumps([
        ["original", "timestamp", "statuscode"],
        ["https://mcpservers.org/servers/acme/demo", "20260101000000", "200"],
    ]).encode()
    page_body = (b'<html><head><title>Demo Server | Awesome MCP Servers</title>'
                 b'<meta name="description" content="A demo server listed in the '
                 b'directory."></head><body></body></html>')

    def run_feed(origin_serves, root):
        """Run the feed's block offline; return (requested urls, run log)."""
        requested = []

        def fake_http_get(url, timeout, etag=None, source_id=None):
            requested.append(url)
            if url == index_url:
                return 200, {}, index_body
            if url == submap_url:
                return 200, {}, submap_body
            if url == page_url:
                if origin_serves:
                    return 200, {}, page_body
                raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)
            if url == cdx_count_url:
                return 200, {}, b"1"
            if url == cdx_page_url:
                return 200, {}, cdx_body
            if url == replay_url:
                return 200, {}, page_body
            raise OSError(f"no canned response for {url}")

        buffer = io.StringIO()
        with mock.patch.dict(os.environ,
                             {"LITESPM_SOURCE_SNAPSHOT_DIR": root}), \
                mock.patch.object(producer, "_http_get", side_effect=fake_http_get):
            with contextlib.redirect_stdout(buffer):
                producer.build_full_catalog(
                    only_source=producer.FEED_MCPSERVERS[1])
        return requested, buffer.getvalue()

    def failures(root):
        path = os.path.join(root, snapshot_store.FAILURES_FILE)
        if not os.path.isfile(path):
            return []
        with open(path, encoding="utf-8") as f:
            return [json.loads(line) for line in f.read().splitlines() if line]

    # --- the origin refuses -------------------------------------------
    with tempfile.TemporaryDirectory() as root:
        requested, log = run_feed(False, root)

        refused = [f for f in failures(root) if f.get("url") == page_url]
        ok(len(refused) == 1,
           f"the origin's refusal was not recorded exactly once: {failures(root)}")
        ok("403" in refused[0].get("error", ""),
           f"the recorded refusal does not name the status: {refused[0]}")
        ok(bool(refused[0].get("stage")),
           "the recorded refusal names no stage")
        ok(not os.path.exists(snapshot_store.snapshot_dir(root, page_url)),
           "a refused fetch wrote a snapshot (fabricated bytes)")
        ok("mcpservers.org: +1 rows" in log,
           f"the feed produced no row from the public capture:\n{log}")
        ok("refusedLocs" in log,
           f"the run did not report the refused location:\n{log}")

        # Every document the run really read is recorded and completed.
        for url, rows in ((index_url, 0), (submap_url, 0), (cdx_count_url, 0),
                          (cdx_page_url, 0), (replay_url, 1)):
            _body, meta = snapshot_store.load_snapshot(root, url)
            snap = meta["snapshot"]
            ok(snap["sourceId"] == producer.FEED_MCPSERVERS[1],
               f"{url} was recorded under {snap['sourceId']!r}")
            ok(snap["status"] == "healthy",
               f"the parsed document {url} stayed {snap['status']!r}")
            ok(snap.get("itemCount") == rows,
               f"{url} must carry {rows} row(s), got {snap.get('itemCount')!r}")
        ok(any("cdx" in url for url in requested),
           "the fallback did not consult the public capture index")

    # --- the origin serves --------------------------------------------
    with tempfile.TemporaryDirectory() as root:
        requested, log = run_feed(True, root)

        ok(not [f for f in failures(root) if f.get("url") == page_url],
           f"a served page was recorded as a refusal: {failures(root)}")
        _body, meta = snapshot_store.load_snapshot(root, page_url)
        snap = meta["snapshot"]
        ok(snap["status"] == "healthy",
           f"the origin page stayed {snap['status']!r}")
        ok(snap.get("itemCount") == 1,
           f"the origin page must carry the 1 row it produced, got "
           f"{snap.get('itemCount')!r}")
        ok("mcpservers.org: +1 rows" in log,
           f"the feed produced no row from the origin:\n{log}")
        ok(not any("cdx" in url for url in requested),
           "the capture index was consulted although the origin served the page")


def main():
    checks = 0

    def ok(cond, message):
        nonlocal checks
        if not cond:
            raise AssertionError(message)
        checks += 1

    # --- Selection rule -------------------------------------------------
    one = fixture_server([{"type": "streamable-http", "url": "https://mcp.acme.example/mcp"}])
    entry, extras = producer.select_remote_endpoint(one["remotes"])
    ok(entry["url"] == "https://mcp.acme.example/mcp",
       "single remote endpoint not selected")
    ok(extras == 0, "a single-endpoint document must drop nothing")

    three = fixture_server([
        {"type": "sse", "url": "https://sse.acme.example/sse"},
        {"type": "streamable-http", "url": "https://mcp.acme.example/mcp"},
        {"type": "sse", "url": "https://other.acme.example/sse"},
    ])
    entry, extras = producer.select_remote_endpoint(three["remotes"])
    ok(entry["url"] == "https://mcp.acme.example/mcp",
       "selection did not prefer the streamable-http entry")
    ok(extras == 2, f"3 declared endpoints must drop 2, got {extras}")

    all_sse = fixture_server([
        {"type": "sse", "url": "https://sse1.acme.example/sse"},
        {"type": "sse", "url": "https://sse2.acme.example/sse"},
    ])
    entry, extras = producer.select_remote_endpoint(all_sse["remotes"])
    ok(entry["url"] == "https://sse1.acme.example/sse",
       "without a streamable-http entry the first one must be selected")
    ok(extras == 1, "the unchosen sse endpoint must be counted as dropped")

    ok(producer.select_remote_endpoint(None) == (None, 0),
       "a document with no remotes must declare no endpoint")
    ok(producer.select_remote_endpoint("not-a-list") == (None, 0),
       "a malformed remotes field must not be treated as an endpoint")
    ok(producer.select_remote_endpoint(["not-a-dict"]) == (None, 0),
       "a malformed remotes entry must not be treated as an endpoint")

    # --- Row shape for a publishable endpoint ---------------------------
    row, extras, refused = build_row(one)
    ok(row["url"] == "https://mcp.acme.example/mcp", "published URL lost")
    ok(row["transport"] == "streamable-http", "published transport lost")
    ok(row["installability"] == producer.METADATA_VERIFIED,
       "a published endpoint must classify metadata_verified (Decision 7)")
    ok(row["version"] == "2.1.0", "the top-level server.json version was not kept")
    ok(extras == 0 and refused is False,
       "a single publishable endpoint must report no drops and no refusal")

    row, extras, refused = build_row(three)
    ok(row["url"] == "https://mcp.acme.example/mcp" and row["transport"] == "streamable-http",
       "multi-endpoint document did not publish the selected endpoint")
    ok(extras == 2, f"multi-endpoint row must report 2 dropped entries, got {extras}")
    ok(row["installability"] == producer.METADATA_VERIFIED,
       "a multi-endpoint row with a publishable selection must be verified")

    # --- Rows that must stay discovery_only -----------------------------
    no_remotes = fixture_server(remotes=None)
    row, extras, refused = build_row(no_remotes)
    ok(row["url"] is None and row["transport"] is None,
       "a document with no remotes must publish no endpoint")
    ok(row["installability"] == producer.DISCOVERY_ONLY,
       "an endpoint-less registry row must stay discovery_only")

    for label, bad in (
        ("plain http (non-loopback)", "http://mcp.acme.example/mcp"),
        ("credentials in the URL", "https://user:pass@mcp.acme.example/mcp"),
        ("URL fragment", "https://mcp.acme.example/mcp#tok"),
        ("non-default port", "https://mcp.acme.example:8443/mcp"),
        ("link-local literal", "https://169.254.169.254/latest/meta-data"),
        ("private literal", "https://10.0.0.8/mcp"),
        ("wrong scheme", "ws://mcp.acme.example/mcp"),
        ("not a string", None),
    ):
        srv = fixture_server([{"type": "streamable-http", "url": bad}])
        row, extras, refused = build_row(srv)
        ok(row["url"] is None and row["transport"] is None,
           f"refusable endpoint was published ({label}): {bad!r}")
        ok(row["installability"] == producer.DISCOVERY_ONLY,
           f"a refused endpoint must keep discovery_only ({label})")
        ok(refused is True, f"a refused endpoint must be logged as refused ({label})")

    # Loopback over plain http is the guard's one carve-out
    # (egress.Policy.AllowLoopbackHTTP): a local dev endpoint is publishable.
    loopback = fixture_server([{"type": "streamable-http", "url": "http://127.0.0.1:8080/mcp"}])
    row, extras, refused = build_row(loopback)
    ok(row["url"] == "http://127.0.0.1:8080/mcp",
       "the loopback http carve-out must be publishable")
    ok(refused is False, "a loopback endpoint must not be counted as refused")

    # A declared endpoint with no transport type cannot be published either:
    # catalogbuild.ParseDataset refuses a verified row without transport.
    no_type = fixture_server([{"url": "https://mcp.acme.example/mcp"}])
    row, extras, refused = build_row(no_type)
    ok(row["url"] is None and row["transport"] is None,
       "an endpoint with no transport type must not be published")
    ok(row["installability"] == producer.DISCOVERY_ONLY,
       "an untyped endpoint must not earn metadata_verified")
    ok(refused is True, "an untyped endpoint must be counted as refused")

    # --- No invented launch line, ever ----------------------------------
    for srv in (one, three, no_remotes, loopback,
                fixture_server([{"type": "streamable-http", "url": "http://bad.example/mcp"}])):
        row, _, _ = build_row(srv)
        ok(row["command"] is None, "registry rows must never publish a command")
        ok(row["args"] is None, "registry rows must never publish args")
        ok(row["runtime"] is None, "registry rows must never publish a runtime hint")
        ok(row["stars"] is None, "registry rows must never publish a star figure")
        ok(row["source"] == producer.REGISTRY_SOURCE,
           "registry row lost its source id")

    # --- Dropped-count logging -----------------------------------------
    fixtures = [one, three, all_sse, no_remotes, loopback, no_type,
                fixture_server([{"type": "streamable-http", "url": "http://bad.example/mcp"}])]
    extra_rows = refused_rows = 0
    for srv in fixtures:
        _, extras, refused = build_row(srv)
        if extras:
            extra_rows += 1
        if refused:
            refused_rows += 1
    ok(extra_rows == 2, f"expected 2 rows with dropped extra endpoints, got {extra_rows}")
    ok(refused_rows == 2, f"expected 2 rows with a refused endpoint, got {refused_rows}")

    line = producer.registry_summary(7, 7, 1, 0, 0, 0, 0, 0, extra_rows, refused_rows)
    ok(f"{extra_rows} row(s) dropped extra remote endpoints" in line,
       f"dropped-endpoint count missing from the log line: {line}")
    ok(f"{refused_rows} row(s) declared an endpoint that was not publishable" in line,
       f"refused-endpoint count missing from the log line: {line}")

    # The mcpservers.org directory feed: a real fetch or a recorded refusal.
    test_mcpservers_feed_is_fetched_or_refused(ok)

    print(f"REMOTE ENDPOINT TEST OK ({checks} checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
