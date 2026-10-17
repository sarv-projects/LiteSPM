#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const { getBinaryName } = require("../bin/litespm.js");

const VERSION = require("../package.json").version;

// ---------------------------------------------------------------------------
// Trust policy
//
// The installer downloads a native binary and then executes it. A SHA-256
// listing fetched from the same release as the binary is INTEGRITY, not
// AUTHENTICITY: whoever can serve a modified binary can serve a modified
// SHA256SUMS.txt beside it and the check passes. Publisher authentication
// needs a signature over the bytes, made by a key the release channel does
// not control.
//
// `release.yml` already mints one: `cosign sign-blob --bundle` in keyless
// (Fulcio) mode, once per asset, including `<binary>.sigstore.json`. The
// certificate's Subject Alternative Name is bound to the workflow run that
// produced the artifact:
//
//   https://github.com/<owner>/<repo>/.github/workflows/release.yml@refs/tags/v<version>
//
// with OIDC issuer https://token.actions.githubusercontent.com.
//
// Both halves of that identity are PINNED IN CODE below. A signature that
// verifies against *some* Fulcio certificate is not evidence — anyone with a
// GitHub account can mint one. It is only evidence when it verifies against
// THIS repository's release workflow on the tag being installed.
// ---------------------------------------------------------------------------

// The trust anchor. Deliberately a literal, not derived from the environment:
// LITESPM_RELEASE_REPO redirects *where bytes are fetched from*, and if the
// expected signer were derived from it too, then a caller who can point at an
// arbitrary repository could also supply the matching signature and the check
// would pass. See resolveTrustPolicy().
const DEFAULT_RELEASE_REPO = "sarv-projects/LiteSPM";

// The one workflow allowed to sign release artifacts.
const RELEASE_WORKFLOW_FILE = ".github/workflows/release.yml";

// GitHub Actions' federated-identity issuer.
const DEFAULT_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

// The suffix release.yml appends to every asset it signs.
const BUNDLE_SUFFIX = ".sigstore.json";

// Sigstore bundle v0.1: the shape `cosign sign-blob --bundle` writes, carrying
// an inclusion promise (SET) rather than a Merkle inclusion proof.
const BUNDLE_V01_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle+json;version=0.1";

// GitHub serves release assets from github.com and 302s to its asset CDN.
// Redirects are bounded to these hosts for the pinned repository; a redirect
// anywhere else is refused. See assertAllowedRedirect().
const GITHUB_ASSET_HOSTS = [
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
  "codeload.github.com",
];

/**
 * The exact certificate identity this release must be signed by.
 *
 * This is the string GitHub's OIDC `job_workflow_ref` claim produces for a
 * tag push, which Fulcio copies verbatim into the certificate SAN. It is
 * verified by reading the SAN out of the published bundles (see the
 * `LITESPM_TEST_NETWORK` cases in test_npm.js) and cross-checked against
 * release.yml's signing step.
 */
function releaseIdentity(repo, version) {
  return `https://github.com/${repo}/${RELEASE_WORKFLOW_FILE}@refs/tags/v${version}`;
}

