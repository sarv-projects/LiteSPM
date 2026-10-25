#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const VERSION = require("../package.json").version;

function getBinaryName() {
  const platform = process.platform;
  const arch = process.arch;

  let osName = "";
  if (platform === "win32") osName = "windows";
  else if (platform === "darwin") osName = "darwin";
  else if (platform === "linux") osName = "linux";
  else throw new Error(`Unsupported OS platform: ${platform}`);

  let archName = "";
  if (arch === "x64") archName = "amd64";
  else if (arch === "arm64") archName = "arm64";
  else throw new Error(`Unsupported CPU architecture: ${arch}`);

  const ext = platform === "win32" ? ".exe" : "";
  return `litespm-${osName}-${archName}${ext}`;
}

function getManagedBinaryPath() {
  const binName = getBinaryName();
  return path.join(os.homedir(), ".litespm", "bin", `v${VERSION}`, binName);
}

function resolveBinary() {
  const binName = getBinaryName();

  // The package-local copy is version-pinned by the package tarball. Managed
  // downloads live in a version-specific directory so a second global npm
  // install cannot execute the previous version's binary.
  const candidates = [
    path.join(__dirname, binName),
    getManagedBinaryPath(),
  ];

  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    if (c === getManagedBinaryPath()) {
      let installedVersion = "";
      try {
        installedVersion = fs.readFileSync(`${c}.version`, "utf8").trim();
      } catch (err) {
        continue;
      }
      if (installedVersion !== VERSION &&
          !(installedVersion === `${VERSION}-local` && process.env.LITESPM_ALLOW_LOCAL_DIST === "1")) {
        continue;
      }
    }
    if (process.platform !== "win32") {
      try {
        fs.accessSync(c, fs.constants.X_OK);
      } catch (err) {
        continue;
      }
    }
    return c;
  }

  // There is deliberately NO "whatever `litespm` is on PATH" fallback.
  //
  // It used to be here, and it silently subverted the point of this wrapper: a
  // `litespm i -g litespm` would run whatever binary happened to come first on
  // PATH — an older release, a build in the user's own tree, or anything an
  // attacker managed to place there — with no version check and no checksum. A
  // package that pins a version must run that version or fail. If the pinned
  // binary is genuinely missing, main() says so and exits non-zero.
  return null;
}

function main() {
  let binaryPath = resolveBinary();

  if (!binaryPath) {
    // Attempt on-demand download / setup
    try {
      const installScript = path.join(__dirname, "..", "scripts", "install-binary.js");
      if (fs.existsSync(installScript)) {
        const result = spawnSync(process.execPath, [installScript], { stdio: "inherit" });
        const failure = installerResultError(result);
        if (failure) {
          console.error(failure);
          process.exit(result.status === 0 ? 1 : (result.status || 1));
          return;
        }
        binaryPath = resolveBinary();
      }
    } catch (err) {
      console.error(`[litespm] Could not run the binary installer: ${err.message}`);
      process.exit(1);
      return;
    }
  }

  if (!binaryPath) {
    console.error(`[litespm] Error: Native binary not found for ${process.platform}/${process.arch}.`);
    console.error(`[litespm] Please download ${getBinaryName()} from https://github.com/sarv-projects/LiteSPM/releases/tag/v${VERSION}`);
    process.exit(1);
  }

  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (err) => {
    console.error(`[litespm] Failed to spawn native binary: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code || 0);
    }
  });
}

function installerResultError(result) {
  if (result.error) {
    return `[litespm] Could not start the binary installer: ${result.error.message}`;
  }
  if (result.status !== 0) {
    if (result.signal) {
      return `[litespm] Binary installer stopped by signal ${result.signal}.`;
    }
    return `[litespm] Binary installer failed with exit code ${result.status ?? 1}.`;
  }
  return null;
}

if (require.main === module) {
  main();
}

module.exports = { getBinaryName, getManagedBinaryPath, installerResultError, resolveBinary };
