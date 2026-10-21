#!/usr/bin/env python3
"""The catalog snapshot must not depend on the checkout's line endings.

Regression test for bd19ab9 (#462), where catalog-summary.json was regenerated
on a CRLF checkout. Every recorded sha256 was the CRLF hash of the source file,
so `verify:data` failed on every LF platform, including CI.

The upstream generator (`scripts/generate-catalog-summary.py`) is not vendored, so
the digest is computed here instead: the committed snapshot is the proof that the
local computation agrees with upstream, because the recorded hashes were produced
by the upstream generator and this test compares the two.
"""

import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

def _find_repo():
    """The upstream repository root, or None when it is not in this checkout.

    The upstream repository ships the generator that computes the snapshot
    digests. When it is present this module uses it; when it is not, the same
    digest is computed from the committed data.
    """
    for parent in Path(__file__).resolve().parents:
        if (parent / "scripts" / "generate-catalog-summary.py").is_file():
            return parent
    return None


REPO = _find_repo()
# The skill this module belongs to: <root>/.agents/skills/<skill>/.
SKILL_DIR = Path(__file__).resolve().parents[2]
# Upstream keeps the catalog under src/ui-ux-pro-max/data; the vendored copy
# keeps it in the skill's own data/ directory.
DATA = REPO / "src/ui-ux-pro-max/data" if REPO else SKILL_DIR / "data"
SNAPSHOT_FILES = (
    "google-fonts.csv",
    "google-font-licenses.json",
    "icons.csv",
    "phosphor-icons-upstream.json",
)


def _load_generator():
    """The upstream generator module, or None when it is not vendored."""
    if REPO is None:
        return None
    path = REPO / "scripts" / "generate-catalog-summary.py"
    spec = importlib.util.spec_from_file_location("generate_catalog_summary", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GENERATOR = _load_generator()


def digest(path):
    """The sha256 of a file's CRLF-normalized bytes.

    Upstream's generator normalizes line endings before hashing, so the recorded
    hash does not change with the checkout's line endings. The upstream module is
    used when it is present; otherwise the same normalization is applied here.
    """
    if GENERATOR is not None:
        return GENERATOR.digest(path)
    return hashlib.sha256(Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


class CatalogSummaryLineEndingsTest(unittest.TestCase):
    def test_the_committed_snapshot_is_present(self):
        for name in SNAPSHOT_FILES:
            self.assertTrue((DATA / name).is_file(), f"missing committed source: {name}")
        self.assertTrue((DATA / "catalog-summary.json").is_file(),
                        "missing committed catalog-summary.json")

    def test_digest_is_identical_for_lf_and_crlf(self):
        with tempfile.TemporaryDirectory() as tmp:
            lf = Path(tmp) / "lf.csv"
            crlf = Path(tmp) / "crlf.csv"
            lf.write_bytes(b"id,name\n1,alpha\n2,beta\n")
            crlf.write_bytes(b"id,name\r\n1,alpha\r\n2,beta\r\n")
            self.assertEqual(
                digest(lf), digest(crlf),
                "snapshot hashes must not change with the checkout's line endings",
            )

    def test_committed_snapshot_matches_normalized_sources(self):
        summary = json.loads((DATA / "catalog-summary.json").read_text(encoding="utf-8"))
        for name in SNAPSHOT_FILES:
            expected = hashlib.sha256(
                (DATA / name).read_bytes().replace(b"\r\n", b"\n")
            ).hexdigest()
            self.assertEqual(
                summary["snapshots"][name]["sha256"], expected,
                f"{name}: committed snapshot hash does not match the LF-normalized source",
            )

    def test_crlf_checkout_produces_the_committed_hashes(self):
        """Simulate a Windows checkout: the recorded hashes must still validate."""
        summary = json.loads((DATA / "catalog-summary.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            for name in SNAPSHOT_FILES:
                crlf_copy = Path(tmp) / name
                raw = (DATA / name).read_bytes().replace(b"\r\n", b"\n")
                crlf_copy.write_bytes(raw.replace(b"\n", b"\r\n"))
                self.assertEqual(
                    digest(crlf_copy), summary["snapshots"][name]["sha256"],
                    f"{name}: a CRLF checkout would record a different hash",
                )


if __name__ == "__main__":
    unittest.main()