/** Escape a literal so it can be used as an anchored regular expression. */
function escapeRegExp(literal) {
  return String(literal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the signer identity and issuer the installer will accept, from the
 * environment, without ever silently weakening the pin.
 *
 * - Default (no LITESPM_RELEASE_REPO): the identity is the literal above.
 *   LITESPM_TRUST_IDENTITY / LITESPM_TRUST_ISSUER are NOT consulted — a trust
 *   anchor that an environment variable can move is not an anchor.
 * - LITESPM_RELEASE_REPO set to a mirror: the mirror is a *delegation of
 *   trust* — it can swap the binary and the signature together — so the
 *   operator must state the signer they expect it to present. Without
 *   LITESPM_TRUST_IDENTITY and LITESPM_TRUST_ISSUER this refuses rather than
 *   trusting whatever the mirror happens to serve.
 */
function resolveTrustPolicy(env = process.env) {
  // A trailing slash is a typo, not a different repository.
  const configuredRepo = String(env.LITESPM_RELEASE_REPO || "").trim().replace(/\/+$/, "");
  const isMirror =
    configuredRepo !== "" && configuredRepo.toLowerCase() !== DEFAULT_RELEASE_REPO.toLowerCase();

  if (!isMirror) {
    return {
      repo: DEFAULT_RELEASE_REPO,
      isMirror: false,
      identity: releaseIdentity(DEFAULT_RELEASE_REPO, VERSION),
      issuer: DEFAULT_OIDC_ISSUER,
      source: "pinned",
      releaseBase: `https://github.com/${DEFAULT_RELEASE_REPO}/releases/download/v${VERSION}`,
      mirrorHost: null,
    };
  }

  const identity = String(env.LITESPM_TRUST_IDENTITY || "").trim();
  const issuer = String(env.LITESPM_TRUST_ISSUER || "").trim();
  if (!identity || !issuer) {
    const err = new Error(
      `LITESPM_RELEASE_REPO names "${configuredRepo}", which is not the pinned release repository ` +
        `"${DEFAULT_RELEASE_REPO}". A mirror is not a trust anchor: it can replace the binary and ` +
        `its signature together. To install from it, state the signer you expect it to present by ` +
        `setting both LITESPM_TRUST_IDENTITY (the exact certificate identity) and LITESPM_TRUST_ISSUER ` +
        `(the OIDC issuer). Refusing to trust it implicitly.`
    );
    err.trustConfig = true;
    throw err;
  }

  // Two forms: a GitHub "owner/name" repository, or a full HTTPS origin whose
  // path is the release base.
  let releaseBase;
  let mirrorHost = null;
  if (/^https:\/\//i.test(configuredRepo)) {
    let parsed;
    try {
      parsed = new URL(configuredRepo);
    } catch (e) {
      throw new Error(`LITESPM_RELEASE_REPO is not a valid URL: ${configuredRepo}`);
    }
    assertHTTPS(parsed.toString());
    releaseBase = parsed.toString().replace(/\/$/, "");
    mirrorHost = parsed.hostname.toLowerCase();
  } else {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(configuredRepo)) {
      throw new Error(
        `LITESPM_RELEASE_REPO must be https, got "${configuredRepo}": a plaintext origin would ` +
          `deliver the binary, its checksum listing and its signature bundle in the clear`
      );
    }
    if (!/^[^/\s]+\/[^/\s]+$/.test(configuredRepo)) {
      throw new Error(
        `LITESPM_RELEASE_REPO must be a GitHub "owner/name" repository or an https:// origin, got "${configuredRepo}"`
      );
    }
    releaseBase = `https://github.com/${configuredRepo}/releases/download/v${VERSION}`;
    mirrorHost = "github.com";
  }

  return {
    repo: configuredRepo,
    isMirror: true,
    identity,
    issuer,
    source: "LITESPM_TRUST_IDENTITY",
    releaseBase,
    mirrorHost,
  };
}

/**
 * Whether a verifiable signature is mandatory.
 *
 * Default: YES. LITESPM_ALLOW_UNSIGNED_RELEASE=1 is the explicit, documented
 * opt-out for releases cut before `release.yml` began signing (every tag
 * before v0.4.0), or for an air-gapped machine that cannot reach the Sigstore
 * trust root. It is never a silent fallback: the install prints a loud
 * warning naming exactly what is no longer proven.
 */
function signatureRequired(env = process.env) {
  return env.LITESPM_ALLOW_UNSIGNED_RELEASE !== "1";
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function computeFileSHA256(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

/** Attach the HTTP status to an error so callers can tell 404 from a network fault. */
function httpError(message, statusCode) {
  const err = new Error(message);
  if (statusCode !== undefined) {
    err.statusCode = statusCode;
  }
  return err;
}

/** Fetch a small text resource over HTTPS, following up to MAX_REDIRECTS. */
function fetchText(url, redirects = 0, policy = null) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error("too many redirects"));
      return;
    }
    request(url)
      .on("error", reject)
      .on("timeout", function () {
        this.destroy(new Error("timeout"));
      })
      .on("response", (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          let next;
          try {
            next = resolveRedirect(url, res.headers.location, policy);
          } catch (err) {
            reject(err);
            return;
          }
          resolve(fetchText(next, redirects + 1, policy));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(httpError(`HTTP ${res.statusCode}`, res.statusCode));
          return;
        }
        let bytes = 0;
        let data = "";
        let tooLarge = false;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > MAX_TEXT_BYTES) {
            tooLarge = true;
            res.destroy(new Error(`response exceeds the ${MAX_TEXT_BYTES} byte limit`));
            return;
          }
          data += chunk;
        });
        res.on("end", () => {
          if (tooLarge || bytes > MAX_TEXT_BYTES) {
            reject(new Error(`response exceeds the ${MAX_TEXT_BYTES} byte limit`));
            return;
          }
          resolve(data);
        });
        res.on("error", reject);
      });
  });
}

/** Extract the SHA-256 hex digest for `binName` from a `sha256sum` style listing. */
function checksumFor(sumsText, binName) {
  for (const line of String(sumsText).split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2].trim() === binName) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

// Keep-alive is disabled deliberately: Node's default global agent keeps
// sockets alive for ~5s, which leaves the postinstall process alive after the
// binary is written and makes `npm install` look hung (it ends in SIGINT).
const agent = new https.Agent({ keepAlive: false });

