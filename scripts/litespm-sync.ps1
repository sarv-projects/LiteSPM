# litespm-sync.ps1 — Automatic, zero-interaction sync script for Windows.
#
# What it does:
#   1. Detects all installed AI agents on Windows (Cursor, Claude Code, OpenCode, Cline, Zed, etc.).
#   2. Automatically wires the LiteSPM bridge to all detected hosts without manual prompts.
#   3. Syncs the capability catalog to ensure fresh package listings.
#   4. Updates all installed skills across all agents to their latest upstream commits.
#
# Usage:
#   .\scripts\litespm-sync.ps1

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "◆ LiteSPM Automatic Sync" -ForegroundColor Cyan
Write-Host "│ Syncing AI coding agents, skills, and catalog..." -ForegroundColor DarkGray
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$LocalExe = Join-Path $RepoRoot "litespm.exe"

if (Test-Path $LocalExe) {
    $LiteSPMBin = $LocalExe
} else {
    $LiteSPMBin = (Get-Command "litespm" -ErrorAction SilentlyContinue).Source
}

if (-not $LiteSPMBin) {
    Write-Host "✗ litespm executable not found in PATH or current directory." -ForegroundColor Red
    exit 1
}

Write-Host "• Step 1/3: Synchronizing agent host configurations..." -ForegroundColor Cyan
& $LiteSPMBin setup --all

Write-Host "• Step 2/3: Refreshing capability catalog..." -ForegroundColor Cyan
& $LiteSPMBin catalog sync

Write-Host "• Step 3/3: Updating installed skills across agents..." -ForegroundColor Cyan
& $LiteSPMBin skills update -y

Write-Host ""
Write-Host "✓ Auto-sync complete!" -ForegroundColor Green
Write-Host "All detected agents are connected and their skills are up to date." -ForegroundColor DarkGray
Write-Host ""
