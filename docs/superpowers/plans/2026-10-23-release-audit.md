# LiteSPM release audit remediation

> Execution: native, as requested by the user; continue without approval pauses.

Goal: correct discovery, attribution, setup and loading defects before declaring a release ready.
Architecture: retain Next static export and the Cloudflare package resolver; share presentation rules across export, browser and edge. Keep CLI approval, path confinement and rollback guarantees.
Spec: user-supplied LiteSPM_Audit_2026-10-24.md (5,065 lines), plus the pasted real-user browser findings.

## Work and validation

- [x] Recover upstream 9c6e740 source; preserve the large catalog unchanged in remote trees.
- [x] Add focused regressions for source attribution, duplicate identity, task recommendations and query bounds.
- [x] Correct setup CTA, publisher control events, input bounds, featured ranking and management copy.
- [x] Add trust, about, roadmap, changelog and downloadable docs; link them in navigation and sitemap.
- [ ] Validate publisher facets/counts against the complete catalog and ensure worker/export normalization agrees.
- [ ] Verify package identity on initial HTML and hydration without unrelated package flashes.
- [ ] Verify light/dark, narrow-screen layouts, keyboard controls and long query containment.
- [ ] Extend CLI skill directory source parsing through the existing hardened installer; test a real isolated add/list/remove journey.
- [ ] Run complete build, CLI and browser suites; inspect failures and repeat affected checks.
- [ ] Review all changes, merge only verified work, and report exact tests and remaining release blockers.

Constraints: no invented compatibility, ratings, user quotes or runtime verification; no public deployment without approval. Local catalog placeholder is type-check-only, ignored by git, and must never enter an export or a commit.

Review focus: duplicate repositories with distinct subpaths/revisions; source owner versus distributor; failed publisher fetch and retry; 10,000-character query and URL refresh; real install/remove preserving unmanaged data.