// Guard against a stalled transfer: an npm lifecycle script must never hang.
const REQUEST_TIMEOUT_MS = 120000;

// Bounds for remote reads. A hostile or misconfigured origin must not be able
// to exhaust memory or disk: the checksum manifest is a small text file (the
// Go updater caps it at 1 MiB), a Sigstore bundle is a few kilobytes, and a
// native binary must fit well under the 256 MiB archive bound used by
// internal/artifact. Redirects are capped at 5, matching the Go artifact
// fetcher.
const MAX_TEXT_BYTES = 1 << 20;
const MAX_BINARY_BYTES = 256 << 20;
const MAX_REDIRECTS = 5;

/**
 * Refuse anything that is not plain HTTPS.
 *
 * This installer downloads a native binary and then executes it, so it is the
 * one place in the tree where a transport downgrade turns into code execution:
 * a redirect to http:// would deliver the binary, its checksum manifest and
 * its signature bundle in cleartext, and a fail-open verification would then
 * accept them. The scheme is never negotiable.
 */
function assertHTTPS(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`malformed URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`refusing non-HTTPS URL (${parsed.protocol}//): ${url}`);
  }
  return url;
}

/**
 * Refuse a redirect that leaves the expected origins.
 *
 * The pinned repository is served by GitHub, whose release assets 302 to
 * release-assets.githubusercontent.com / objects.githubusercontent.com, so
 * those hosts are allowed and nothing else is. A mirror names its own host, so
 * that host is allowed too — but a redirect from the mirror to a third party
 * is not what the operator asked for and is refused. (The signature is what
 * actually makes the bytes trustworthy; this bound exists so that an
 * unexpected redirect is a visible refusal rather than a silent fetch.)
 */
function assertAllowedRedirect(url, policy) {
  assertHTTPS(url);
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  const host = parsed.host.toLowerCase();
  const allowed = new Set(GITHUB_ASSET_HOSTS);
  if (policy && policy.isMirror && policy.mirrorHost) {
    // A mirror may live on GitHub or anywhere else; allow the host the
    // operator named.
    allowed.add(String(policy.mirrorHost).toLowerCase());
  }
  const ok = [...allowed].some(
    (h) => hostname === h || host === h || hostname.endsWith(`.${h}`)
  );
  if (!ok) {
    throw new Error(
      `refusing redirect to unexpected host "${host}" (expected ${[...allowed].join(", ")}); ` +
        `if this is a legitimate mirror, point LITESPM_RELEASE_REPO at the final host`
    );
  }
  return url;
}

function request(url) {
  return https.get(assertHTTPS(url), { agent, timeout: REQUEST_TIMEOUT_MS });
}

/** Resolve a redirect Location against the current URL, keeping HTTPS mandatory. */
function resolveRedirect(currentUrl, location, policy = null) {
  const next = new URL(location, currentUrl).toString();
  if (policy) {
    return assertAllowedRedirect(next, policy);
  }
  return assertHTTPS(next);
}

/**
 * Decide whether a finished transfer delivered everything the origin declared.
 * Returns a reason string when it did not, or null when the bytes are whole.
 *
 * Split out so the rule is testable without standing up a server: a download
 * that stopped early must be a refusal, not a short file that a later stage
 * has to explain.
 */
function incompleteTransferReason(bytes, declaredBytes, maxBytes) {
  if (bytes > maxBytes) {
    return `download exceeds the ${maxBytes} byte limit`;
  }
  if (declaredBytes !== null && declaredBytes !== undefined && bytes !== declaredBytes) {
    return `download was truncated: got ${bytes} bytes, the origin declared ${declaredBytes}`;
  }
  return null;
}

