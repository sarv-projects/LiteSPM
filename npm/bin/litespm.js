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
        // The installer's progress and verification lines go to stderr, never
        // stdout. `litespm bridge stdio` speaks JSON-RPC on stdout: an MCP host
        // that launches the shim before the binary exists would otherwise read
        // "[litespm] Installing ..." as a malformed protocol frame.
        // LITESPM_INSTALL_MODE=lazy tells the installer this is the first-run
        // path: a network failure must exit non-zero here (we are about to run
        // the binary), unlike npm's postinstall where it must not break the
        // install. The installer has already explained the cause on stderr.
        console.error(`[litespm] The native binary for v${VERSION} is not installed yet; downloading it now (first run).`);
        const result = spawnSync(process.execPath, [installScript], {
          stdio: ["inherit", 2, "inherit"],
          env: { ...process.env, LITESPM_INSTALL_MODE: "lazy" },
        });
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
    console.error(`[litespm] Run \`litespm\` again once you are online, or download ${getBinaryName()} from https://github.com/sarv-projects/LiteSPM/releases/tag/v${VERSION}`);
    process.exit(1);
  }

  let stdinOption = "inherit";
  let args = process.argv.slice(2);

  // Translate OS protocol handler URLs: litespm://install/<pkg>[?agent=<host>]
  if (args.length === 1 && typeof args[0] === "string" && args[0].startsWith("litespm://")) {
    const safeDecode = (s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return null;
      }
    };
    let rawPkg = "";
    let agent = "";
    try {
      const parsed = new URL(args[0]);
      if (parsed.hostname === "install") {
        rawPkg = parsed.pathname.replace(/^\/+/, "");
      } else if (parsed.pathname.startsWith("//install/")) {
        rawPkg = parsed.pathname.replace(/^\/\/install\//, "");
      } else if (parsed.hostname && parsed.hostname !== "install") {
        rawPkg = parsed.hostname + parsed.pathname;
      }
      agent = parsed.searchParams.get("agent") || parsed.searchParams.get("host") || "";
    } catch {
      const match = args[0].match(/^litespm:\/\/install\/([^?]+)/);
      if (match) rawPkg = match[1];
    }
    const pkg = rawPkg ? safeDecode(rawPkg) : null;
    if (!pkg || pkg.startsWith("-") || (agent && agent.startsWith("-"))) {
      console.error("[litespm] Refusing invalid or flag-like litespm:// URI.");
      process.exit(2);
    }
    args = ["install", pkg];
    if (agent) args.push("--agent", agent);
  }

  let coninFd = null;
  const isBridgeStdio = args.includes("bridge") && args.includes("stdio");
  if (!isBridgeStdio && process.platform === "win32" && !process.stdin.isTTY && process.stdout.isTTY) {
    try {
      coninFd = fs.openSync("CONIN$", "r+");
      stdinOption = coninFd;
    } catch (e) {}
  }

  const child = spawn(binaryPath, args, {
    stdio: [stdinOption, "inherit", "inherit"],
    env: process.env,
  });
  if (coninFd !== null) {
    try {
      fs.closeSync(coninFd);
    } catch (e) {}
  }

  child.on("error", (err) => {
    console.error(`[litespm] Failed to spawn native binary: ${err.message}`);
    process.exit(1);
  });

  // Forward termination to the native process. An MCP host stops a bridge with
  // SIGTERM (or SIGHUP when its terminal closes); without forwarding, only this
  // Node shim dies and the native `litespm bridge stdio` child is orphaned.
  // SIGINT is forwarded only without a terminal: with one, Ctrl-C already
  // reaches the child through the foreground process group, and a second
  // SIGINT would make a Go program that traps the first one exit hard.
  const forwarded = ["SIGTERM", "SIGHUP"];
  if (!process.stdin.isTTY) forwarded.push("SIGINT");
  for (const sig of forwarded) {
    try {
      process.on(sig, () => {
        try {
          child.kill(sig);
        } catch (e) {
          /* the child already exited */
        }
      });
    } catch (e) {
      /* a signal this platform cannot listen for (e.g. SIGHUP on Windows) */
    }
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.removeAllListeners(signal);
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
    return `[litespm] Binary installer failed with exit code ${result.status ?? 1}; the native binary is not installed. Fix the problem above (network, proxy, permissions) and run \`litespm\` again.`;
  }
  return null;
}

if (require.main === module) {
  main();
}

module.exports = { getBinaryName, getManagedBinaryPath, installerResultError, main, resolveBinary };
