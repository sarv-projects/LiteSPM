#!/usr/bin/env node
"use strict";

// Manually remove only this package version's native executable. npm owns the
// package directory itself; this helper cleans the separate versioned binary
// cache that install-binary.js creates under ~/.litespm/bin. npm v7+ does not
// run uninstall lifecycle scripts, so README.md documents the explicit command.
// It deliberately does NOT
// remove LiteSPM state, backups, agent config entries, skills, or user data.

const fs = require("fs");
const os = require("os");
const path = require("path");
const VERSION = require("../package.json").version;

function getBinaryName(platform = process.platform, arch = process.arch) {
  const osName = platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : "";
  const archName = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : "";
  if (!osName || !archName) return null;
  return `litespm-${osName}-${archName}${platform === "win32" ? ".exe" : ""}`;
}

function resolveManagedPaths({ home = os.homedir(), version = VERSION, platform = process.platform, arch = process.arch } = {}) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("refusing to resolve a managed path for an invalid package version");
  }
  const binaryName = getBinaryName(platform, arch);
  if (!binaryName) return null;
  const root = path.resolve(home, ".litespm", "bin");
  const versionDir = path.resolve(root, `v${version}`);
  if (!versionDir.startsWith(`${root}${path.sep}`)) {
    throw new Error("managed binary path escaped the LiteSPM version directory");
  }
  const binaryPath = path.join(versionDir, binaryName);
  return { root, versionDir, binaryPath, stampPath: `${binaryPath}.version`, version };
}

function isRegularFileWithoutFollowingLinks(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
}

function removeManagedBinary(options = {}) {
  const log = typeof options.log === "function" ? options.log : console.log;
  const paths = resolveManagedPaths(options);
  if (!paths) {
    log("[litespm] No native binary cleanup needed for this platform.");
    return { removed: false, reason: "unsupported-platform" };
  }

  // Do not follow a redirected/symlinked managed directory. The installer
  // creates these directories itself; a link here is not a package-owned path.
  for (const dir of [path.dirname(paths.root), paths.root, paths.versionDir]) {
    try {
      const stat = fs.lstatSync(dir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        log(`[litespm] Preserving ${paths.binaryPath}: managed directory is not a real directory (${dir}).`);
        return { removed: false, reason: "unsafe-directory" };
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return { removed: false, reason: "not-installed" };
      }
      throw err;
    }
  }

  if (!isRegularFileWithoutFollowingLinks(paths.stampPath)) {
    log(`[litespm] No matching version stamp for ${paths.binaryPath}; leaving any unrecognised file untouched.`);
    return { removed: false, reason: "missing-or-unsafe-stamp" };
  }
  const stamp = fs.readFileSync(paths.stampPath, "utf8").trim();
  if (stamp !== paths.version && stamp !== `${paths.version}-local`) {
    log(`[litespm] Version stamp ${JSON.stringify(stamp)} does not match ${paths.version}; preserving the binary.`);
    return { removed: false, reason: "version-mismatch" };
  }
  if (!isRegularFileWithoutFollowingLinks(paths.binaryPath)) {
    log(`[litespm] Managed binary is missing or is not a regular file; preserving the version stamp.`);
    return { removed: false, reason: "missing-or-unsafe-binary" };
  }

  fs.unlinkSync(paths.binaryPath);
  fs.unlinkSync(paths.stampPath);
  try {
    fs.rmdirSync(paths.versionDir); // only if empty; never recursive
  } catch (err) {
    if (!err || !["ENOTEMPTY", "EEXIST"].includes(err.code)) throw err;
  }
  log(`[litespm] Removed this package's managed binary for v${paths.version}. LiteSPM state and agent configurations were left untouched.`);
  return { removed: true, reason: "removed" };
}

if (require.main === module) {
  try {
    removeManagedBinary();
  } catch (err) {
    // Uninstall should not fail because a stale cache file could not be
    // removed. Leave it in place and report the exact cleanup issue.
    console.warn(`[litespm] Could not clean the versioned binary cache: ${err.message}`);
    process.exitCode = 0;
  }
}

module.exports = { getBinaryName, resolveManagedPaths, removeManagedBinary };
