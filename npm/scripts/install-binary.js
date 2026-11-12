#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const net = require("net");
const tls = require("tls");
const { spawnSync } = require("child_process");
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
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    throw describeFsError(err, dir);
  }
}

/**
 * Turn a raw filesystem error on the install location into something a person
 * can act on. ENOTDIR / EACCES on the home directory otherwise surface as
 * "ENOTDIR: not a directory, mkdir 'C:\\Users\\x\\.litespm\\bin\\v1'".
 */
function describeFsError(err, target) {
  if (!err || !err.code || err.statusCode !== undefined || err.filesystem) return err;
  // A socket-level EACCES/EPERM (firewall, proxy) is a network fault, not a file one.
  if (["connect", "getaddrinfo", "read", "write"].includes(err.syscall) && !err.path) return err;
  const hints = {
    ENOTDIR:
      `a path component of ${target} is a file, not a directory (is ~/.litespm or ~/.litespm/bin a regular file?). ` +
      `Move or delete that file and reinstall`,
    EACCES:
      `permission denied writing ${target}. Fix the ownership/permissions of your home directory ` +
      `(do not use sudo for \`npm i -g\`; configure an npm prefix you own) and reinstall`,
    EPERM:
      `operation not permitted writing ${target}. Check the permissions of your home directory and any ` +
      `security software that guards it, then reinstall`,
    EROFS: `${target} is on a read-only filesystem. Set HOME/USERPROFILE to a writable location and reinstall`,
    ENOSPC: `no space left on the device holding ${target}. Free some disk space and reinstall`,
    EEXIST: `${target} already exists and is not a directory. Move or delete it and reinstall`,
  };
  if (!hints[err.code]) return err;
  const out = new Error(`cannot prepare the install location: ${hints[err.code]} (${err.code})`);
  out.code = err.code;
  out.filesystem = true;
  return out;
}

/**
 * SHA-256 of a file, hashed in fixed-size chunks so a large binary is never
 * held in memory a second time just to be digested. The digest is identical
 * to hashing the whole buffer; only the memory profile differs.
 */
