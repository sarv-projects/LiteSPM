#!/usr/bin/env node
// Gate: the site never prints an install command the CLI would refuse.
//
// The entry page publishes one command. When the CLI takes a short term
// (`litespm install --search <term>`) the page publishes that; when it does
// not, the page publishes the exact id. The switch between the two lives in
// `lib/installCommand.ts` as `CLI_INSTALL_ACCEPTS_SEARCH` — and a switch
// nobody checks is a switch that drifts.
//
// This script is the check, and it checks TWO different binaries, because the
// site does not address the source tree. `npx --yes litespm@latest` resolves
// to what npm serves, so the flags the page prints have to be flags the
// PUBLISHED release accepts — and for six releases now the published release
// and this working tree have been different programs.
//
//   1. the working tree's own install parser (`cmd/litespm/*.go`): the site
//      must not publish a flag even the current binary lacks;
//   2. the published release's install parser (`git show v<published>`): the
//      site must not publish a flag the binary a reader installs lacks — that
//      is the check whose absence let the site publish `--agent` and
//      `--all-detected` while `npm`'s `latest` answered `unknown flag`.
//
// The published version is read from npm when the network answers it, and
// from `data/published-cli.json` when it does not; the gate fails when they
// disagree, so a new publish cannot quietly leave the snapshot — and with it
// the site — behind.
//
// It then asserts the module's own behaviour on fixed rows, so the branches
// cannot be swapped by accident.
//
// Usage: node scripts/check-install-command.mjs [--root <dir>]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);
const repoRoot = path.resolve(webRoot, "..");
const cliDir = path.join(repoRoot, "cmd", "litespm");

function fail(message) {
  console.error(`FAIL install command — ${message}`);
  process.exit(1);
}

/**
 * The install flags a Go source at `ref` accepts, read out of the parser
 * itself. `ref` is either a git tag (what npm serves) or `""` for the working
 * tree.
 *
 * A missing parser is a failure, never a "no flags": the gate exists to
 * compare the site against the binary, and a comparison against an empty set
 * would silently read "the site publishes nothing", which passes.
 */
function gitShow(ref, file) {
  return execFileSync("git", ["show", `${ref}:cmd/litespm/${file}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Fetch one tag if this clone does not have it.
 *
 * `actions/checkout` is a depth-1 clone by default, so the published tag is
 * not in the object store: without this, the gate failed in CI with "the tag
 * is not here" — which reads exactly like a broken release and is not one.
 * One bounded fetch, and a failure is not fatal: the caller falls back to the
 * committed snapshot and says so.
 */
function fetchTagIfNeeded(ref) {
  if (!ref) return false;
  const has = execFileSync("git", ["tag", "-l", ref], { cwd: repoRoot, encoding: "utf8" }).trim();
  if (has) return true;
  try {
    execFileSync("git", ["fetch", "--depth=1", "origin", `refs/tags/${ref}:refs/tags/${ref}`], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return execFileSync("git", ["tag", "-l", ref], { cwd: repoRoot, encoding: "utf8" }).trim() !== "";
  } catch {
    return false;
  }
}

function installFlagsAt(ref) {
  if (ref && !existsSync(path.join(repoRoot, ".git"))) {
    fail(`cannot read ${ref}: ${repoRoot} is not a git checkout`);
  }
  if (ref && !fetchTagIfNeeded(ref)) {
    console.log(`  ! tag ${ref} is not in this clone and could not be fetched; ` +
      "checking against the committed snapshot instead");
    return null;
  }
  const files = readdirSync(cliDir).filter((name) => name.endsWith(".go"));
  const flags = new Set();
  let sawParser = false;
  for (const file of files) {
    let text;
    if (ref) {
      try {
        text = gitShow(ref, file);
      } catch {
        continue; // the tag predates this file
      }
    } else {
      text = readFileSync(path.join(cliDir, file), "utf8");
    }
    // Only the install verb's own parser: the struct it fills and the function
    // that parses it. Every other verb in the same file has a `case "--flag"`
    // of its own — `search`'s `--limit`, `list`'s `--agent` — and folding
    // those in would let the site print a flag the install verb refuses.
    const start = text.search(/func parseInstallFlags\s*\(/);
    if (start === -1) continue;
    sawParser = true;
    // The function ends at the first `}` in column zero.
    const body = text.slice(start, text.indexOf("\n}", start) + 1);
    for (const clause of body.matchAll(/case\s+([^:]*?):/g)) {
      for (const literal of clause[1].matchAll(/"(--?[a-z][a-z0-9-]*)"/g)) {
        flags.add(literal[1]);
      }
    }
  }
  if (!sawParser) {
    fail(
      `parseInstallFlags was not found for ${ref || "the working tree"} ` +
        `in cmd/litespm — the gate cannot tell what the binary accepts`
    );
  }
  return flags;
}

/**
 * What npm serves as `latest`.
 *
 * The network is asked first, because that is the fact that matters and this
 * is the one place in the build where being wrong about it prints a failing
 * command on a reader's terminal. The committed snapshot is the offline
 * fallback, and a live answer that disagrees with it is a failure: the file
 * the site is being checked against has gone stale.
 */
function publishedVersion(snapshot) {
  try {
    const live = execFileSync("npm", ["view", "litespm", "version"], {
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, NO_COLOR: "1" },
    }).trim();
    if (live) {
      if (live !== snapshot.version) {
        fail(
          `npm now serves litespm@${live} but web/data/published-cli.json records ` +
            `${snapshot.version} — update the file (and its installFlags, read from ` +
            `git show v${live}:cmd/litespm/main.go), then re-check the site's commands`
        );
      }
      return live;
    }
  } catch {
    console.log(
      `  ! npm could not be reached; checking against the committed snapshot ` +
        `${snapshot.version} (checked ${snapshot.checkedAt})`
    );
  }
  return snapshot.version;
}