function downloadFile(url, targetPath, redirects = 0, policy = null) {  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error("too many redirects"));
      return;
    }
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        try {
          fs.unlinkSync(targetPath);
        } catch (e) {
          /* best effort */
        }
        reject(err);
      } else {
        resolve();
      }
    };

    const handleResponse = (res, currentUrl, redirectCount) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) {
          res.resume();
          done(new Error("too many redirects"));
          return;
        }
        // Follow the GitHub redirect. The response MUST be drained, otherwise
        // its socket is never released and the process cannot exit. The target
        // must still be HTTPS and on the allowed hosts (see
        // assertAllowedRedirect).
        res.resume();
        let nextUrl;
        try {
          nextUrl = resolveRedirect(currentUrl, res.headers.location, policy);
        } catch (err) {
          done(err);
          return;
        }
        request(nextUrl).on("error", done).on("timeout", function () {
          this.destroy(new Error("download timeout"));
        }).on("response", (r2) => handleResponse(r2, nextUrl, redirectCount + 1));
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        done(httpError(`Download failed with status HTTP ${res.statusCode}`, res.statusCode));
        return;
      }

      // A declared length that is not met means the transfer was cut short.
      // Without this a truncated body would only be caught downstream, by a
      // digest mismatch, with a much less actionable message.
      const declared = Number(res.headers["content-length"]);
      const expectedBytes = Number.isFinite(declared) && declared > 0 ? declared : null;

      // Bound the download: a binary larger than MAX_BINARY_BYTES is either a
      // misconfigured origin or an attack, never a legitimate release asset.
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BINARY_BYTES) {
          done(new Error(`download exceeds the ${MAX_BINARY_BYTES} byte limit`));
          try {
            res.destroy();
          } catch (e) {
            /* best effort */
          }
        }
      });

      // `close` (not `finish`) is the reliable signal that the fd is closed.
      const file = fs.createWriteStream(targetPath);
      file.on("close", () => {
        const reason = incompleteTransferReason(bytes, expectedBytes, MAX_BINARY_BYTES);
        done(reason ? new Error(reason) : undefined);
      });
      file.on("error", done);
      res.on("error", done);
      res.on("aborted", () => done(new Error("download aborted")));
      res.pipe(file);
    };

    request(url)
      .on("error", done)
      .on("timeout", function () {
        this.destroy(new Error("download timeout"));
      })
      .on("response", (res) => handleResponse(res, url, redirects));
  });
}

// ---------------------------------------------------------------------------
// Bundle parsing
//
// Two on-the-wire shapes exist and both must be accepted, because both are
// genuinely published:
//
//  - the legacy cosign shape {base64Signature, cert, rekorBundle}, which is
//    what `cosign sign-blob --bundle` wrote for v0.4.0 and v0.4.1;
//  - the Sigstore protobuf bundle (mediaType + verificationMaterial), which is
//    what newer cosign writes.
//
// The conversion below is a mechanical re-encoding of the SAME bytes — it
// moves a PEM certificate, a signature, a Rekor body and its SET between two
// JSON layouts. It performs no cryptography and asserts nothing. Every check
// that decides whether the artifact is trustworthy happens afterwards, in
// sigstore-js. Do not add trust logic here.
// ---------------------------------------------------------------------------

function isLegacyCosignBundle(raw) {
  return (
    raw !== null &&
    typeof raw === "object" &&
    typeof raw.base64Signature === "string" &&
    typeof raw.cert === "string" &&
    raw.rekorBundle !== null &&
    typeof raw.rekorBundle === "object"
  );
}

/** Decode base64, refusing input that does not round-trip cleanly. */
function decodeBase64Strict(value, what) {
  const compact = String(value).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new Error(`${what} is not valid base64`);
  }
  const buf = Buffer.from(compact, "base64");
  if (buf.length === 0) {
    throw new Error(`${what} decodes to zero bytes`);
  }
  return buf;
}

/**
 * Re-encode a legacy cosign bundle as a Sigstore protobuf v0.1 bundle.
 *
 * `artifactDigest` is the SHA-256 of the bytes on disk, not a value read out
 * of the bundle. Putting the on-disk digest into the message signature is what
 * makes sigstore-js cross-check the artifact against the Rekor entry: if the
 * bytes were tampered with, the digest recorded in the transparency log no
 * longer matches and verification fails on a mismatch rather than silently
 * agreeing with itself.
 */
function legacyBundleToProtobuf(raw, artifactDigest) {
  const rb = raw.rekorBundle;
  const payload = rb.Payload;
  if (!payload || typeof payload !== "object") {
    throw new Error("legacy bundle has no rekorBundle.Payload");
  }
  for (const field of ["body", "integratedTime", "logIndex", "logID"]) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      throw new Error(`legacy bundle rekorBundle.Payload is missing ${field}`);
    }
  }
  if (typeof rb.SignedEntryTimestamp !== "string" || rb.SignedEntryTimestamp === "") {
    throw new Error("legacy bundle has no rekorBundle.SignedEntryTimestamp");
  }

  // `cert` holds a PEM certificate that is itself base64-encoded in the JSON.
  const pem = decodeBase64Strict(raw.cert, "bundle cert").toString("utf8");
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  if (!/BEGIN CERTIFICATE/.test(pem)) {
    throw new Error("bundle cert is not a PEM certificate");
  }
  const der = decodeBase64Strict(body, "bundle certificate");

  const signature = decodeBase64Strict(raw.base64Signature, "bundle signature");
  const canonicalizedBody = decodeBase64Strict(payload.body, "rekor entry body");
  const signedEntryTimestamp = decodeBase64Strict(
    rb.SignedEntryTimestamp,
    "rekor signed entry timestamp"
  );

  const logIDHex = String(payload.logID);
  if (!/^[0-9a-fA-F]+$/.test(logIDHex)) {
    throw new Error("legacy bundle rekor logID is not hexadecimal");
  }

  const integratedTime = Number(payload.integratedTime);
  const logIndex = Number(payload.logIndex);
  if (!Number.isFinite(integratedTime) || !Number.isFinite(logIndex)) {
    throw new Error("legacy bundle rekor integratedTime/logIndex are not numeric");
  }

  return {
    mediaType: BUNDLE_V01_MEDIA_TYPE,
    verificationMaterial: {
      x509CertificateChain: {
        certificates: [{ rawBytes: der.toString("base64") }],
      },
      tlogEntries: [
        {
          logIndex: String(logIndex),
          logId: { keyId: Buffer.from(logIDHex, "hex").toString("base64") },
          kindVersion: { kind: "hashedrekord", version: "0.0.1" },
          integratedTime: String(integratedTime),
          inclusionPromise: { signedEntryTimestamp: signedEntryTimestamp.toString("base64") },
          canonicalizedBody: canonicalizedBody.toString("base64"),
        },
      ],
    },
    messageSignature: {
      messageDigest: { algorithm: "SHA2_256", digest: artifactDigest.toString("base64") },
      signature: signature.toString("base64"),
    },
  };
}

