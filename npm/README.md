<div align="center">

# litespm

**The package manager for AI agents.**

One verified catalog of MCP servers, agent skills and plugins, installed into
52 coding agents: Claude Code, Codex, Cursor, OpenCode, Cline, Gemini CLI,
GitHub Copilot, VS Code, Zed, Pi and more. Undo any of it with one command.

[![npm version](https://img.shields.io/npm/v/litespm.svg?color=10b981)](https://www.npmjs.com/package/litespm)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.22.2-brightgreen.svg)](https://nodejs.org)

[Website](https://lite-spm-nine.vercel.app) ·
[Marketplace](https://lite-spm-nine.vercel.app/marketplace) ·
[Docs](https://lite-spm-nine.vercel.app/docs) ·
[GitHub](https://github.com/sarv-projects/LiteSPM) ·
[Changelog](https://github.com/sarv-projects/LiteSPM/blob/main/CHANGELOG.md)

</div>

---

## Install

```bash
npm install -g litespm
litespm
```

`litespm` opens the setup wizard. It finds the agents on your machine, shows the
exact change it will make to each configuration file, saves a backup, and writes
only after you confirm.

```bash
litespm search postgres              # the catalog downloads itself on first use
litespm install <id>                 # plan → preview → approve → install
litespm list                         # what is installed, per agent
litespm install remove <installId>   # undo exactly that install
```

You do not need to sync the catalog manually. The first command that needs it
downloads it with progress; later runs refresh it in the background at most
every 6 hours and never wait. `LITESPM_NO_AUTO_SYNC=1` (or `CI`) turns that off,
and `litespm catalog sync` syncs on demand. Searches use an on-disk SQLite FTS5
index, so they take milliseconds.

Inside a configured agent, `litespm setup --agent <id>` adds a marketplace
command: `/marketplace` in Pi, `/litespm-marketplace` in OpenCode, Claude Code,
GitHub Copilot CLI and others (a popup where the agent supports one, a prompt
command elsewhere). `litespm host remove <id>` removes it again.

## What you get

- **69,376 catalog listings:** 48,418 MCP servers, 20,320 skills, 638 plugins.
- **52 agent adapters, 81 skill targets;** 47 of the 52 take remote (URL) MCP
  servers. Claude Desktop, Code Studio, iFlow CLI, Mux and ZCode do not document a
  remote entry, so LiteSPM refuses remote entries for them.
- **Preview, backup, undo.** Removal takes out only what LiteSPM wrote and keeps
  your own edits.
- **Human approval for every install.** An agent can prepare a plan; only a
  person approves it.
- **No account, no telemetry.** Credentials stay in your environment or the OS
  keychain; LiteSPM writes references, never secret values.

Visual Studio Code is workspace-scoped: run `litespm host setup vscode` from the
workspace root and install with `--scope project --agent vscode`. This writes the
portable Copilot `.mcp.json` format (stdio and HTTP, not SSE).

Plugins install their portable components (MCP servers and skills) from the
commit their publisher pinned. A plugin with no fetchable source is refused with
`LPSM-ARTIFACT-UNAVAILABLE`; one that declares commands, hooks, subagents or LSP
servers installs only with `--allow-partial`. The live catalog pointer is not yet
Sigstore-signed (it is digest-verified and rollback-protected). See
[STATUS.md](https://github.com/sarv-projects/LiteSPM/blob/main/STATUS.md) for the
current state of every subsystem.

## Commands

| Command | What it does |
|---|---|
| `litespm` / `litespm setup` | Interactive setup and management wizard |
| `litespm setup --agent <host-id>` | Connect one agent without prompts |
| `litespm search <query>` | Search MCP servers, skills and plugins |
| `litespm install <id>` | Install a skill, MCP server or plugin |
| `litespm install remove <installId>` | Remove one install |
| `litespm list` | Installed capabilities |
| `litespm skills add\|use\|find\|list\|update\|remove` | Manage `SKILL.md` skills from a repo, URL or folder |
| `litespm init [name]` | Scaffold a `SKILL.md` |
| `litespm marketplace rows [--json]` | The row view model the in-agent popups render |
| `litespm host list\|detect\|setup\|remove` | Inspect and configure agent adapters |
| `litespm catalog sync` | Refresh the local catalog now |
| `litespm doctor [--repair]` | Health checks and repairs |
| `litespm uninstall [--dry-run]` | Remove the bridge entry from every agent |
| `litespm self-update` | Update the native binary |

`litespm help <command>` documents any of them.

## How the installer works

The npm package is a thin launcher. `postinstall` downloads the native binary for
your OS and CPU (Windows, macOS, Linux; x64 and arm64) from
[GitHub Releases](https://github.com/sarv-projects/LiteSPM/releases) and verifies
its **Sigstore signature** before anything is installed or executed, fail-closed.
Downloads are HTTPS-only and host-bounded (a redirect off GitHub's asset hosts is
refused), and a truncated transfer is discarded. Prefer no npm? Take the binary
directly from the releases page.

**A valid signature is required by default.** The installer checks the signature
over the downloaded bytes, the certificate chain to a Fulcio CA, the
certificate-transparency proof and the Rekor inclusion, then requires the signer
to be exactly this repository's release workflow on the tag being installed:

```text
identity: https://github.com/sarv-projects/LiteSPM/.github/workflows/release.yml@refs/tags/v<version>
issuer:   https://token.actions.githubusercontent.com
```

A signature by anyone else is refused. Every failure discards the download,
prints `INSTALL REFUSED` and exits non-zero:

```text
[litespm] INSTALL REFUSED — refusing to install litespm-linux-amd64: signature verification failed: digest mismatch
[litespm] The download was discarded rather than installed unverified. Nothing was written to ~/.litespm/bin/v<version>/litespm-linux-amd64.
[litespm] Check https://github.com/sarv-projects/LiteSPM/releases/tag/v<version> for litespm-linux-amd64 and its .sigstore.json bundle, then reinstall. Setting LITESPM_ALLOW_UNSIGNED_RELEASE=1 disables publisher authentication and is not a fix.
```

Fetching the Sigstore trust root needs network access to
`tuf-repo-cdn.sigstore.dev` on first use; it is then cached.

### Installer environment variables

| Variable | Effect |
|---|---|
| `LITESPM_ALLOW_UNSIGNED_RELEASE=1` | **Explicit opt-out.** SHA-256-only verification, only for releases that publish no bundle at all (tags before `v0.4.0`). A bundle that exists but cannot be fetched or verified is still fatal. Prints a warning. |
| `LITESPM_RELEASE_REPO=<owner>/<name>` or `https://<host>/<path>` | Install from a mirror. Refused unless you also state the signer you expect. |
| `LITESPM_TRUST_IDENTITY` / `LITESPM_TRUST_ISSUER` | Required with `LITESPM_RELEASE_REPO`: the exact certificate identity and OIDC issuer the mirror must present. Ignored for the pinned repository. |
| `LITESPM_ALLOW_LOCAL_DIST=1` | Use a `dist/` build in the checkout instead of the published release. No checksum or signature is verified, and the installer says so. |
| `HTTPS_PROXY` / `https_proxy`, `npm_config_https_proxy`, `npm_config_proxy`, `HTTP_PROXY` / `http_proxy` | Download through an HTTP(S) proxy (first one set wins, in that order). `http://user:password@host:port` sends Basic proxy credentials; they are never printed. `socks://` proxies are not supported. See [Behind a proxy](#behind-a-proxy). |
| `NO_PROXY` / `no_proxy`, `npm_config_noproxy` | Comma-separated hosts that bypass the proxy: `example.com` (and its subdomains), `.example.com`, `*` for everything, optional `:port`. |
| `NODE_USE_ENV_PROXY=1` | Set by the installer itself (see below) so Node's built-in `fetch`, used for the Sigstore trust root, honours the proxy. You do not need to set it. |
| `LITESPM_DEBUG=1` | Adds maintainer-oriented hints to failure messages. |
| `LITESPM_RETRY_BASE_MS` | Test hook: the first retry delay in milliseconds (default `1000`; retries wait about 1x, 3x and 9x that). |

Runtime variables (`LITESPM_NO_AUTO_SYNC`, `LITESPM_DATA_ROOT`,
`LITESPM_REQUIRE_CATALOG_SIGNATURE`, and others) are listed in the
[main README](https://github.com/sarv-projects/LiteSPM#configuration).

### Behind a proxy

The installer opens an HTTP `CONNECT` tunnel through the proxy named by the
variables above and negotiates TLS with `github.com` through it, so certificate
checks, the HTTPS-only rule and the redirect-host allowlist are unchanged; the
proxy only ever sees `host:port`. It prints one line naming the proxy host (never
the credentials):

```text
[litespm] Using proxy proxy.corp.example:3128 (from HTTPS_PROXY) for downloads.
```

The Sigstore trust root (`tuf-repo-cdn.sigstore.dev`) is fetched by Node's
built-in `fetch`, which ignores proxy variables unless `NODE_USE_ENV_PROXY=1` is
set when Node starts. When a proxy applies, the installer therefore re-runs
itself once with that variable and your proxy settings exported (Node 22.21+, which
this package requires). `undici` is not importable from Node without adding a
dependency, so no in-process dispatcher is installed. What cannot be done:
`socks://` proxies, PAC files and `NTLM`/`Negotiate` proxy authentication are not
supported; if your proxy needs them, download the binary from the releases page
or use a local forwarder such as `cntlm` that exposes a plain HTTP proxy.

### If the download fails

- **Transient network failure** (reset, timeout, DNS, HTTP 408/429/5xx): the
  download is retried up to 4 times with exponential backoff and jitter (about 1s,
  3s, 9s). If it still fails, `npm install -g litespm` **succeeds** (exit 0) with a
  notice, because nothing unverified was installed; the binary is downloaded the
  first time you run `litespm`, which exits non-zero if it still cannot.
- **Integrity failure** (bad signature, wrong signer, digest mismatch, unexpected
  redirect, missing signature bundle): never retried, nothing is installed, and the
  install exits 1 with `INSTALL REFUSED`.
- **Release not found** (HTTP 404/410): the release for this version has not been
  published yet or was withdrawn. Not retried; the install exits 1. Install an
  earlier version (`npm view litespm versions`, then `npm i -g litespm@<version>`)
  or try again later.
- **Windows: file in use.** If a running `litespm` (for example its background
  daemon) holds the binary, the install is retried briefly and then fails with a
  message saying so; close it and reinstall.

npm hides a lifecycle script's output on success, so the progress lines (a bar on
a terminal, otherwise at most four milestone lines) and the closing
`✓ litespm <version> installed (signature verified)` appear on stderr but npm may
not show them. Use `npm install -g litespm --foreground-scripts` to see them.

### Installing a local build

`npm install` installs the published binary for this package version; a stale
`dist/` binary in a checkout is ignored on purpose. To install a binary you built
yourself, opt in explicitly:

```bash
LITESPM_ALLOW_LOCAL_DIST=1 npm install -g litespm
```

### Uninstalling

npm 7+ does not run package uninstall scripts, so `npm uninstall -g litespm`
removes the wrapper but **leaves the native binary** in `~/.litespm/bin`. Clean up
explicitly. Optionally run `litespm uninstall --dry-run`, then `litespm uninstall`,
first: it removes LiteSPM's bridge entry from every agent configuration it wrote
(with a backup). It does not delete the binary, servers or skills you installed
(`litespm install remove <installId>` and `litespm skills remove` do that).

macOS / Linux:

```bash
litespm uninstall                                           # optional: agent entries
node "$(npm root -g)/litespm/scripts/uninstall-binary.js"  # this version's binary
npm uninstall -g litespm
rm -rf ~/.litespm/bin                                       # all versions (optional)
```

Windows PowerShell:

```powershell
litespm uninstall                                           # optional: agent entries
node "$(npm root -g)\litespm\scripts\uninstall-binary.js"
npm uninstall -g litespm
Remove-Item -Recurse -Force "$env:USERPROFILE\.litespm\bin" # all versions (optional)
```

Windows cmd.exe:

```bat
npm uninstall -g litespm
rmdir /s /q "%USERPROFILE%\.litespm\bin"
```

Windows cannot delete a running executable: stop any running `litespm` (including
its background daemon) first. Only `~/.litespm/bin` is the installer's; the rest of
`~/.litespm` is LiteSPM's own state and is left alone. `uninstall-binary.js` removes
only the current version's executable and version stamp.

On Linux or WSL, `Permission denied` on `bin/litespm` means the command shim lost
its executable bit. Repair it with
`chmod +x "$(readlink -f "$(command -v litespm)")"` or reinstall.

## Requirements

- Node.js 22.22.2 or later (the Sigstore verification libraries need it), or a
  standalone native binary.
- Windows 10+, macOS 12+, or a modern Linux distribution.

## License

[Apache-2.0](https://github.com/sarv-projects/LiteSPM/blob/main/LICENSE)