/** The site's own declaration, transpiled from TypeScript. */
async function loadModule() {
  const modulePath = path.join(webRoot, "lib", "installCommand.ts");
  const transpiled = ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: modulePath,
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  return import(url);
}

/**
 * Every `--flag` the LiteSPM part of a generated command prints.
 *
 * Everything before the binary's own name belongs to whatever launcher the
 * page put it behind (`npx --yes …`), and `--yes` is npx's flag, not the
 * CLI's — counting it would fail the gate on a flag no `litespm install`
 * parser could ever accept.
 */
function flagsIn(command) {
  const at = command.indexOf("litespm");
  const own = at === -1 ? "" : command.slice(at + "litespm".length);
  const found = new Set();
  for (const match of own.matchAll(/\s(--[a-z][a-z0-9-]*)/g)) found.add(match[1]);
  return found;
}

async function main() {
  const module = await loadModule();
  if (typeof module.installCommandFor !== "function") {
    fail("lib/installCommand.ts did not export installCommandFor");
  }

  const snapshotPath = path.join(webRoot, "data", "published-cli.json");
  if (!existsSync(snapshotPath)) {
    fail("data/published-cli.json is missing — the gate has no record of what npm serves");
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (!snapshot.version || !Array.isArray(snapshot.installFlags) || snapshot.installFlags.length === 0) {
    fail("data/published-cli.json records no version or no install flags");
  }

  const version = publishedVersion(snapshot);
  const sourceFlags = installFlagsAt("");
  // null = the tag is not in this clone (and could not be fetched), so the
  // snapshot is the answer and the tag/snapshot comparison below is skipped.
  const tagFlags = installFlagsAt(`v${version}`);
  const publishedFlags = tagFlags ?? new Set(snapshot.installFlags);

  // The snapshot has to describe the tag it names: a file whose flag list has
  // gone stale is worse than no file, because it reads as a check that passed.
  // (Skipped when the tag was unavailable and the snapshot is the answer.)
  const recorded = new Set(snapshot.installFlags);
  const fromTag = tagFlags ?? new Set();
  const missing = [...fromTag].filter((flag) => !recorded.has(flag));
  const extra = [...recorded].filter((flag) => !fromTag.has(flag));
  if (tagFlags !== null && (missing.length > 0 || extra.length > 0)) {
    fail(
      `web/data/published-cli.json does not describe v${version}: ` +
        `${missing.length > 0 ? `missing ${missing.join(", ")}` : ""}` +
        `${missing.length > 0 && extra.length > 0 ? "; " : ""}` +
        `${extra.length > 0 ? `has ${extra.join(", ")} which that tag does not take` : ""}`
    );
  }

  // Every flag the page prints, from the commands it actually builds.
  const built = [
    module.installCommandFor({ id: "mcp:builtin:mcp-registry:io.github.github-github-mcp-server", name: "GitHub" }),
    module.websiteInstallCommandFor({ id: "mcp:example", kind: "mcp" }),
    module.websiteInstallCommandFor({ id: "mcp:example", kind: "mcp" }, "codex"),
    module.websiteInstallCommandFor({ id: "skill:example", kind: "skill" }),
    module.websiteInstallCommandFor({ id: "skill:example", kind: "skill" }, "codex"),
    module.websiteInstallCommandFor({ id: "plugin:example", kind: "plugin" }),
    module.websiteInstallCommandFor({ id: "plugin:example", kind: "plugin" }, "codex"),
    { command: module.exactIdCommand({ id: "mcp:example" }) },
    { command: module.WEBSITE_SETUP_COMMAND },
    { command: module.WEBSITE_CATALOG_SYNC_COMMAND },
  ];
  const published = new Set();
  for (const entry of built) {
    for (const flag of flagsIn(entry.command)) published.add(flag);
  }

  for (const flag of published) {
    if (!sourceFlags.has(flag)) {
      fail(
        `the site prints ${flag}, which this working tree's install parser does not accept — ` +
          `the command would fail with "unknown flag"`
      );
    }
    if (!publishedFlags.has(flag)) {
      fail(
        `the site prints ${flag}, but the CLI a reader installs (${version}, what npm serves as ` +
          `latest) does not accept it — the command would fail with "unknown flag". ` +
          `Use a flag both take, or update web/data/published-cli.json after publishing`
      );
    }
  }

  // The short-form switch: the page may offer `--search` only when the binary
  // a reader runs offers it. (The working tree is checked separately by the
  // loop above: a short form neither takes is already refused there.)
  const declared = module.CLI_INSTALL_ACCEPTS_SEARCH;
  if (typeof declared !== "boolean") {
    fail("lib/installCommand.ts did not export a boolean CLI_INSTALL_ACCEPTS_SEARCH");
  }
  if (declared !== publishedFlags.has("--search")) {
    fail(
      declared
        ? `the site publishes \`litespm install --search <term>\` but the published CLI (${version}) ` +
            "does not accept it"
        : `the published CLI (${version}) accepts \`--search\` but the site does not publish it — ` +
            "set CLI_INSTALL_ACCEPTS_SEARCH to true in lib/installCommand.ts"
    );
  }

  // The two branches, asserted on a fixed row so they cannot be swapped.
  const row = { id: "mcp:builtin:mcp-registry:io.github.github-github-mcp-server", name: "GitHub" };
  const command = module.installCommandFor(row);
  if (declared) {
    if (!command.command.startsWith("litespm install --search ")) {
      fail(`with --search available, the command is "${command.command}"`);
    }
  } else if (command.command !== `litespm install ${row.id}`) {
    fail(`without --search, the command is "${command.command}", not the exact id form`);
  }
  if (module.exactIdCommand(row) !== `litespm install ${row.id}`) {
    fail("the exact-id command is not the id form — the Details disclosure would lie");
  }
  if (!command.id) fail("the command carries no id — the disclosure would have nothing to show");

  // Naming a target. Asserted in both directions against the working tree, and
  // against the published binary by the loop above.
  const targeted = module.websiteInstallCommandFor({ id: "skill:example", kind: "skill" }, "codex");
  const siteNamesTarget = targeted.command.includes(" --host codex") || targeted.command.includes(" --agent codex");
  if (!siteNamesTarget) {
    fail(`a chosen agent must be named in the command; it is "${targeted.command}"`);
  }
  const untargeted = module.websiteInstallCommandFor({ id: "skill:example", kind: "skill" });
  if (flagsIn(untargeted.command).size !== 0) {
    fail(
      "an untargeted skill command must stay bare: `@latest` can be a release that does not take " +
        `the flag a newer one added (it is "${untargeted.command}")`
    );
  }
  const untargetedMcp = module.websiteInstallCommandFor({ id: "mcp:ok", kind: "mcp" });
  if (flagsIn(untargetedMcp.command).size !== 0) {
    fail("an MCP command must keep its documented default target set and name no flag");
  }

  console.log(
    `OK install command — every flag the site prints (${[...published].sort().join(", ")}) is ` +
      `accepted by this tree and by the published CLI (${version}); ` +
      `\`--search\` ${declared ? "is" : "is not"} published because the published CLI ` +
      `${declared ? "takes" : "does not take"} it; the exact id is always available`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
