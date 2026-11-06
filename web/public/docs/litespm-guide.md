# LiteSPM offline guide

Requires Node.js 22.22.2+ for npm. Download and install the CLI while online.

## Setup

```sh
npm install -g litespm
litespm                    # setup and management wizard
litespm host detect        # which agents this machine has
litespm catalog sync       # download the catalog
litespm search github      # search it
```

Catalog sync and fetching new packages require a network connection. Saved
instructions and local inventory commands remain available offline.

## Install

Copy the package ID from its page. Select the target explicitly:

```sh
litespm install <package-id> --agent codex
litespm list
litespm inventory --json
```

`--host` is the older spelling of `--agent` and still works. Review the
displayed paths and changes, then approve in the terminal. Check the package
page for prerequisites, credentials and supported targets.

## Remove or recover

```sh
litespm list --drifted
litespm install remove <install-id>
litespm restore <install-id>
litespm doctor
litespm self-update
```

Removal reconciles managed entries; restoration restores the configuration
backup. `list --drifted` shows entries changed outside LiteSPM. Review the
preview when other tools share the configuration file.

## Skills from your own source

```sh
litespm skills add <repo-or-local-directory> --agent codex --scope project
litespm skills list
litespm skills update
litespm skills remove <skill-name> --scope project
litespm skills adopt <skill-name>
```

`skills adopt` takes ownership of a skill that is already in an agent's tree;
it does not reinstall or rewrite it. Keep this file with your project. See
https://github.com/sarv-projects/LiteSPM for current releases and security
reports.
