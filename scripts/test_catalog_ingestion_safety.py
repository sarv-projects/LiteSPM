"""Focused offline regression checks for producer fetch and registry behavior."""

import contextlib
import io
import json
import socket
import os
import sys
import tempfile
import urllib.parse
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_full_catalog as producer  # noqa: E402
import snapshot_store  # noqa: E402


def _public_dns(host, port, type=None):
    return [(None, None, None, None, ("93.184.216.34", port))]


def _registry_page(servers, next_cursor=None):
    """One /v0/servers envelope in the shape the registry publishes it."""
    metadata = {"count": len(servers)}
    if next_cursor is not None:
        metadata["nextCursor"] = next_cursor
    return json.dumps({"servers": servers, "metadata": metadata}).encode("utf-8")


def _registry_element(name, description, version="1.0.0", latest=True):
    """One wrapped server.json record with its official _meta block."""
    return {
        "server": {"name": name, "description": description, "version": version},
        "_meta": {producer.REGISTRY_META_KEY: {"status": "active", "isLatest": latest}},
    }


def test_registry_fetch_is_bounded(ok):
    """The registry fetch path is bounded, recorded and namespace-faithful.

    K001 asks for the official registry API to be fetched, recorded and
    replayable offline. The bounds are part of that contract, so they are
    pinned here (no network, no live upstream):

      * every request addresses the registry host over https and asks for at
        most REGISTRY_PAGE_LIMIT records;
      * pagination stops at REGISTRY_MAX_PAGES pages, and stops earlier when
        the upstream cursor stops advancing (an unbounded cursor walk would
        hammer the API);
      * every page the run parsed is recorded as a snapshot under the
        registry's own source id and completed with the rows it produced;
      * the rows keep the registry's own namespace -- the id is namespaced
        under builtin:mcp-registry and the publisher is the reverse-DNS root
        the registry itself published, never a rewritten form.
    """
    saved_max_pages = producer.REGISTRY_MAX_PAGES
    try:
        # A three-page walk with a page cap of 2: the run must stop at the cap.
        producer.REGISTRY_MAX_PAGES = 2
        pages = {
            None: _registry_page(
                [_registry_element("io.github.acme/demo-mcp", "A demo server.")],
                next_cursor="cursor-1"),
            "cursor-1": _registry_page(
                [_registry_element("ai.smithery/another", "Another server.")],
                next_cursor="cursor-2"),
            "cursor-2": _registry_page(
                [_registry_element("io.github.acme/third", "A third server.")]),
        }
        requested = []

        def fake_http_get(url, timeout, etag=None, source_id=None):
            requested.append(url)
            parsed = urllib.parse.urlsplit(url)
            params = urllib.parse.parse_qs(parsed.query)
            cursor = (params.get("cursor") or [None])[0]
            body = pages.get(cursor)
            if body is None:
                raise OSError(f"no canned registry page for cursor {cursor!r}")
            return 200, {}, body

        with tempfile.TemporaryDirectory() as root:
            with mock.patch.dict(os.environ,
                                 {"LITESPM_SOURCE_SNAPSHOT_DIR": root}), \
                    mock.patch.object(producer, "_http_get",
                                      side_effect=fake_http_get):
                buffer = io.StringIO()
                with contextlib.redirect_stdout(buffer):
                    producer.build_full_catalog(
                        only_source=producer.REGISTRY_SOURCE)
            log = buffer.getvalue()

            ok(len(requested) == 2,
               f"the page cap was not honoured: {len(requested)} pages fetched")
            for url in requested:
                parsed = urllib.parse.urlsplit(url)
                ok(parsed.scheme == "https" and
                   parsed.hostname == "registry.modelcontextprotocol.io" and
                   parsed.path == "/v0/servers",
                   f"the registry fetch addressed an unexpected URL: {url}")
                params = urllib.parse.parse_qs(parsed.query)
                limit = int((params.get("limit") or ["0"])[0])
                ok(0 < limit <= producer.REGISTRY_PAGE_LIMIT,
                   f"the registry fetch asked for {limit} records per page")
                ok(params.get("limit") == [str(producer.REGISTRY_PAGE_LIMIT)],
                   f"the registry fetch did not use the page limit: {url}")

            # Every parsed page is recorded under the registry's own source id
            # and completed with the rows it produced.
            for url in requested:
                _body, meta = snapshot_store.load_snapshot(root, url)
                snap = meta["snapshot"]
                ok(snap["sourceId"] == producer.REGISTRY_SOURCE,
                   f"page snapshot carries source {snap['sourceId']!r}")
                ok(snap["status"] == "healthy",
                   f"the parsed registry page stayed {snap['status']!r}: {url}")
                ok(snap.get("itemCount") == 1,
                   f"the registry page must carry the 1 row it produced, got "
                   f"{snap.get('itemCount')!r}")
            ok("registry: PAGINATION INCOMPLETE" in log,
               "the run did not report that the page cap stopped the walk")

        # A cursor that never advances must stop the walk, not spin.
        requested2 = []

        def stuck_http_get(url, timeout, etag=None, source_id=None):
            requested2.append(url)
            return 200, {}, _registry_page(
                [_registry_element("io.github.acme/stuck", "A stuck server.")],
                next_cursor="same-cursor")

        with tempfile.TemporaryDirectory() as root:
            with mock.patch.dict(os.environ,
                                 {"LITESPM_SOURCE_SNAPSHOT_DIR": root}), \
                    mock.patch.object(producer, "_http_get",
                                      side_effect=stuck_http_get):
                buffer = io.StringIO()
                with contextlib.redirect_stdout(buffer):
                    producer.build_full_catalog(
                        only_source=producer.REGISTRY_SOURCE)
            ok(len(requested2) == 2,
               f"a stuck cursor must stop the walk after 2 pages, got "
               f"{len(requested2)}")
            ok("upstream cursor did not advance" in buffer.getvalue(),
               "the run did not report the cursor that did not advance")
    finally:
        producer.REGISTRY_MAX_PAGES = saved_max_pages

    # The row namespace is the registry's own: the id is namespaced under the
    # registry's source id and the publisher is the reverse-DNS root the
    # registry published, not a rewritten form of it.
    item_id = producer.canonical_id("mcp", producer.REGISTRY_SOURCE,
                                    "io.github.acme/demo-mcp")
    ok(item_id.startswith("mcp:builtin:mcp-registry:"),
       f"the registry row id is not namespaced under the registry: {item_id}")
    owner, url = producer.registry_publisher(
        "io.github.acme/demo-mcp",
        {"name": "io.github.acme/demo-mcp", "description": "x"})
    ok(owner == "acme" and url == "https://github.com/acme",
       f"the io.github namespace was rewritten: {owner!r} {url!r}")
    owner, url = producer.registry_publisher(
        "ai.smithery/another", {"name": "ai.smithery/another", "description": "x"})
    ok(owner == "ai.smithery" and url == "",
       f"a non-github registry root was rewritten: {owner!r} {url!r}")


