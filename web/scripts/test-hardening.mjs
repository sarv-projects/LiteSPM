#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const bodySource = read("../src/server/litespm/request-body.ts")
  .replace(/^export class /gm, "class ")
  .replace(/^export async function /gm, "async function ")
  .replace(/: Promise<unknown>/g, "")
  .replace(/: number/g, "")
  .replace(/: Request/g, "")
  .replace(/: void/g, "")
  .replace(/: string/g, "")
  .replace(/: Error/g, "")
  .replace(/: Uint8Array\[\]/g, "")
  .replace(/: \{ \[key: string\]: unknown \}/g, "")
  .replace(/ as unknown/g, "")
  .replace(/ as RequestBodyTooLargeError/g, "");

const bodyHarness = `
${bodySource}
globalThis.__test = { readJsonBody, RequestBodyTooLargeError };
`;
const bodyContext = vm.createContext({ TextDecoder, Uint8Array, Number, JSON, TypeError, Error });
vm.runInContext(bodyHarness, bodyContext);
const { readJsonBody, RequestBodyTooLargeError } = bodyContext.__test;

const request = (chunks, headers = {}) => new Request("https://test.invalid", {
  method: "POST",
  headers,
  body: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }),
  duplex: "half",
});

assert.deepEqual(await readJsonBody(request(['{"ok":true}']), 64), { ok: true });
await assert.rejects(
  readJsonBody(request(["{}"], { "content-length": "100" }), 10),
  RequestBodyTooLargeError,
);
await assert.rejects(
  readJsonBody(request(['{"x":"', "x".repeat(64), '"}']), 16),
  RequestBodyTooLargeError,
);
await assert.rejects(readJsonBody(request(["{"]), 16), SyntaxError);

const routerSource = read("../src/lib/litespm/router.ts");
assert.match(routerSource, /if \(hash\.startsWith\("#\/"\)\)/);
assert.doesNotMatch(routerSource, /hash && \(hash\.startsWith\("#\/"\) \|\| hash\.startsWith\("#"\)\)/);
assert.match(routerSource, /if \(target\.startsWith\("#\/"\)\) return target\.slice\(1\)/);
assert.match(routerSource, /if \(target\.startsWith\("#"\)\) return target\.length > 1 \? target : "\/"\s*;/);

const limiterSource = read("../src/server/litespm/rate-limit.ts");
assert.match(limiterSource, /RATE_WINDOW_MAX_KEYS = 10_000/);
assert.match(limiterSource, /function pruneWindows/);

const hostRows = JSON.parse(read("../data/hosts.json"));
assert.equal(hostRows.length, 52, "generated host registry must contain 52 adapters");
const claudeDesktop = hostRows.find((host) => host.id === "claude-desktop");
assert.ok(claudeDesktop, "Claude Desktop adapter must be generated");
assert.deepEqual(claudeDesktop.supportedOS, ["windows", "darwin", "linux"]);
const vscode = hostRows.find((host) => host.id === "vscode");
assert.ok(vscode, "VS Code adapter must be generated");
assert.equal(vscode.projectOnly, true);
assert.deepEqual(vscode.supportedOS, ["windows", "darwin", "linux"]);
assert.equal(vscode.layoutScope, "project");
assert.equal(vscode.projectPath, ".mcp.json");
assert.equal(vscode.keyPath, "mcpServers");
assert.equal(vscode.shape, "object");
assert.deepEqual(vscode.remoteTransports, ["streamable-http"]);

const hostSource = read("../src/server/litespm/hosts.ts");
assert.match(hostSource, /claude-desktop/);
assert.match(hostSource, /hostPathIsHomeDerived/);
const detailSource = read("../src/components/litespm/views/agent-detail.tsx");
assert.match(detailSource, /aria-label="Operating system"/);
assert.match(detailSource, /windowsPathHomeDerived/);

const routeError = read("../src/app/error.tsx");
assert.match(routeError, /reset\(\)/);
assert.match(routeError, /role="alert"/);
const globalError = read("../src/app/global-error.tsx");
assert.match(globalError, /<html lang="en">/);
assert.match(globalError, /reset\(\)/);
const notFound = read("../src/app/not-found.tsx");
assert.match(notFound, /Return to catalog/);

console.log("web hardening, host compatibility and recovery regression checks: passed");
