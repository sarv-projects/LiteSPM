// installFeasibility.test.ts — the unit assertions for the install-gate
// projection.
//
// The repository has no unit-test convention for `web/lib`: the web suite is
// Playwright (`web/tests/*.spec.ts`), and CI runs it against the built
// export. This file is therefore a LOCAL harness: a plain script with a
// hand-rolled assert, runnable with
//
//     node --experimental-strip-types web/lib/installFeasibility.test.ts
//
// (Node 22.15+; the loader hook below is what lets the module's JSON imports
// resolve outside a bundler). The same assertions are mirrored in
// `web/tests/install-feasibility.spec.ts`, which IS what CI runs.
//
// Why the loader hook: `lib/hosts.ts` imports the two generated registries
// with a plain JSON import, which is what a bundler wants and what Node's
// ESM loader refuses without an import attribute. The hook turns a `.json`
// module into a default export, exactly as the bundler does.

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import type { LoadHookSync, ResolveHookSync } from "node:module";
import { fileURLToPath } from "node:url";

import type { Listing } from "./telemetry";

const resolveHook: ResolveHookSync = (specifier, context, nextResolve) => {
  // The repository's own modules import each other without a file extension
  // (a bundler resolves that; Node's ESM resolver does not). The hook adds
  // the extension back, so the module under test runs unmodified.
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
    try {
      return nextResolve(`${specifier}.ts`, context);
    } catch {
      // fall through to the default resolution
    }
  }
  return nextResolve(specifier, context);
};

