# Security Policy

## Reporting a vulnerability

Open a private security advisory at
<https://github.com/sarv-projects/LiteSPM/security/advisories/new>, or email the
maintainer listed on the GitHub profile.

Please include: the version (`litespm version`), your OS, the exact steps, and
the impact you believe it has. You do not need a working exploit.

We will acknowledge within 7 days. There is no bug bounty. Credit is given in
the advisory unless you ask otherwise.

**Please do not open a public issue for a vulnerability.** LiteSPM edits the
configuration files of other tools and brokers credentials, so a public report
is a working exploit for everyone until a fix ships.

## Supported versions

Only the latest published release receives security fixes. There are no
long-term-support branches.

## What LiteSPM is trusted to do

This is a small tool asking for a large amount of trust, so the boundaries are
stated plainly.

| Surface | What it can do | What limits it |
|---|---|---|
| **Host config adapters** | Write one `litespm` entry into an agent's config file | The file is backed up first; only the `litespm` member is touched; comments, key order and formatting elsewhere survive byte-for-byte; the result is re-parsed and asserted before anything is written; every write has an inverse (`litespm host remove`) |
| **In-agent marketplace command** | Write a small command file, or for popups a plugin/extension (JavaScript/TypeScript run by the agent itself), into the agent's own command/plugin directory when you run `litespm setup --agent <id>` | Each file carries the ownership marker `litespm-marketplace-command`; a file at the same path without it is skipped, never overwritten or deleted; `litespm host remove` deletes only marked files; the renderers only call `litespm marketplace rows`, which reads the local catalog and ledger. Several renderers are unverified against a real install of their agent (see `AGENTS.md` §3) |
| **Bridge shim** | Proxy MCP traffic between an agent and the daemon over stdio | It holds no credentials and makes no network calls of its own |
| **Daemon** | Supervise provider processes, enforce policy, broker secrets | Single writer to its own database; secrets go through the OS vault (Keychain / DPAPI / Secret Service), never to a config file |
| **Skill installer** | Copy a `SKILL.md` directory into an agent's skills tree | Refuses symlinks, non-regular files, `http://`/`file:`/`ftp://` sources (https, `ssh://` and `git@` are accepted) and overwrites unless `--force`, which prints `overwrites: <path>` and records a pre-image digest and a byte-exact backup first; caps a skill at 32 MiB |
| **Self-update** | Replace its own binary | Fails closed on a missing checksum, and verifies the release's keyless signature bundle when the release publishes one (see below) |
| **Connector executor** (design only) | Not implemented: `internal/connector` was deleted under decision D1 for having zero production importers, and no connector executor ships | The credential-custody design — the agent supplies a connection handle rather than a secret, the target host is pinned by the connector manifest, private/loopback/link-local addresses are refused after DNS resolution, and caller-supplied `Authorization`, `Cookie` and `Proxy-Authorization` headers are stripped — is recorded in [29 — Connector System Design](ARCH/29-CONNECTOR-SYSTEM-DESIGN.md) and carries no shipped guarantee |

### The approval gate is consent, not a sandbox

`litespm approve <plan-id>` requires a TTY and records a human-cli approval
bound to the plan hash. `install.execute` consumes that approval atomically and
refuses an agent-channel or expired/used token. This stops accidental installs
and produces an audit trail.

It is **not** a security boundary against a hostile process running as the same
OS user. The approval token is stored in the same-user SQLite database, the IPC
peer check is same-uid, and such a process can also edit an agent's config
directly. If that threat is in scope, run the agent as a different OS user (or
in a container/VM) and keep the LiteSPM state directory out of its reach.

## Supply chain

**Releases are integrity-checked and signature-verified.** Each release
publishes `SHA256SUMS.txt` alongside the binaries, and the release workflow
signs every artifact — the binaries, the checksum listing, the web archive —
with `cosign sign-blob` in keyless mode, publishing a Sigstore bundle beside
each (`<asset>.sigstore.json`) plus a CycloneDX SBOM of the assets as
published. The updater verifies the downloaded binary against
`SHA256SUMS.txt` (fail-closed on a missing checksum, a mismatch, or a
missing entry — an earlier build skipped verification when the checksum was
absent and carried a hard-coded bypass string; both were removed) and then
verifies the bundle against the downloaded bytes:

- a bundle that is published and does not verify **always** aborts;
- a release that publishes none is refused by default; only the explicit
  `LITESPM_ALLOW_UNSIGNED_RELEASE=1` opt-out permits checksum-only verification
  for pre-signing releases, with a prominent warning;
- verification uses the `sigstore-go` library in-process and pins the certificate
  identity to this repository's release workflow on a version tag
  (`.../release.yml@refs/tags/v...`, issuer
  `https://token.actions.githubusercontent.com`), so a signature minted by a
  fork, a branch build, or a different workflow does not verify.