function computeFileSHA256(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const chunk = Buffer.allocUnsafe(1 << 20);
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      hash.update(chunk.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

/**
 * A temp file name that cannot collide with a concurrent installer (two
 * `npm i -g` runs, or a postinstall racing the lazy installer): pid plus
 * random bytes, not a millisecond timestamp.
 */
function tempPathFor(targetPath) {
  return `${targetPath}.tmp.${process.pid}.${crypto.randomBytes(6).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Failure taxonomy and retry
//
// Three kinds of failure need three different responses, so they are told
// apart explicitly instead of by "did it have an HTTP status":
//
//   integrity  - a signature, digest, redirect or scheme refusal. Never
//                retried; the postinstall exits 1.
//   network    - a transient transport fault (reset, timeout, DNS, 408/429/5xx).
//                Retried with backoff; if it persists the postinstall exits 0
//                (nothing unverified was installed) and the first run of
//                `litespm` finishes the job.
//   other      - a missing release (404), a filesystem problem, bad config.
//                Not retried; exit 1.
// ---------------------------------------------------------------------------

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ECONNABORTED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

const TRANSIENT_MESSAGE = /socket hang up|\btimeout\b|timed out|download aborted|download was truncated|fetch failed|network (?:error|socket)|premature close|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/i;

function transientStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** Walk an error and its `cause` chain (bounded) looking for a predicate match. */
function someInChain(err, pred) {
  const seen = new Set();
  for (let e = err, i = 0; e && typeof e === "object" && !seen.has(e) && i < 6; i++) {
    seen.add(e);
    if (pred(e)) return true;
    e = e.cause || (Array.isArray(e.errors) ? e.errors[0] : undefined);
  }
  return false;
}

/**
 * Is this a transient transport fault worth retrying (and, once retries are
 * spent, worth deferring to first run)? Integrity refusals are never transient.
 */
function isTransientError(err) {
  if (!err) return false;
  if (err.unverified || err.refusal || err.filesystem || err.trustConfig) return false;
  return someInChain(err, (e) => {
    if (e.unverified || e.refusal) return false;
    if (e.proxyStatus !== undefined) return transientStatus(e.proxyStatus);
    if (e.statusCode !== undefined) return transientStatus(e.statusCode);
    if (e.code && TRANSIENT_ERROR_CODES.has(e.code)) return true;
    return typeof e.message === "string" && TRANSIENT_MESSAGE.test(e.message);
  });
}

/** Deterministic delay for 1-based `attempt`: 1s, 3s, 9s ... with +/-20% jitter. */
function backoffDelayMs(attempt, random = Math.random, baseMs = Number(process.env.LITESPM_RETRY_BASE_MS) || 1000) {
  const nominal = baseMs * Math.pow(3, Math.max(attempt, 1) - 1);
  return Math.round(nominal * (0.8 + 0.4 * random()));
}

const MAX_ATTEMPTS = 4;

/**
 * Run `fn` up to `attempts` times, sleeping with exponential backoff between
 * attempts, retrying only errors `isRetryable` accepts. The last error is
 * rethrown unchanged.
 */
async function withRetry(fn, options = {}) {
  const attempts = options.attempts || MAX_ATTEMPTS;
  const isRetryable = options.isRetryable || isTransientError;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const delayFor = options.delayFor || ((attempt) => backoffDelayMs(attempt));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;
      const waitMs = delayFor(attempt);
      if (options.onRetry) options.onRetry(err, attempt, attempts, waitMs);
      await sleep(waitMs);
    }
  }
}

/** Classify a finished-and-failed install for reporting and the exit code. */
function classifyInstallFailure(err) {
  if (!err) return "none";
  if (err.trustConfig || (err.unverified && !err.network)) return "integrity";
  if (err.refusal) return "integrity";
  if (err.filesystem || err.locked) return "filesystem";
  if (err.network) return "network";
  if (err.statusCode === 404 || err.statusCode === 410) return "unavailable";
  if (isTransientError(err)) return "network";
  return "other";
}

/**
 * The postinstall exit code. A transient network failure must not break
 * `npm i -g` (exit 0: the lazy installer finishes on first run); everything
 * else, and every failure in the on-demand (lazy) run, stays non-zero.
 */
function exitCodeForFailure(err, options = {}) {
  if (options.lazy) return 1;
  return classifyInstallFailure(err) === "network" ? 0 : 1;
}

/** Retry a promise-returning rename-like step on Windows file-lock errors. */
async function renameWithRetry(from, to, options = {}) {
  const platform = options.platform || process.platform;
  const rename = options.rename || fs.renameSync;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts || 5;
  const lockCodes = ["EPERM", "EBUSY", "EACCES"];
  for (let attempt = 1; ; attempt++) {
    try {
      rename(from, to);
      return;
    } catch (err) {
      const locked = platform === "win32" && lockCodes.includes(err && err.code);
      if (!locked) throw describeFsError(err, to);
      if (attempt >= attempts) {
        const out = new Error(
          `could not replace ${to} (${err.code}): the file is in use. A running litespm (for example its ` +
            `background daemon, or an agent that launched the bridge) is holding it. Close it and run ` +
            `\`npm i -g litespm\` again`
        );
        out.code = err.code;
        out.locked = true;
        throw out;
      }
      await sleep(100 * Math.pow(2, attempt - 1));
    }
  }
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

/** fetchText with the same bounded, jittered backoff as the binary download. */
function fetchTextWithRetry(url, redirects = 0, policy = null) {
  return withRetry(() => fetchText(url, redirects, policy), {
    isRetryable: isTransientError,
    onRetry: (err, attempt, attempts, waitMs) =>
      console.error(
        `[litespm] Fetch of ${new URL(url).pathname.split("/").pop()} failed (${err.message}); retry ${attempt}/${attempts - 1} in ${Math.round(waitMs / 100) / 10}s.`
      ),
  });
}

/** Is any proxy variable set? (Only used to decide whether to suggest one.) */
function hasProxyConfigured(env = process.env) {
  return Boolean(
    firstEnv(env, ["https_proxy", "HTTPS_PROXY", "npm_config_https_proxy", "npm_config_proxy", "http_proxy", "HTTP_PROXY"])
  );
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

// ---------------------------------------------------------------------------
// Proxy support (no dependencies)
//
// Corporate networks reach github.com only through an HTTP(S) proxy. Node's
// https.get ignores HTTPS_PROXY, so the installer opens an HTTP CONNECT tunnel
// itself and runs TLS to the ORIGIN through it: the proxy sees only the
// host:port, never the bytes, and certificate validation is unchanged (the
// origin's certificate is checked against the origin's name, not the proxy's).
// The HTTPS-only and redirect-host rules apply to the target URL exactly as
// before; the proxy is just the transport.
// ---------------------------------------------------------------------------

/** First non-empty value among the named variables, with the name that set it. */
function firstEnv(env, names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") {
      return { name, value: value.trim() };
    }
  }
  return null;
}

