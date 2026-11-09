# Platform, Release Engineering & Migrations

## 1. Cross-Platform Compilation Matrix

LiteSPM is compiled as a single native static Go binary (`cmd/litespm`):

```text
┌─────────────────┬──────────────────────┬───────────────────────────────────────────┐
│ Target OS       │ Architecture         │ Native System Integrations                │
├─────────────────┼──────────────────────┼───────────────────────────────────────────┤
│ Windows         │ amd64, arm64         │ DPAPI, Named Pipes with DACL, Job Objects │
├─────────────────┼──────────────────────┼───────────────────────────────────────────┤
│ macOS           │ arm64 (Apple Silicon)│ Apple Keychain Services, Domain Sockets   │
│                 │ amd64 (Intel)        │                                           │
├─────────────────┼──────────────────────┼───────────────────────────────────────────┤
│ Linux           │ amd64, arm64         │ Secret Service (D-Bus), Domain Sockets    │
└─────────────────┴──────────────────────┴───────────────────────────────────────────┘
```

*   **SQLite Compilation:** Uses a pure-Go SQLite driver (`modernc.org/sqlite`) or static CGO compilation, ensuring zero dynamic C-runtime library dependencies across target environments.

---

## 2. Database Migration Lifecycle

Database migrations are tracked in `schema_migrations` and executed on daemon startup:

```go
type Migration struct {
    Version     int
    Description string
    UpSQL       string
}
```

### Migration Rules
1.  **Transactional Execution:** Each migration runs inside an isolated SQLite transaction (`BEGIN IMMEDIATE`).
2.  **Pre-Migration Backup:** Before applying migrations, the daemon creates a copy of `state.db` at `DATA_ROOT/backups/db/state-pre-migration-v<N>.db`.
3.  **Strict Downgrade Prevention:** If the database contains a schema version higher than the compiled binary's maximum supported version:
    $$\text{Database Schema Version} > \text{Binary Max Supported Version}$$
    The daemon halts immediately with `LPSM-STATE-VERSION-INCOMPATIBLE`. It **never** attempts automated downgrades, which could destroy user state.

---

## 3. Binary Self-Update Architecture

LiteSPM binary updates are isolated from extension package updates:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Binary Self-Update Flow                         │
│                                                                        │
│   $ litespm self-update                                                │
│         │                                                              │
│         ▼                                                              │
│   1. Check Active Transactions (Abort if operation in-flight)          │
│   2. Fetch Latest Release Manifest & SHA256SUMS.txt checksums          │
│   3. Download Target Platform Binary to staging/litespm.new            │
│   4. Verify SHA-256 (fail-closed) + Sigstore bundle if published       │
│   5. On Windows: Rename running binary to litespm.old (File in use)    │
│      On Unix: Atomic rename staging/litespm.new -> current binary      │
│   6. Verify New Binary Boots ('litespm --version')                     │
│   7. Clean up backup binary (litespm.old)                              │
└────────────────────────────────────────────────────────────────────────┘
```

**Verification is SHA-256 fail-closed plus a signature required by default.** `internal/update/updater.go` fetches `SHA256SUMS.txt`, requires a matching entry for the platform binary, and refuses an update with no expected checksum. `verifyDownloadedUpdate` (`cmd/litespm/main.go`) uses `sigstore-go` in-process to verify the release's Sigstore bundle (`<asset>.sigstore.json`) against the downloaded bytes before install: a published bundle that fails, cannot be fetched, or cannot be verified always aborts; a release with no bundle is refused by default. Only the explicit `LITESPM_ALLOW_UNSIGNED_RELEASE=1` opt-out permits checksum-only verification for pre-signing tags, with a warning. Because a checksum travels in the same release as the binary it proves transit integrity, not publisher authenticity — the bundle is what answers "who produced this". **`v0.4.0` (2026-10-11) is the first tag to publish a bundle for every asset** (8 `.sigstore.json` bundles, one per asset); every earlier tag carries none, so checksum-only verification is possible for those tags only when `LITESPM_ALLOW_UNSIGNED_RELEASE=1` is explicitly set; an update from `v0.4.0` verifies a real signature ([STATUS.md](../STATUS.md) §1). A TUF-style signed *catalog* envelope remains `DESIGNED`; the catalog pointer itself is signed by `deploy-pages.sh` when an OIDC identity exists and the client verifies the bundle before consuming it ([STATUS.md](../STATUS.md) §2/§5; [36 — Enterprise Policy & Audit](36-ENTERPRISE-POLICY-AND-AUDIT.md)).

---

## 4. npm release publication gate

The release workflow is triggered by a `v*` tag. Before compiling or creating a GitHub Release, it requires the tag, `npm/package.json` version and `npm/package-lock.json` root version to agree. It then runs the Go suite, builds the six native CLI targets, builds the web standalone archive, signs release artifacts with keyless Sigstore, and creates the GitHub Release.

The npm publish step runs only after release assets exist and the npm installer tests complete. The release workflow sets `LITESPM_TEST_REQUIRE_RELEASE=1`: in this mode, an unreachable or missing binary, `SHA256SUMS.txt` or Sigstore bundle for the exact release tag is fatal. Local pre-release runs may omit this variable and skip the real-release fixture test while the tag does not yet exist.

The package is not considered shipped until both the GitHub release assets and the npm registry package are live. The workflow requires the repository Actions secret `NPM_TOKEN` unless an explicit `ALLOW_NPM_SKIP=true` repository variable deliberately disables npm publication. An official npm release must not use that skip mode.