def _other_source_ids():
    """Every source id the producer can ingest EXCEPT the registry.

    Derived from the producer's own tables, so a new source cannot slip past
    a test that skips "the others" by accident.
    """
    ids = {
        producer.FEED_AWESOME_MCP[1],
        producer.FEED_AWESOME_SKILLS[1],
        producer.FEED_OFFICIAL_SERVERS[1],
        producer.FEED_SKILLSH[1],
        producer.FEED_MCPSERVERS[1],
        producer.FEED_MCPMARKET[1],
    }
    for src in producer.MARKETPLACE_SOURCES:
        ids.add(src["source_id"])
    return frozenset(ids)


def test_registry_replay_is_offline_and_byte_reproducible(ok):
    """A recorded registry replays offline and reproduces the same dataset.

    K001 asks for the official registry API to be fetched, RECORDED and
    replayable offline. The bounded-fetch test above pins the request shape;
    this pins the recording half, with no network at all:

      * the first run fetches two canned pages and records them;
      * the second run replays those recordings -- the fetcher is replaced by
        a function that FAILS the test if it is ever called, so a replay that
        quietly re-fetched would be caught;
      * the two runs must produce byte-identical datasets, because a replay
        that differs from the recording has drifted from it;
      * every recorded page is completed with the rows it produced, and every
        row carries the registry's own namespace.
    """
    first_url = f"{producer.REGISTRY_API}?limit={producer.REGISTRY_PAGE_LIMIT}"
    second_url = f"{producer.REGISTRY_API}?limit={producer.REGISTRY_PAGE_LIMIT}&cursor=cursor-1"
    pages = {
        first_url: _registry_page(
            [_registry_element("io.github.acme/demo-mcp", "A demo server.")],
            next_cursor="cursor-1"),
        second_url: _registry_page(
            [_registry_element("ai.smithery/another", "Another server.")]),
    }
    skip = _other_source_ids()

    def run(out_dir, root, fetcher):
        with mock.patch.dict(os.environ,
                             {"LITESPM_SOURCE_SNAPSHOT_DIR": root,
                              "CATALOG_OUT_DIR": out_dir}), \
                mock.patch.object(producer, "_http_get", side_effect=fetcher):
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                producer.build_full_catalog(skip_sources=skip)
            return buffer.getvalue()

    with tempfile.TemporaryDirectory() as root:
        out_fetched = os.path.join(root, "fetched")
        out_replayed = os.path.join(root, "replayed")

        def fake_http_get(url, timeout, etag=None, source_id=None):
            if url in pages:
                return 200, {}, pages[url]
            raise OSError(f"no canned response for {url}")

        run(out_fetched, root, fake_http_get)

        def no_network(url, timeout, etag=None, source_id=None):
            raise AssertionError(f"the replay touched the network: {url}")

        run(out_replayed, root, no_network)

        fetched = open(os.path.join(out_fetched, "catalog.json"), "rb").read()
        replayed = open(os.path.join(out_replayed, "catalog.json"), "rb").read()
        ok(fetched == replayed,
           "the offline replay did not reproduce the recorded dataset byte for byte")

        rows = json.loads(fetched.decode("utf-8"))
        ok(len(rows) == 2,
           f"the two canned registry pages must produce 2 rows, got {len(rows)}")
        for row in rows:
            ok(row["source"] == producer.REGISTRY_SOURCE,
               f"a registry row lost its source: {row.get('source')!r}")
            ok(row["id"].startswith("mcp:builtin:mcp-registry:"),
               f"a registry row is not namespaced under the registry: {row['id']!r}")
            ok(row["version"] is not None,
               "a registry row must publish the version the record declared")

        # Every recorded page is completed with the rows it produced, and the
        # recording survives the replay unchanged.
        for url, expected in ((first_url, 1), (second_url, 1)):
            _body, meta = snapshot_store.load_snapshot(root, url)
            snap = meta["snapshot"]
            ok(snap["status"] == "healthy",
               f"the recorded registry page stayed {snap['status']!r}: {url}")
            ok(snap.get("itemCount") == expected,
               f"the registry page must carry {expected} row(s), got "
               f"{snap.get('itemCount')!r}")


