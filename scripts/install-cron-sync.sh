#!/usr/bin/env bash
# install-cron-sync.sh — Sets up a background cron job to auto-sync LiteSPM every 6 hours.
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/litespm-sync.sh"
chmod +x "$SCRIPT_PATH"

CRON_JOB="0 */6 * * * $SCRIPT_PATH >/dev/null 2>&1"

# Check if already installed
if crontab -l 2>/dev/null | grep -Fq "$SCRIPT_PATH"; then
  echo "✓ LiteSPM auto-sync cron job is already active."
  exit 0
fi

(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
echo "✓ Scheduled automatic LiteSPM sync every 6 hours."
echo "  Run crontab -l to verify."
