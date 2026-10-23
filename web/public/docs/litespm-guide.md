# LiteSPM offline guide

Requires Node.js 22.22.2+ for npm. Download and install the CLI while online.

## Setup

```sh
npm install -g litespm
litespm
litespm catalog sync
litespm search github
```

Catalog sync and fetching new packages require a network connection. Saved
instructions and local inventory commands remain available offline.

## Install

Copy the package ID from its page. Select the target explicitly:

```sh
litespm install <package-id> --host codex
litespm list
```

Review the displayed paths and changes, then approve in the terminal.
Check the package page for prerequisites, credentials and supported targets.

## Remove or recover

```sh
litespm list
litespm install remove <install-id>
litespm restore <install-id>
litespm doctor
```

Removal reconciles managed entries; restoration restores the configuration
backup. Review the preview when other tools share the configuration file.

## Skills from your own source

```sh
litespm skills add <repo-or-local-directory> --agent codex --scope project
litespm skills list
litespm skills remove <skill-name> --scope project
```

Keep this file with your project. See https://github.com/sarv-projects/LiteSPM
for current releases and security reports.
