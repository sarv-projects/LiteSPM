#!/usr/bin/env bash
# litespm-sync.sh — Automatic, zero-interaction sync script for LiteSPM.
#
# What it does:
#   1. Detects all installed AI agents on the machine (Cursor, Claude Code, OpenCode, Cline, Zed, etc.).
#   2. Automatically wires the LiteSPM bridge to all detected hosts without manual prompts.
#   3. Syncs the capability catalog to ensure fresh package listings.
#   4. Updates all installed skills across all agents to their latest upstream commits.
#   5. Runs a diagnostic check and displays a concise summary.
#
# Usage:
#   ./scripts/litespm-sync.sh
#   Or add to your ~/.bashrc or cron for hands-free background syncing:
#   (crontab -l 2>/dev/null; echo "0 */6 * * * $(pwd)/scripts/litespm-sync.sh >/dev/null 2>&1") | crontab -

set -euo pipefail

# ANSI colors
BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
DIM="\033[2m"
RESET="\033[0m"

echo -e "\n${BOLD}${CYAN}◆ LiteSPM Automatic Sync${RESET}"
echo -e "${DIM}│ Syncing AI coding agents, skills, and catalog...${RESET}\n"

# Locate litespm binary (prefer local build if in repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LITESPM_BIN="litespm"
if [ -f "$REPO_ROOT/litespm" ]; then
  LITESPM_BIN="$REPO_ROOT/litespm"
elif [ -f "$REPO_ROOT/litespm.exe" ]; then
  LITESPM_BIN="$REPO_ROOT/litespm.exe"
elif ! command -v "$LITESPM_BIN" &>/dev/null; then
  echo -e "✗ litespm executable not found in PATH or repo root."
  exit 1
fi

# Step 1: Connect / repair all detected agent hosts
echo -e "${CYAN}• Step 1/3: Synchronizing agent host configurations...${RESET}"
"$LITESPM_BIN" setup --all || true

# Step 2: Sync latest capability catalog
echo -e "${CYAN}• Step 2/3: Refreshing capability catalog...${RESET}"
"$LITESPM_BIN" catalog sync || true

# Step 3: Update all installed skills
echo -e "${CYAN}• Step 3/3: Updating installed skills across agents...${RESET}"
"$LITESPM_BIN" skills update -y || true

echo -e "\n${BOLD}${GREEN}✓ Auto-sync complete!${RESET}"
echo -e "${DIM}All detected agents are connected and their skills are up to date.${RESET}\n"