const loadHook: LoadHookSync = (url, context, nextLoad) => {
  if (url.endsWith(".json")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${source};`, shortCircuit: true };
  }
  return nextLoad(url, context);
};

registerHooks({ resolve: resolveHook, load: loadHook });

/* ------------------------------------------------------------------ *
 * A hand-rolled assert harness
 * ------------------------------------------------------------------ */

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = ""): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
}

function equal(name: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(
    name,
    same,
    same ? "" : `expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`
  );
}

/* ------------------------------------------------------------------ *
 * The module under test
 * ------------------------------------------------------------------ */

const MODULE_URL = new URL("./installFeasibility.ts", import.meta.url).href;
const feasibility = (await import(MODULE_URL)) as typeof import("./installFeasibility");
const { feasibilityFor, feasibilityCounts } = feasibility;

/* ------------------------------------------------------------------ *
 * The generated registries and the dataset
 * ------------------------------------------------------------------ */

interface HostRow {
  id: string;
  name: string;
  remote?: boolean;
  projectScope?: boolean;
  projectOnly?: boolean;
  shape?: string;
  keyPath?: string;
}

interface SkillRow {
  id: string;
  displayName: string;
  universal?: boolean;
  hasGlobal: boolean;
}

const hosts = JSON.parse(
  readFileSync(new URL("../data/hosts.json", import.meta.url), "utf8")
) as HostRow[];
const skillTargets = JSON.parse(
  readFileSync(new URL("../data/skill-targets.json", import.meta.url), "utf8")
) as SkillRow[];
const catalog = JSON.parse(
  readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")
) as Listing[];

const REMOTE_HOST_IDS = hosts.filter((h) => h.remote === true).map((h) => h.id).sort();
const NON_REMOTE_HOST_IDS = hosts.filter((h) => h.remote !== true).map((h) => h.id).sort();

/** A row with every field the type requires, and whatever the case needs. */
function row(overrides: Partial<Listing> & Pick<Listing, "kind">): Listing {
  return {
    id: "mcp:test:demo",
    name: "Demo",
    slug: "demo",
    summary: "A demo row.",
    category: "Demo",
    publisher: { name: "Test", verified: true },
    stars: null,
    version: "1.0.0",
    ...overrides,
  } as Listing;
}

const REMOTE_HTTP = row({
  id: "mcp:test:remote-http",
  kind: "mcp",
  transport: "streamable-http",
  url: "https://example.com/mcp",
  installability: "metadata_verified",
});

const REMOTE_SSE = row({
  id: "mcp:test:remote-sse",
  kind: "mcp",
  transport: "sse",
  url: "https://example.com/sse",
  installability: "metadata_verified",
});

const LOCAL = row({
  id: "mcp:test:local",
  kind: "mcp",
  transport: "stdio",
  installability: "metadata_verified",
});

const SKILL = row({
  id: "skill:test:demo",
  kind: "skill",
  installability: "metadata_verified",
  skillSource: "https://github.com/example/skills",
});

/**
 * A plugin that publishes a PINNED git tree - the shape that installs. The
 * source question (fetchable? pinned?) is asked before the host question, so
 * a fixture without an artifact would answer the source question and never
 * reach the host rules.
 */
const PLUGIN = row({
  id: "plugin:test:demo",
  kind: "plugin",
  installability: "metadata_verified",
  compatibleHosts: ["Claude Code"],
  artifact: {
    type: "git-tree",
    repo: "https://github.com/example/plugins.git",
    path: "plugins/demo",
    ref: "v1.0.0",
    sha: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    pinned: true,
  },
});

/** A plugin that publishes no fetchable source: refused before any host. */
const PLUGIN_UNFETCHABLE = row({
  id: "plugin:test:unfetchable",
  kind: "plugin",
  installability: "metadata_verified",
  compatibleHosts: ["Claude Code"],
});

const DISCOVERY = row({
  id: "mcp:test:discovery",
  kind: "mcp",
  installability: "discovery_only",
});

/* ------------------------------------------------------------------ *
 * Rule 1 — a plugin is refused by kind
 * ------------------------------------------------------------------ */

{
  // A plugin that publishes no fetchable pinned source is refused with the
  // reason that is actually true.
  const verdict = feasibilityFor(PLUGIN_UNFETCHABLE);
  equal("plugin: state", verdict.state, "unsupported");
  equal("plugin: mode", verdict.mode, "plugin");
  ok(
    "plugin: reason",
    verdict.reasons.length > 0,
    JSON.stringify(verdict.reasons)
  );
  equal("plugin: no host is installable", verdict.supportedHostIds, []);

  // A plugin that publishes a pinned git tree installs: the MCP servers it
  // registers are read from its own manifest, inside that tree.
  const installable = feasibilityFor(PLUGIN);
  equal("plugin: a pinned source installs", installable.state, "supported");
  equal("plugin: the mode is still plugin", installable.mode, "plugin");
  ok(
    "plugin: the hosts that can take a server entry are named",
    installable.supportedHostIds.length > 0,
    JSON.stringify(installable.supportedHostIds)
  );
}

/* ------------------------------------------------------------------ *
 * Rule 2 — a discovery-only row has no launch line
 * ------------------------------------------------------------------ */

{
  const verdict = feasibilityFor(DISCOVERY);
  equal("discovery-only: state", verdict.state, "discovery-only");
  ok(
    "discovery-only: reason",
    verdict.reasons.includes("the publisher published no launch line"),
    JSON.stringify(verdict.reasons)
  );
  equal("discovery-only: no host is installable", verdict.supportedHostIds, []);
}

/* ------------------------------------------------------------------ *
 * Rule 3 — a remote row needs a host with a verified URL entry spelling
 * ------------------------------------------------------------------ */

{
  const verdict = feasibilityFor(REMOTE_HTTP);
  equal("remote: state", verdict.state, "supported");
  equal("remote: mode", verdict.mode, "mcp-remote");
  equal(
    "remote: the supported hosts are exactly the remote-capable ones",
    [...verdict.supportedHostIds].sort(),
    REMOTE_HOST_IDS
  );
  equal("remote: eight hosts carry a remote spelling", REMOTE_HOST_IDS.length, 8);
  equal(
    "remote: the other forty-two are not in the supported set",
    NON_REMOTE_HOST_IDS.filter((id) => verdict.supportedHostIds.includes(id)),
    []
  );

  const capable = feasibilityFor(REMOTE_HTTP, "claude-code");
  equal("remote: a capable host is supported", capable.state, "supported");
  ok(
    "remote: a capable host says why",
    capable.reasons.length > 0,
    JSON.stringify(capable.reasons)
  );

  const incapable = feasibilityFor(REMOTE_HTTP, NON_REMOTE_HOST_IDS[0]);
  ok(
    "remote: a host with no recorded capability is unknown, never supported",
    incapable.state === "unknown" || incapable.state === "unsupported",
    `got ${incapable.state}`
  );
  ok(
    "remote: an unknown host is not claimed as supported",
    incapable.state !== "supported"
  );
  ok(
    "remote: a refusal names the agent",
    incapable.reasons.length > 0,
    JSON.stringify(incapable.reasons)
  );
}

/* ------------------------------------------------------------------ *
 * Rule 3, continued — the transport the entry publishes
 * ------------------------------------------------------------------ */

{
  // The registry records that only Claude Code, Cline and Cursor document the
  // sse transport for a URL entry; the binary refuses the other five by name
  // (LPSM-HOST-REMOTE-UNSUPPORTED).
  const verdict = feasibilityFor(REMOTE_SSE);
  equal(
    "sse: only the hosts that document sse are supported",
    [...verdict.supportedHostIds].sort(),
    ["claude-code", "cline", "cursor"]
  );
  const refused = feasibilityFor(REMOTE_SSE, "opencode");
  equal("sse: a host that documents no sse entry refuses", refused.state, "unsupported");
  ok(
    "sse: the refusal names the agent",
    refused.reasons.some((r) => r.includes("remote (URL) server")),
    JSON.stringify(refused.reasons)
  );
}

/* ------------------------------------------------------------------ *
 * Rule 4 — a local row needs a host with a documented entry shape
 * ------------------------------------------------------------------ */

{
  const verdict = feasibilityFor(LOCAL);
  equal("local: state", verdict.state, "supported");
  equal("local: mode", verdict.mode, "mcp-local");
  equal("local: every adapter takes a local entry", verdict.supportedHostIds.length, hosts.length);

  // Project scope: the seven adapters that document only a user-scope config
  // refuse a project-scope entry.
  const projectVerdict = feasibilityFor(LOCAL, "cline", "project");
  equal("local: project scope refuses a user-scope-only host", projectVerdict.state, "unsupported");
  ok(
    "local: the project-scope refusal says why",
    projectVerdict.reasons.some((r) => r.includes("user-scope config file")),
    JSON.stringify(projectVerdict.reasons)
  );

  // The three agents that document only a repo-local config: a user-scope
  // install lands inside the project the command is run from.
  const projectOnly = hosts.filter((h) => h.projectOnly).map((h) => h.id);
  equal("three agents document only a repo-local config", projectOnly.length, 3);
  const needsProject = feasibilityFor(LOCAL, projectOnly[0]);
  equal("local: a repo-local-only agent needs setup", needsProject.state, "requires-setup");
}

/* ------------------------------------------------------------------ *
 * Rule 5 — a skill needs a registered target and a documented scope
 * ------------------------------------------------------------------ */

{
  const verdict = feasibilityFor(SKILL);
  equal("skill: state", verdict.state, "supported");
  equal("skill: mode", verdict.mode, "skill");

  const withoutGlobal = skillTargets.filter((t) => !t.hasGlobal).map((t) => t.id).sort();
  equal("two skill targets document no user-level directory", withoutGlobal, [
    "eve",
    "promptscript",
  ]);

  const userScope = feasibilityFor(SKILL, "eve", "user");
  equal("skill: user scope refuses a target with no user directory", userScope.state, "unsupported");
  ok(
    "skill: the user-scope refusal says why",
    userScope.reasons.includes("user scope is not documented for this agent"),
    JSON.stringify(userScope.reasons)
  );

  const projectScope = feasibilityFor(SKILL, "eve", "project");
  equal("skill: project scope takes the same target", projectScope.state, "supported");
}

/* ------------------------------------------------------------------ *
 * Rule 6 — a host the entry does not name is unknown, never a refusal
 * ------------------------------------------------------------------ */

{
  const verdict = feasibilityFor(PLUGIN, "Cursor");
  equal("plugin: a host the publisher does not name is unknown", verdict.state, "unknown");
  ok(
    "plugin: the reason names the publisher's list",
    verdict.reasons.includes("the publisher declares no host list"),
    JSON.stringify(verdict.reasons)
  );
  const named = feasibilityFor(PLUGIN, "Claude Code");
  equal("plugin: a host the publisher names can take it", named.state, "supported");
  ok(
    "plugin: the servers are not published in the catalogue",
    named.limitations.some((l) => l.includes("manifest")),
    JSON.stringify(named.limitations)
  );

  // A plugin that publishes no fetchable source is refused, whatever the
  // host: the source question comes first.
  const unfetchable = feasibilityFor(PLUGIN_UNFETCHABLE, "Claude Code");
  equal("plugin: no source is unsupported", unfetchable.state, "unsupported");
  ok(
    "plugin: the reason names the missing source",
    unfetchable.reasons.some((r) => r.includes("no source")),
    JSON.stringify(unfetchable.reasons)
  );
}

/* ------------------------------------------------------------------ *
 * Rule 7 — `supported` claims the install path, not the server
 * ------------------------------------------------------------------ */

{
  for (const [name, verdict] of [
    ["remote", feasibilityFor(REMOTE_HTTP, "claude-code")],
    ["local", feasibilityFor(LOCAL, "claude-code")],
    ["skill", feasibilityFor(SKILL, "claude-code")],
  ] as Array<[string, ReturnType<typeof feasibilityFor>]>) {
    ok(
      `${name}: a supported verdict says the runtime is not tested`,
      verdict.limitations.includes("the publisher's runtime is not tested by LiteSPM"),
      JSON.stringify(verdict.limitations)
    );
  }
  const remote = feasibilityFor(REMOTE_HTTP, "claude-code");
  ok(
    "remote: a supported verdict says the credentials are the reader's",
    remote.limitations.some((l) => l.includes("publishes no credentials")),
    JSON.stringify(remote.limitations)
  );
}

/* ------------------------------------------------------------------ *
 * Rule 8 — the counts are the numbers the site already publishes
 * ------------------------------------------------------------------ */

{
  const counts = feasibilityCounts(catalog);
  equal("counts: installable rows", counts.supported, 26554);
  equal("counts: discovery-only rows", counts["discovery-only"], 42574);
  equal("counts: plugin rows", counts.unsupported, 248);
  equal("counts: no row is left open", counts.unknown, 0);
  equal("counts: no row needs setup", counts["requires-setup"], 0);
  equal("counts: every row is counted once", Object.values(counts).reduce((a, b) => a + b, 0), 69376);
}

/* ------------------------------------------------------------------ *
 * The drift guard: the generated registry and this module must agree
 * ------------------------------------------------------------------ */

{
  // Every host the generated registry marks remote-capable must be in the
  // module's supported set for a streamable-http row. A new remote host the
  // transport table does not cover fails here, loudly.
  const verdict = feasibilityFor(REMOTE_HTTP);
  const missing = REMOTE_HOST_IDS.filter((id) => !verdict.supportedHostIds.includes(id));
  equal("drift: every remote-capable host is in the supported set", missing, []);

  // And the host the registry says nothing about must never be claimed.
  const claimed = NON_REMOTE_HOST_IDS.filter((id) => verdict.supportedHostIds.includes(id));
  equal("drift: no host the registry says nothing about is claimed", claimed, []);
}

console.log(
  failures === 0
    ? `ok — ${checks} assertions passed`
    : `FAILED — ${failures} of ${checks} assertions failed`
);
if (failures > 0) process.exitCode = 1;
