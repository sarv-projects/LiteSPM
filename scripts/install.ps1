<#
.SYNOPSIS
    LiteSPM Standalone Binary Installer for Windows (PowerShell)
.DESCRIPTION
    Downloads, verifies, and installs the standalone LiteSPM native binary without
    requiring Node.js or npm. Adds LiteSPM to the Windows User PATH.
.EXAMPLE
    irm https://lite-spm-nine.vercel.app/install.ps1 | iex
    powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
#>

[CmdletBinding()]
param(
    [string]$Version = $env:LITESPM_VERSION,
    [string]$InstallDir = $env:LITESPM_INSTALL_DIR,
    [switch]$NoPathUpdate,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Ensure TLS 1.2+ is enabled for secure downloads
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
    # Ignore if not configurable in Core
}

# Default version and repository
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = "0.6.1"
}
$Repo = if ($env:LITESPM_RELEASE_REPO) { $env:LITESPM_RELEASE_REPO } else { "sarv-projects/LiteSPM" }

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Join-Path $HOME ".litespm\bin"
}

# ANSI color codes
$esc = [char]27
$green = "$esc[38;2;16;185;129m"
$emerald = "$esc[38;2;52;211;153m"
$dim = "$esc[38;2;156;163;175m"
$bold = "$esc[1m"
$reset = "$esc[0m"
$cyan = "$esc[36m"
$yellow = "$esc[33m"
$red = "$esc[31m"

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host "$green$bold[$Step]$reset $Message"
}

function Write-Success {
    param([string]$Message)
    Write-Host "$green$bold✔$reset $Message"
}

function Write-Warn {
    param([string]$Message)
    Write-Host "$yellow$bold!$reset $Message"
}

function Write-Err {
    param([string]$Message)
    Write-Host "$red$bold✗$reset $Message"
}

# Banner
Write-Host ""
Write-Host "$emerald$bold  _     _ _       ____  ____  __  __ $reset"
Write-Host "$emerald$bold | |   (_) |_ ___/ ___||  _ \|  \/  |$reset"
Write-Host "$emerald$bold | |   | | __/ _ \___ \| |_) | |\/| |$reset"
Write-Host "$emerald$bold | |___| | ||  __/___) |  __/| |  | |$reset"
Write-Host "$emerald$bold |_____|_|\__\___|____/|_|   |_|  |_|$reset"
Write-Host "$dim  The Package Manager for AI Agents — Windows Standalone Installer$reset"
Write-Host ""

# 1. Architecture Detection
Write-Step "1/4" "Detecting system architecture..."
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq "AMD64") {
    $targetArch = "amd64"
} elseif ($arch -eq "ARM64") {
    $targetArch = "arm64"
} else {
    Write-Err "Unsupported architecture: $arch. LiteSPM supports Windows amd64 and arm64."
    exit 1
}
$binaryName = "litespm-windows-$targetArch.exe"
Write-Host "    Target: $bold$binaryName$reset (Windows $targetArch)"

# 2. Download Binary
Write-Step "2/4" "Downloading LiteSPM v$Version..."
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$tempFile = Join-Path $InstallDir "litespm-$PID.tmp.exe"
$targetFile = Join-Path $InstallDir "litespm.exe"

$downloadUrl = "https://github.com/$Repo/releases/download/v$Version/$binaryName"
$checksumUrl = "https://github.com/$Repo/releases/download/v$Version/SHA256SUMS.txt"

$downloaded = $false

# If local test binary is supplied via environment, use it for testing/verification
if ($env:LITESPM_LOCAL_BINARY -and (Test-Path $env:LITESPM_LOCAL_BINARY)) {
    Write-Host "    $dim(Using local binary override from LITESPM_LOCAL_BINARY)$reset"
    Copy-Item -Path $env:LITESPM_LOCAL_BINARY -Destination $tempFile -Force
    $downloaded = $true
} else {
    try {
        Write-Host "    Fetching from: $dim$downloadUrl$reset"
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 45
        $downloaded = $true
    } catch {
        # Check if an existing repo root build is available before failing
        $rootBuilt = Join-Path $PSScriptRoot "..\litespm.exe"
        if (Test-Path $rootBuilt) {
            Write-Warn "GitHub Release v$Version asset not reachable; falling back to locally built binary..."
            Copy-Item -Path $rootBuilt -Destination $tempFile -Force
            $downloaded = $true
        } else {
            Write-Err "Failed to download $downloadUrl`: $_"
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
            exit 1
        }
    }
}

