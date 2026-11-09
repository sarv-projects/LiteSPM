#!/usr/bin/env bash
set -euo pipefail

# Build a clean, six-platform release matrix. Artifacts are staged in a fresh
# sibling directory and published to DIST_DIR only after every build and the
# checksum manifest succeed. A failed build leaves the previous dist/ intact.

VERSION="${VERSION:?Set VERSION to the release version, for example VERSION=0.6.0}"
if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid VERSION '${VERSION}'; expected a semantic version." >&2
    exit 2
fi

DIST_DIR="${DIST_DIR:-dist}"
DIST_PARENT="$(dirname "${DIST_DIR}")"
DIST_BASE="$(basename "${DIST_DIR}")"
if [[ -z "${DIST_DIR}" || "${DIST_DIR}" == "/" || "${DIST_DIR}" == "." || "${DIST_BASE}" == "." || "${DIST_BASE}" == ".." ]]; then
    echo "Refusing unsafe DIST_DIR '${DIST_DIR}'. Choose a dedicated release-output directory." >&2
    exit 2
fi
if [[ -L "${DIST_DIR}" ]]; then
    echo "Refusing to replace a symlinked DIST_DIR: ${DIST_DIR}" >&2
    exit 2
fi
mkdir -p "${DIST_PARENT}"
STAGING_DIR="$(mktemp -d "${DIST_PARENT%/}/.${DIST_BASE}.staging.XXXXXX")"
BACKUP_DIR=""

cleanup() {
    if [[ -n "${STAGING_DIR}" && -d "${STAGING_DIR}" ]]; then
        rm -rf -- "${STAGING_DIR}"
    fi
    # If publication failed after moving the old tree aside, restore it.
    if [[ -n "${BACKUP_DIR}" && -d "${BACKUP_DIR}" && ! -e "${DIST_DIR}" ]]; then
        mv -- "${BACKUP_DIR}" "${DIST_DIR}"
    fi
}
trap cleanup EXIT

TARGETS=(
    "windows/amd64/litespm-windows-amd64.exe"
    "windows/arm64/litespm-windows-arm64.exe"
    "linux/amd64/litespm-linux-amd64"
    "linux/arm64/litespm-linux-arm64"
    "darwin/amd64/litespm-darwin-amd64"
    "darwin/arm64/litespm-darwin-arm64"
)

printf 'Building LiteSPM v%s (%d targets) into isolated staging...\n' "${VERSION}" "${#TARGETS[@]}"
for target in "${TARGETS[@]}"; do
    IFS="/" read -r os arch filename <<< "${target}"
    out_path="${STAGING_DIR}/${filename}"
    printf '  Compiling %s/%s -> %s\n' "${os}" "${arch}" "${out_path}"
    GOOS="${os}" GOARCH="${arch}" CGO_ENABLED=0 go build \
        -p "${GO_BUILD_PARALLELISM:-1}" \
        -trimpath \
        -ldflags="-s -w -X main.Version=${VERSION}" \
        -o "${out_path}" \
        ./cmd/litespm
    if [[ ! -s "${out_path}" ]]; then
        echo "Build produced a missing or empty artifact: ${filename}" >&2
        exit 1
    fi
done

(
    cd "${STAGING_DIR}"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -- litespm-* > SHA256SUMS.txt
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 litespm-* > SHA256SUMS.txt
    else
        echo "Cannot generate SHA256SUMS.txt: install sha256sum or shasum." >&2
        exit 1
    fi
)

# Assert the exact release shape before replacing the previous successful build.
actual_count="$(find "${STAGING_DIR}" -maxdepth 1 -type f -name 'litespm-*' | wc -l | tr -d ' ')"
if [[ "${actual_count}" != "${#TARGETS[@]}" || ! -s "${STAGING_DIR}/SHA256SUMS.txt" ]]; then
    echo "Release staging is incomplete: expected ${#TARGETS[@]} binaries, found ${actual_count}." >&2
    exit 1
fi

if [[ -e "${DIST_DIR}" ]]; then
    BACKUP_DIR="${DIST_DIR}.previous.$$"
    if [[ -e "${BACKUP_DIR}" ]]; then
        echo "Refusing to overwrite an existing backup path: ${BACKUP_DIR}" >&2
        exit 1
    fi
    mv -- "${DIST_DIR}" "${BACKUP_DIR}"
fi

if ! mv -- "${STAGING_DIR}" "${DIST_DIR}"; then
    echo "Could not publish staged release directory; restoring previous dist." >&2
    if [[ -n "${BACKUP_DIR}" && -d "${BACKUP_DIR}" ]]; then
        mv -- "${BACKUP_DIR}" "${DIST_DIR}"
        BACKUP_DIR=""
    fi
    exit 1
fi
STAGING_DIR=""

if [[ -n "${BACKUP_DIR}" && -d "${BACKUP_DIR}" ]]; then
    rm -rf -- "${BACKUP_DIR}"
    BACKUP_DIR=""
fi
trap - EXIT

printf '\nBuild complete. Published exactly %d binaries and SHA256SUMS.txt in %s/\n' "${#TARGETS[@]}" "${DIST_DIR}"
ls -lah "${DIST_DIR}"
