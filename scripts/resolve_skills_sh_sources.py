#!/usr/bin/env python3
"""Resolve skills.sh listing pages to the GitHub source of each skill.

The public skills.sh page publishes one install command:

    npx skills add https://github.com/<owner>/<repo> --skill <name>

The producer used to keep only the skills.sh page URL, which is not a git
source, so every one of those rows stayed ``discovery_only``. This script
reads that command, downloads the repository once, finds the ``SKILL.md``
whose directory or frontmatter name matches, and writes the exact
``github.com/<owner>/<repo>/tree/HEAD/<path>`` source that the installer
can clone.

It is deliberately a separate step from the ordinary build: the tarball
scan needs one download per repository (about 2.2k), while normal builds
replay the committed index and stay offline.

Usage:
  python scripts/resolve_skills_sh_sources.py --dry-run
  python scripts/resolve_skills_sh_sources.py --apply
"""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import re
import subprocess
import sys
import tarfile
import time
import urllib.parse

sys.path.insert(0, "scripts")

import build_full_catalog as producer
import snapshot_store

CATALOG = "web/data/catalog.json"
INDEX = "web/data/skills-sh-sources.json"
MAX_TARBALL = 30 * 1024 * 1024
MAX_SKILL_MD = 256 * 1024
WORKERS = 6

CMD_RE = re.compile(
    r"npx skills add\s+(https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)"
    r"(?:\s+--skill\s+([A-Za-z0-9_.:-]+))?"
)


def install_source(page: bytes) -> tuple[str, str] | None:
    text = page.decode("utf-8", "replace")
    match = CMD_RE.search(text)
    if not match:
        return None
    repo = match.group(1).rstrip("/").replace(".git", "")
    name = (match.group(2) or "").strip()
    if not name:
        return None
    return repo, name


def safe_rel_path(name: str) -> str | None:
    parts = name.replace("\\", "/").split("/")
    if not parts or any(p in ("", ".", "..") for p in parts):
        return None
    if any(ord(c) < 0x20 for c in name):
        return None
    return "/".join(parts)


