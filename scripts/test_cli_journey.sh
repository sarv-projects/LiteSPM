#!/usr/bin/env bash
set -euo pipefail
# A real CLI journey with local fixture bytes and project-only destinations.
cli="$(realpath "${1:?provide the built CLI path}")"
journey_root="$(mktemp -d)"
trap 'rm -rf "$journey_root"' EXIT
export LITESPM_DATA_ROOT="$journey_root/data"
export LITESPM_CONFIG_ROOT="$journey_root/config"
export LITESPM_RUNTIME_ROOT="$journey_root/runtime"
mkdir -p "$journey_root/source/audit-smoke" "$journey_root/project"
cat > "$journey_root/source/audit-smoke/SKILL.md" <<'SKILL'
---
name: audit-smoke
description: A local fixture for validating installation and removal.
---
Read the project instructions and summarize them.
SKILL
cd "$journey_root/project"
"$cli" version
"$cli" skills add "$journey_root/source" --skill audit-smoke --agent codex --scope project --yes
"$cli" skills list --json > "$journey_root/installed.json"
python3 - "$journey_root/installed.json" <<'PY'
import pathlib,sys
assert 'audit-smoke' in pathlib.Path(sys.argv[1]).read_text(), 'installed skill missing from inventory'
assert list(pathlib.Path('.').rglob('SKILL.md')), 'installer copied no skill bytes'
PY
"$cli" skills remove audit-smoke --scope project --yes
python3 - <<'PY'
from pathlib import Path
assert not list(Path('.').rglob('SKILL.md')), 'removal left installed fixture files'
PY
"$cli" skills list
printf 'PASS: actual local skill add, list and removal\n'