/**
 * Parse a proxy setting ("http://user:pw@host:3128", "host:3128") into the
 * pieces the tunnel needs. Credentials are kept ONLY in `authHeader`; `display`
 * is what may be printed. Throws for a scheme the installer cannot tunnel.
 */
function parseProxyUrl(raw) {
  let text = String(raw).trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch (e) {
    throw new Error("the configured proxy is not a valid URL");
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(
      `the configured proxy uses "${protocol}//", which the installer cannot tunnel through ` +
        `(only http:// and https:// proxies are supported)`
    );
  }
  if (!url.hostname) throw new Error("the configured proxy has no host");
  const port = Number(url.port) || (protocol === "https:" ? 443 : 80);
  let authHeader = null;
  if (url.username || url.password) {
    const decode = (s) => {
      try {
        return decodeURIComponent(s);
      } catch (e) {
        return s;
      }
    };
    authHeader = `Basic ${Buffer.from(`${decode(url.username)}:${decode(url.password)}`).toString("base64")}`;
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return {
    protocol,
    hostname,
    port,
    authHeader,
    key: `${protocol}//${hostname}:${port}|${authHeader || ""}`,
    display: `${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`,
  };
}

/**
 * NO_PROXY matching: a comma/space separated list of hosts. `*` matches
 * everything; `example.com` and `.example.com` (or `*.example.com`) match the
 * domain and its subdomains; an entry may carry a `:port`.
 */
function shouldBypassProxy(hostname, port, noProxy) {
  const list = String(noProxy || "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  for (let entry of list) {
    if (entry === "*") return true;
    let entryPort = null;
    const m = entry.match(/^(.*?):(\d+)$/);
    if (m && !entry.includes("]") && entry.indexOf(":") === entry.lastIndexOf(":")) {
      entry = m[1];
      entryPort = Number(m[2]);
    }
    if (entryPort !== null && Number(port) !== entryPort) continue;
    entry = entry.replace(/^\*?\./, "");
    if (!entry) continue;
    if (host === entry || host.endsWith(`.${entry}`)) return true;
  }
  return false;
}

/**
 * Which proxy (if any) carries a request to `url`. Returns null (direct) or
 * { proxy, source }. Precedence: https_proxy, HTTPS_PROXY,
 * npm_config_https_proxy, npm_config_proxy, http_proxy, HTTP_PROXY. A proxy
 * that cannot be used throws rather than silently going direct.
 */
function proxyForUrl(url, env = process.env) {
  const target = new URL(url);
  const port = Number(target.port) || 443;
  const noProxy = firstEnv(env, ["no_proxy", "NO_PROXY", "npm_config_noproxy"]);
  if (noProxy && shouldBypassProxy(target.hostname, port, noProxy.value)) return null;
  const found = firstEnv(env, [
    "https_proxy",
    "HTTPS_PROXY",
    "npm_config_https_proxy",
    "npm_config_proxy",
    "http_proxy",
    "HTTP_PROXY",
  ]);
  if (!found) return null;
  try {
    return { proxy: parseProxyUrl(found.value), source: found.name };
  } catch (err) {
    throw new Error(`${found.name}: ${err.message}`);
  }
}

/**
 * An https.Agent that reaches the origin through an HTTP CONNECT tunnel. TLS is
 * negotiated with the origin over the tunnelled socket, with SNI and
 * certificate checks for the origin's host name.
 */
class ProxyTunnelAgent extends https.Agent {
  constructor(proxy, options = {}) {
    super({ keepAlive: false, ...options });
    this.proxy = proxy;
  }

  createConnection(options, callback) {
    const proxy = this.proxy;
    const host = options.host || options.hostname;
    const port = options.port || 443;
    let settled = false;
    const finish = (err, socket) => {
      if (settled) {
        if (socket) socket.destroy();
        return;
      }
      settled = true;
      callback(err, socket);
    };
    const headers = { Host: `${host}:${port}` };
    if (proxy.authHeader) headers["Proxy-Authorization"] = proxy.authHeader;
    const transport = proxy.protocol === "https:" ? https : http;
    const req = transport.request({
      host: proxy.hostname,
      port: proxy.port,
      method: "CONNECT",
      path: `${host}:${port}`,
      headers,
      agent: false,
      timeout: REQUEST_TIMEOUT_MS,
    });
    req.once("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        const hint =
          res.statusCode === 407
            ? " (proxy authentication failed: put user:password in the proxy URL, e.g. http://user:password@host:port)"
            : "";
        const err = new Error(
          `the proxy ${proxy.display} refused the CONNECT tunnel to ${host}:${port} with HTTP ${res.statusCode}${hint}`
        );
        err.proxyStatus = res.statusCode;
        finish(err);
        return;
      }
      const tlsOptions = { ...options };
      for (const k of ["host", "hostname", "port", "path", "agent", "timeout"]) delete tlsOptions[k];
      tlsOptions.socket = socket;
      tlsOptions.servername = options.servername || (net.isIP(host) ? undefined : host);
      let secure;
      try {
        secure = tls.connect(tlsOptions);
      } catch (err) {
        socket.destroy();
        finish(err);
        return;
      }
      finish(null, secure);
    });
    req.once("timeout", () => req.destroy(new Error(`the proxy ${proxy.display} did not answer the CONNECT in time (timeout)`)));
    req.once("error", (err) => {
      if (!/^(could not reach|the proxy)/.test(err.message)) {
        err.message = `could not reach the proxy ${proxy.display}: ${err.message}`;
      }
      finish(err);
    });
    req.end();
  }
}

