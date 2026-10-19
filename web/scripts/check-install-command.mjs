#!/usr/bin/env node
// Gate: the site never prints an install command the CLI would refuse.
//
// The entry page publishes one command. When the CLI takes a short term
// (`litespm install --search <term>`) the page publishes that; when it does
// not, the page publishes the exact id. The switch between the two lives in
// `lib/installCommand.ts` as `CLI_INSTALL_ACCEPTS_SEARCH` — and a switch
// nobody checks is a switch that drifts.
//
// This script is the check. It reads the CLI's own install flag parser out of
// `cmd/litespm/main.go` and asserts the two agree, in BOTH directions:
//
//   * the CLI accepts `--search` and the site does not publish it → the site
//     is leaving a short form on the table;
//   * the site publishes `--search` and the CLI does not accept it → the site
//     is printing a command that fails with "unknown flag", which is the one
//     thing this site must never do.
//
// It then asserts the module's own behaviour on a fixed row, so the two
// branches cannot be swapped by accident.
//
// Usage: node scripts/check-install-command.mjs [--root <dir>]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
 * Does the CLI's install verb accept a `--search` flag?
 *
 * Read out of the CLI's own source rather than declared here, because the
 * declaration is the thing this gate exists to check. The positive control
 * matters as much as the answer: if the parser cannot be found at all, the
 * gate fails loudly instead of reporting "the CLI has no --search" and letting
 * the site publish a command nobody can run.
 */
function cliAcceptsSearch() {
  if (!existsSync(cliDir)) {
    fail(`the CLI source is not at ${cliDir} — the gate cannot check the install verb`);
  }
  const files = readdirSync(cliDir).filter((name) => name.endsWith(".go"));
  let sawParser = false;
  for (const file of files) {
    const text = readFileSync(path.join(cliDir, file), "utf8");
    // The install verb's flag parser: the struct it fills and the function
    // that parses it. Any other `--search` in the CLI (there is none today)
    // belongs to another verb and says nothing about `litespm install`.
    if (!/parseInstallFlags|installFlags/.test(text)) continue;
    sawParser = true;
    if (/case\s+"--search"/.test(text)) return true;
  }
  if (!sawParser) {
    fail(
      "the CLI's install flag parser was not found in cmd/litespm — the gate cannot " +
        "tell whether `litespm install --search` exists"
    );
  }
  return false;
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

async function main() {
  const module = await loadModule();
  if (typeof module.installCommandFor !== "function") {
    fail("lib/installCommand.ts did not export installCommandFor");
  }
  const declared = module.CLI_INSTALL_ACCEPTS_SEARCH;
  if (typeof declared !== "boolean") {
    fail("lib/installCommand.ts did not export a boolean CLI_INSTALL_ACCEPTS_SEARCH");
  }
  const actual = cliAcceptsSearch();

  if (declared !== actual) {
    if (declared && !actual) {
      fail(
        "the site publishes `litespm install --search <term>` but the CLI does not " +
          "accept a --search flag — the page would print a command that fails"
      );
    }
    fail(
      "the CLI accepts `litespm install --search <term>` but the site does not " +
        "publish it — set CLI_INSTALL_ACCEPTS_SEARCH to true in lib/installCommand.ts"
    );
  }

  // The two branches, asserted on a fixed row so they cannot be swapped.
  const row = { id: "mcp:builtin:mcp-registry:io.github.github-github-mcp-server", name: "GitHub" };
  const command = module.installCommandFor(row);
  if (actual) {
    if (!command.command.startsWith("litespm install --search ")) {
      fail(`with --search available, the command is "${command.command}"`);
    }
  } else {
    if (command.command !== `litespm install ${row.id}`) {
      fail(`without --search, the command is "${command.command}", not the exact id form`);
    }
  }
  if (module.exactIdCommand(row) !== `litespm install ${row.id}`) {
    fail("the exact-id command is not the id form — the Details disclosure would lie");
  }
  if (!command.id) fail("the command carries no id — the disclosure would have nothing to show");

  console.log(
    `OK install command — the CLI ${actual ? "accepts" : "does not accept"} ` +
      `\`litespm install --search\`, and the site publishes the ` +
      `${actual ? "short form" : "exact id"}; the exact id is always available`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
