# install-task-sync.ps1 — Sets up a background Windows Scheduled Task to auto-sync LiteSPM every 6 hours.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SyncScript = Join-Path $ScriptDir "litespm-sync.ps1"

$TaskName = "LiteSPM_AutoSync"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$SyncScript`""
$Trigger = New-ScheduledTaskTrigger -Daily -At "00:00"
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Repeat every 6 hours indefinitely
$Trigger.RepetitionInterval = (New-TimeSpan -Hours 6)
$Trigger.RepetitionDuration = (New-TimeSpan -Days 3650)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Automatically syncs LiteSPM agent bridges, catalog and skills every 6 hours" | Out-Null

Write-Host "✓ LiteSPM background auto-sync task registered successfully in Windows Task Scheduler." -ForegroundColor Green
Write-Host "  Runs every 6 hours automatically." -ForegroundColor DarkGray