Both the Go self-updater and npm installer require the same bundle by default.
The Go verifier uses `sigstore-go` in-process, so end users do not need to
install a separate `cosign` executable. It still obtains the public-good
Sigstore trust root through TUF and fails closed if trust material or
verification is unavailable. The npm installer verifies the same bundle and
is **signature-verified by default**. `npm/scripts/install-binary.js` fetches `<binary>.sigstore.json`
beside the binary, checks the signature over the downloaded bytes, the
certificate chain to a Fulcio CA at the transparency-log timestamp, the SCT
against a trusted certificate-transparency log, and the Rekor inclusion promise
against the trusted log key — then requires the signer to be **exactly**
`https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/tags/v<version>`
with issuer `https://token.actions.githubusercontent.com`. Both are literals in
the installer, not values read from the environment: a trust anchor an
environment variable can move is not an anchor.

Every failure refuses and discards the staged download, printing
`INSTALL REFUSED` and exiting non-zero: a missing bundle, a bundle that is not
JSON, a bundle of an unrecognised shape, a malformed bundle, a signature over
different bytes, a signature by a different identity, a wrong issuer, a
truncated transfer, a digest mismatch, and a redirect off the expected origins.
Nothing unverified is installed or executed.

The default is *require a signature* for both installation and self-update.
`LITESPM_ALLOW_UNSIGNED_RELEASE=1` is the explicit, documented opt-out for tags
cut before `release.yml` began signing (every tag before `v0.4.0`); it falls
back to checksum-only **and says so loudly**. A published bundle that cannot
be verified is always refused, even with the opt-out set. It is never a
silent downgrade: a release that publishes a bundle which fails to verify is
refused even with the opt-out set, because that is the attack signal rather
than the absence of one. `LITESPM_RELEASE_REPO` redirects where bytes are
fetched from, and because a mirror can replace the binary *and* its signature
together it is refused unless the operator also states the expected signer via
`LITESPM_TRUST_IDENTITY` and `LITESPM_TRUST_ISSUER`.

The Go cryptography is sigstore-go; the npm cryptography is sigstore-js (`@sigstore/verify` + `@sigstore/tuf`); the
installer does not implement certificate-chain, Merkle-proof or SET validation
itself. The trusted root is fetched over TUF, which verifies it against the root
shipped inside `@sigstore/tuf` before trusting anything it serves, and is cached
for later installs.

The honest limit: checksums travel in the same release as the binaries, so
they prove the download was not corrupted in transit but not that it is
authentic. The signature closes that gap only as far as the signing identity
is trustworthy: the certificate binds artifacts to *this repository's release
workflow running on a tag*, so someone who compromised only the artifact
store cannot mint a matching signature — but someone who can edit this
repository's release workflow can sign whatever that workflow signs. The
trust root is therefore GitHub plus this repository's write controls. Signed releases **have**
shipped: `v0.4.0` (2026-10-11) published a keyless bundle for every asset, and every tag before it
published none — so the practical mitigation for those older binaries remains to build from source
(`go build ./cmd/litespm`) or pin a commit. The `v0.4.1` assets carry a
`.sigstore.json` bundle for every binary (verified 2026-10-17), so installs of it are authenticated, not only
prospectively. As of 2026-11-10 the npm registry's `latest` is `0.6.0`; its bundle was not re-verified in the 2026-11-10 documentation review.

The catalog pointer is signed the same way: `scripts/deploy-pages.sh` signs
`/v1/current.json` when a signing identity exists, and `catalog sync`
verifies the bundle before consuming the pointer — a published-but-invalid
signature always fails, and `LITESPM_REQUIRE_CATALOG_SIGNATURE=1` refuses an
origin that publishes none.

`npm install -g litespm` runs a `postinstall` script that downloads the platform
binary from the GitHub release and verifies its Sigstore bundle against this
repository's release workflow before installing it; the install fails closed
(non-zero exit) when that proof cannot be produced. It first needs network
access to `tuf-repo-cdn.sigstore.dev` to obtain the Sigstore trust root, which
is then cached under `~/.local/share/sigstore-js` (macOS
`~/Library/Application Support/sigstore-js`). Read
`npm/scripts/install-binary.js` before installing if you want to see exactly
what it fetches.

## What we do not claim

These distinctions matter and are enforced in the product, not just documented:

- **"Verified" is not our verdict.** A `verified` badge on a publisher means the
  upstream registry flagged that publisher. LiteSPM has not audited it. The UI
  says so wherever the badge appears.
- **No popularity or usage data is published.** The catalog carries no star,
  download or install figures, because the upstream sources do not expose them.
  An earlier build estimated them; that was wrong and was removed.
- **No compatibility claim is a test result.** A capability's host list is
  publisher-declared or derived from what the host can technically install. It is
  not the output of running the capability against every host.
- **No risk verdict is invented.** When there is no audit data for a capability,
  the UI says `unverified`. It never fabricates a "safe" verdict.

## Untrusted input

The following are treated as untrusted data and are never followed as
instructions: catalog entries, upstream manifests, repository READMEs, MCP tool
descriptions and results, and skill contents. A
`SKILL.md` is instructions an agent will follow — installing one is a prompt
surface, which is why the installer shows you the source and refuses
non-https origins.

## Out of scope

- Vulnerabilities in the agents LiteSPM configures (report those upstream).
- Vulnerabilities in MCP servers or skills listed in the catalog. The catalog is
  an index; LiteSPM is not the publisher of those entries.
- Anything requiring an attacker who already has write access to your user
  account or your vault.
