import assert from "node:assert/strict";

import {
  HOSTS,
  bridgeSnippet,
  hostPath,
  hostPathIsHomeDerived,
  hostSupportsPlatform,
} from "../src/server/litespm/hosts";

const findHost = (id: string) => {
  const host = HOSTS.find((candidate) => candidate.id === id);
  assert.ok(host, `missing host adapter: ${id}`);
  return host;
};

const claudeDesktop = findHost("claude-desktop");
assert.deepEqual(claudeDesktop.supportedOS, ["windows", "darwin", "linux"]);
assert.equal(hostPath(claudeDesktop, "win"), "%APPDATA%\\Claude\\claude_desktop_config.json");
assert.equal(hostPath(claudeDesktop, "mac"), "~/Library/Application Support/Claude/claude_desktop_config.json");
assert.equal(hostPath(claudeDesktop, "linux"), "~/.config/Claude/claude_desktop_config.json");
assert.equal(hostPathIsHomeDerived(claudeDesktop, "win"), false);

const vscode = findHost("vscode");
assert.equal(vscode.projectOnly, true);
assert.deepEqual(vscode.supportedOS, ["windows", "darwin", "linux"]);
assert.equal(vscode.projectPath, ".mcp.json");
assert.equal(vscode.keyPath, "mcpServers");
assert.equal(vscode.shape, "object");
assert.deepEqual(vscode.remoteTransports, ["streamable-http"]);
assert.equal(hostPath(vscode, "win"), "");
assert.equal(hostPath(vscode, "mac"), "");
assert.equal(hostPath(vscode, "linux"), "");
assert.equal(hostSupportsPlatform(vscode, "win"), true);
const vscodeSnippet = bridgeSnippet(vscode, "litespm", "win");
assert.match(vscodeSnippet, /\.mcp\.json/);
assert.match(vscodeSnippet, /"mcpServers"/);
assert.doesNotMatch(vscodeSnippet, /"type": "stdio"/);

const cursor = findHost("cursor");
assert.ok(cursor.userPath);
assert.equal(hostPath(cursor, "mac"), cursor.userPath);
assert.equal(hostPath(cursor, "linux"), cursor.userPath);
assert.ok(hostPath(cursor, "win").startsWith("%USERPROFILE%\\"));
assert.equal(hostPathIsHomeDerived(cursor, "win"), true);

assert.equal(HOSTS.length, 52);
for (const host of HOSTS) {
  for (const platform of ["win", "mac", "linux"] as const) {
    if (!hostSupportsPlatform(host, platform)) {
      assert.equal(hostPath(host, platform), "", `${host.id} must not expose an unsupported ${platform} path`);
      continue;
    }
    if (host.projectOnly) {
      assert.ok(host.projectPath, `${host.id} is project-only but has no project path`);
      assert.equal(hostPath(host, platform), "");
      assert.match(bridgeSnippet(host, "litespm", platform), /<project>/);
    } else {
      assert.ok(hostPath(host, platform), `missing ${platform} path for ${host.id}`);
    }
  }
}

console.log("host platform path tests: passed for all 52 hosts across Windows, macOS and Linux");
