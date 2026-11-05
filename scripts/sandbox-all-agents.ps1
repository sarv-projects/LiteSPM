#!/usr/bin/env pwsh
# Run the all-agent sandbox.
#
# The first suite drives every one of the 50 host adapters through
# setup -> bridge handshake -> install -> remove in temporary homes.
# The second drives the real `litespm setup --all` command path against a
# throwaway home with a seed config for every user-scope host, then verifies
# each bridge entry. The third proves the bridge's skill tools see a
# ledger-only skill (the `skills add` path).
#
# Usage: ./scripts/sandbox-all-agents.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "== 50-host adapter sandbox ==" -ForegroundColor Cyan
go test ./internal/host -run 'TestAll50Hosts' -count=1 -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== litespm setup --all sandbox ==" -ForegroundColor Cyan
go test ./cmd/litespm -run 'TestSandboxAllAgentsSetupAll' -count=1 -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== /marketplace skill visibility ==" -ForegroundColor Cyan
go test ./cmd/litespm -run 'TestBridgeSkillToolsSeeLedgerOnlySkill' -count=1 -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "All-agent sandbox passed." -ForegroundColor Green
