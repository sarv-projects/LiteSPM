const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const {
  getBinaryName,
  resolveBinary,
} = require("./bin/litespm.js");
const {
  checksumFor,
  computeFileSHA256,
  verifyDownloadedBinary,
  verifyReleaseArtifact,
  verifyBundleAgainstPolicy,
  normalizeBundle,
  legacyBundleToProtobuf,
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
  DEFAULT_RELEASE_REPO,
  RELEASE_WORKFLOW_FILE,
  DEFAULT_OIDC_ISSUER,
  BUNDLE_SUFFIX,
} = require("./scripts/install-binary.js");

const VERSION = require("./package.json").version;
const PINNED_IDENTITY = releaseIdentity(DEFAULT_RELEASE_REPO, VERSION);

let failures = 0;
let skips = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${name}: ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${name}: ${err.message}`);
  }
}

/**
 * Assert that an operation REFUSES, and print the reason it gave. The refusal
 * message is the deliverable for the adversarial cases, so it is echoed rather
 * than swallowed.
 */
async function checkRefusal(name, fn, pattern) {
  try {
    await fn();
  } catch (err) {
    if (pattern && !pattern.test(err.message)) {
      failures += 1;
      console.error(`✗ ${name}: refused for the wrong reason: ${err.message}`);
      return;
    }
    const reason = err.message.length > 220 ? `${err.message.slice(0, 220)}…` : err.message;
    console.log(`✓ ${name}\n    refused: ${reason}`);
    return;
  }
  failures += 1;
  console.error(`✗ ${name}: the operation SUCCEEDED; it must have refused`);
}

/** The line of installer output that says why it refused. */
function refusalLine(out) {
  const line = String(out)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.includes("INSTALL REFUSED"));
  return line || String(out).trim().split("\n")[0];
}

function skip(name, why) {
  skips += 1;
  console.log(`- ${name} (skipped: ${why})`);
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------- binary name
check("binary name is platform-shaped", () => {
  const binName = getBinaryName();
  assert(typeof binName === "string" && binName.startsWith("litespm-"));
  assert(/-amd64|-arm64/.test(binName), `unexpected arch in ${binName}`);
});

// ------------------------------------------------------------ checksum parsing
check("checksum manifest parsing", () => {
  const digest = "a".repeat(64);
  const binName = getBinaryName();
  assert.strictEqual(checksumFor(`${digest}  ${binName}\n`, binName), digest);
  assert.strictEqual(checksumFor(`${digest} *${binName}\n`, binName), digest);
  assert.strictEqual(checksumFor(`deadbeef  other-file\n`, binName), null);
});

// ---------------------------------------------------------- https-only policy
check("non-HTTPS URLs are refused", () => {
  assert.throws(() => assertHTTPS("http://example.com/x"), /refusing non-HTTPS/);
  assert.throws(() => assertHTTPS("ftp://example.com/x"), /refusing non-HTTPS/);
  assert.throws(() => assertHTTPS("not-a-url"), /malformed URL/);
  assert.strictEqual(
    assertHTTPS("https://github.com/a/b"),
    "https://github.com/a/b"
  );
});

check("redirect targets stay on HTTPS", () => {
  // Absolute http redirect: refused.
  assert.throws(
    () => resolveRedirect("https://github.com/x", "http://evil.example/y"),
    /refusing non-HTTPS/
  );
  // A protocol-relative target inherits the base scheme, so it stays HTTPS.
  assert.strictEqual(
    resolveRedirect("https://github.com/x", "//evil.example/y"),
    "https://evil.example/y"
  );
  // ...but it must not be able to smuggle plaintext in.
  assert.throws(
    () => resolveRedirect("https://github.com/x", "http:/\evil.example/y"),
    /refusing non-HTTPS/
  );
  // Legitimate GitHub asset redirect: allowed.
  assert.strictEqual(
    resolveRedirect(
      "https://github.com/o/r/releases/download/v1/litespm-linux-amd64",
      "https://objects.githubusercontent.com/github-production-release-asset/abc"
    ),
    "https://objects.githubusercontent.com/github-production-release-asset/abc"
  );
});

// ===========================================================================
// Adversarial case: an unexpected redirect
// ===========================================================================
check("[adversarial] a redirect off the expected origins is refused", () => {
  const pinned = resolveTrustPolicy({});
  // GitHub's own asset CDN is where a release download legitimately lands.
  assert.strictEqual(
    assertAllowedRedirect("https://release-assets.githubusercontent.com/x", pinned),
    "https://release-assets.githubusercontent.com/x"
  );
  assert.strictEqual(
    assertAllowedRedirect("https://objects.githubusercontent.com/x", pinned),
    "https://objects.githubusercontent.com/x"
  );
  // Anywhere else is not where this release lives.
  assert.throws(
    () => assertAllowedRedirect("https://evil.example/litespm-linux-amd64", pinned),
    /refusing redirect to unexpected host "evil\.example"/
  );
  // A lookalike suffix must not slip through the suffix rule.
  assert.throws(
    () => assertAllowedRedirect("https://notgithub.com/x", pinned),
    /refusing redirect to unexpected host/
  );
  // A mirror names its own host; that host is allowed, a third party is not.
  const mirror = resolveTrustPolicy({
    LITESPM_RELEASE_REPO: "https://mirror.example/litespm/v0.4.1",
    LITESPM_TRUST_IDENTITY: "https://github.com/mirror.example/.github/workflows/release.yml@refs/tags/v1",
    LITESPM_TRUST_ISSUER: DEFAULT_OIDC_ISSUER,
  });
  assert.strictEqual(assertAllowedRedirect("https://mirror.example/a", mirror), "https://mirror.example/a");
  assert.throws(
    () => assertAllowedRedirect("https://evil.example/a", mirror),
    /refusing to trust it implicitly|refusing redirect to unexpected host/
  );
  // A GitHub-repo mirror redirects through GitHub's asset CDN as usual.
  const ghMirror = resolveTrustPolicy({
    LITESPM_RELEASE_REPO: "mirror-org/LiteSPM",
    LITESPM_TRUST_IDENTITY: "https://github.com/mirror-org/LiteSPM/.github/workflows/release.yml@refs/tags/v1",
    LITESPM_TRUST_ISSUER: DEFAULT_OIDC_ISSUER,
  });
  assert.strictEqual(
    assertAllowedRedirect("https://release-assets.githubusercontent.com/x", ghMirror),
    "https://release-assets.githubusercontent.com/x"
  );
});

// ===========================================================================
// Adversarial case: a truncated download
// ===========================================================================
check("[adversarial] a short transfer is a refusal, not a short file", () => {
  assert.strictEqual(incompleteTransferReason(100, 100, 1000), null);
  assert.strictEqual(incompleteTransferReason(100, null, 1000), null);
  assert.match(
    incompleteTransferReason(64, 4096, 1 << 20),
    /download was truncated: got 64 bytes, the origin declared 4096/
  );
  // An origin that sends MORE than it declared is refused too.
  assert.match(incompleteTransferReason(4097, 4096, 1 << 20), /truncated/);
  // The size cap still applies.
  assert.match(incompleteTransferReason(2000, 2000, 1000), /exceeds the 1000 byte limit/);
});

// ===========================================================================
// Trust policy: the signer identity is pinned, and a mirror is not an anchor
// ===========================================================================
check("the signer identity and issuer are pinned in code", () => {
  const policy = resolveTrustPolicy({});
  assert.strictEqual(policy.isMirror, false);
  assert.strictEqual(policy.repo, DEFAULT_RELEASE_REPO);
  assert.strictEqual(policy.source, "pinned");
  assert.strictEqual(
    policy.identity,
    `https://github.com/${DEFAULT_RELEASE_REPO}/${RELEASE_WORKFLOW_FILE}@refs/tags/v${VERSION}`
  );
  assert.strictEqual(policy.issuer, DEFAULT_OIDC_ISSUER);
  // The identity must name THIS repository's release workflow on THIS tag.
  assert(/^https:\/\/github\.com\/sarv-projects\/LiteSPM\/\.github\/workflows\/release\.yml@refs\/tags\/v/.test(policy.identity));
  // Naming the pinned repository explicitly is not a mirror.
  assert.strictEqual(resolveTrustPolicy({ LITESPM_RELEASE_REPO: DEFAULT_RELEASE_REPO }).isMirror, false);
  assert.strictEqual(
    resolveTrustPolicy({ LITESPM_RELEASE_REPO: ` ${DEFAULT_RELEASE_REPO} ` }).isMirror,
    false
  );
});