const tunnelAgents = new Map();
let proxyAnnounced = false;

/** The agent for one request: a tunnel when a proxy applies, else the direct agent. */
function agentFor(url, env = process.env) {
  const chosen = proxyForUrl(url, env);
  if (!chosen) return agent;
  if (!proxyAnnounced) {
    proxyAnnounced = true;
    // Host and port only. The credentials in the proxy URL are never printed.
    console.error(`[litespm] Using proxy ${chosen.proxy.display} (from ${chosen.source}) for downloads.`);
  }
  let tunnel = tunnelAgents.get(chosen.proxy.key);
  if (!tunnel) {
    tunnel = new ProxyTunnelAgent(chosen.proxy);
    tunnelAgents.set(chosen.proxy.key, tunnel);
  }
  return tunnel;
}

function destroyAgents() {
  agent.destroy();
  for (const a of tunnelAgents.values()) a.destroy();
}

/**
 * Node's built-in fetch() (used by @sigstore/tuf to fetch the Sigstore trust
 * root) ignores proxy variables unless NODE_USE_ENV_PROXY=1 is set at process
 * start (Node >= 22.21 / 24). That cannot be switched on from inside a running
 * process, and there is no importable undici to install a dispatcher, so when
 * a proxy applies the installer re-runs itself once with it enabled and the
 * resolved proxy exported under the names Node reads.
 */
function envForProxiedChild(env = process.env) {
  if (env.NODE_USE_ENV_PROXY === "1" || env.LITESPM_PROXY_REEXEC === "1") return null;
  let chosen = null;
  for (const probe of ["https://github.com/", "https://tuf-repo-cdn.sigstore.dev/"]) {
    const c = proxyForUrl(probe, env);
    if (c) {
      chosen = firstEnv(env, [
        "https_proxy", "HTTPS_PROXY", "npm_config_https_proxy", "npm_config_proxy", "http_proxy", "HTTP_PROXY",
      ]);
      break;
    }
  }
  if (!chosen) return null;
  const noProxy = firstEnv(env, ["no_proxy", "NO_PROXY", "npm_config_noproxy"]);
  const child = {
    ...env,
    NODE_USE_ENV_PROXY: "1",
    LITESPM_PROXY_REEXEC: "1",
    HTTPS_PROXY: chosen.value,
    https_proxy: chosen.value,
    HTTP_PROXY: chosen.value,
    http_proxy: chosen.value,
  };
  if (noProxy) {
    child.NO_PROXY = noProxy.value;
    child.no_proxy = noProxy.value;
  }
  return child;
}

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

/** An error that is a deliberate refusal (never retried, exit code 1). */
function refusal(message) {
  const err = new Error(message);
  err.refusal = true;
  return err;
}

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
    throw refusal(`malformed URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw refusal(`refusing non-HTTPS URL (${parsed.protocol}//): ${url}`);
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
    throw refusal(
      `refusing redirect to unexpected host "${host}" (expected ${[...allowed].join(", ")}); ` +
        `if this is a legitimate mirror, point LITESPM_RELEASE_REPO at the final host`
    );
  }
  return url;
}

