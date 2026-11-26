#!/bin/sh
# LiteSPM Standalone Binary Installer for macOS and Linux
# Usage:
#   curl -fsSL https://lite-spm-nine.vercel.app/install.sh | sh
#   or:
#   wget -qO- https://lite-spm-nine.vercel.app/install.sh | sh

set -e

# ANSI Color codes
BOLD="\033[1m"
GREEN="\033[38;2;16;185;129m"
EMERALD="\033[38;2;52;211;153m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
DIM="\033[38;2;156;163;175m"
RESET="\033[0m"

# Disable colors if not in a terminal or if NO_COLOR is set
if [ ! -t 1 ] || [ -n "${NO_COLOR:-}" ]; then
    BOLD=""
    GREEN=""
    EMERALD=""
    CYAN=""
    YELLOW=""
    RED=""
    DIM=""
    RESET=""
fi

log_step() {
    printf "%b[%s]%b %s\n" "${GREEN}${BOLD}" "$1" "${RESET}" "$2"
}

log_info() {
    printf "    %b\n" "$1"
}

log_success() {
    printf "%b✔%b %s\n" "${GREEN}${BOLD}" "${RESET}" "$1"
}

log_warn() {
    printf "%b!%b %s\n" "${YELLOW}${BOLD}" "${RESET}" "$1"
}

log_error() {
    printf "%b✗%b %s\n" "${RED}${BOLD}" "${RESET}" "$1" >&2
}

echo ""
printf "%b  _     _ _       ____  ____  __  __ %b\n" "${EMERALD}${BOLD}" "${RESET}"
printf "%b | |   (_) |_ ___/ ___||  _ \|  \/  |%b\n" "${EMERALD}${BOLD}" "${RESET}"
printf "%b | |   | | __/ _ \___ \| |_) | |\/| |%b\n" "${EMERALD}${BOLD}" "${RESET}"
printf "%b | |___| | ||  __/___) |  __/| |  | |%b\n" "${EMERALD}${BOLD}" "${RESET}"
printf "%b |_____|_|\__\___|____/|_|   |_|  |_|%b\n" "${EMERALD}${BOLD}" "${RESET}"
printf "%b  The Package Manager for AI Agents — Standalone Installer%b\n" "${DIM}" "${RESET}"
echo ""

# 1. OS & Architecture Detection
log_step "1/4" "Detecting platform and architecture..."
RAW_OS="$(uname -s)"
case "${RAW_OS}" in
    Darwin)
        OS="darwin"
        ;;
    Linux)
        OS="linux"
        ;;
    CYGWIN*|MINGW*|MSYS*)
        log_warn "Windows environment detected under POSIX shell emulation."
        log_info "For native Windows PowerShell, run:"
        printf "    %birm https://lite-spm-nine.vercel.app/install.ps1 | iex%b\n\n" "${CYAN}${BOLD}" "${RESET}"
        exit 1
        ;;
    *)
        log_error "Unsupported operating system: ${RAW_OS}"
        exit 1
        ;;
esac

RAW_ARCH="$(uname -m)"
case "${RAW_ARCH}" in
    x86_64|amd64)
        ARCH="amd64"
        ;;
    arm64|aarch64)
        ARCH="arm64"
        ;;
    *)
        log_error "Unsupported CPU architecture: ${RAW_ARCH} (LiteSPM supports amd64 and arm64)"
        exit 1
        ;;
esac

TARGET_BINARY="litespm-${OS}-${ARCH}"
log_info "Target: ${BOLD}${TARGET_BINARY}${RESET} (${OS} / ${ARCH})"

# Version and repository configuration
REPO="${LITESPM_RELEASE_REPO:-sarv-projects/LiteSPM}"
INSTALL_DIR="${LITESPM_INSTALL_DIR:-$HOME/.local/bin}"

# 2. Download Binary
if [ -n "${LITESPM_VERSION:-}" ]; then
    VERSION="${LITESPM_VERSION}"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${TARGET_BINARY}"
    CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/SHA256SUMS.txt"
    log_step "2/4" "Downloading LiteSPM v${VERSION}..."
else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${TARGET_BINARY}"
    CHECKSUM_URL="https://github.com/${REPO}/releases/latest/download/SHA256SUMS.txt"
    log_step "2/4" "Downloading LiteSPM (latest release)..."
fi
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'litespm')"
cleanup() {
    rm -rf "${TMP_DIR}"
}
trap cleanup EXIT INT TERM

TMP_BIN="${TMP_DIR}/${TARGET_BINARY}"
TMP_SUMS="${TMP_DIR}/SHA256SUMS.txt"

download_file() {
    url="$1"
    output="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 --connect-timeout 15 -o "${output}" "${url}"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "${output}" "${url}"
    else
        log_error "Neither curl nor wget was found on your system."
        exit 1
    fi
}

# Allow local binary override for testing
if [ -n "${LITESPM_LOCAL_BINARY:-}" ] && [ -f "${LITESPM_LOCAL_BINARY}" ]; then
    log_info "(Using local binary override from LITESPM_LOCAL_BINARY)"
    cp "${LITESPM_LOCAL_BINARY}" "${TMP_BIN}"
else
    log_info "Fetching from: ${DIM}${DOWNLOAD_URL}${RESET}"
    if ! download_file "${DOWNLOAD_URL}" "${TMP_BIN}"; then
        log_error "Failed to download binary from ${DOWNLOAD_URL}"
        exit 1
    fi
fi

