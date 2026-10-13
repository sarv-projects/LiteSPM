"""Offline regression checks for the Pages budget gate.

`check_pages_limits.py` is the only thing standing between a catalog growth and
a `wrangler deploy` that fails at upload time and reports a CDN problem instead
of a spent budget, so its three outcomes are pinned here: over a hard limit
(fail), within `--headroom` of one (fail, with wording that says nothing is
actually over), and comfortably inside (pass). The default run in CI only ever
exercises the third — the real bundle is 80% of the per-asset ceiling — so the
first two would otherwise have no coverage at all.

Runs as a subprocess rather than importing, because the gate's exit code and
its printed explanation are the whole contract.

    python3 scripts/test_pages_limits.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check_pages_limits.py")

# 25 MiB + a little: over the per-asset limit outright.
OVER_ASSET = 25 * 1024 * 1024 + 256 * 1024
# Past the default 0.90 headroom (22.5 MiB) but still under the limit.
NEAR_ASSET = 23 * 1024 * 1024  # 92% of 25 MiB
# The shipped catalog's own state today: comfortably inside the default headroom.
SHIPPED_ASSET = 20 * 1024 * 1024  # 80% of 25 MiB
SAFE_ASSET = 4 * 1024 * 1024


def run(bundle: str, *extra: str) -> tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, SCRIPT, bundle, *extra],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, proc.stdout + proc.stderr


def make_bundle(size: int) -> str:
    root = tempfile.mkdtemp(prefix="litespm-pages-")
    data = os.path.join(root, "data")
    os.makedirs(data)
    with open(os.path.join(data, "catalog-0000.json"), "wb") as handle:
        handle.write(os.urandom(size))
    return root


def main() -> int:
    checks = 0
    bundles: list[str] = []
    try:
        safe = make_bundle(SAFE_ASSET)
        shipped = make_bundle(SHIPPED_ASSET)
        near = make_bundle(NEAR_ASSET)
        over = make_bundle(OVER_ASSET)
        bundles.extend([safe, shipped, near, over])

        code, out = run(safe)
        assert code == 0, f"a small bundle must pass, got {code}: {out}"
        checks += 1
        assert "OK" in out, f"a passing run must say so: {out}"
        checks += 1

        # The shipped catalog's largest shard is 20.00 MiB — 80% of the ceiling
        # and below the default 0.90 headroom. This must keep passing, or the
        # gate would fail on the bundle CI actually builds.
        code, out = run(shipped)
        assert code == 0, f"an asset at 80% must pass the default 0.90 headroom, got {code}: {out}"
        checks += 1
        assert "OK" in out, f"the shipped state must still read OK: {out}"
        checks += 1

        # 23 MiB is past 0.90 but under the limit: a near miss, not a breach.
        code, out = run(near)
        assert code == 1, f"an asset at 92% of the limit must fail at headroom 0.90, got {code}: {out}"
        checks += 1
        assert "OVER:" not in out, f"a near miss must not be reported as over: {out}"
        checks += 1
        assert "nearly out of room" in out, f"near misses must say they are near, not over: {out}"
        checks += 1
        assert "would still accept this bundle" in out, (
            f"the explanation must not claim wrangler would reject it: {out}"
        )
        checks += 1

        # The same bundle passes if the operator asks only for the hard limits.
        code, out = run(near, "--headroom", "1.0")
        assert code == 0, f"--headroom 1.0 must restore over-the-line-only, got {code}: {out}"
        checks += 1
        assert "OK" in out, f"--headroom 1.0 pass must say so: {out}"
        checks += 1

        code, out = run(near, "--headroom", "0.85")
        assert code == 1, f"a threshold below the actual usage (92% > 85%) must fail, got {code}: {out}"
        checks += 1

        code, out = run(over)
        assert code == 1, f"an asset over 25 MiB must fail, got {code}: {out}"
        checks += 1
        assert "OVER:" in out, f"an over-limit asset must be labelled OVER: {out}"
        checks += 1
        assert "wrangler deploy` would reject" in out, (
            f"an over-limit run must keep the rejection warning: {out}"
        )
        checks += 1

        # A headroom of 1.0 does not excuse an asset that is actually over.
        code, out = run(over, "--headroom", "1.0")
        assert code == 1, f"--headroom 1.0 must still fail when over the limit, got {code}: {out}"
        checks += 1

        for bad in ("0", "1.5", "-0.2"):
            code, out = run(safe, "--headroom", bad)
            assert code == 2, f"--headroom {bad} must be a usage error, got {code}: {out}"
            assert "must be in (0, 1]" in out, f"--headroom {bad} needs a real message: {out}"
            checks += 2

        code, out = run(os.path.join(tempfile.gettempdir(), "litespm-does-not-exist"))
        assert code == 2, f"a missing bundle directory must be a usage error, got {code}: {out}"
        checks += 1

        print(f"OK pages limits — {checks} checks")
        return 0
    except AssertionError as exc:
        print(f"FAIL pages limits: {exc}")
        return 1
    finally:
        for bundle in bundles:
            shutil.rmtree(bundle, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