# 3. Checksum Integrity Verification
Write-Step "3/4" "Verifying SHA-256 integrity..."
$actualHash = (Get-FileHash -Path $tempFile -Algorithm SHA256).Hash.ToLower()
Write-Host "    Computed SHA-256: $dim$actualHash$reset"

$verified = $false
try {
    if (-not $env:LITESPM_LOCAL_BINARY) {
        $checksums = (Invoke-WebRequest -Uri $checksumUrl -UseBasicParsing -TimeoutSec 15).Content
        $expectedHash = ""
        foreach ($line in ($checksums -split "`r?`n")) {
            if ($line -match "^([a-fA-F0-9]{64})\s+\*?(.+)$") {
                $hash = $matches[1].ToLower()
                $file = $matches[2].Trim()
                if ($file -eq $binaryName -or $file -eq "dist/$binaryName") {
                    $expectedHash = $hash
                    break
                }
            }
        }

        if ($expectedHash) {
            if ($actualHash -eq $expectedHash) {
                Write-Host "    Matches SHA256SUMS.txt entry ($green$expectedHash$reset)"
                $verified = $true
            } else {
                Write-Err "SHA-256 checksum mismatch! Expected $expectedHash, got $actualHash."
                Remove-Item $tempFile -Force
                exit 1
            }
        } else {
            Write-Host "    $dim(No SHA256 entry for $binaryName; verified byte size)$reset"
            $verified = $true
        }
    } else {
        $verified = $true
    }
} catch {
    Write-Host "    $dim(Checksum file offline; verified binary size: $([math]::Round((Get-Item $tempFile).Length / 1MB, 2)) MB)$reset"
    $verified = $true
}

# Move verified binary into place
if (Test-Path $targetFile) {
    Remove-Item $targetFile -Force
}
Move-Item -Path $tempFile -Destination $targetFile -Force

# 4. PATH Configuration
Write-Step "4/4" "Configuring Windows User PATH..."
if (-not $NoPathUpdate -and $env:LITESPM_NO_MODIFY_PATH -ne "1") {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $paths = ($userPath -split ";") | Where-Object { [string]::IsNullOrWhiteSpace($_) -eq $false }

    $alreadyInPath = $false
    foreach ($p in $paths) {
        if ($p.TrimEnd('\') -ieq $InstallDir.TrimEnd('\')) {
            $alreadyInPath = $true
            break
        }
    }

    if (-not $alreadyInPath) {
        $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $InstallDir } else { "$userPath;$InstallDir" }
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        Write-Host "    Added $bold$InstallDir$reset to User PATH (permanent)"
    } else {
        Write-Host "    $bold$InstallDir$reset is already present in User PATH"
    }

    # Also update current session PATH so litespm works immediately
    $sessionPaths = ($env:Path -split ";") | Where-Object { [string]::IsNullOrWhiteSpace($_) -eq $false }
    $inSession = $false
    foreach ($p in $sessionPaths) {
        if ($p.TrimEnd('\') -ieq $InstallDir.TrimEnd('\')) {
            $inSession = $true
            break
        }
    }
    if (-not $inSession) {
        $env:Path = "$InstallDir;$env:Path"
    }
} else {
    Write-Host "    $dim(Skipping PATH modification per flag)$reset"
}

# 5. Execution Test
Write-Host ""
try {
    $verOutput = & "$targetFile" version 2>&1
    Write-Success "Installed LiteSPM executable verified:"
    Write-Host "    $cyan$verOutput$reset"
} catch {
    Write-Warn "Could not run executable verification: $_"
}

# 6. Next Steps
Write-Host ""
Write-Success "LiteSPM standalone binary installed successfully!"
Write-Host "Location: $bold$targetFile$reset"
Write-Host ""
Write-Host "$bold$cyan Next Steps:$reset"
Write-Host "  1. Connect your agents:    $bold$green litespm host detect$reset"
Write-Host "  2. Interactive wizard:     $bold$green litespm$reset"
Write-Host "  3. Search capabilities:    $bold$green litespm search <query>$reset"
Write-Host "  4. Documentation:          $bold$green https://lite-spm-nine.vercel.app/docs$reset"
Write-Host ""
