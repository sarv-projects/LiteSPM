#!/usr/bin/env node
// Gate: the browser-facing hardening rules stay wired.
//
// F8 — the copy-paste host-config snippet is built from catalog command/args,
// which are publisher data. A value carrying a quote and a newline used to
// inject a whole extra [mcp_servers.*] block into a config the visitor pastes
// into their agent. The escapers plus the token validator live in
// `src/server/litespm/config-snippet.ts`, which is dependency-free, so this
// gate transpiles it with the repo's own typescript devDependency and runs
// the real code — no bundler, no test runner. The wiring around it is
// asserted at source level (those modules pull in the Next.js runtime).
//
// Usage: node scripts/check-web-hardening.mjs

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);

function loadModule(rel) {
  const source = readFileSync(path.join(webRoot, rel), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    fileName: rel,
  });
  const dir = mkdtempSync(path.join(tmpdir(), "litespm-hardening-"));
  const file = path.join(dir, "module.mjs");
  writeFileSync(file, outputText);
  return import(pathToFileURL(file).href);
}

function readSource(rel) {
  return readFileSync(path.join(webRoot, rel), "utf8");
}

const {
  hasControlCharacters,
  isSafeCommandToken,
  jsonSnippet,
  tomlLocalEntry,
  tomlString,
  validateCommandLine,
} = await loadModule("src/server/litespm/config-snippet.ts");