/**
 * Normalise either published bundle shape into a protobuf bundle document.
 * Throws on anything that is not recognisably one of the two.
 */
function normalizeBundle(raw, artifactDigest) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("bundle is not a JSON object");
  }
  if (typeof raw.mediaType === "string") {
    // Already a Sigstore protobuf bundle; sigstore-js validates the shape.
    return raw;
  }
  if (isLegacyCosignBundle(raw)) {
    return legacyBundleToProtobuf(raw, artifactDigest);
  }
  throw new Error(
    "bundle is neither a Sigstore protobuf bundle (no mediaType) nor a legacy cosign bundle " +
      "(no base64Signature/cert/rekorBundle)"
  );
}

/**
 * Load the Sigstore verification libraries lazily so that a checkout without
 * `npm install` gets an actionable message rather than MODULE_NOT_FOUND.
 */
function loadSigstore() {
  try {
    const { bundleFromJSON } = require("@sigstore/bundle");
    const { Verifier, toSignedEntity, toTrustMaterial, PolicyError } = require("@sigstore/verify");
    const { getTrustedRoot } = require("@sigstore/tuf");
    return { bundleFromJSON, Verifier, toSignedEntity, toTrustMaterial, getTrustedRoot, PolicyError };
  } catch (err) {
    const e = new Error(
      `the Sigstore verification libraries are not installed (${err.message}). ` +
        `Install them with "npm install" in the package directory. ` +
        `Set LITESPM_ALLOW_UNSIGNED_RELEASE=1 only if you knowingly accept checksum-only ` +
        `verification, which does not authenticate the publisher.`
    );
    e.unverified = true;
    throw e;
  }
}

/**
 * Verify `artifactBytes` against a Sigstore bundle, against the pinned signer
 * identity and issuer.
 *
 * Every failure mode the audit named lands here and throws: a malformed
 * bundle, a bundle whose certificate chains to a different signer, a valid
 * signature over a different artifact, a forged transparency-log entry, a
 * certificate outside its validity window, and a digest that does not match
 * what the log recorded. Nothing in this function returns a "probably fine".
 *
 * The cryptography is sigstore-js's (@sigstore/verify + @sigstore/tuf). This
 * function does not re-implement certificate-chain validation, Merkle proof
 * checking or SET verification — hand-rolling any of those is how this goes
 * wrong.
 */