check("an environment variable cannot move the pinned identity", () => {
  // LITESPM_TRUST_IDENTITY is ignored while the pinned repository is in use:
  // a trust anchor an environment variable can repoint is not an anchor.
  const policy = resolveTrustPolicy({
    LITESPM_TRUST_IDENTITY: "https://github.com/attacker/LiteSPM/.github/workflows/release.yml@refs/tags/v0.4.1",
    LITESPM_TRUST_ISSUER: "https://attacker.example",
  });
  assert.strictEqual(policy.identity, PINNED_IDENTITY);
  assert.strictEqual(policy.issuer, DEFAULT_OIDC_ISSUER);
});

// ===========================================================================
// Adversarial case: a mirror override without explicit trust configuration
// ===========================================================================
check("[adversarial] a mirror override without explicit trust is refused", () => {
  assert.throws(
    () => resolveTrustPolicy({ LITESPM_RELEASE_REPO: "attacker/LiteSPM" }),
    (err) => {
      assert(/mirror is not a trust anchor/.test(err.message), err.message);
      assert(/LITESPM_TRUST_IDENTITY/.test(err.message), err.message);
      assert(/LITESPM_TRUST_ISSUER/.test(err.message), err.message);
      return true;
    }
  );
  // Half a policy is not a policy.
  assert.throws(
    () => resolveTrustPolicy({
      LITESPM_RELEASE_REPO: "attacker/LiteSPM",
      LITESPM_TRUST_IDENTITY: "https://github.com/attacker/LiteSPM/.github/workflows/release.yml@refs/tags/v0.4.1",
    }),
    /mirror is not a trust anchor/
  );
  assert.throws(
    () => resolveTrustPolicy({
      LITESPM_RELEASE_REPO: "attacker/LiteSPM",
      LITESPM_TRUST_ISSUER: DEFAULT_OIDC_ISSUER,
    }),
    /mirror is not a trust anchor/
  );
  // Stating the signer is what makes it explicit.
  const explicit = resolveTrustPolicy({
    LITESPM_RELEASE_REPO: "mirror.example/LiteSPM",
    LITESPM_TRUST_IDENTITY: "https://github.com/mirror.example/LiteSPM/.github/workflows/release.yml@refs/tags/v0.4.1",
    LITESPM_TRUST_ISSUER: DEFAULT_OIDC_ISSUER,
  });
  assert.strictEqual(explicit.isMirror, true);
  assert.strictEqual(explicit.source, "LITESPM_TRUST_IDENTITY");
  assert(/mirror\.example/.test(explicit.identity));
  // The mirror base is where the bytes come from; the pin is what they must
  // be signed by.
  assert.strictEqual(
    explicit.releaseBase,
    `https://github.com/mirror.example/LiteSPM/releases/download/v${VERSION}`
  );
  assert.strictEqual(explicit.mirrorHost, "github.com");
  // A full HTTPS origin is accepted; plaintext is not.
  const origin = resolveTrustPolicy({
    LITESPM_RELEASE_REPO: "https://dl.example.com/litespm/v0.4.1",
    LITESPM_TRUST_IDENTITY: "x",
    LITESPM_TRUST_ISSUER: "y",
  });
  assert.strictEqual(origin.releaseBase, "https://dl.example.com/litespm/v0.4.1");
  assert.strictEqual(origin.mirrorHost, "dl.example.com");
  assert.throws(
    () => resolveTrustPolicy({
      LITESPM_RELEASE_REPO: "http://dl.example.com/litespm",
      LITESPM_TRUST_IDENTITY: "x",
      LITESPM_TRUST_ISSUER: "y",
    }),
    /must be https/
  );
  assert.throws(
    () => resolveTrustPolicy({
      LITESPM_RELEASE_REPO: "not a repo",
      LITESPM_TRUST_IDENTITY: "x",
      LITESPM_TRUST_ISSUER: "y",
    }),
    /GitHub "owner\/name" repository or an https:\/\/ origin/
  );
});

