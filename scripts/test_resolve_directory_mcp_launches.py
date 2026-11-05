"""Offline checks for the directory -> registry launch resolver.

The resolver is deliberately evidence-only. These tests pin the two failure
modes that would make a promoted row dishonest (a different owner, or a
different repository) and the two contract fields the release builder requires
(version and transport).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import resolve_directory_mcp_launches as resolver  # noqa: E402


def registry_row(**overrides):
    row = {
        "id": "mcp:builtin:mcp-registry:acme-widget-mcp",
        "kind": "mcp",
        "name": "Widget",
        "slug": "widget-mcp",
        "source": "builtin:mcp-registry",
        "repository": "https://github.com/acme/widget-mcp",
        "version": "1.2.3",
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "widget-mcp@1.2.3"],
        "runtime": "node",
        "url": None,
        "installability": "metadata_verified",
    }
    row.update(overrides)
    return row


def directory_row(**overrides):
    row = {
        "id": "mcp:acme:widget-mcp",
        "kind": "mcp",
        "name": "Widget",
        "slug": "widget-mcp",
        "source": "feed:punkpeye-awesome-mcp-servers",
        "publisher": {"name": "acme", "url": "https://github.com/acme"},
        "transport": None,
        "command": None,
        "args": None,
        "runtime": "typescript",
        "version": None,
        "installability": "discovery_only",
        "upstreamTransportHint": "sse",
    }
    row.update(overrides)
    return row


class ResolveDirectoryLaunchesTest(unittest.TestCase):
    def test_exact_owner_and_repository_promotes_command(self):
        rows = [registry_row(), directory_row()]
        report = resolver.resolve_directory_launches(rows)
        self.assertEqual(report["resolved"], 1)
        row = rows[1]
        self.assertEqual(row["installability"], "metadata_verified")
        self.assertEqual(row["command"], "npx")
        self.assertEqual(row["args"], ["-y", "widget-mcp@1.2.3"])
        self.assertEqual(row["version"], "1.2.3")
        self.assertEqual(row["transport"], "stdio")
        self.assertNotIn("upstreamTransportHint", row)
        self.assertEqual(row["resolvedFrom"]["listingId"], registry_row()["id"])

    def test_remote_launch_is_copied(self):
        remote = registry_row(
            command=None,
            args=None,
            runtime=None,
            url="https://mcp.acme.example/mcp",
            transport="streamable-http",
        )
        rows = [remote, directory_row()]
        resolver.resolve_directory_launches(rows)
        self.assertEqual(rows[1]["url"], "https://mcp.acme.example/mcp")
        self.assertEqual(rows[1]["transport"], "streamable-http")
        self.assertIsNone(rows[1]["command"])
        self.assertEqual(rows[1]["installability"], "metadata_verified")

    def test_different_owner_is_not_evidence(self):
        rows = [registry_row(), directory_row(publisher={"name": "other"})]
        report = resolver.resolve_directory_launches(rows)
        self.assertEqual(report["resolved"], 0)
        self.assertEqual(rows[1]["installability"], "discovery_only")
        self.assertIsNone(rows[1]["command"])

    def test_different_repository_is_not_evidence(self):
        rows = [registry_row(), directory_row(slug="different-repo")]
        report = resolver.resolve_directory_launches(rows)
        self.assertEqual(report["resolved"], 0)
        self.assertEqual(rows[1]["installability"], "discovery_only")

    def test_registry_row_without_launch_or_version_is_not_used(self):
        no_launch = registry_row(command=None, url=None)
        no_version = registry_row(version=None)
        for candidate in (no_launch, no_version):
            rows = [candidate, directory_row()]
            report = resolver.resolve_directory_launches(rows)
            self.assertEqual(report["resolved"], 0)
            self.assertEqual(rows[1]["installability"], "discovery_only")

    def test_already_installable_rows_are_never_rewritten(self):
        existing = directory_row(
            installability="runtime_verified",
            command="uvx",
            args=["pkg"],
            version="9.9.9",
        )
        rows = [registry_row(), existing]
        report = resolver.resolve_directory_launches(rows)
        self.assertEqual(report["resolved"], 0)
        self.assertEqual(existing["command"], "uvx")
        self.assertEqual(existing["version"], "9.9.9")

    def test_other_sources_are_not_touched(self):
        rows = [registry_row(), directory_row(source="feed:skills-sh", kind="skill")]
        report = resolver.resolve_directory_launches(rows)
        self.assertEqual(report["resolved"], 0)
        self.assertEqual(rows[1]["installability"], "discovery_only")


if __name__ == "__main__":
    unittest.main()
