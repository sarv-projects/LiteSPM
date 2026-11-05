#!/usr/bin/env bash
set -euo pipefail

# LiteSPM catalog origin packaging & security audit.
#
# The website is a Next.js standalone app deployed on Vercel (see web/README.md
# and .github/workflows/release.yml). This script no longer builds or copies a
# static Next export: that path was removed when the app gained API routes,
# Prisma and a standalone server. What remains on the Cloudflare origin is the
# signed /v1 catalog release tree; worker/index.js serves it and redirects every
# other path to the app origin.

PAGES_DIR="pages-dist"
rm -rf "${PAGES_DIR}"
mkdir -p "${PAGES_DIR}"

echo "● Materializing catalog release tree (Go builder)..."
# -materialize reproduces the RELEASED pointer's id, sequence, createdAt and
# manifest byte for byte instead of cutting a new release: the CDN caches
# /v1/releases/* immutably, so the deployed bytes must be exactly the bytes
# web/public/v1/current.json digests. It fails closed if the released pointer
# is missing or is not a Go-built pointer.
go run ./cmd/litespm catalog build \
    --materialize \
    --out "${PAGES_DIR}" \
    --prev web/public/v1/current.json

# Sign the trust anchor. /v1/current.json is what every client verifies its
# release chain against, so it is the one file whose AUTHENTICITY matters:
# the digest chain (manifest/listings/versions) proves integrity from the
# pointer down, and this signature proves who published the pointer.
#
# Signing runs only where a real signing identity exists — CI's OIDC token
# (ACTIONS_ID_TOKEN_REQUEST_URL) for cosign's keyless flow. A local run has
# none and says so rather than producing a signature nobody can verify.
# Clients check it when present (internal/catalog) and require it with
# LITESPM_REQUIRE_CATALOG_SIGNATURE=1.
if command -v cosign >/dev/null 2>&1 && [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
    echo "● Signing /v1/current.json (cosign keyless)..."
    cosign sign-blob --yes \
        --bundle "${PAGES_DIR}/v1/current.json.sigstore.json" \
        "${PAGES_DIR}/v1/current.json"
else
    echo "● Skipping catalog pointer signature (cosign or OIDC identity unavailable in this environment)"
fi

echo "● Writing Cloudflare Pages _headers..."
# ARCH/18 §4: the CDN caches /v1/releases/* immutably and /v1/current.json is
# the only mutable part. CORS is open (the catalog is public data) and
# nosniff is set on both stanzas.
cat << 'EOF' > "${PAGES_DIR}/_headers"
# Immutable release directory (forever cached)
/v1/releases/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff

# Pointer file (always revalidate)
/v1/current.json
  Cache-Control: public, no-cache, must-revalidate
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff

# Signature bundle for the pointer (revalidate with it; never immutable)
/v1/current.json.sigstore.json
  Cache-Control: public, no-cache, must-revalidate
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff

# Site-shaped catalog rows, fetched on the first interaction that needs them.
# _headers matches the path, not the query, and the site always requests
# ?v=<datasetDigest> — so the bare URL must not be pinned long either: a
# short max-age keeps a direct hit from serving last week's rows after a
# redeploy, while the digest query keeps concurrent fetches self-consistent.
/data/catalog.json
  Cache-Control: public, max-age=300, must-revalidate
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff

# Catalog shards named by the /data/catalog.json index. _headers matches the
# path, not the query, and the loader requests every shard with the same
# ?v=<datasetDigest> the index carries — so a redeploy that changes any row
# changes the query and every shard URL becomes a fresh cache key, while the
# bytes behind a given key are immutable by construction (a digest-addressed
# dataset never rewrites a shard in place). Long immutable caching is
# therefore safe here and makes repeated visits to the same dataset free;
# the index itself stays short-lived as above.
/data/catalog-*.json
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
EOF

# The Worker is the only handler: it serves /v1 from the asset binding and
# redirects every other path to the Vercel app origin. There is no HTML shell
# in pages-dist and no /package/* rewrite here.

# Every judgement about the finished bundle lives in one script, so the deploy
# path and the checks it faces cannot drift apart.
./scripts/audit-pages-dist.sh "${PAGES_DIR}"
echo "✓ Catalog origin bundle prepared successfully in ${PAGES_DIR}/"
ls -la "${PAGES_DIR}"