// ===========================================================================
// The identity check must be an EXACT match, not a substring/regex match
// ===========================================================================
check("[adversarial] a certificate identity that merely CONTAINS the pin does not match", () => {
  const anchored = `^${escapeRegExp(PINNED_IDENTITY)}$`;
  assert.strictEqual(PINNED_IDENTITY.match(anchored)[0], PINNED_IDENTITY);
  // sigstore-js treats the policy string as a JavaScript RegExp. Unescaped,
  // "github.com" would match "githubXcom" and an unanchored pattern would
  // match any SAN that embeds the pinned string.
  assert.strictEqual("https://githubXcom/sarv-projects/LiteSPM/x".match(`^${escapeRegExp("https://github.com/x")}$`), null);
  assert.strictEqual(`prefix-${PINNED_IDENTITY}`.match(anchored), null);
  assert.strictEqual(`${PINNED_IDENTITY}-suffix`.match(anchored), null);
  assert.strictEqual(`https://evil.example/?u=${PINNED_IDENTITY}`.match(anchored), null);
  // And the escape really escapes.
  assert.strictEqual(escapeRegExp("a.b+c"), "a\\.b\\+c");
});

// ===========================================================================
// Bundle shapes
// ===========================================================================
const legacyFixture = {
  base64Signature: Buffer.from("not-a-real-signature").toString("base64"),
  cert: Buffer.from("-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n").toString("base64"),
  rekorBundle: {
    SignedEntryTimestamp: Buffer.from("set").toString("base64"),
    Payload: {
      body: Buffer.from('{"apiVersion":"0.0.1","kind":"hashedrekord"}').toString("base64"),
      integratedTime: 1792081908,
      logIndex: 3266235065,
      logID: "c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d",
    },
  },
};

check("a legacy cosign bundle is re-encoded as a v0.1 protobuf bundle", () => {
  const digest = crypto.createHash("sha256").update("artifact").digest();
  const out = legacyBundleToProtobuf(legacyFixture, digest);
  assert.strictEqual(out.mediaType, "application/vnd.dev.sigstore.bundle+json;version=0.1");
  assert.strictEqual(out.messageSignature.messageDigest.algorithm, "SHA2_256");
  // The digest comes from the bytes on disk, not from the bundle.
  assert.strictEqual(out.messageSignature.messageDigest.digest, digest.toString("base64"));
  assert.strictEqual(out.messageSignature.signature, legacyFixture.base64Signature);
  const entry = out.verificationMaterial.tlogEntries[0];
  assert.strictEqual(entry.kindVersion.kind, "hashedrekord");
  assert.strictEqual(entry.kindVersion.version, "0.0.1");
  assert.strictEqual(entry.integratedTime, "1792081908");
  assert.strictEqual(entry.logIndex, "3266235065");
  // hex logID -> base64 keyId
  assert.strictEqual(
    Buffer.from(entry.logId.keyId, "base64").toString("hex"),
    legacyFixture.rekorBundle.Payload.logID
  );
  // PEM -> DER
  const der = Buffer.from(out.verificationMaterial.x509CertificateChain.certificates[0].rawBytes, "base64");
  assert(der.toString("utf8").includes("BEGIN CERTIFICATE") === false, "rawBytes must be DER, not PEM");
  assert.strictEqual(normalizeBundle(legacyFixture, digest).mediaType, out.mediaType);
});