const failures = [];
const expect = (label, actual, predicate) => {
  if (!predicate(actual)) {
    failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 160)}`);
  }
};

/* ------------------------------- F8 — TOML ------------------------------- */

// The audit's exact injection demo: a command carrying a quote and newline,
// which used to close `command = "..."` and open a second table.
const INJECTION = 'evil"\n[mcp_servers.pwned]\ncommand = "sh';
expect(
  "the raw interpolation really injects a table (demo sanity)",
  `command = "${INJECTION}"`,
  (v) => v.includes("[mcp_servers.pwned]"),
);
// Escaped, the value cannot close its own quoting or start a new line, so the
// injected header stays inside the string instead of becoming a table.
expect(
  "escaping pins the value inside one quoted TOML line",
  tomlString(INJECTION),
  (v) => v === '"evil\\"\\n[mcp_servers.pwned]\\ncommand = \\"sh"',
);
expect(
  "the TOML emitter refuses an injected command",
  tomlLocalEntry({ section: "[mcp_servers.demo]", command: INJECTION, args: [] }),
  (v) => v === null,
);
expect(
  "the TOML emitter refuses an injected argument",
  tomlLocalEntry({ section: "[mcp_servers.demo]", command: "npx", args: [INJECTION] }),
  (v) => v === null,
);

// A real TOML string escaper, asserted literally: backslash, quote, the short
// escapes, and \uXXXX for every other control character.
expect("plain values are quoted", tomlString("plain"), (v) => v === '"plain"');
expect("double quotes are escaped", tomlString('a"b'), (v) => v === '"a\\"b"');
expect("backslashes are escaped", tomlString("a\\b"), (v) => v === '"a\\\\b"');
expect("the short TOML escapes are used", tomlString("\b\t\n\f\r"), (v) => v === '"\\b\\t\\n\\f\\r"');
expect("other C0 controls become \\uXXXX", tomlString("\u0000"), (v) => v === '"\\u0000"');
expect("ESC becomes \\u001B", tomlString("\u001b"), (v) => v === '"\\u001B"');
expect("DEL becomes \\u007F", tomlString("\u007f"), (v) => v === '"\\u007F"');
expect("C1 controls become \\uXXXX", tomlString("\u009b"), (v) => v === '"\\u009B"');
expect("printable unicode is kept", tomlString("\u{1f680}"), (v) => v === '"\u{1f680}"');

expect(
  "a valid launch line emits the exact TOML block",
  tomlLocalEntry({
    section: "[mcp_servers.demo]",
    command: "npx",
    args: ["-y", "@scope/pkg@1.2.3"],
    typedStdio: true,
    envVarNames: ["API_KEY", "TOKEN"],
  }),
  (v) =>
    v ===
    [
      "[mcp_servers.demo]",
      'command = "npx"',
      'args = ["-y", "@scope/pkg@1.2.3"]',
      'type = "stdio"',
      "# required env: API_KEY, TOKEN (use this host's documented syntax)",
    ].join("\n"),
);

/* --------------------------- F8 — validation ----------------------------- */

expect("a clean token passes", isSafeCommandToken("npx"), (v) => v === true);
expect("a scoped npm spec passes", isSafeCommandToken("@scope/pkg@1.2.3"), (v) => v === true);
expect("a uvx spec passes", isSafeCommandToken("pkg==1.0.0"), (v) => v === true);
expect("an OCI tag passes", isSafeCommandToken("registry.example/img:1.0"), (v) => v === true);
expect("a quote fails", isSafeCommandToken('npx"'), (v) => v === false);
expect("a backslash fails", isSafeCommandToken("npx\\"), (v) => v === false);
expect("a space fails", isSafeCommandToken("a b"), (v) => v === false);
expect("braces fail", isSafeCommandToken("a{b}"), (v) => v === false);
expect("an empty token fails", isSafeCommandToken(""), (v) => v === false);

expect("newlines are control characters", hasControlCharacters("a\nb"), (v) => v === true);
expect("C0/C1 ranges are control characters", hasControlCharacters("\u009b"), (v) => v === true);
expect("ordinary text is not", hasControlCharacters("npx -y pkg"), (v) => v === false);

expect("a missing command is refused", validateCommandLine("", []), (v) => v === null);
expect("a control char in the command is refused", validateCommandLine("npx\u0007", []), (v) => v === null);
expect("a quote in an argument is refused", validateCommandLine("npx", ['-y', 'a"b']), (v) => v === null);
expect("a non-string argument is refused", validateCommandLine("npx", [1]), (v) => v === null);
expect("a non-array args value is refused", validateCommandLine("npx", "-y"), (v) => v === null);
expect("missing args mean no arguments", validateCommandLine("npx", null), (v) => v !== null && v.args.length === 0);
expect(
  "every allowlisted token shape survives",
  validateCommandLine("npx", ["-y", "@scope/pkg@1.2.3", "--from=pkg==1.0", "image:tag", "/usr/local/bin/node", "a_b.c~d+e-f"]),
  (v) => v !== null && v.args.length === 6,
);

/* ----------------------------- F8 — JSON -------------------------------- */

const jsonValue = { mcpServers: { demo: { command: 'a"b\nc', args: ['x"y'] } } };
const jsonText = jsonSnippet(jsonValue);
expect("jsonSnippet is JSON.stringify", jsonText, (v) => v === JSON.stringify(jsonValue, null, 2));
expect(
  "JSON.parse round-trips the hostile values",
  JSON.parse(jsonText).mcpServers.demo,
  (v) => v.command === 'a"b\nc' && v.args[0] === 'x"y',
);

/* ---------------------------- F8 — wiring ------------------------------- */

const typeSpecs = readSource("src/server/litespm/type-specs.ts");
expect("type-specs no longer interpolates the TOML command", typeSpecs, (v) => !v.includes('command = "${command}"'));
expect("type-specs no longer interpolates TOML args", typeSpecs, (v) => !v.includes('"${arg}"'));
expect(
  "type-specs escapes TOML through config-snippet",
  typeSpecs,
  (v) => v.includes('from "./config-snippet"') && v.includes("tomlLocalEntry("),
);
expect("type-specs emits JSON through config-snippet", typeSpecs, (v) => v.includes("jsonSnippet("));
expect("type-specs validates the launch line", typeSpecs, (v) => v.includes("validateCommandLine("));
expect("type-specs honours the withheld mark", typeSpecs, (v) => v.includes("row.snippetWithheld"));

const datasetSource = readSource("src/server/litespm/dataset.ts");
expect(
  "dataset validates command/args at load time",
  datasetSource,
  (v) => v.includes('from "./config-snippet"') && v.includes("validateCommandLine("),
);
expect("dataset marks the withheld rows", datasetSource, (v) => v.includes("snippetWithheld = true"));
expect(
  "dataset logs exactly one aggregate warning",
  datasetSource,
  (v) => (v.match(/\[catalog\] withheld the install snippet for/g) ?? []).length === 1,
);

const marketplace = readSource("src/components/litespm/views/marketplace.tsx");
const packageDetail = readSource("src/components/litespm/views/package-detail.tsx");
expect(
  "marketplace quotes the install id",
  marketplace,
  (v) => v.includes("litespm install ${shellArg(hit.id)}") && !v.includes("litespm install ${hit.id}"),
);
expect("package-detail quotes the install id", packageDetail, (v) => v.includes("litespm install ${shellArg(data.id)}"));
expect(
  "both views share the one shellArg helper",
  { marketplace, packageDetail },
  (v) =>
    v.marketplace.includes('from "@/lib/litespm/shell"') &&
    v.packageDetail.includes('from "@/lib/litespm/shell"') &&
    !v.packageDetail.includes("function shellArg("),
);

if (failures.length > 0) {
  console.error("Web hardening check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Web hardening check passed.");