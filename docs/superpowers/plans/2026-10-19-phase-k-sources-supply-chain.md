# Phase K — Sources & Supply Chain (K001–K004, K009 first half) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four `IN_PROGRESS` Phase-K rows with real, recorded evidence, and unblock the contested decision D4 so the Go pipeline can become authoritative.

**Architecture:** The producer (`scripts/build_full_catalog.py`) is the dataset authority; the snapshot store (`scripts/snapshot_store.py`) is the replay boundary; `internal/source` mirrors the snapshot format for the Go side. The machinery for snapshot completion (`_consume` → `attribute_rows` → `finalize_consumed_snapshots`) **already exists** — the defect is that some parsed URLs are never registered as consumed, so their records stay `partial` forever.

**Tech Stack:** Python 3 stdlib only (the producer must stay dependency-free — no `requests`, no `bs4`), `snapshot_store.py`'s self-test, Go for the dataset contract test.

**Spec:** `TODO.md` Phase K rows `LPSM-K001`–`LPSM-K009`, `ARCH/03-CATALOG-SOURCES.md` §4, `REMEDIATION-PLAN.md` decision `D4`, `ARCH/07-DECISIONS.md`.

## Global Constraints

- **Never fabricate.** A source that cannot be fetched is recorded as a failure (`failures.jsonl`) and the dataset records the source as incomplete. A row that was not fetched is never invented, and a star count, a version or a command is never synthesised.
- **Stdlib only.** The producer imports nothing outside the standard library.
- **A snapshot is `partial` until its bytes were actually parsed.** A body that was fetched but refused by a parser must stay `partial` — promoting it would claim a completion that did not happen.
- **Offline replay must keep working.** A run without `--refresh` must succeed from the recording, and must be byte-identical to a second replay.
- **Do not change the dataset's shape.** The row contract, the id grammar and the release layout are fixed by `ARCH/10`/`ARCH/18`; the web build must be unaffected (First Load ≤ 110 kB).
- **No publication.** No release cut, no deploy, no tag, no npm publish. A dataset change that is not released is a working-tree change, and the release is a separate human action.
- **Never let an experiment overwrite the committed dataset.** `build_full_catalog.py` writes `web/data/catalog.json` by default, which is a 54 MB committed file. While experimenting, always pass `--output <temp path>` and diff against the committed file; only write the real path when the result is intended and has been diffed. Use `--only-source <id>` to run one source block and `--skip-source a,b` to skip slow ones.
- **Bound the crawl.** `feed:mcpmarket-com` is budgeted at 2,000 page fetches with a 1 s crawl delay — a full run can take half an hour, and the handover records two runs being killed. Use `--only-source` / `--skip-source`, and run the long fetch in the background with a generous timeout rather than letting it block.
- **Snapshots are not committed.** `source-snapshots/` is gitignored by design: the bodies are upstream content with their own licences, and the store is a *local* cache. "Recorded" means recorded in the store with a real status — not committed to git. Do not un-gitignore the directory.

## Review Focus

1. **A body that was fetched but not parsed** must stay `partial`; the fix must not promote records that were never consumed.
2. **A replay run** (no `--refresh`) must produce the same dataset as the run that recorded the snapshots — if the fix changes a row count, the recording and the dataset have diverged.
3. **A failed fetch** must appear in `failures.jsonl` with the stage and the error, and must not appear in the dataset as a row.
4. **A source that returns fewer rows than before** must be reported as a change, not silently accepted as complete.

---

## Task 1: K004 — every parsed snapshot is completed (no records stuck `partial`)

**Files:**
- Modify: `scripts/build_full_catalog.py` (the per-source parse sites that call `obtain()` but never `_consume()` / `attribute_rows()`)
- Test: `scripts/test_snapshot_lifecycle.py` (exists — extend it; it is currently manual-only and must stay runnable standalone)