function request(url) {
  assertHTTPS(url);
  return https.get(url, { agent: agentFor(url), timeout: REQUEST_TIMEOUT_MS });
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A tiny TTY progress line. It is deliberately not a dependency and writes
 * nothing when stdout is a pipe, so `npm install --silent` and CI logs stay
 * clean. The final update is forced so the user always sees 100%.
 */
function formatRate(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/**
 * Download progress, on STDERR. npm hides a lifecycle script's stdout, so
 * progress written there is never seen; stderr is the channel a user (and
 * `npm i -g --foreground-scripts`) can actually read, and it keeps the MCP
 * shim's stdout clean.
 *
 * - TTY stderr: a redrawn bar with rate and ETA.
 * - Anything else (pipe, CI, TERM=dumb): at most four milestone lines
 *   (25/50/75/100%) with MB counts, so logs stay short.
 *
 * Returns a callback (bytes, total) with an `.end(bytes)` method that emits the
 * closing line when the total was unknown.
 */
function makeDownloadProgress(label, options = {}) {
  const stream = options.stream || process.stderr;
  const interactive =
    options.tty !== undefined ? options.tty : Boolean(stream.isTTY) && process.env.TERM !== "dumb";
  const columns = options.columns || stream.columns || 80;
  const now = options.now || Date.now;
  const startedAt = now();
  let lastAt = 0;
  let milestone = 0;
  let finished = false;

  const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

  const update = (bytes, total) => {
    const known = Number.isFinite(total) && total > 0;
    const complete = known && bytes >= total;
    if (!interactive) {
      if (!known) return;
      const pct = Math.floor((bytes / total) * 100);
      while (milestone < 4 && pct >= (milestone + 1) * 25) {
        milestone += 1;
        stream.write(`[litespm] ${label} ${milestone * 25}% (${mb(Math.min(bytes, total))} of ${mb(total)})\n`);
      }
      if (complete) finished = true;
      return;
    }
    const t = now();
    if (!complete && t - lastAt < 100) return;
    lastAt = t;
    const elapsed = Math.max((t - startedAt) / 1000, 0.001);
    const rate = bytes / elapsed;
    const parts = [];
    if (known) {
      const ratio = Math.max(0, Math.min(1, bytes / total));
      parts.push(`${Math.round(ratio * 100)}%`.padStart(4));
      parts.push(`${formatBytes(bytes)} / ${formatBytes(total)}`);
    } else {
      parts.push(formatBytes(bytes));
    }
    if (!complete) {
      const speed = formatRate(rate);
      if (speed) parts.push(speed);
      if (known && rate > 0 && elapsed > 1) parts.push(`ETA ${formatEta((total - bytes) / rate)}`);
    }
    const text = parts.join("  ");
    let bar = "";
    const prefix = `[litespm] ${label} `;
    const room = columns - prefix.length - text.length - 3;
    if (known && room >= 10) {
      const width = Math.min(24, room);
      const filled = Math.round(Math.max(0, Math.min(1, bytes / total)) * width);
      bar = `${"█".repeat(filled)}${"░".repeat(width - filled)} `;
    }
    const line = `${prefix}${bar}${text}`.slice(0, Math.max(columns - 1, 20));
    if (complete) {
      finished = true;
      stream.write(`\r\x1b[K[litespm] ✓ Downloaded ${formatBytes(bytes)} in ${elapsed.toFixed(1)}s (${formatRate(rate)})\n`);
    } else {
      stream.write(`\r\x1b[K${line}`);
    }
  };

  update.end = (bytes) => {
    if (finished) return;
    finished = true;
    if (interactive) {
      stream.write(`\r\x1b[K[litespm] ✓ Downloaded ${formatBytes(bytes)}\n`);
    } else {
      stream.write(`[litespm] ${label} 100% (${mb(bytes)})\n`);
    }
  };
  return update;
}
function downloadFile(url, targetPath, redirects = 0, policy = null, onProgress = null) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error("too many redirects"));
      return;
    }
    let settled = false;
    let totalBytes = 0;
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
        resolve(totalBytes);
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
        if (onProgress) {
          try {
            onProgress(bytes, expectedBytes);
          } catch (e) {
            /* progress is cosmetic; never fail the download for it */
          }
        }
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
        totalBytes = bytes;
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
    // Only a transport fault is retried; a TUF verification failure is not.
    trustedRoot = await withRetry(() => sigstore.getTrustedRoot(), {
      isRetryable: isTransientError,
      onRetry: (err, attempt, attempts, waitMs) =>
        console.error(
          `[litespm] Fetching the Sigstore trust root failed (${err.message}); retry ${attempt}/${attempts - 1} in ${Math.round(waitMs / 100) / 10}s.`
        ),
    });
  } catch (err) {
    const wrapped = new Error(
      `the Sigstore trust root could not be obtained (${err.message}); ` +
        `this install needs network access to tuf-repo-cdn.sigstore.dev on first use` +
        (hasProxyConfigured()
          ? ""
          : `. Behind a proxy? Set HTTPS_PROXY=http://host:port`)
    );
    wrapped.cause = err;
    // A refused/forged root is an integrity fault; an unreachable one is not.
    if (isTransientError(err)) wrapped.network = true;
    throw wrapped;
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
async function verifyDownloadedBinary(binaryPath, binName, releaseBase, policy = null, getText = fetchTextWithRetry) {
  const fail = (reason, cause) => {
    try {
      fs.unlinkSync(binaryPath);
    } catch (e) {
      /* best effort */
    }
    const err = new Error(`refusing to install ${binName}: ${reason}`);
    // Distinguishes "we could not prove these bytes" from "there were no
    // bytes", because the two demand different operator responses.
    err.unverified = true;
    if (cause && (cause.network || isTransientError(cause))) err.network = true;
    throw err;
  };

  let sums;
  try {
    sums = await getText(`${releaseBase}/SHA256SUMS.txt`, 0, policy);
  } catch (err) {
    fail(`the checksum manifest could not be fetched (${err.message})`, err);
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
  console.error(`[litespm] Verified SHA-256 checksum for ${binName}`);
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
  const getText = options.fetchText || fetchTextWithRetry;

  const discard = (reason, cause) => {
    try {
      fs.unlinkSync(binaryPath);
    } catch (e) {
      /* best effort */
    }
    const err = new Error(`refusing to install ${binName}: ${reason}`);
    err.unverified = true;
    // A fetch that never completed is a network fault, not a verdict on the
    // bytes: nothing unverified is installed either way, but the postinstall
    // must not treat "the network dropped" like "the signature is forged".
    if (cause && (cause.network || isTransientError(cause))) err.network = true;
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
      discard(`the release's signature bundle could not be fetched (${err.message})`, err);
    } else {
      // Opt-out set, but we could not even learn whether a bundle exists.
      // Falling back here would silently downgrade an unknown state to
      // checksum-only, so it refuses instead.
      discard(
        `the release's signature bundle could not be fetched (${err.message}); ` +
          `LITESPM_ALLOW_UNSIGNED_RELEASE=1 falls back only when a release publishes no bundle at all`,
        err
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
    console.error(
      `[litespm] WARNING: this release publishes no Sigstore signature bundle, and ` +
        `LITESPM_ALLOW_UNSIGNED_RELEASE=1 was set. Falling back to checksum-only verification.`
    );
    console.error(
      `[litespm] WARNING: a checksum travels in the same release as the binary, so it proves the ` +
        `download was not corrupted — it does NOT prove who published it.`
    );
  } else {
    try {
      const signer = await verifyBundleAgainstPolicy(bundleText, artifactBytes, policy);
      console.error(
        `[litespm] Verified Sigstore signature for ${binName}\n` +
          `[litespm]   signer: ${signer.identity.subjectAlternativeName}\n` +
          `[litespm]   issuer: ${signer.identity.extensions.issuer}`
      );
    } catch (err) {
      discard(err.message, err.network ? err : null);
    }
  }

  await verifyDownloadedBinary(binaryPath, binName, releaseBase, policy, getText);
  return { signed: !bundleMissing };
}

/**
 * Download with bounded retries for transient transport failures: up to
 * MAX_ATTEMPTS tries with exponential backoff and jitter (~1s, 3s, 9s). A 4xx
 * other than 408/429, a redirect/scheme refusal, an integrity refusal or the
 * final attempt is not retried: those are decisions, not flakiness. The file
 * is discarded on every failure, so a retry can never leave partial bytes
 * behind.
 */
async function downloadWithRetry(url, targetPath, policy, options = {}) {
  const progress = options.progress || makeDownloadProgress("Downloading");
  const bytes = await withRetry(
    () => downloadFile(url, targetPath, 0, policy, progress),
    {
      attempts: options.attempts || MAX_ATTEMPTS,
      sleep: options.sleep,
      delayFor: options.delayFor,
      isRetryable: isTransientError,
      onRetry: (err, attempt, attempts, waitMs) =>
        console.error(
          `[litespm] Download attempt ${attempt}/${attempts} failed (${err.message}); retrying in ${Math.round(waitMs / 100) / 10}s.`
        ),
    }
  );
  if (progress && typeof progress.end === "function") progress.end(bytes || 0);
  return bytes;
}

async function installBinary() {
  const binName = getBinaryName();
  console.error(`[litespm] Installing LiteSPM v${VERSION} for ${binName}`);
  const targetDir = path.join(os.homedir(), ".litespm", "bin", `v${VERSION}`);
  const targetPath = path.join(targetDir, binName);
  const stampPath = `${targetPath}.version`;

  // 0. Resolve the trust policy before anything is fetched, so a
  //    misconfigured mirror fails immediately and unambiguously.
  let policy;
  try {
    policy = resolveTrustPolicy(process.env);
  } catch (err) {
    err.context = { targetPath };
    throw err;
  }
  ensureDir(targetDir);
  if (policy.isMirror) {
    console.error(
      `[litespm] WARNING: installing from the mirror ${policy.repo} (${policy.releaseBase}), ` +
        `trusting signer ${policy.identity} (issuer ${policy.issuer}).`
    );
  } else if (String(process.env.LITESPM_TRUST_IDENTITY || "").trim()) {
    console.error(
      `[litespm] Note: LITESPM_TRUST_IDENTITY is ignored because LITESPM_RELEASE_REPO names the ` +
        `pinned repository; the identity is fixed in the installer.`
    );
  }
  if (!signatureRequired(process.env)) {
    console.error(
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
    console.error(
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
    console.error(
      `[litespm] Using the LOCAL build at ${localDist} (LITESPM_ALLOW_LOCAL_DIST=1). ` +
        `It is not the published v${VERSION} binary and its checksum and signature are not verified.`
    );
    return;
  }
  if (fs.existsSync(localDist)) {
    console.error(
      `[litespm] Ignoring the local build at ${localDist}; installing the published ` +
        `v${VERSION} binary. Set LITESPM_ALLOW_LOCAL_DIST=1 to use it deliberately.`
    );
  }

  // 3. Fallback: Download pre-compiled release binary from GitHub Releases
  const releaseBase = policy.releaseBase;
  const releaseUrl = `${releaseBase}/${binName}`;
  console.error(`[litespm] Downloading native binary from the release: ${releaseUrl}...`);
  const tempTarget = tempPathFor(targetPath);
  try {
    await downloadWithRetry(releaseUrl, tempTarget, policy);

    // Verification is FAIL-CLOSED. Bytes are on disk and this script's entire
    // job is to make them trustworthy, so an unverifiable download is discarded
    // rather than installed: a missing bundle, an unverifiable bundle, a
    // signature by the wrong identity, a missing manifest, a missing entry, an
    // unreadable manifest or a digest mismatch all leave no binary behind.
    // Proceeding on a warning would mean the one artifact we execute is the one
    // artifact we could not check.
    const verdict = await verifyReleaseArtifact(tempTarget, binName, releaseBase, { policy });

    await renameWithRetry(tempTarget, targetPath);
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }
    fs.writeFileSync(stampPath, `${VERSION}\n`);
    // stderr, not stdout: npm hides a lifecycle script's stdout.
    const how = verdict && verdict.signed === false ? "checksum verified, UNSIGNED" : "signature verified";
    console.error(
      `[litespm] ✓ litespm ${VERSION} installed (${how}) — run \`litespm\` to connect your agents`
    );
    console.error(`[litespm]   ${targetPath}`);
  } catch (err) {
    // A partial artifact must never survive a refusal, whatever the failure.
    try {
      fs.unlinkSync(tempTarget);
    } catch (e) {
      /* best effort */
    }
    // And neither may an empty versioned directory (rmdir only removes an
    // empty one, so a working install of the same version is never touched).
    try {
      fs.rmdirSync(targetDir);
    } catch (e) {
      /* not empty, or already gone */
    }
    // Reporting happens once, in reportInstallFailure(), from the entry point.
    err.context = { targetPath, releaseBase, releaseUrl, binName };
    throw err;
  }
}

/**
 * Print ONE explanation of a failed install and return the exit code.
 *
 * The old flow printed "INSTALL REFUSED ..." in the catch and then
 * "Postinstall failed: <same message>" from the entry point. This is the only
 * place that prints now.
 */
function reportInstallFailure(err, options = {}) {
  const lazy = Boolean(options.lazy);
  const kind = classifyInstallFailure(err);
  const ctx = (err && err.context) || {};
  const say = (line) => console.error(`[litespm] ${line}`);
  const debug = process.env.LITESPM_DEBUG === "1";
  const message = err && err.message ? err.message : String(err);

  if (kind === "integrity") {
    say(`INSTALL REFUSED — ${message}`);
    if (ctx.targetPath) {
      say(
        `The download was discarded rather than installed unverified. Nothing was written to ${ctx.targetPath}.`
      );
    }
    if (ctx.releaseBase) {
      say(
        `Check ${ctx.releaseBase} for ${ctx.binName} and its ${BUNDLE_SUFFIX} bundle, then ` +
          `reinstall. Setting LITESPM_ALLOW_UNSIGNED_RELEASE=1 disables publisher ` +
          `authentication and is not a fix.`
      );
    }
  } else if (kind === "network") {
    if (lazy) {
      say(`Could not download the native binary (${message}).`);
      say("Check your network connection and proxy settings (HTTPS_PROXY / NO_PROXY), then run `litespm` again.");
    } else {
      say(`Notice: could not download the native binary now (${message}).`);
      say("It will be downloaded the first time you run `litespm`. The npm install itself succeeded.");
    }
    if (!hasProxyConfigured()) {
      say("Behind a corporate proxy? Set HTTPS_PROXY=http://host:port (and NO_PROXY for hosts to skip), then retry.");
    }
    if (ctx.releaseUrl) say(`Expected release asset: ${ctx.releaseUrl}`);
  } else if (kind === "unavailable") {
    say(`The LiteSPM v${VERSION} download is not available (${message}).`);
    say(
      `The v${VERSION} release has probably not been published yet, or was withdrawn. ` +
        `Install the previous version with \`npm i -g litespm@<version>\` (see \`npm view litespm versions\`), or try again later.`
    );
    if (ctx.releaseUrl) say(`Expected release asset: ${ctx.releaseUrl}`);
    if (debug) {
      say(`[debug] maintainers: push the v${VERSION} tag and let release.yml publish the release before \`npm publish\`.`);
    }
  } else {
    say(`Postinstall failed: ${message}`);
  }
  return exitCodeForFailure(err, { lazy });
}

/** Write pending stderr, then exit: process.exit() can truncate piped output on Windows. */
function exitAfterFlush(code) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    process.exit(code);
  };
  try {
    process.stderr.write("", go);
  } catch (e) {
    go();
  }
  setTimeout(go, 500).unref();
}

if (require.main === module) {
  // `litespm` itself launches this script on first run with LITESPM_INSTALL_MODE=lazy;
  // there a network failure must be a non-zero exit, because the caller is about
  // to run the binary. From npm's postinstall it must not break `npm i -g`.
  const lazy = process.env.LITESPM_INSTALL_MODE === "lazy";

  // Node's built-in fetch (used for the Sigstore trust root) only honours a
  // proxy when NODE_USE_ENV_PROXY=1 at process start. Re-run once with it set.
  let childEnv = null;
  try {
    childEnv = envForProxiedChild(process.env);
  } catch (err) {
    process.exitCode = reportInstallFailure(err, { lazy });
    exitAfterFlush(process.exitCode);
    childEnv = undefined;
  }
  if (childEnv) {
    const res = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", __filename, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: childEnv,
    });
    process.exit(res.status === null ? 1 : res.status);
  } else if (childEnv === null) {
    installBinary()
      .then(() => {
        // Release the pooled sockets and exit explicitly: an npm lifecycle
        // script must not linger waiting for keep-alive timeouts.
        destroyAgents();
        exitAfterFlush(0);
      })
      .catch((rawErr) => {
        const err = describeFsError(rawErr, (rawErr && rawErr.path) || "the LiteSPM install directory");
        const code = reportInstallFailure(err, { lazy });
        destroyAgents();
        exitAfterFlush(code);
      });
  }
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
  fetchTextWithRetry,
  agent,
  ProxyTunnelAgent,
  agentFor,
  parseProxyUrl,
  shouldBypassProxy,
  proxyForUrl,
  envForProxiedChild,
  isTransientError,
  backoffDelayMs,
  withRetry,
  classifyInstallFailure,
  exitCodeForFailure,
  reportInstallFailure,
  renameWithRetry,
  tempPathFor,
  describeFsError,
  makeDownloadProgress,
  downloadWithRetry,
  MAX_ATTEMPTS,
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