def main():
    checks = 0

    def ok(cond, message):
        nonlocal checks
        if not cond:
            raise AssertionError(message)
        checks += 1

    # Destination policy: configured exact hosts are accepted, sitemap-fed
    # arbitrary hosts, credentials, private literals and non-HTTPS URLs are not.
    with mock.patch.object(producer.socket, "getaddrinfo", side_effect=_public_dns):
        producer._validate_request_url(
            "https://skills.sh/sitemap.xml", "feed:skills-sh")
    for url in (
        "https://127.0.0.1/sitemap-skills-1.xml",
        "https://skills.sh.evil.example/sitemap.xml",
        "https://user:pass@skills.sh/sitemap.xml",
        "http://skills.sh/sitemap.xml",
    ):
        try:
            producer._validate_request_url(url, "feed:skills-sh", check_dns=False)
        except ValueError:
            ok(True, f"unsafe request URL accepted: {url}")
        else:
            ok(False, f"unsafe request URL accepted: {url}")

    with mock.patch.object(producer.socket, "getaddrinfo", return_value=[
            (None, None, None, None, ("169.254.169.254", 443))]):
        try:
            producer._validate_request_url(
                "https://skills.sh/sitemap.xml", "feed:skills-sh")
        except ValueError:
            ok(True, "allowlisted hostname resolving to link-local IP rejected")
        else:
            ok(False, "allowlisted hostname resolving to link-local IP accepted")

    # Mixed DNS answers fail closed rather than selecting just the public
    # answer. This is also checked again at the point the socket is opened.
    with mock.patch.object(producer.socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "",
             ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "",
             ("10.0.0.4", 443)),
    ]):
        try:
            producer._resolve_public_addresses("skills.sh", 443)
        except ValueError:
            ok(True, "mixed public/private DNS answers rejected")
        else:
            ok(False, "mixed public/private DNS answers accepted")

    # The actual HTTPS connection uses the exact checked sockaddr and retains
    # the DNS hostname for certificate validation/SNI (no second DNS dial).
    class FakeSocket:
        connected = None
        timeout = None
        closed = False

        def settimeout(self, value):
            self.timeout = value

        def connect(self, address):
            self.connected = address

        def close(self):
            self.closed = True

    class FakeTLSContext:
        server_hostname = None

        def wrap_socket(self, sock, server_hostname=None):
            self.server_hostname = server_hostname
            return sock

    pinned = FakeSocket()
    tls_context = FakeTLSContext()
    allowed_sockaddr = ("93.184.216.34", 443)
    with mock.patch.object(producer.socket, "getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", allowed_sockaddr)]), \
            mock.patch.object(producer.socket, "socket", return_value=pinned):
        conn_type = producer._source_https_connection("feed:skills-sh")
        conn = conn_type("skills.sh", timeout=2)
        conn._context = tls_context
        conn.connect()
    ok(pinned.connected == allowed_sockaddr,
       "HTTPS connection did not dial the exact validated sockaddr")
    ok(tls_context.server_hostname == "skills.sh",
       "HTTPS TLS hostname verification did not retain the origin hostname")

    # Replay cannot bypass the allowlist using an already-recorded arbitrary
    # sitemap URL; validation occurs before snapshot lookup.
    try:
        producer.obtain("https://127.0.0.1/sitemap-skills-1.xml",
                        "feed:skills-sh", 1, False, "test")
    except ValueError:
        ok(True, "unsafe replay URL rejected before snapshot lookup")
    else:
        ok(False, "unsafe replay URL bypassed destination policy")

    # Redirect validation applies the source allowlist and public-IP check.
    handler = producer._SourceRedirectHandler("feed:skills-sh")
    request = producer.urllib.request.Request("https://skills.sh/sitemap.xml")
    with mock.patch.object(producer.socket, "getaddrinfo", side_effect=_public_dns):
        redirected = handler.redirect_request(
            request, None, 302, "Found", {}, "https://www.skills.sh/sitemap-1.xml")
        ok(redirected is not None, "approved same-source redirect was not followed")
    try:
        handler.redirect_request(
            request, None, 302, "Found", {}, "https://169.254.169.254/latest/meta-data")
    except ValueError:
        ok(True, "private redirect destination rejected")
    else:
        ok(False, "private redirect destination accepted")

    ok(producer._is_source_sitemap_url(
        "https://www.skills.sh/sitemap-skills-1.xml", "feed:skills-sh",
        r"/sitemap-skills-[A-Za-z0-9._-]+\.xml"),
       "valid skills sub-sitemap URL rejected")
    for loc, source_id, pattern in (
        ("https://skills.sh.evil.example/sitemap-skills-1.xml", "feed:skills-sh",
         r"/sitemap-skills-[A-Za-z0-9._-]+\.xml"),
        ("https://skills.sh/nested/sitemap-skills-1.xml", "feed:skills-sh",
         r"/sitemap-skills-[A-Za-z0-9._-]+\.xml"),
        ("https://mcpservers.org.evil.example/sitemaps/servers/1.xml", "feed:mcpservers-org",
         r"/sitemaps/servers/[A-Za-z0-9._-]+\.xml"),
        ("https://mcpservers.org/sitemaps/servers/1.xml?next=bad", "feed:mcpservers-org",
         r"/sitemaps/servers/[A-Za-z0-9._-]+\.xml"),
    ):
        ok(not producer._is_source_sitemap_url(loc, source_id, pattern),
           f"invalid sitemap URL accepted: {loc}")

    # The streaming cap refuses an over-limit body even without Content-Length
    # and closes the response on the error path.
    class Response:
        headers = {}
        closed = False

        def getcode(self):
            return 200

        def read(self, size=-1):
            return b"12345"[:size]

        def close(self):
            self.closed = True

    response = Response()

    class Opener:
        def open(self, req, timeout=None):
            return response

    with mock.patch.object(producer, "MAX_RESPONSE_BYTES", 4), \
            mock.patch.object(producer.socket, "getaddrinfo", side_effect=_public_dns), \
            mock.patch.object(producer.urllib.request, "build_opener", return_value=Opener()):
        try:
            producer._http_get("https://skills.sh/sitemap.xml", 1,
                               source_id="feed:skills-sh")
        except ValueError as exc:
            ok("byte limit" in str(exc), "oversized response gave the wrong error")
        else:
            ok(False, "oversized response was accepted")
    ok(response.closed, "oversized HTTP response was not closed")

    # Registry metadata must be structurally complete and only an explicit
    # active status is publishable.
    elements, cursor = producer.registry_page_parts(
        b'{"servers": [], "metadata": {"nextCursor": "next"}}')
    ok(elements == [] and cursor == "next", "valid registry page envelope not decoded")
    for payload in (
        b'{"servers": []}',
        b'{"servers": [], "metadata": {"nextCursor": 12}}',
        ('{"servers": [], "metadata": {"nextCursor": "' + "x" * 4097 + '"}}').encode(),
    ):
        try:
            producer.registry_page_parts(payload)
        except (ValueError, TypeError):
            ok(True, "malformed registry pagination metadata rejected")
        else:
            ok(False, "malformed registry pagination metadata treated as complete")
    ok(producer.registry_status_is_active("active"), "explicit active status rejected")
    ok(not producer.registry_status_is_active(None), "missing status treated as active")
    ok(not producer.registry_status_is_active(""), "empty status treated as active")
    ok(not producer.registry_status_is_active("deprecated"), "deprecated status treated as active")
    ok(producer.registry_latest_flag(True), "true latest flag was lost")
    ok(not producer.registry_latest_flag(False), "false latest flag became true")
    try:
        producer.registry_latest_flag("false")
    except TypeError:
        ok(True, "non-boolean isLatest metadata rejected")
    else:
        ok(False, "truthy string isLatest metadata was accepted")

    # Refresh fallback is represented in the machine-readable run summary even
    # though bulk progress output is intentionally quiet.
    with tempfile.TemporaryDirectory() as root:
        url = "https://skills.sh/sitemap.xml"
        snapshot_store.write_snapshot(
            root, url, "feed:skills-sh", None, 200, b"<sitemap/>")
        producer._reset_run_ledger()
        with mock.patch.object(snapshot_store, "default_root", return_value=root), \
                mock.patch.object(producer, "_http_get", side_effect=OSError("offline")):
            result = producer.obtain(url, "feed:skills-sh", 1, True, "sitemap")
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            producer._print_ingestion_status(True, frozenset(), None)
        ok(result == b"<sitemap/>", "refresh failure did not use the recorded bytes")
        ok('"staleSources": ["feed:skills-sh"]' in output.getvalue(),
           "stale fallback was omitted from structured ingestion status")

    # The registry fetch path: bounded, recorded, namespace-faithful.
    test_registry_fetch_is_bounded(ok)

    # The registry recording: a replay reproduces the recorded dataset
    # offline, byte for byte.
    test_registry_replay_is_offline_and_byte_reproducible(ok)

    print(f"CATALOG INGESTION SAFETY TEST OK ({checks} checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