def default_ref(repo: str) -> str | None:
    """The repository's default branch, from `git ls-remote --symref`.

    A `/tree/HEAD/...` URL is a GitHub web convention: the installer clones
    with `git clone --branch <ref>`, and `HEAD` is not a branch, so a
    promoted tree must name the real default branch.
    """
    try:
        proc = subprocess.run(
            ["git", "ls-remote", "--symref", f"{repo}.git", "HEAD"],
            capture_output=True, text=True, timeout=30,
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    for line in proc.stdout.splitlines():
        if line.startswith("ref: refs/heads/") and line.endswith("\tHEAD"):
            return line[len("ref: refs/heads/"):-len("\tHEAD")]
    return None


def download_tarball(repo: str, ref: str) -> tuple[bytes | None, str]:
    """(tarball bytes, "") or (None, reason) for one repository ref."""
    slug = repo.replace("https://github.com/", "")
    url = f"https://codeload.github.com/{slug}/tar.gz/{ref}"
    try:
        proc = subprocess.run(
            ["curl.exe", "-sSL", "--max-time", "90", "--max-filesize",
             str(MAX_TARBALL), "--retry", "3", "--retry-delay", "5",
             "--retry-all-errors", url],
            capture_output=True, timeout=180,
        )
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if proc.returncode != 0:
        return None, f"curl exit {proc.returncode}"
    data = proc.stdout
    if not data:
        return None, "empty tarball"
    if len(data) > MAX_TARBALL:
        return None, "tarball exceeds limit"
    return data, ""


def scan_tarball(data: bytes) -> dict:
    """{normalized skill name: {path, name}} from a repository tarball."""
    found: dict[str, dict] = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r|gz") as tar:
            for member in tar:
                if not member.isfile() or not member.name.endswith("SKILL.md"):
                    continue
                rel = safe_rel_path(member.name)
                if rel is None:
                    continue
                # Archive members are prefixed with the repo directory.
                parts = rel.split("/", 1)
                if len(parts) != 2:
                    continue
                rel = parts[1]
                if not rel.endswith("SKILL.md"):
                    continue
                fileobj = tar.extractfile(member)
                if fileobj is None:
                    continue
                body = fileobj.read(MAX_SKILL_MD)
                name, description = producer.skill_md_frontmatter(body)
                if not name or not description:
                    continue
                directory = rel[: -len("SKILL.md")].rstrip("/")
                normalized = producer.sanitize_skill_name(name)
                dir_name = directory.rsplit("/", 1)[-1] if directory else ""
                dir_key = producer.sanitize_skill_name(dir_name) if dir_name else None
                record = {"path": directory, "name": name}
                for key in (normalized, dir_key):
                    if key:
                        found.setdefault(key, record)
    except Exception as exc:
        return {"error": f"tar: {type(exc).__name__}: {exc}"}
    return {"skills": found}


def scan_repo(repo: str) -> dict:
    """Resolve one repository at its default branch."""
    ref = default_ref(repo)
    if ref is None:
        return {"error": "no default branch"}
    data, reason = download_tarball(repo, ref)
    if data is None:
        return {"error": reason}
    result = scan_tarball(data)
    if "skills" in result:
        result["ref"] = ref
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=CATALOG)
    parser.add_argument("--index", default=INDEX)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.apply and not args.dry_run:
        parser.error("choose --dry-run or --apply")

    rows = json.load(open(args.catalog, encoding="utf-8"))
    targets = {}
    by_repo: dict[str, list[tuple[str, str, str]]] = {}
    root = snapshot_store.default_root()
    for row in rows:
        if row.get("source") != "feed:skills-sh":
            continue
        page_url = row.get("skillSource") or ""
        try:
            page, _ = snapshot_store.load_snapshot(root, page_url)
        except Exception:
            continue
        source = install_source(page)
        if source is None:
            continue
        repo, command_name = source
        targets[row["id"]] = (repo, command_name, page_url)
        by_repo.setdefault(repo, []).append((row["id"], command_name, row["slug"]))
    print(f"skills.sh rows: {len(targets)}, repositories: {len(by_repo)}")

    scanned: dict[str, dict] = {}
    errors = 0
    done = 0
    started = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(scan_repo, repo): repo for repo in by_repo}
        for future in concurrent.futures.as_completed(futures):
            repo = futures[future]
            result = future.result()
            scanned[repo] = result
            if "error" in result:
                errors += 1
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(by_repo)} repos, {errors} errors, "
                      f"{time.time() - started:.0f}s", flush=True)
    print(f"scanned {len(scanned)} repos ({errors} errors) in "
          f"{time.time() - started:.0f}s")

    sources: dict[str, dict] = {}
    for row_id, (repo, command_name, _page) in targets.items():
        skills = scanned.get(repo, {}).get("skills") or {}
        key = producer.sanitize_skill_name(command_name)
        record = skills.get(key) if key else None
        if record is None:
            continue
        directory = record["path"]
        ref = scanned.get(repo, {}).get("ref")
        if directory:
            if not ref:
                continue
            source = (f"{repo}/tree/{urllib.parse.quote(ref)}/{urllib.parse.quote(directory)}")
        else:
            source = repo
        if not producer.skill_source_parses_git(source):
            continue
        sources[row_id] = {
            "source": source,
            "repo": repo,
            "skill": record["name"],
            "path": directory,
            "ref": ref,
        }
    print(f"resolved {len(sources)}/{len(targets)} skills.sh rows")
    if args.apply:
        with open(args.index, "w", encoding="utf-8") as f:
            json.dump({
                "format": "litespm-skills-sh-sources/v1",
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "sources": sources,
            }, f, indent=2)
            f.write("\n")
        print(f"wrote {args.index}")
        for row in rows:
            entry = sources.get(row["id"])
            if not entry:
                continue
            row["skillSource"] = entry["source"]
            if isinstance(row.get("publisher"), dict):
                row["publisher"]["url"] = entry["source"]
            row["installability"] = producer.METADATA_VERIFIED
        with open(args.catalog, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2)
            f.write("\n")
        print(f"updated {args.catalog}")
    else:
        print("dry run: nothing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