async function verifyBundleAgainstPolicy(bundleText, artifactBytes, policy) {
  const sigstore = loadSigstore();

  let raw;
  try {
    raw = JSON.parse(bundleText);
  } catch (err) {
    throw new Error(`bundle is not valid JSON (${err.message})`);
  }

  const artifactDigest = crypto.createHash("sha256").update(artifactBytes).digest();
  const document = normalizeBundle(raw, artifactDigest);

  let bundle;
  try {
    bundle = sigstore.bundleFromJSON(document);
  } catch (err) {
    throw new Error(`bundle is malformed (${err.message})`);
  }

  // The trusted root is fetched over TUF, which verifies the root itself
  // against the root shipped inside @sigstore/tuf before trusting anything it
  // serves, and caches it on disk for subsequent installs. An unreachable
  // trust root is a refusal, never a bypass.
  let trustedRoot;
  try {
    trustedRoot = await sigstore.getTrustedRoot();
  } catch (err) {
    throw new Error(
      `the Sigstore trust root could not be obtained (${err.message}); ` +
        `this install needs network access to tuf-repo-cdn.sigstore.dev on first use`
    );
  }

  const verifier = new sigstore.Verifier(sigstore.toTrustMaterial(trustedRoot), {
    // One transparency-log inclusion and one certificate-transparency
    // inclusion are the minimum that make the signature auditable. They are
    // defaults; they are stated here so that lowering them is a visible edit.
    tlogThreshold: 1,
    ctlogThreshold: 1,
  });

  const entity = sigstore.toSignedEntity(bundle, artifactBytes);

  try {
    // verify() checks, in order: the Rekor SET against the trusted log keys,
    // the canonicalized body against the signature and digest in the bundle,
    // the certificate chain to a trusted Fulcio CA at the logged timestamp,
    // the SCT against a trusted CT log, the signature over the artifact bytes,
    // and finally the identity policy below.
    const signer = verifier.verify(entity, {
      // sigstore-js treats this as an unanchored JavaScript RegExp, so the
      // literal is escaped and anchored. Without that, "github.com" would
      // match "githubXcom" and a SAN merely CONTAINING the pinned string
      // would pass.
      subjectAlternativeName: `^${escapeRegExp(policy.identity)}$`,
      extensions: { issuer: policy.issuer },
    });
    return signer;
  } catch (err) {
    if (sigstore.PolicyError && err instanceof sigstore.PolicyError) {
      throw new Error(
        `the signature is valid but was made by the wrong signer: ${err.message}. ` +
          `This release must be signed by ${policy.identity} (issuer ${policy.issuer})`
      );
    }
    throw new Error(`signature verification failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Checksum manifest (retained)
// ---------------------------------------------------------------------------

/**
 * Verify a downloaded binary against the release's published SHA-256 manifest,
 * deleting it and throwing unless the digest is proven. Fail-closed by design.
 *
 * This is a *consistency* check, not an authenticity check: it proves the
 * bytes match the listing the release publishes, and the listing travels in
 * the same release as the binary. Authenticity comes from the Sigstore bundle
 * verified by verifyBundleAgainstPolicy(); this remains because a release
 * whose manifest disagrees with its own signed artifact is malformed and must
 * not install.
 */
async function verifyDownloadedBinary(binaryPath, binName, releaseBase, policy = null, getText = fetchText) {
  const fail = (reason) => {
    try {
      fs.unlinkSync(binaryPath);
    } catch (e) {
      /* best effort */
    }
    const err = new Error(`refusing to install ${binName}: ${reason}`);
    // Distinguishes "we could not prove these bytes" from "there were no
    // bytes", because the two demand different operator responses.
    err.unverified = true;
    throw err;
  };

  let sums;
  try {
    sums = await getText(`${releaseBase}/SHA256SUMS.txt`, 0, policy);
  } catch (err) {
    fail(`the checksum manifest could not be fetched (${err.message})`);
  }

  const expected = checksumFor(sums, binName);
  if (!expected) {
    fail(`no checksum entry for ${binName} in SHA256SUMS.txt`);
  }

  return assertVerifiedDigest(binaryPath, binName, expected);
}

/**
 * Compare a downloaded file against an expected digest, deleting it and
 * throwing when they disagree. Split out from verifyDownloadedBinary so the
 * accept and reject paths are testable without standing up TLS.
 */
function assertVerifiedDigest(binaryPath, binName, expected) {
  const actual = computeFileSHA256(binaryPath);
  if (actual !== expected) {
    try {
      fs.unlinkSync(binaryPath);
    } catch (e) {
      /* best effort */
    }
    const err = new Error(
      `refusing to install ${binName}: checksum mismatch (expected ${expected}, got ${actual})`
    );
    err.unverified = true;
    throw err;
  }
  console.log(`[litespm] Verified SHA-256 checksum for ${binName}`);
  return actual;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Prove that `binaryPath` is the artifact this release signed, and that the
 * signer is this repository's release workflow.
 *
 * Order matters: the signature bundle is fetched and verified first, because
 * it is the only thing here that authenticates the publisher. The checksum
 * manifest is then cross-checked as a consistency assertion.
 *
 * The two cases are kept apart on purpose: "the release publishes no bundle"
 * (a pre-signing release, eligible for the explicit opt-out) is not the same
 * as "a bundle was published and did not verify" (always fatal, because that
 * is the attack signal rather than the absence of one).
 */
async function verifyReleaseArtifact(binaryPath, binName, releaseBase, options = {}) {
  const env = options.env || process.env;
  const policy = options.policy || resolveTrustPolicy(env);
  const requireSignature = signatureRequired(env);
  const bundleUrl = `${releaseBase}/${binName}${BUNDLE_SUFFIX}`;
  // Injectable purely so the refusal paths can be driven from tests without
  // standing up TLS. Production always uses the real fetcher, which is
  // HTTPS-only and redirect-bounded; nothing here relaxes either.
  const getText = options.fetchText || fetchText;

  const discard = (reason) => {
    try {
      fs.unlinkSync(binaryPath);
    } catch (e) {
      /* best effort */
    }
    const err = new Error(`refusing to install ${binName}: ${reason}`);
    err.unverified = true;
    throw err;
  };

  const artifactBytes = fs.readFileSync(binaryPath);

  let bundleText = null;
  let bundleMissing = false;
  try {
    bundleText = await getText(bundleUrl, 0, policy);
  } catch (err) {
    if (err.statusCode === 404) {
      bundleMissing = true;
    } else if (requireSignature) {
      discard(`the release's signature bundle could not be fetched (${err.message})`);
    } else {
      // Opt-out set, but we could not even learn whether a bundle exists.
      // Falling back here would silently downgrade an unknown state to
      // checksum-only, so it refuses instead.
      discard(
        `the release's signature bundle could not be fetched (${err.message}); ` +
          `LITESPM_ALLOW_UNSIGNED_RELEASE=1 falls back only when a release publishes no bundle at all`
      );
    }
  }

  if (bundleMissing) {
    if (requireSignature) {
      discard(
        `this release publishes no signature bundle (${bundleUrl} returned HTTP 404). ` +
          `LiteSPM requires a Sigstore signature by default; a checksum alone does not ` +
          `authenticate the publisher. If you knowingly accept that for a release cut before ` +
          `v0.4.0, re-run with LITESPM_ALLOW_UNSIGNED_RELEASE=1`
      );
    }
    console.warn(
      `[litespm] WARNING: this release publishes no Sigstore signature bundle, and ` +
        `LITESPM_ALLOW_UNSIGNED_RELEASE=1 was set. Falling back to checksum-only verification.`
    );
    console.warn(
      `[litespm] WARNING: a checksum travels in the same release as the binary, so it proves the ` +
        `download was not corrupted — it does NOT prove who published it.`
    );
  } else {
    try {
      const signer = await verifyBundleAgainstPolicy(bundleText, artifactBytes, policy);
      console.log(
        `[litespm] Verified Sigstore signature for ${binName}\n` +
          `[litespm]   signer: ${signer.identity.subjectAlternativeName}\n` +
          `[litespm]   issuer: ${signer.identity.extensions.issuer}`
      );
    } catch (err) {
      discard(err.message);
    }
  }

  await verifyDownloadedBinary(binaryPath, binName, releaseBase, policy, getText);
}