**Interfaces:**
- Consumes: `snapshot_store.mark_ingested(root, url, item_count)`, `snapshot_store.list_history`, the producer's `_consume(url, source_id)` and `attribute_rows(url, rows)`.
- Produces: after a successful run, every snapshot the run *parsed* is `healthy` with a real `itemCount`; every snapshot it did not parse is still `partial`.

- [ ] **Step 1: Write the failing test.**
  In `scripts/test_snapshot_lifecycle.py` add `test_every_parsed_snapshot_is_completed`: build a temp snapshot store, write two snapshots (a "skills-like" per-item URL and an index URL), run the producer's parse path against them (or, if the producer path is too heavy for a unit test, call the producer's `_consume`/`attribute_rows`/`finalize_consumed_snapshots` sequence directly), and assert that the consumed URL becomes `healthy` with the right `itemCount` while the un-consumed URL stays `partial`.
  The assertion that matters: **a record that was never consumed is still `partial` after finalization.**
- [ ] **Step 2: Run it and watch it fail.**
  Run: `python3 scripts/test_snapshot_lifecycle.py`
  Expected: FAIL on the "consumed URL did not become healthy" assertion, or on the skills.sh-shaped case if the producer does not register that URL.
- [ ] **Step 3: Find the URLs that are parsed but never consumed.**
  Grep the producer for every `obtain(` call site (there are five: the mcp list, the skills list, the official registry, the plugin manifests, and the quiet variant at line ~1150). For each, confirm the parse path calls `_consume(url, source_id)` and `attribute_rows(url, rows)` with the row count the parse actually produced. The skills.sh source is the known offender — 138 of its records are stuck `partial`.
- [ ] **Step 4: Register the missing consumption.**
  Add the `_consume` / `attribute_rows` calls at the sites identified in step 3. A URL whose decode raised must NOT be consumed (its bytes did not produce usable content) — that is the existing contract in `_consume`'s docstring, keep it.
- [ ] **Step 5: Run the test and the store self-test.**
  Run: `python3 scripts/test_snapshot_lifecycle.py && python3 scripts/snapshot_store.py`
  Expected: both PASS; the self-test prints `SNAPSHOT STORE SELFTEST OK`.
- [ ] **Step 6: Prove it on the real store.**
  Run a replay build (no `--refresh`) and count the records still `partial`:
  Run: `python3 scripts/build_full_catalog.py 2>&1 | tail -30` then count `partial` records under `source-snapshots/`.
  Expected: the count of `partial` records that correspond to URLs the run parsed drops to zero; any remaining `partial` record is one whose bytes were never parsed, and the run says so.
  Record the before/after numbers in your report.
- [ ] **Step 7: Commit.**
  ```bash
  git add scripts/build_full_catalog.py scripts/test_snapshot_lifecycle.py
  git commit -m "fix(catalog): every snapshot the build parses is completed"
  ```

---

## Task 2: K001 — the official MCP Registry API is fetched and recorded

**Files:**
- Modify: `scripts/build_full_catalog.py` only if the fetch path needs a fix (do not restructure it)
- Test: `scripts/test_catalog_ingestion_safety.py` (exists — extend if needed)

**Interfaces:**
- Consumes: `REGISTRY_API = "https://registry.modelcontextprotocol.io/v0/servers"`, `obtain(url, source_id, timeout, refresh, label)`, `snapshot_store.write_snapshot`.
- Produces: a recorded snapshot of the registry API with `source_id = "builtin:mcp-registry"`, rows whose namespace is the registry's own (`io.github.*`, `ai.smithery/*`, …), and an offline replay that reproduces them.

- [ ] **Step 1: Write the failing test.**
  Add to `scripts/test_catalog_ingestion_safety.py` a test that asserts the registry fetch path is *bounded*: it never requests more than `REGISTRY_MAX_PAGES` pages, never exceeds `REGISTRY_PAGE_LIMIT` per request, and only accepts `https://registry.modelcontextprotocol.io` as the host. The test must not need the network.
