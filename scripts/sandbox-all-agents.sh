#!/usr/bin/env bash
# Run the all-agent sandbox. See sandbox-all-agents.ps1 for the suite map.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 50-host adapter sandbox =="
go test ./internal/host -run 'TestAll50Hosts' -count=1 -v

echo "== litespm setup --all sandbox =="
go test ./cmd/litespm -run 'TestSandboxAllAgentsSetupAll' -count=1 -v

echo "== /marketplace skill visibility =="
go test ./cmd/litespm -run 'TestBridgeSkillToolsSeeLedgerOnlySkill' -count=1 -v

echo "All-agent sandbox passed."