check("a protobuf bundle passes through untouched", () => {
  const modern = { mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.3", verificationMaterial: {} };
  assert.strictEqual(normalizeBundle(modern, Buffer.alloc(32)), modern);
});

// ===========================================================================
// Adversarial case: a malformed bundle
// ===========================================================================
check("[adversarial] malformed bundles are refused before anything is trusted", () => {
  const digest = crypto.createHash("sha256").update("x").digest();
  const cases = {
    "not an object": 42,
    "an array": [],
    "empty object": {},
    "neither shape": { hello: "world" },
    "legacy without rekorBundle.Payload": { ...legacyFixture, rekorBundle: {} },
    "legacy missing the log body": {
      ...legacyFixture,
      rekorBundle: { ...legacyFixture.rekorBundle, Payload: { ...legacyFixture.rekorBundle.Payload, body: "" } },
    },
    "legacy with a non-hex logID": {
      ...legacyFixture,
      rekorBundle: { ...legacyFixture.rekorBundle, Payload: { ...legacyFixture.rekorBundle.Payload, logID: "zzzz" } },
    },
    "legacy with a non-numeric logIndex": {
      ...legacyFixture,
      rekorBundle: { ...legacyFixture.rekorBundle, Payload: { ...legacyFixture.rekorBundle.Payload, logIndex: "soon" } },
    },
    "legacy with a corrupt signature": { ...legacyFixture, base64Signature: "!!!not base64!!!" },
    "legacy with a corrupt certificate": { ...legacyFixture, cert: "!!!!" },
    "legacy with a cert that is not PEM": {
      ...legacyFixture,
      cert: Buffer.from("this is not a certificate").toString("base64"),
    },
    "legacy without a signed entry timestamp": {
      ...legacyFixture,
      rekorBundle: { ...legacyFixture.rekorBundle, SignedEntryTimestamp: "" },
    },
  };
  for (const [label, raw] of Object.entries(cases)) {
    assert.throws(
      () => normalizeBundle(raw, digest),
      (err) => /bundle|rekor|cert|base64/i.test(err.message),
      `${label} was accepted`
    );
  }
});

async function main() {
  const binName = getBinaryName();
  const tmp = tempDir("litespm-npm-test-");
  const binaryPath = path.join(tmp, binName);
  fs.writeFileSync(binaryPath, "not really a binary");
  const realDigestOf = (p) => computeFileSHA256(p);

  await checkAsync("a matching digest is accepted", () => {
    const kept = path.join(tmp, "kept-" + binName);
    fs.writeFileSync(kept, "payload");
    assert.strictEqual(assertVerifiedDigest(kept, binName, realDigestOf(kept)), realDigestOf(kept));
    assert(fs.existsSync(kept), "a verified binary must survive");
    fs.rmSync(kept);
  });

  await checkAsync("a mismatched digest destroys the binary", () => {
    const suspect = path.join(tmp, "suspect-" + binName);
    fs.writeFileSync(suspect, "payload");
    assert.throws(
      () => assertVerifiedDigest(suspect, binName, "c".repeat(64)),
      (err) => {
        assert(err.unverified === true, "failure must be flagged as unverified");
        assert(/checksum mismatch/.test(err.message), err.message);
        return true;
      }
    );
    assert(!fs.existsSync(suspect), "an unverified binary must not survive");
  });

  await checkAsync("an unreachable manifest refuses the install", async () => {
    const p = path.join(tmp, "unreachable-" + binName);
    fs.writeFileSync(p, "payload");
    await assert.rejects(
      verifyDownloadedBinary(p, binName, "http://127.0.0.1:1/none"),
      (err) => {
        assert(err.unverified === true, "failure must be flagged as unverified");
        assert(/refusing to install/.test(err.message), err.message);
        return true;
      }
    );
    assert(!fs.existsSync(p), "an unverifiable binary must be destroyed");
  });

  // =========================================================================
  // Adversarial: the bundle itself
  // =========================================================================
  const policy = resolveTrustPolicy({});

  await checkRefusal(
    "[adversarial] a bundle that is not JSON is refused",
    async () => verifyBundleAgainstPolicy("<html>404</html>", Buffer.from("x"), policy),
    /bundle is not valid JSON/
  );

  await checkRefusal(
    "[adversarial] a bundle with an unrecognised shape is refused",
    async () => verifyBundleAgainstPolicy(JSON.stringify({ hello: "world" }), Buffer.from("x"), policy),
    /neither a Sigstore protobuf bundle/
  );

  await checkRefusal(
    "[adversarial] a protobuf bundle missing its verification material is refused",
    async () =>
      verifyBundleAgainstPolicy(
        JSON.stringify({
          mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.1",
          messageSignature: { messageDigest: { algorithm: "SHA2_256", digest: "AAAA" }, signature: "AAAA" },
        }),
        Buffer.from("x"),
        policy
      ),
    /bundle is malformed/
  );

  await checkRefusal(
    "[adversarial] a legacy bundle with a corrupt certificate is refused",
    async () =>
      verifyBundleAgainstPolicy(
        JSON.stringify({ ...legacyFixture, cert: Buffer.from("not a certificate").toString("base64") }),
        Buffer.from("x"),
        policy
      ),
    /certificate|cert|malformed/i
  );

  // =========================================================================
  // Adversarial: missing bundle, through the real orchestration path
  // =========================================================================
  const fakeRelease = "https://release.example/download/v0.4.1";

  await checkRefusal(
    "[adversarial] a release that publishes no bundle is refused by default",
    async () => {
      const p = path.join(tmp, "nobundle-" + binName);
      fs.writeFileSync(p, "payload");
      const notFound = () => Promise.reject(Object.assign(new Error("HTTP 404"), { statusCode: 404 }));
      await verifyReleaseArtifact(p, binName, fakeRelease, { env: {}, policy, fetchText: notFound });
    },
    /publishes no signature bundle/
  );

  check("a refused install leaves no partial artifact behind", () => {
    // verifyReleaseArtifact deletes the staged download on every refusal path.
    const leftovers = fs.readdirSync(tmp).filter((f) => f.startsWith("nobundle-"));
    assert.strictEqual(leftovers.length, 0, `partial artifacts survived: ${leftovers.join(", ")}`);
  });

  await checkAsync("the legacy opt-out is explicit and still refuses an unverifiable bundle", async () => {
    // With the opt-out set, a release that publishes NO bundle falls back to
    // checksum-only — but that is a decision the caller made, and it is
    // announced. It must not swallow a network fault into a silent downgrade.
    const p = path.join(tmp, "optout-" + binName);
    fs.writeFileSync(p, "payload");
    const networkFault = () => Promise.reject(new Error("ECONNRESET"));
    await assert.rejects(
      verifyReleaseArtifact(p, binName, fakeRelease, {
        env: { LITESPM_ALLOW_UNSIGNED_RELEASE: "1" },
        policy,
        fetchText: networkFault,
      }),
      (err) => {
        assert(/falls back only when a release publishes no bundle at all/.test(err.message), err.message);
        assert(err.unverified === true);
        return true;
      }
    );
    assert(!fs.existsSync(p), "the artifact must be discarded");
  });

  check("the signature policy defaults to required", () => {
    assert.strictEqual(signatureRequired({}), true);
    assert.strictEqual(signatureRequired({ LITESPM_ALLOW_UNSIGNED_RELEASE: "1" }), false);
    // Only the exact opt-in value counts.
    assert.strictEqual(signatureRequired({ LITESPM_ALLOW_UNSIGNED_RELEASE: "true" }), true);
    assert.strictEqual(signatureRequired({ LITESPM_ALLOW_UNSIGNED_RELEASE: "0" }), true);
  });

  // The wrapper must not silently run an arbitrary PATH binary.
  check("resolveBinary does not fall back to PATH", () => {
    const sandbox = tempDir("litespm-path-");
    const realHome = os.homedir;
    const realPathEnv = process.env.PATH;
    try {
      const decoyDir = path.join(sandbox, "bin");
      fs.mkdirSync(decoyDir, { recursive: true });
      fs.writeFileSync(path.join(decoyDir, "litespm"), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });
      process.env.PATH = decoyDir;
      os.homedir = () => path.join(sandbox, "empty-home");
      fs.mkdirSync(os.homedir(), { recursive: true });

      const resolved = resolveBinary();
      if (resolved) {
        assert(
          !resolved.startsWith(decoyDir),
          `resolveBinary returned a PATH binary: ${resolved}`
        );
      }
    } finally {
      os.homedir = realHome;
      process.env.PATH = realPathEnv;
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // npm pack content: the installer is only as trustworthy as the package
  // =========================================================================
  await checkAsync("[supply-chain] npm pack ships exactly the allowlist, unmodified", async () => {
    const packDir = tempDir("litespm-pack-");
    try {
      const res = spawnSync("npm", ["pack", "--json", "--pack-destination", packDir], {
        cwd: __dirname,
        encoding: "utf8",
        env: { ...process.env, npm_config_loglevel: "error" },
      });
      if (res.status !== 0) {
        throw new Error(`npm pack failed: ${res.stderr || res.stdout}`);
      }
      const meta = JSON.parse(res.stdout)[0];
      const shipped = meta.files.map((f) => f.path).sort();
      const expected = [
        "LICENSE",
        "NOTICE",
        "README.md",
        "bin/litespm.js",
        "package.json",
        "scripts/install-binary.js",
      ];
      assert.deepStrictEqual(shipped, expected, `unexpected tarball contents: ${shipped.join(", ")}`);
      // The publish workflow writes npm/.npmrc with an auth token; it must
      // never be able to reach a consumer.
      assert(!shipped.some((f) => f.includes(".npmrc")), ".npmrc would be published");

      // Extract and prove the shipped installer is byte-identical to this one.
      const tgz = path.join(packDir, meta.filename);
      const extract = path.join(packDir, "extract");
      fs.mkdirSync(extract, { recursive: true });
      const untar = spawnSync("tar", ["-xzf", tgz, "-C", extract], { encoding: "utf8" });
      assert.strictEqual(untar.status, 0, `tar failed: ${untar.stderr}`);
      const shippedInstaller = path.join(extract, "package", "scripts", "install-binary.js");
      assert.strictEqual(
        computeFileSHA256(shippedInstaller),
        computeFileSHA256(path.join(__dirname, "scripts", "install-binary.js")),
        "the packed installer differs from the reviewed source"
      );

      // The tarball must declare the verification dependency, or every install
      // of the published package would fail closed with "libraries not installed".
      const shippedPkg = JSON.parse(
        fs.readFileSync(path.join(extract, "package", "package.json"), "utf8")
      );
      assert(shippedPkg.dependencies["@sigstore/verify"], "sigstore verifier is not a dependency");
      assert(shippedPkg.dependencies["@sigstore/tuf"], "TUF client is not a dependency");
      assert(shippedPkg.dependencies["@sigstore/bundle"], "bundle parser is not a dependency");
    } finally {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  });

  const fixtures = await realArtifactCases(tmp, binName);
  await trustRootUnobtainableCase(binName);
  await fullInstallCases(tmp, binName, fixtures);

  fs.rmSync(tmp, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\n${failures} npm wrapper test(s) failed${skips ? `, ${skips} skipped` : ""}`);
    process.exit(1);
  }
  console.log(
    `\nAll npm wrapper tests passed${skips ? ` (${skips} skipped)` : ""}`
  );
}

// ===========================================================================
// The real thing: the published release, its real bundles, real Sigstore
// verification against the real Fulcio/Rekor trust root.
//
// Every case below runs against bytes that were actually published, and the
// refusals are produced by real cryptography — not by a mock returning false.
// Cases skip (never pass silently) when the release or the Sigstore trust root
// cannot be reached.
// ===========================================================================
const FIXTURE_DIR = path.join(os.tmpdir(), "litespm-npm-fixtures");

async function fetchFixture(url, filename) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const dest = path.join(FIXTURE_DIR, filename);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return dest;
  }
  await downloadFile(url, dest);
  return dest;
}

async function realArtifactCases(tmp, binName) {
  if (process.env.LITESPM_TEST_NETWORK === "0") {
    skip("real release fixtures", "LITESPM_TEST_NETWORK=0");
    return null;
  }

  const base = (v) => `https://github.com/${DEFAULT_RELEASE_REPO}/releases/download/v${v}`;
  let bundleText;
  let binaryPath;
  let sumsText;
  try {
    bundleText = await fetchText(`${base(VERSION)}/${binName}${BUNDLE_SUFFIX}`);
    binaryPath = await fetchFixture(`${base(VERSION)}/${binName}`, `v${VERSION}-${binName}`);
    sumsText = await fetchText(`${base(VERSION)}/SHA256SUMS.txt`);
  } catch (err) {
    skip("real release fixtures", `cannot reach the release (${err.message})`);
    return null;
  }
  // Persist the bundle beside the binary so later cases can drive a child
  // process that must read it from disk.
  fs.writeFileSync(`${binaryPath}.bundle.json`, bundleText);

  console.log(`\n--- real release v${VERSION} (${binName}) ---`);

  // The pin must be the identity that is actually in the published certificate.
  await checkAsync("[real] the published certificate's SAN and issuer equal the pin", async () => {
    const legacy = JSON.parse(bundleText);
    const pem = Buffer.from(legacy.cert, "base64").toString("utf8");
    const cert = new crypto.X509Certificate(pem);
    const san = cert.subjectAltName.replace(/^URI:/, "");
    assert.strictEqual(san, PINNED_IDENTITY, `published SAN is ${san}`);
    // The issuer is read back from the identity sigstore-js extracted while
    // verifying (OID 1.3.6.1.4.1.57264.1.1), which is the value the policy
    // check actually compares — not a re-parse of the same bytes.
    const signer = await verifyBundleAgainstPolicy(
      bundleText,
      fs.readFileSync(binaryPath),
      resolveTrustPolicy({})
    );
    assert.strictEqual(signer.identity.subjectAlternativeName, PINNED_IDENTITY);
    assert.strictEqual(signer.identity.extensions.issuer, DEFAULT_OIDC_ISSUER);
  });

  await checkAsync("[real] a genuine release binary verifies", async () => {
    const policy = resolveTrustPolicy({});
    const signer = await verifyBundleAgainstPolicy(
      bundleText,
      fs.readFileSync(binaryPath),
      policy
    );
    assert.strictEqual(signer.identity.subjectAlternativeName, PINNED_IDENTITY);
    assert.strictEqual(signer.identity.extensions.issuer, DEFAULT_OIDC_ISSUER);
  });

  // ---------------------------------------------------------------- tampered
  await checkRefusal(
    "[real][adversarial] a tampered binary is refused against its genuine bundle",
    async () => {
      const tampered = path.join(tmp, `tampered-${binName}`);
      const bytes = Buffer.from(fs.readFileSync(binaryPath));
      // Flip one bit deep inside the payload: the file stays a valid ELF and
      // its size is unchanged, so only a real signature check can catch it.
      const at = Math.floor(bytes.length / 2);
      bytes[at] = bytes[at] ^ 0x01;
      fs.writeFileSync(tampered, bytes);
      assert.notStrictEqual(
        computeFileSHA256(tampered),
        computeFileSHA256(binaryPath),
        "the tamper did not change the digest"
      );
      await verifyBundleAgainstPolicy(bundleText, bytes, resolveTrustPolicy({}));
    },
    /signature verification failed|digest mismatch/
  );

  // -------------------------------------------- valid signature, wrong bytes
  await checkRefusal(
    "[real][adversarial] a valid signature over a DIFFERENT artifact is refused",
    async () => {
      // Take the release's own bundle for another platform's binary: the
      // certificate is genuine, the signature is genuine, the transparency-log
      // entry is genuine — it is simply not over these bytes.
      const other = binName.includes("darwin") ? "litespm-linux-amd64" : "litespm-darwin-amd64";
      const otherBundle = await fetchText(`${base(VERSION)}/${other}${BUNDLE_SUFFIX}`);
      await verifyBundleAgainstPolicy(
        otherBundle,
        fs.readFileSync(binaryPath),
        resolveTrustPolicy({})
      );
    },
    /signature verification failed|digest mismatch/
  );

  // ------------------------------------------- real signature, wrong identity
  await checkRefusal(
    "[real][adversarial] a genuine bundle signed by a DIFFERENT identity is refused",
    async () => {
      // v0.4.0's artifacts are signed by
      //   ...release.yml@refs/tags/v0.4.0
      // which is a different identity from the pinned
      //   ...release.yml@refs/tags/v0.4.1
      // The signature is real, the certificate is real, the transparency-log
      // entry is real, and it is over the artifact it ships with. Only the
      // signer is wrong — which is exactly what "any valid signature" would
      // have accepted.
      const otherVersion = "0.4.0";
      const otherBundle = await fetchText(`${base(otherVersion)}/${binName}${BUNDLE_SUFFIX}`);
      const otherBinary = await fetchFixture(
        `${base(otherVersion)}/${binName}`,
        `v${otherVersion}-${binName}`
      );
      const policy = resolveTrustPolicy({});
      assert.strictEqual(policy.identity, PINNED_IDENTITY);
      await verifyBundleAgainstPolicy(otherBundle, fs.readFileSync(otherBinary), policy);
    },
    /wrong signer/
  );

  await checkRefusal(
    "[real][adversarial] a certificate outside its validity window is refused",
    async () => {
      // A Fulcio certificate lives for ten minutes, so revocation for keyless
      // signing is "the certificate is not valid at the logged time". Move the
      // transparency-log timestamp a day either way and the chain check must
      // refuse even though every byte of the signature and certificate is
      // genuine.
      const mutated = JSON.parse(JSON.stringify(JSON.parse(bundleText)));
      mutated.rekorBundle.Payload.integratedTime += 86400;
      await verifyBundleAgainstPolicy(
        JSON.stringify(mutated),
        fs.readFileSync(binaryPath),
        resolveTrustPolicy({})
      );
    },
    /Failed to verify certificate chain|certificate is not valid or expired/
  );

  await checkRefusal(
    "[real][adversarial] a wrong OIDC issuer is refused",
    async () => {
      await verifyBundleAgainstPolicy(bundleText, fs.readFileSync(binaryPath), {
        ...resolveTrustPolicy({}),
        issuer: "https://accounts.google.com",
      });
    },
    /wrong signer|invalid certificate extension/
  );

  // ---------------------------- forged checksum listing + tampered binary
  await checkRefusal(
    "[real][adversarial] a tampered binary with a FORGED SHA256SUMS is refused",
    async () => {
      const tampered = path.join(tmp, `forged-${binName}`);
      const bytes = Buffer.from(fs.readFileSync(binaryPath));
      bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0xff;
      fs.writeFileSync(tampered, bytes);

      // The attacker's listing is internally consistent: it matches the bytes
      // they are serving, so checksum-only verification accepts it. Build it
      // exactly the way the release does, and prove it would have passed.
      const forged = `${computeFileSHA256(tampered)}  ${binName}\n`;
      assert.strictEqual(
        checksumFor(forged, binName),
        computeFileSHA256(tampered),
        "the forged listing does not match the tampered binary"
      );
      // ...which is precisely the old failure: this line alone proves the
      // forged pair is self-consistent and would install under a
      // checksum-only policy.
      assertVerifiedDigest(tampered, binName, computeFileSHA256(tampered));
      fs.writeFileSync(tampered, bytes);

      const fetch = async (url) => {
        if (url.endsWith(BUNDLE_SUFFIX)) return bundleText;
        if (url.endsWith("SHA256SUMS.txt")) return forged;
        throw new Error(`unexpected fetch: ${url}`);
      };
      await verifyReleaseArtifact(tampered, binName, base(VERSION), {
        env: {},
        policy: resolveTrustPolicy({}),
        fetchText: fetch,
      });
    },
    /signature verification failed|digest mismatch/
  );

  await checkAsync("[real] a tampered binary leaves nothing behind", () => {
    const leftovers = fs.readdirSync(tmp).filter((f) => f.startsWith("forged-"));
    assert.strictEqual(leftovers.length, 0, `partial artifacts survived: ${leftovers.join(", ")}`);
  });

  return { bundleText, binaryPath, sumsText };
}

// ===========================================================================
// Adversarial case: a bundle that is present but cannot be verified, because
// the Sigstore trust root cannot be obtained.
//
// This is the air-gapped / CDN-down case. It must refuse, never fall back:
// the bundle is present, so "we could not check it" is not "there was nothing
// to check". Runs in a network namespace with a cold TUF cache, using the
// real published bundle.
// ===========================================================================
async function trustRootUnobtainableCase(binName) {
  if (process.platform !== "linux") {
    skip("trust root unobtainable", "needs a Linux network namespace");
    return;
  }
  const probe = spawnSync("unshare", ["-n", "-r", "true"], { encoding: "utf8" });
  if (probe.status !== 0) {
    skip("trust root unobtainable", "unshare -n -r is unavailable here");
    return;
  }
  const fixtureDir = path.join(os.tmpdir(), "litespm-npm-fixtures");
  // The fixture directory only exists once something was downloaded into it.
  // Before the release named by this package version exists — which is the
  // normal state while the release is being cut — there is nothing to read
  // and the directory was never created, so the case skips rather than
  // throwing ENOENT and failing the release job.
  if (!fs.existsSync(fixtureDir)) {
    skip("trust root unobtainable", "the real release fixtures are unavailable");
    return;
  }
  const binary = fs
    .readdirSync(fixtureDir)
    .find((f) => f.endsWith(binName) && f.startsWith(`v${VERSION}-`) && !f.endsWith(".json"));
  if (!binary || !fs.existsSync(path.join(fixtureDir, `${binary}.bundle.json`))) {
    skip("trust root unobtainable", "the real release fixtures are unavailable");
    return;
  }

  const coldCache = tempDir("litespm-tuf-cold-");
  const script = `
    const fs = require("fs"), path = require("path");
    const { verifyBundleAgainstPolicy, resolveTrustPolicy } = require(${JSON.stringify(
      path.join(__dirname, "scripts", "install-binary.js")
    )});
    const bundle = fs.readFileSync(${JSON.stringify(path.join(fixtureDir, `${binary}.bundle.json`))}, "utf8");
    const bytes = fs.readFileSync(${JSON.stringify(path.join(fixtureDir, binary))});
    verifyBundleAgainstPolicy(bundle, bytes, resolveTrustPolicy({}))
      .then(() => { console.error("VERIFIED; it must have refused"); process.exit(9); })
      .catch((err) => { console.error("REFUSED: " + err.message); process.exit(0); });
  `;
  try {
    await checkAsync(
      "[real][adversarial] a bundle that cannot be verified is refused, not trusted",
      async () => {
        const res = await new Promise((resolve) => {
          const child = spawn(
            "unshare",
            ["-n", "-r", process.execPath, "-e", script],
            { cwd: __dirname, env: { ...process.env, XDG_DATA_HOME: coldCache } }
          );
          let stderr = "";
          child.stderr.on("data", (d) => (stderr += d));
          child.on("close", (status) => resolve({ status, stderr }));
        });
        assert.strictEqual(res.status, 0, `child exited ${res.status}: ${res.stderr}`);
        assert(
          /could not be obtained/.test(res.stderr),
          `child did not report an unobtainable trust root: ${res.stderr}`
        );
        console.log(`    refused: ${res.stderr.trim().split("REFUSED: ").pop()}`);
      }
    );
  } finally {
    fs.rmSync(coldCache, { recursive: true, force: true });
  }
}

// ===========================================================================
// The full install sequence, over a local HTTPS origin.
//
// This is the headline case: `installBinary()` is run for real, in a child
// process, with a real signed artifact and a real tampered one served from an
// origin we control. The URL really is https, so assertHTTPS is satisfied and
// the production download path runs unchanged; the origin's CA is trusted by
// the child process only, and nothing in the installer is relaxed.
//
// The genuine-bytes case is run first. If the harness could not install when
// everything is authentic, the refusals below would prove nothing.
// ===========================================================================
async function fullInstallCases(tmp, binName, fixtures) {
  const openssl = spawnSync("openssl", ["version"], { encoding: "utf8" });
  if (openssl.status !== 0) {
    skip("full install path over a local origin", "openssl is unavailable");
    return;
  }
  if (!fixtures) {
    skip("full install path over a local origin", "the real release fixtures are unavailable");
    return;
  }

  const dir = tempDir("litespm-tls-");
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  const gen = spawnSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", key, "-out", cert, "-days", "1",
      "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1",
    ],
    { encoding: "utf8" }
  );
  if (gen.status !== 0) {
    skip("full install path over a local origin", "could not generate a test certificate");
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }

  // The tampered artifact: one bit flipped mid-file. Size, magic and framing
  // are unchanged, so only a real signature check can catch it.
  const digestOf = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
  const genuineBytes = Buffer.from(fs.readFileSync(fixtures.binaryPath));
  const tamperedBytes = Buffer.from(genuineBytes);
  tamperedBytes[Math.floor(tamperedBytes.length / 2)] ^= 0x01;
  const forgedSums = `${digestOf(tamperedBytes)}  ${binName}\n`;

  // What the origin serves, keyed by path. `tampered` is the attack: a
  // modified binary with a companion SHA256SUMS that matches it exactly, so a
  // checksum-only installer accepts the pair. The bundle served beside them is
  // the release's genuine one, because an attacker who can replace the
  // artifact store can serve the real bundle too.
  const routes = {
    "/genuine": { body: genuineBytes, sums: fixtures.sumsText, bundle: fixtures.bundleText },
    "/tampered": { body: tamperedBytes, sums: forgedSums, bundle: fixtures.bundleText },
  };

  const https = require("https");
  const server = https.createServer(
    { key: fs.readFileSync(key), cert: fs.readFileSync(cert) },
    (req, res) => {
      const pathname = req.url.split("?")[0];
      if (pathname === "/truncated") {
        res.writeHead(200, { "content-length": "4096", "content-type": "application/octet-stream" });
        res.write(Buffer.alloc(64, 7));
        res.end();
        return;
      }
      if (pathname === "/redirect-to-evil") {
        res.writeHead(302, { location: "https://evil.example/litespm-linux-amd64" });
        res.end();
        return;
      }
      // The installer fetches <base>/<asset>, and <base> is <origin>/<route>.
      const routeName = Object.keys(routes).find((r) => pathname.startsWith(`${r}/`));
      const route = routeName ? routes[routeName] : null;
      if (!route) {
        res.writeHead(404).end();
        return;
      }
      const body = pathname.endsWith(BUNDLE_SUFFIX)
        ? route.bundle
        : pathname.endsWith("SHA256SUMS.txt")
          ? route.sums
          : route.body;
      if (body === null || body === undefined) {
        res.writeHead(404).end();
        return;
      }
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
      res.writeHead(200, { "content-length": String(buf.length) });
      res.end(buf);
    }
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `https://127.0.0.1:${port}`;

  // spawnSync would block THIS process's event loop, and the server lives in
  // this process — so the child must be spawned asynchronously.
  const runInstaller = (route, home) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(__dirname, "scripts", "install-binary.js")], {
        cwd: __dirname,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          NODE_EXTRA_CA_CERTS: cert,
          // The mirror is the local origin; the signer is still pinned to this
          // repository's release workflow, so the bytes must be the real ones.
          LITESPM_RELEASE_REPO: `${origin}${route}`,
          LITESPM_TRUST_IDENTITY: PINNED_IDENTITY,
          LITESPM_TRUST_ISSUER: DEFAULT_OIDC_ISSUER,
          LITESPM_ALLOW_UNSIGNED_RELEASE: "",
          LITESPM_ALLOW_LOCAL_DIST: "",
        },
      });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("close", (status) => resolve({ status, out }));
    });

  const runChild = (script) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, ["-e", script], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: cert, LITESPM_ORIGIN: origin },
        cwd: __dirname,
      });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (status) => resolve({ status, stderr }));
    });

  try {
    console.log(`\n--- full install path over a local origin (${binName}) ---`);

    // ------------------------------------------------------------------
    // Control: genuine bytes install. Without this, the refusals below
    // could be refusing for any reason at all.
    // ------------------------------------------------------------------
    await checkAsync("[control] the genuine artifact installs through installBinary()", async () => {
      const home = tempDir("litespm-home-genuine-");
      try {
        const res = await runInstaller("/genuine", home);
        assert.strictEqual(res.status, 0, `installer exited ${res.status}:\n${res.out}`);
        assert(
          /Verified Sigstore signature/.test(res.out),
          `the installer did not report signature verification:\n${res.out}`
        );
        const installed = path.join(home, ".litespm", "bin", binName);
        assert(fs.existsSync(installed), "the genuine artifact was not installed");
        assert.strictEqual(
          computeFileSHA256(installed),
          computeFileSHA256(fixtures.binaryPath),
          "the installed bytes differ from the published artifact"
        );
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    // ------------------------------------------------------------------
    // THE ACCEPTANCE CRITERION:
    // "A tampered binary plus forged companion SHA256SUMS never executes."
    // ------------------------------------------------------------------
    await checkAsync(
      "[adversarial] a tampered binary with a forged SHA256SUMS never installs",
      async () => {
        // First: prove the attack is real. The forged listing matches the
        // tampered bytes exactly, so checksum-only verification — the old
        // behaviour — would have accepted this pair and installed it.
        assert.strictEqual(
          checksumFor(forgedSums, binName),
          digestOf(tamperedBytes),
          "the forged listing does not match the tampered binary"
        );

        const home = tempDir("litespm-home-tampered-");
        try {
          const res = await runInstaller("/tampered", home);
          assert.notStrictEqual(res.status, 0, `the installer exited 0:\n${res.out}`);
          assert(/INSTALL REFUSED/.test(res.out), `no refusal was reported:\n${res.out}`);
          assert(
            /signature verification failed|digest mismatch/.test(res.out),
            `the refusal was not a signature failure:\n${res.out}`
          );
          const installed = path.join(home, ".litespm", "bin", binName);
          assert(!fs.existsSync(installed), "the tampered binary was installed");
          // Nothing partial may survive either.
          const binDir = path.join(home, ".litespm", "bin");
          const leftovers = fs.existsSync(binDir)
            ? fs.readdirSync(binDir).filter((f) => f.includes(".tmp."))
            : [];
          assert.strictEqual(leftovers.length, 0, `partial files survived: ${leftovers.join(", ")}`);
          console.log(`    refused (exit ${res.status}): ${refusalLine(res.out)}`);
        } finally {
          fs.rmSync(home, { recursive: true, force: true });
        }
      }
    );

    // ------------------------------------------------------------------
    // A release with no bundle at all, through installBinary().
    // ------------------------------------------------------------------
    await checkAsync(
      "[adversarial] a release that publishes no bundle is refused by installBinary()",
      async () => {
        // The same genuine bytes, served beside a 404 for the bundle: a
        // release cut before signing began.
        routes["/nobundle"] = { ...routes["/genuine"], bundle: null };
        const home2 = tempDir("litespm-home-nobundle-");
        try {
          const res = await runInstaller("/nobundle", home2);
          assert.notStrictEqual(res.status, 0, `the installer exited 0:\n${res.out}`);
          assert(/INSTALL REFUSED/.test(res.out), `no refusal was reported:\n${res.out}`);
          assert(
            /publishes no signature bundle/.test(res.out),
            `the refusal did not name the missing bundle:\n${res.out}`
          );
          assert(
            !fs.existsSync(path.join(home2, ".litespm", "bin", binName)),
            "an unsigned release was installed"
          );
          console.log(`    refused (exit ${res.status}): ${refusalLine(res.out)}`);
        } finally {
          fs.rmSync(home2, { recursive: true, force: true });
        }
      }
    );

    // ------------------------------------------------------------------
    // Transport-level refusals over real TLS.
    // ------------------------------------------------------------------
    await checkAsync(
      "[adversarial] a truncated download is refused and leaves no file",
      async () => {
        const out = path.join(tmp, `truncated-${binName}`);
        const script = `
          const { downloadFile } = require(${JSON.stringify(path.join(__dirname, "scripts", "install-binary.js"))});
          const fs = require("fs");
          downloadFile(process.env.LITESPM_ORIGIN + "/truncated", ${JSON.stringify(out)})
            .then(() => { console.error("DOWNLOAD SUCCEEDED; it must have refused"); process.exit(9); })
            .catch((err) => { console.error("REFUSED: " + err.message); process.exit(0); });
        `;
        const res = await runChild(script);
        assert.strictEqual(res.status, 0, `child exited ${res.status}: ${res.stderr}`);
        assert(
          /truncated|aborted|exceeds/.test(res.stderr),
          `child did not report a short transfer: ${res.stderr}`
        );
        assert(!fs.existsSync(out), "a truncated download must not be left on disk");
        console.log(`    refused: ${res.stderr.trim().split("REFUSED: ").pop()}`);
      }
    );

    await checkAsync(
      "[adversarial] an unexpected redirect is refused over real TLS",
      async () => {
        const out = path.join(tmp, `redirect-${binName}`);
        const script = `
          const { downloadFile, resolveTrustPolicy } = require(${JSON.stringify(path.join(__dirname, "scripts", "install-binary.js"))});
          const fs = require("fs");
          const policy = resolveTrustPolicy({});
          downloadFile(process.env.LITESPM_ORIGIN + "/redirect-to-evil", ${JSON.stringify(out)}, 0, policy)
            .then(() => { console.error("DOWNLOAD SUCCEEDED; it must have refused"); process.exit(9); })
            .catch((err) => { console.error("REFUSED: " + err.message); process.exit(0); });
        `;
        const res = await runChild(script);
        assert.strictEqual(res.status, 0, `child exited ${res.status}: ${res.stderr}`);
        assert(
          /refusing redirect to unexpected host/.test(res.stderr),
          `child did not report an unexpected redirect: ${res.stderr}`
        );
        assert(!fs.existsSync(out), "a refused redirect must leave no file");
        console.log(`    refused: ${res.stderr.trim().split("REFUSED: ").pop()}`);
      }
    );

    // ------------------------------------------------------------------
    // A mirror override without explicit trust, through installBinary().
    // ------------------------------------------------------------------
    await checkAsync(
      "[adversarial] a mirror override without explicit trust is refused by installBinary()",
      async () => {
        const home = tempDir("litespm-home-mirror-");
        try {
          const child = spawn(
            process.execPath,
            [path.join(__dirname, "scripts", "install-binary.js")],
            {
              cwd: __dirname,
              env: {
                ...process.env,
                HOME: home,
                NODE_EXTRA_CA_CERTS: cert,
                LITESPM_RELEASE_REPO: `${origin}/genuine`,
                LITESPM_TRUST_IDENTITY: "",
                LITESPM_TRUST_ISSUER: "",
              },
            }
          );
          let out = "";
          child.stdout.on("data", (d) => (out += d));
          child.stderr.on("data", (d) => (out += d));
          const status = await new Promise((resolve) => child.on("close", resolve));
          assert.notStrictEqual(status, 0, `the installer exited 0:\n${out}`);
          assert(/INSTALL REFUSED/.test(out), `no refusal was reported:\n${out}`);
          assert(
            /mirror is not a trust anchor/.test(out),
            `the refusal did not explain the mirror rule:\n${out}`
          );
          assert(
            !fs.existsSync(path.join(home, ".litespm", "bin", binName)),
            "an implicitly-trusted mirror was installed from"
          );
          console.log(`    refused (exit ${status}): ${refusalLine(out)}`);
        } finally {
          fs.rmSync(home, { recursive: true, force: true });
        }
      }
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