- [ ] **Step 2: Run it and watch it fail** (if the bounds are not already enforced) — then implement or confirm.
- [ ] **Step 3: Fetch the registry live and record it.**
  Run: `python3 scripts/build_full_catalog.py --refresh` (or the narrowest invocation that fetches only the registry source — check the CLI's `--only-source` flag; use it if present).
  Expected: a snapshot recorded for the registry API with status `partial` (then `healthy` after the parse, per Task 1), and registry rows present with their own namespaces.
  If the live fetch fails, record the failure in `failures.jsonl` and report it — **do not fabricate rows and do not fall back to a stale snapshot silently**. The STALE notice is printed by `obtain()`; keep it.
- [ ] **Step 4: Prove the offline replay.**
  Run: `python3 scripts/build_full_catalog.py` with no `--refresh`, against the store written in step 3.
  Expected: the run succeeds, prints `CATALOG_INGESTION_STATUS`, and the row counts are identical to step 3. Record the counts.
- [ ] **Step 5: Record the namespace check.**
  In your report, list the distinct namespaces among the registry rows and confirm each is the registry's own (not a rewritten form). `canonical_id()` is the fail-closed funnel — a row whose id the domain grammar rejects must be refused, not repaired.
- [ ] **Step 6: Commit** (only if a code change was needed; a recorded snapshot is local state, not a commit).
  ```bash
  git add scripts/build_full_catalog.py scripts/test_catalog_ingestion_safety.py
  git commit -m "feat(catalog): the registry API is fetched, recorded and replayable"
  ```

---

## Task 3: K003 — `feed:mcpservers-org` gets a real fetch (or a real, recorded failure)

**Files:**
- Modify: `scripts/build_full_catalog.py` only if the feed's request is what gets refused
- Test: `scripts/test_remote_endpoints.py` (exists) or a new focused test

**Interfaces:**
- Consumes: the `feed:mcpservers-org` source definition, `obtain()`, `snapshot_store.log_failure`.
- Produces: either ≥1 snapshot for the feed with a real status, or a `failures.jsonl` entry naming the stage and the error — and in both cases **zero fabricated rows**.

- [ ] **Step 1: Write the failing test.**
  Assert the invariant, not the network: after a run that includes the feed, either the feed has a recorded snapshot, or `failures.jsonl` has an entry for it — and the dataset contains no row whose `source` is the feed unless the feed was actually ingested. A source id that appears in the dataset with zero corresponding snapshot is a fabrication.
- [ ] **Step 2: Run it and watch it fail** (the feed currently has zero snapshots and, if the row count is non-zero, zero provenance evidence).
- [ ] **Step 3: Attempt the fetch and find out why it is refused.**
  The handover records that `mcpservers.org` returns 403 to automation. Determine the actual reason (user-agent policy, bot protection, path). If a documented, policy-respecting request path exists (an official API, a published feed, a robots-permitted endpoint), use it. If the site refuses automation, record the refusal honestly in `failures.jsonl` and report that the feed stays unsourced — that is an acceptable end state, and the row must be absent from the dataset.
  **Do not** spoof an identity to defeat a bot policy.
- [ ] **Step 4: Implement the outcome** (a supported request path, or a precise, recorded refusal).
- [ ] **Step 5: Run the test and the full producer replay.**
  Run: `python3 scripts/test_remote_endpoints.py && python3 scripts/build_full_catalog.py`
  Expected: PASS; the dataset has no `feed:mcpservers-org` rows unless a snapshot exists.
- [ ] **Step 6: Commit.**
  ```bash
  git add scripts/build_full_catalog.py scripts/test_remote_endpoints.py
  git commit -m "feat(catalog): the mcpservers-org feed is fetched or its refusal is recorded"
  ```

---

## Task 4: K002 — the provenance contract, proved over the committed dataset

**Files:**
- Modify: `internal/catalogbuild/dataset_test.go` only if the committed dataset exposes a contract gap
- Test: `internal/catalogbuild/dataset_test.go` (the K002 contract test already exists — line ~499)

**Interfaces:**
- Consumes: `web/data/catalog.json` (69,376 rows), the `domain.SourceID` grammar.
- Produces: a test that fails if any row loses its `source`, or carries a grammar-invalid one.

- [ ] **Step 1: Run the existing contract test and record the result.**
  Run: `go test ./internal/catalogbuild/ -run 'K002|Source|Provenance' -v`
  Expected: PASS today — the committed dataset already carries `source` on all 69,376 rows and 12 distinct source ids (measured 2026-10-19).
- [ ] **Step 2: If it passes, do not add a redundant test.** Instead, extend the existing assertion to cover the *whole* committed dataset rather than a fixture: every row's `source` must parse as a `domain.SourceID` and must be one of the ids the producer can emit. A row whose `source` is a typo must fail the build, not ship.
- [ ] **Step 3: Run the test and the tree.**
  Run: `go test ./internal/catalogbuild/ -v && go test ./...`
  Expected: PASS.
- [ ] **Step 4: Commit** (only if step 2 changed something).
  ```bash
  git add internal/catalogbuild
  git commit -m "test(catalog): the provenance contract holds over the whole committed dataset"
  ```

---

## Task 5: K009 first half — the D4 evidence the ADR needs

**Files:**
- Create: `scripts/test_builder_parity.py` (a parity harness the Go builder and the Python producer can both be run through)
- Read only: `internal/catalogbuild/compiler.go`, `scripts/build_full_catalog.py`

**Interfaces:**
- Consumes: `go run ./cmd/litespm catalog build --materialize` (the Go builder) and the Python producer's dataset.
- Produces: a parity measurement — how many rows the Go builder and the Python producer disagree on, and how — recorded as data the ADR can cite. **Not** a cutover.

- [ ] **Step 1: Write the harness.**
  `scripts/test_builder_parity.py` must: build the Go release from the committed dataset into a temp dir, read the Go builder's listings, read the Python producer's dataset, and compare them **row by row** on the fields both own (id, kind, name, summary, version, installability, source, publisher, url, transport). It prints a machine-readable `BUILDER_PARITY {"compared": N, "identical": N, "differing": N, "examples": [...]}` line and exits non-zero when a difference is not explainable by a declared field ownership split.
- [ ] **Step 2: Run it and record the number.**
  Run: `python3 scripts/test_builder_parity.py`
  Expected: a number. Whatever it is, it is the ADR's evidence — a parity figure of 100% would mean the split is safe; a figure below 100% names exactly which fields disagree and the ADR must say who owns them.
- [ ] **Step 3: Do not cut over.** The cutover (making the Go builder the production publisher) is a separate, human-approved step. This task produces the measurement only.
- [ ] **Step 4: Commit.**
  ```bash
  git add scripts/test_builder_parity.py
  git commit -m "test(catalog): measure what the Go builder and the Python producer disagree on"
  ```

---

## Self-review

**Spec coverage.** K001 → Task 2; K002 → Task 4; K003 → Task 3; K004 → Task 1; K009 → Task 5 (the measurement; the ADR text and the cutover are the orchestrator's). K006 (signed advisories), K007 (TUF root) and K008 (npm/PyPI sources) are **not** in this plan: each is a design-plus-implementation item of its own size, and each needs its own plan file before an implementer starts. They are listed in the program plan as Track 2b.

**Step scan.** Each step names a file, a command, and the expected output. No step says "add appropriate validation".

**Type consistency.** The producer's `_consume` / `attribute_rows` / `finalize_consumed_snapshots` names, the store's `mark_ingested(root, url, item_count)` signature and the `BUILDER_PARITY` output line are fixed here and are the names the ADR and the later tracks cite.

**Review Focus.** All four lines are pinned: an unparsed body stays `partial` (Task 1 step 1), replay is byte-stable (Task 2 step 4), a failure is recorded and never becomes a row (Task 3 steps 1 and 3), and a shrunken source is reported (Task 3 step 3).