# 3. Checksum Verification
log_step "3/4" "Verifying SHA-256 integrity..."
compute_sha256() {
    file="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${file}" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${file}" | awk '{print $1}'
    elif command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "${file}" | awk '{print $NF}'
    else
        echo ""
    fi
}

ACTUAL_HASH="$(compute_sha256 "${TMP_BIN}")"
if [ -n "${ACTUAL_HASH}" ]; then
    log_info "Computed SHA-256: ${DIM}${ACTUAL_HASH}${RESET}"
fi

if [ -z "${LITESPM_LOCAL_BINARY:-}" ]; then
    if [ "${LITESPM_SKIP_CHECKSUM:-0}" = "1" ]; then
        log_warn "Skipping SHA-256 verification (LITESPM_SKIP_CHECKSUM=1)"
    else
        if [ -z "${ACTUAL_HASH}" ]; then
            log_error "No SHA-256 tool found (sha256sum, shasum, or openssl). Set LITESPM_SKIP_CHECKSUM=1 to bypass."
            exit 1
        fi
        if ! download_file "${CHECKSUM_URL}" "${TMP_SUMS}" 2>/dev/null; then
            log_error "Failed to download ${CHECKSUM_URL}. Set LITESPM_SKIP_CHECKSUM=1 to bypass."
            exit 1
        fi
        EXPECTED_HASH="$(tr -d '\r' < "${TMP_SUMS}" | awk -v tgt="${TARGET_BINARY}" '$2 == tgt || $2 == ("dist/" tgt) || $2 == ("*" tgt) { print $1; exit }')"
        if [ -z "${EXPECTED_HASH}" ]; then
            log_error "No SHA-256 entry found for ${TARGET_BINARY} in SHA256SUMS.txt. Set LITESPM_SKIP_CHECKSUM=1 to bypass."
            exit 1
        fi
        if [ "${ACTUAL_HASH}" = "${EXPECTED_HASH}" ]; then
            log_info "Checksum matches SHA256SUMS.txt (${GREEN}${EXPECTED_HASH}${RESET})"
        else
            log_error "SHA-256 checksum mismatch! Expected ${EXPECTED_HASH}, got ${ACTUAL_HASH}."
            exit 1
        fi
    fi
fi

# 4. Install & Configure PATH
log_step "4/4" "Installing binary and configuring PATH..."
mkdir -p "${INSTALL_DIR}"
FINAL_BIN="${INSTALL_DIR}/litespm"
STAGE_BIN="${FINAL_BIN}.new.$$"
cp "${TMP_BIN}" "${STAGE_BIN}"
chmod +x "${STAGE_BIN}"
mv -f "${STAGE_BIN}" "${FINAL_BIN}"
log_info "Installed executable to: ${BOLD}${FINAL_BIN}${RESET}"

# Check PATH
NEED_PATH_CONFIG=0
case ":${PATH}:" in
    *":${INSTALL_DIR}:"*)
        log_info "${BOLD}${INSTALL_DIR}${RESET} is already in PATH"
        ;;
    *)
        NEED_PATH_CONFIG=1
        ;;
esac

if [ "${NEED_PATH_CONFIG}" -eq 1 ] && [ "${LITESPM_NO_MODIFY_PATH:-0}" != "1" ]; then
    SHELL_PROFILE=""
    CURRENT_SHELL="$(basename "${SHELL:-sh}")"
    if [ "${CURRENT_SHELL}" = "zsh" ] && [ -f "$HOME/.zshrc" ]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [ "${CURRENT_SHELL}" = "bash" ] && [ -f "$HOME/.bashrc" ]; then
        SHELL_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.profile" ]; then
        SHELL_PROFILE="$HOME/.profile"
    fi

    if [ -n "${SHELL_PROFILE}" ]; then
        LINE_TO_ADD="export PATH=\"${INSTALL_DIR}:\$PATH\""
        if ! grep -Fq "${INSTALL_DIR}" "${SHELL_PROFILE}" 2>/dev/null && ! grep -qi "litespm" "${SHELL_PROFILE}" 2>/dev/null; then
            printf "\n# LiteSPM binary\n%s\n" "${LINE_TO_ADD}" >> "${SHELL_PROFILE}"
            log_info "Added ${BOLD}${INSTALL_DIR}${RESET} to ${SHELL_PROFILE}"
        fi
    fi
fi

# 5. Verification
echo ""
if "${FINAL_BIN}" version >/dev/null 2>&1; then
    VER_LINE="$("${FINAL_BIN}" version)"
    log_success "Verified executable execution:"
    printf "    %b%s%b\n" "${CYAN}" "${VER_LINE}" "${RESET}"
else
    log_warn "Installed binary could not be executed directly in current environment."
fi

# 6. Next Steps
echo ""
log_success "LiteSPM standalone binary installed successfully!"
log_info "Binary location: ${BOLD}${FINAL_BIN}${RESET}"
echo ""
printf "%bNext Steps:%b\n" "${CYAN}${BOLD}" "${RESET}"
printf "  1. Connect your agents:    %blitespm host detect%b\n" "${GREEN}${BOLD}" "${RESET}"
printf "  2. Interactive wizard:     %blitespm%b\n" "${GREEN}${BOLD}" "${RESET}"
printf "  3. Search capabilities:    %blitespm search <query>%b\n" "${GREEN}${BOLD}" "${RESET}"
printf "  4. Documentation:          %bhttps://lite-spm-nine.vercel.app/docs%b\n" "${GREEN}${BOLD}" "${RESET}"
echo ""
