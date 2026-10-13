#!/usr/bin/env bash
# Audit a prepared Pages bundle: nothing that could leak source or secrets, and
# a catalog tree that agrees with its own pointer.
#
# Split out of scripts/deploy-pages.sh so CI can run exactly the checks the
# deploy path runs, instead of a paraphrase of them that drifts. The deploy
# script is the only thing allowed to build the bundle; this script only judges
# one, so it is safe to point at any directory.
#
# Usage: scripts/audit-pages-dist.sh <bundle-dir>
set -euo pipefail

PAGES_DIR="${1:-}"
if [ -z "${PAGES_DIR}" ] || [ ! -d "${PAGES_DIR}" ]; then
    echo "usage: $0 <bundle-dir>  (directory that contains v1/)" >&2
    exit 2
fi

echo "● Verifying ${PAGES_DIR}/v1/current.json endpoint..."
if [ ! -f "${PAGES_DIR}/v1/current.json" ] || [ ! -d "${PAGES_DIR}/v1/releases" ]; then
    echo "❌ /v1 tree missing from ${PAGES_DIR}"
    exit 1
fi

# The CDN caches /v1/releases/* immutably and /v1/current.json is the only
# mutable part, so a tree that disagrees with its own pointer is unrecoverable
# once uploaded: the digest chain is checked here, before upload, using the same
# rules `catalog sync` applies on the client.
echo "● Verifying /v1 tree against its pointer (digest chain)..."
go run ./cmd/litespm catalog build --verify "${PAGES_DIR}"

echo "● Running Strict Dist Allowlist & Leak Prevention Audit..."
# Source maps are the leak this audit originally missed: a .js.map embeds the
# original module source, so shipping one publishes the code behind the bundle.
# The .ts rule used to carry a chain of -not exceptions that could never apply
# (a .ts file never matches *.js and friends), which read like an allowlist while
# forbidding every .ts file; it is now the single rule it meant to be.
FORBIDDEN_FILES=$(find "${PAGES_DIR}" -type f \( \
    -name "*.go" -o \
    -name "*.map" -o \
    -name "*.env*" -o \
    -name "*.pem" -o \
    -name "*.key" -o \
    -name "*.db" -o \
    -name "*.sqlite*" -o \
    -name "*.ts" \
\))

if [ -n "${FORBIDDEN_FILES}" ]; then
    echo "❌ SECURITY AUDIT FAILED: Forbidden files detected in ${PAGES_DIR}:"
    echo "${FORBIDDEN_FILES}"
    exit 1
fi

echo "✓ Zero source leaks detected. Dist allowlist verified."

# Cloudflare Pages' asset budget, measured rather than assumed.
#
# The digest chain above proves the release tree is the one the pointer names,
# and the scan proves nothing leaked — but neither says whether the bundle fits.
# A deploy that exceeds a Pages limit fails at upload and reports a CDN problem,
# not a spent budget, so this names it first: 20,000 files and 25 MiB per asset
# on the Free plan (100,000 files when PAGES_WRANGLER_MAJOR_VERSION=4 is set).
# Raise the plan argument here if this project moves off Free.
echo "● Checking Cloudflare Pages limits..."
python3 ./scripts/check_pages_limits.py "${PAGES_DIR}" --plan free