async function installBinary() {
  const binName = getBinaryName();
  const targetDir = path.join(os.homedir(), ".litespm", "bin");
  ensureDir(targetDir);
  const targetPath = path.join(targetDir, binName);
  const stampPath = `${targetPath}.version`;

  // 0. Resolve the trust policy before anything is fetched, so a
  //    misconfigured mirror fails immediately and unambiguously.
  let policy;
  try {
    policy = resolveTrustPolicy(process.env);
  } catch (err) {
    console.error(`[litespm] INSTALL REFUSED — ${err.message}`);
    throw err;
  }
  if (policy.isMirror) {
    console.warn(
      `[litespm] WARNING: installing from the mirror ${policy.repo} (${policy.releaseBase}), ` +
        `trusting signer ${policy.identity} (issuer ${policy.issuer}).`
    );
  } else if (String(process.env.LITESPM_TRUST_IDENTITY || "").trim()) {
    console.log(
      `[litespm] Note: LITESPM_TRUST_IDENTITY is ignored because LITESPM_RELEASE_REPO names the ` +
        `pinned repository; the identity is fixed in the installer.`
    );
  }
  if (!signatureRequired(process.env)) {
    console.warn(
      `[litespm] WARNING: LITESPM_ALLOW_UNSIGNED_RELEASE=1 is set. A release that publishes no ` +
        `signature will be accepted on its SHA-256 checksum alone.`
    );
  }

  // 1. Skip only when the installed binary is the version we asked for.
  //    Comparing versions (not mere existence) is what makes an npm upgrade
  //    actually deliver the new binary.
  if (fs.existsSync(targetPath)) {
    let installed = "";
    try {
      installed = fs.readFileSync(stampPath, "utf8").trim();
    } catch (e) {
      installed = "";
    }
    if (installed === VERSION) {
      return;
    }
    console.log(
      `[litespm] Updating ${binName} ${installed || "(unknown)"} -> ${VERSION}`
    );
  }

  // 2. A pre-built binary in dist/ is a developer convenience, NOT a substitute
  //    for the pinned release. It used to take precedence and was stamped
  //    "local", so a checkout with a stale dist/ kept installing that binary
  //    forever and never re-downloaded the version this package pins. It is now
  //    opt-in: set LITESPM_ALLOW_LOCAL_DIST=1 to use it deliberately, e.g.
  //    while testing a build before publishing a release.
  const localDist = path.join(__dirname, "..", "..", "dist", binName);
  if (process.env.LITESPM_ALLOW_LOCAL_DIST === "1" && fs.existsSync(localDist)) {
    fs.copyFileSync(localDist, targetPath);
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }
    fs.writeFileSync(stampPath, `${VERSION}-local\n`);
    console.log(
      `[litespm] Using the LOCAL build at ${localDist} (LITESPM_ALLOW_LOCAL_DIST=1). ` +
        `It is not the published v${VERSION} binary and its checksum and signature are not verified.`
    );
    return;
  }
  if (fs.existsSync(localDist)) {
    console.log(
      `[litespm] Ignoring the local build at ${localDist}; installing the published ` +
        `v${VERSION} binary. Set LITESPM_ALLOW_LOCAL_DIST=1 to use it deliberately.`
    );
  }

  // 3. Fallback: Download pre-compiled release binary from GitHub Releases
  const releaseBase = policy.releaseBase;
  const releaseUrl = `${releaseBase}/${binName}`;
  console.log(`[litespm] Downloading native binary from the release: ${releaseUrl}...`);
  const tempTarget = `${targetPath}.tmp.${Date.now()}`;
  try {
    await downloadFile(releaseUrl, tempTarget, 0, policy);

    // Verification is FAIL-CLOSED. Bytes are on disk and this script's entire
    // job is to make them trustworthy, so an unverifiable download is discarded
    // rather than installed: a missing bundle, an unverifiable bundle, a
    // signature by the wrong identity, a missing manifest, a missing entry, an
    // unreadable manifest or a digest mismatch all leave no binary behind.
    // Proceeding on a warning would mean the one artifact we execute is the one
    // artifact we could not check.
    await verifyReleaseArtifact(tempTarget, binName, releaseBase, { policy });

    fs.renameSync(tempTarget, targetPath);
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }
    fs.writeFileSync(stampPath, `${VERSION}\n`);
    console.log(`[litespm] Successfully downloaded and installed ${binName} to ${targetPath}`);
  } catch (err) {
    // A partial artifact must never survive a refusal, whatever the failure.
    try {
      fs.unlinkSync(tempTarget);
    } catch (e) {
      /* best effort */
    }
    if (err && err.unverified) {
      // No binary was installed and nothing unverified will run. This is a
      // release-integrity failure, not a network one, so it must not read like
      // a transient notice.
      console.warn(`[litespm] INSTALL REFUSED — ${err.message}`);
      console.warn(
        `[litespm] The download was discarded rather than installed unverified. ` +
          `Nothing was written to ${targetPath}.`
      );
      console.warn(
        `[litespm] Check ${releaseBase} for ${binName} and its ${BUNDLE_SUFFIX} bundle, then ` +
          `reinstall. Setting LITESPM_ALLOW_UNSIGNED_RELEASE=1 disables publisher ` +
          `authentication and is not a fix.`
      );
    } else {
      console.warn(`[litespm] Notice: could not download the native binary (${err.message}).`);
      console.warn(`[litespm] Expected release asset: ${releaseUrl}`);
      console.warn(
        `[litespm] If that release does not exist yet, push the v${VERSION} tag and let its ` +
          `release publish before installing from npm.`
      );
    }
    // Fail closed: a postinstall that cannot prove its binary must fail the
    // install (non-zero exit) rather than succeed silently. The wrapper
    // re-attempts the download on first invocation, so a transient network
    // failure is recoverable by retrying the install.
    throw err;
  }
}

