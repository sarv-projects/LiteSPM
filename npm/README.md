<div align="center">

# litespm

**One place to manage what your coding agents can do.**

Discover and install MCP servers, skills and plugins across Claude Code,
OpenAI Codex, OpenCode, Cline and 45 more hosts — 50 in all. 45 of them can also receive a
remote (URL) MCP entry; the other five are refused rather than written in a shape the
host would ignore.

[![npm version](https://img.shields.io/npm/v/litespm.svg?color=10b981)](https://www.npmjs.com/package/litespm)
[![npm downloads](https://img.shields.io/npm/dm/litespm.svg?color=10b981)](https://www.npmjs.com/package/litespm)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

</div>

---

```console
$ litespm
LiteSPM can connect to 50 different agent hosts.
This run has not changed anything yet.

Which AI coding agent do you use?

Found on this machine (1):
  [1] Claude Code                    /home/you/.claude.json
  [a] Show all 50 supported agents
  [q] Quit
Enter a number, an agent name, or 'a' [q]: 1

Looking for Claude Code's configuration file...
Found your existing configuration file:
  /home/you/.claude.json
LiteSPM will add one entry to this file. Everything else in it is left as it is, and a backup copy is saved first.
Use this file? [Y/n]:

About to make one change to /home/you/.claude.json:

  +   "litespm": {
  +     "command": "/usr/local/bin/litespm",
  +     "args": ["bridge", "stdio", "--host", "claude-code"]
  +   }

Everything else in the file is left as it is.
Write this change? [Y/n]:

✓ Done. LiteSPM is registered with Claude Code.
  • Backup of the previous file: …/backups/claude-code_20261014_120000_1a2b3c4d.bak
  • File written: /home/you/.claude.json

Next:
  • Start Claude Code and type /marketplace to browse and install capabilities.
  • Or stay here: this wizard can update the catalog, install and remove things too.
```

Setup prints **no capability count** and no advisory list: the wizard derives
the host list from the compiled-in adapter registry (`cmd/litespm/wizard.go:154-162`)
and the setup flow makes no network request. The one step that touches the
network is the wizard's *Update the capability catalog* action — an explicit,
confirmed `catalog sync` that names the origin first. `/marketplace` becomes
available in the agent after the bridge entry lands.

Stop hand-editing `~/.claude.json`, `config.toml`, and a dozen other files.
Connect an agent **once**, then manage all of its capabilities from one local
place.

## Install

```bash
npm install -g litespm
```

Prefer a standalone binary? Grab the release for your platform from
[GitHub Releases](https://github.com/sarv-projects/LiteSPM/releases). The npm
package is a thin launcher: it downloads the native binary for your OS and
verifies its **Sigstore signature** before anything is installed or executed —
**fail-closed**. Downloads are HTTPS-only and host-bounded (a redirect off
GitHub's asset hosts is refused), and a truncated transfer is discarded rather
than installed short. See
[`SECURITY.md`](https://github.com/sarv-projects/LiteSPM/blob/main/SECURITY.md).

**The default is: a valid signature is required.** The installer checks the
signature over the downloaded bytes, the certificate chain to a Fulcio CA, the
certificate-transparency proof, and the Rekor transparency-log inclusion — then
requires the signer to be *exactly* this repository's release workflow on the
tag being installed:

```text
identity: https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/tags/v<version>
issuer:   https://token.actions.githubusercontent.com
```

A signature by anyone else is refused, because a signature that verifies
against the wrong signer is not evidence. Every failure discards the download,
prints `INSTALL REFUSED` and exits non-zero:

```text
[litespm] INSTALL REFUSED — refusing to install litespm-linux-amd64: signature verification failed: digest mismatch
[litespm] The download was discarded rather than installed unverified. Nothing was written to ~/.litespm/bin/litespm-linux-amd64.
[litespm] Check https://github.com/sarv-projects/LiteSPM/releases/tag/v0.4.1 for litespm-linux-amd64 and its .sigstore.json bundle, then reinstall. Setting LITESPM_ALLOW_UNSIGNED_RELEASE=1 disables publisher authentication and is not a fix.
```

| Variable | Effect |
|---|---|
| `LITESPM_ALLOW_UNSIGNED_RELEASE=1` | **Explicit opt-out.** Falls back to SHA-256-only verification for releases that publish no bundle at all — every tag before `v0.4.0` — or for a machine that cannot reach the Sigstore trust root. It prints a warning saying so. It is not a silent fallback: a release that publishes a bundle which fails to verify is still refused, because that is the attack signal. A checksum travels in the same release as the binary, so it proves the download was not corrupted, not who published it. |
| `LITESPM_RELEASE_REPO=<owner>/<name>` or `https://<host>/<path>` | Install from a mirror. A mirror can replace the binary *and* its signature together, so it is refused unless you also state the signer you expect it to present. |
| `LITESPM_TRUST_IDENTITY` / `LITESPM_TRUST_ISSUER` | Required with `LITESPM_RELEASE_REPO`: the exact certificate identity and OIDC issuer the mirror must present. Ignored when installing from the pinned repository — the identity there is fixed in the installer, because a trust anchor an environment variable can move is not an anchor. |
| `LITESPM_ALLOW_LOCAL_DIST=1` | Use a `dist/` build in the checkout instead of the published release. Developer convenience; no checksum or signature is verified, and the installer says so. |

Obtaining the Sigstore trust root needs network access to
`tuf-repo-cdn.sigstore.dev` on first use; it is then cached (Linux
`~/.local/share/sigstore-js`, macOS `~/Library/Application Support/sigstore-js`).

> **Honest status.** The catalog is live end-to-end: skills install from it
> (`litespm install <skill-id>` fetches the source and writes the skill files),
> MCP servers install by registering their published launch descriptor in each
> configured agent's config, and a plugin that publishes a **pinned git tree**
> installs its own portable components — its MCP servers are registered and its
> skills are copied into the target host's skills tree. A plugin that publishes
> no fetchable pinned source (248 of the 638 published rows) fails closed with
> `LPSM-ARTIFACT-UNAVAILABLE`, and a plugin that declares commands, hooks,
> subagents or LSP servers installs only with `--allow-partial`, because LiteSPM
> has no adapter for those classes. See
> [`STATUS.md`](https://github.com/sarv-projects/LiteSPM/blob/main/STATUS.md).
>
> **The published package is current: `litespm@0.4.1` (2026-10-15).** A clean
> install downloads the native binary, verifies its published Sigstore
> signature, and syncs the live catalog — `✓ Catalog synchronization complete
> (Release rel-2026-10-15-01, 69376 capabilities indexed)` (verified
> 2026-10-17). The previous release, `0.4.0`, could not sync the sharded
> catalog — it was tagged before the shard-aware client landed — and that
> incident is recorded as history in
> [`STATUS.md`](https://github.com/sarv-projects/LiteSPM/blob/main/STATUS.md) §2.

## Quickstart

```bash
litespm                    # interactive setup and management wizard
litespm search postgres    # search the federated catalog
litespm install <id>       # install a skill, MCP server, or plugin with a pinned source
litespm host list          # show supported agents
litespm doctor             # run local health checks
litespm self-update        # update the binary
```

Inside a configured agent, just type:

```text
/marketplace
```

## Why litespm

- **One bridge, zero config drift.** Each agent gets a single version-pinned
  `litespm` entry. The host adapters perform an MCP-entry merge only; they write
  no instruction or skill files. (The Pi Agent adapter additionally writes its
  companion extension — `<agent-dir>/extensions/litespm.ts`, a command file —
  `internal/host/piagent.go`.)
- **Secrets never leave your machine.** Downstream API keys and OAuth tokens
  live in your OS vault (Windows DPAPI-protected master key, macOS Keychain,
  Linux Secret Service). Nothing is proxied through a cloud.
- **Hardened extraction.** Archive handling rejects path traversal, absolute
  paths, symlinks, device files, case-fold collisions, and oversize payloads,
  and unpacks into a content-addressed store.
- **Approval before every write.** Effectful actions need an explicit,
  cryptographically bound approval. Skills, MCP servers and plugins with a pinned
  source install for real, each gated by a plan plus a human approval. A plugin
  with no fetchable source is refused with `LPSM-ARTIFACT-UNAVAILABLE`, and one
  whose extra components cannot be installed is refused with
  `LPSM-INSTALL-PARTIAL` unless `--allow-partial` accepts the loss. See
  [`STATUS.md`](https://github.com/sarv-projects/LiteSPM/blob/main/STATUS.md).
- **Drift-bound approvals.** The check half is real: the installed server is
  re-probed before every call and one whose schema fingerprint no longer matches
  what was discovered is refused, and the policy engine runs before the server is
  spawned. The grant half is wired: `litespm grant <capabilityId>` writes one
  `capability_grants` row per capability and `internal/policy` Tier 3 reads it
  before an effectful invocation. What no code path produces yet is the automatic
  invalidation state — `grant revoke` sets `revoked`, but nothing flips a grant to
  `changed` when a re-probe sees a new fingerprint (see the status note above).

## Supported hosts

| Agent | Interface | Config | Windows | macOS | Linux |
|---|---|:--:|:--:|:--:|:--:|
| **Claude Code** | CLI | `~/.claude.json` | ✓ | ✓ | ✓ |
| **OpenAI Codex** | CLI | `~/.codex/config.toml` | ✓ | ✓ | ✓ |
| **OpenCode** | CLI | `opencode.json` | ✓ | ✓ | ✓ |
| **Cline** | VS Code | `cline_mcp_settings.json` | ✓ | ✓ | ✓ |
| **Pi Agent** | Terminal | `~/.pi/agent/mcp.json` | ✓ | ✓ | ✓ |
| **Grok Build** | Terminal | `~/.grok/config.toml` | ✓ | ✓ | ✓ |

## Commands

| Command | What it does |
|---|---|
| `litespm` / `litespm setup` | Interactive setup and capability-management wizard |
| `litespm setup --agent <host-id>` | Connect one agent without prompts (same write path as `host setup`) |
| `litespm init [name]` | Scaffold a `SKILL.md` to author a skill |
| `litespm search <query>` | Search MCP servers, skills, and plugins |
| `litespm install <id>` | Install a skill, MCP server, or plugin with a pinned source |
| `litespm uninstall [--dry-run]` | Remove the bridge entry from every agent host config |
| `litespm bridge stdio --host <id>` | MCP stdio bridge used by hosts |
| `litespm host [list\|detect\|setup\|remove]` | Inspect and configure host adapters |
| `litespm agent [list\|resolve <id>]` | List ACP agents / resolve a launch spec |
| `litespm skills [add\|use\|find\|list\|update\|remove]` | Install, print (`use`, installs nothing), search (`find`) and manage `SKILL.md` skills |
| `litespm doctor [--repair] [--yes]` | Health checks and repairs |
| `litespm catalog sync` | Refresh the local catalog cache from the published release |
| `litespm daemon serve` | Start the background supervisor and IPC engine |
| `litespm self-update [--force]` | Update the native binary |

## How it works

```text
  Claude · Codex · OpenCode · Cline · Pi · Grok
                     │  stdio (MCP)
                     ▼
             litespm bridge shim
                     │  local IPC (OS-level ACLs)
                     ▼
              litespm daemon  ──  SQLite (WAL) · policy · secret vault
                     │
                     ▼
        MCP servers · skills · plugins
```

The bridge shim is stateless and never touches your config or database
directly. A single local daemon owns all state and supervises provider
processes. Injecting stored secrets into a provider's environment at launch is
`IMPLEMENTED`, not `WIRED` yet (no production caller — see
[`STATUS.md`](https://github.com/sarv-projects/LiteSPM/blob/main/STATUS.md) §1).

## Security

- Local IPC restricted to your OS user (Named Pipe DACL / Unix socket `0600`).
- Credentials stored only in the OS vault — never in the database or logs.
- Archive extraction is bounded and rejects traversal, absolute paths,
  symlinks, device files, and case-fold collisions.
- Capability approvals bind to a tool's schema fingerprint: the server is
  re-probed before each call and a changed schema is refused; grants are recorded
  by `litespm grant` and enforced by the policy engine before the server is
  spawned. Automatic re-invalidation to `changed` on drift is not implemented
  (see the status note above).

### Installing a local build

`npm install` installs the published binary for this package version. If a
checkout has a stale `dist/` binary it is ignored, deliberately: the postinstall
used to prefer it and stamp the install `"local"`, so the stale build was
reinstalled forever and the pinned release never arrived.

To install a binary you built yourself (for example while testing a change
before publishing a release), opt in explicitly:

```bash
LITESPM_ALLOW_LOCAL_DIST=1 npm install -g litespm
```

That path verifies neither a checksum nor a signature, because a local build has
no published digest and no release bundle. The installer says so when it takes
that path.

## Requirements

- Node.js ≥ 22.22.2 (for the npm launcher — the Sigstore verification libraries it uses
  require it), or a supported native binary.
- Windows 10+, macOS 12+, or a modern Linux distribution.

## Links

- **Repository:** https://github.com/sarv-projects/LiteSPM
- **Issues:** https://github.com/sarv-projects/LiteSPM/issues
- **Catalog API:** https://litespm.sarveshbh-2022.workers.dev/v1/current.json

## License

[Apache-2.0](https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE)