if (require.main === module) {
  installBinary()
    .then(() => {
      // Release the pooled sockets and exit explicitly: an npm lifecycle
      // script must not linger waiting for keep-alive timeouts.
      agent.destroy();
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[litespm] Postinstall failed: ${err.message}`);
      agent.destroy();
      process.exit(1);
    });
}

module.exports = {
  installBinary,
  computeFileSHA256,
  checksumFor,
  verifyDownloadedBinary,
  verifyReleaseArtifact,
  verifyBundleAgainstPolicy,
  normalizeBundle,
  legacyBundleToProtobuf,
  isLegacyCosignBundle,
  resolveTrustPolicy,
  signatureRequired,
  releaseIdentity,
  escapeRegExp,
  assertVerifiedDigest,
  incompleteTransferReason,
  assertHTTPS,
  assertAllowedRedirect,
  resolveRedirect,
  downloadFile,
  fetchText,
  agent,
  DEFAULT_RELEASE_REPO,
  RELEASE_WORKFLOW_FILE,
  DEFAULT_OIDC_ISSUER,
  BUNDLE_SUFFIX,
  BUNDLE_V01_MEDIA_TYPE,
  GITHUB_ASSET_HOSTS,
  MAX_TEXT_BYTES,
  MAX_BINARY_BYTES,
  MAX_REDIRECTS,
};
