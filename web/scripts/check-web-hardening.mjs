#!/usr/bin/env node
// Gate: the browser-facing hardening rules stay wired.
//
// F8 — the copy-paste host-config snippet is built from catalog command/args,
// which are publisher data. A value carrying a quote and a newline used to
// inject a whole extra [mcp_servers.*] block into a config the visitor pastes
// into their agent. The escapers plus the token validator live in
// `src/server/litespm/config-snippet.ts`.
//
// F13 — the rate limiter must key on the platform-set hop, never the leftmost
// client-supplied `x-forwarded-for` entry, and the assistant route must carry
// a per-instance global budget that a rotated header cannot lift.
//
// Both modules are dependency-free, so this gate transpiles them with the
// repo's own typescript devDependency and runs the real code — no bundler,
// no test runner. The wiring around them is asserted at source level (those
// modules pull in the Next.js runtime).
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
const { clientIp, globalBudget } = await loadModule("src/server/litespm/rate-limit.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/* ------------------------------- F13 — IP -------------------------------- */

const requestWith = (headers) => ({ headers: new Headers(headers) });

expect(
  "a single XFF hop is used as-is",
  clientIp(requestWith({ "x-forwarded-for": "203.0.113.9" })),
  (v) => v === "203.0.113.9",
);
expect(
  "the rightmost XFF hop wins",
  clientIp(requestWith({ "x-forwarded-for": "203.0.113.9, 198.51.100.7, 192.0.2.1" })),
  (v) => v === "192.0.2.1",
);
expect(
  "a spoofed leftmost entry never wins",
  clientIp(requestWith({ "x-forwarded-for": "spoofed, 10.0.0.1" })),
  (v) => v === "10.0.0.1" && v !== "spoofed",
);
expect(
  "the platform-set header is preferred over XFF",
  clientIp(requestWith({ "x-forwarded-for": "9.9.9.9, 8.8.8.8", "x-vercel-forwarded-for": "198.51.100.7" })),
  (v) => v === "198.51.100.7",
);
expect(
  "the platform header also resolves its rightmost hop",
  clientIp(requestWith({ "x-vercel-forwarded-for": "10.0.0.9, 198.51.100.7" })),
  (v) => v === "198.51.100.7",
);
expect(
  "x-real-ip is the last resort",
  clientIp(requestWith({ "x-real-ip": "192.0.2.5" })),
  (v) => v === "192.0.2.5",
);
expect("no identity headers mean unknown", clientIp(requestWith({})), (v) => v === "unknown");

/* ---------------------------- F13 — budget ------------------------------- */

const budgetScope = `hardening-${Date.now()}`;
const firstThree = [0, 1, 2].map(() => globalBudget(budgetScope, 3, 60_000));
expect(
  "the global budget allows up to its max",
  firstThree,
  (v) => v.every((result) => result.allowed === true),
);
expect(
  "the global budget then refuses with Retry-After",
  globalBudget(budgetScope, 3, 60_000),
  (v) => v.allowed === false && v.retryAfterSeconds >= 1 && v.remaining === 0,
);
expect(
  "budget scopes are independent",
  globalBudget(`${budgetScope}-other`, 1, 60_000),
  (v) => v.allowed === true,
);

// Sliding, not fixed: after the first event ages out but the second is still
// inside the window, exactly one slot is free again (a fixed window keyed on
// the first event would have released both).
const slidingScope = `${budgetScope}-sliding`;
expect(
  "sliding budget: first request allowed",
  globalBudget(slidingScope, 2, 150),
  (v) => v.allowed === true,
);
await sleep(100);
expect(
  "sliding budget: second request allowed inside the window",
  globalBudget(slidingScope, 2, 150),
  (v) => v.allowed === true,
);
await sleep(70);
expect(
  "sliding budget: an aged-out event frees one slot",
  globalBudget(slidingScope, 2, 150),
  (v) => v.allowed === true,
);
expect(
  "sliding budget: the recent event still counts",
  globalBudget(slidingScope, 2, 150),
  (v) => v.allowed === false,
);

/* ---------------------------- F13 — wiring ------------------------------- */

const rateLimitSource = readSource("src/server/litespm/rate-limit.ts");
expect(
  "rate-limit no longer reads the leftmost XFF hop",
  rateLimitSource,
  (v) => !/split\(\s*",\s*"\)\s*\[\s*0\s*\]/.test(v),
);
expect(
  "rate-limit prefers the platform-set header",
  rateLimitSource,
  (v) => v.includes("x-vercel-forwarded-for"),
);
expect(
  "rate-limit exports the global budget",
  rateLimitSource,
  (v) => v.includes("export function globalBudget("),
);
const assistantRoute = readSource("src/app/api/litespm/assistant/route.ts");
expect(
  "the assistant route keeps the per-IP limit",
  assistantRoute,
  (v) => v.includes("rateLimit(`assistant:${clientIp(request)}"),
);
expect(
  "the assistant route enforces the global budget",
  assistantRoute,
  (v) => v.includes("globalBudget,") && v.includes('const budget = globalBudget("assistant"'),
);
expect(
  "the assistant route answers the budget with 429 + Retry-After",
  assistantRoute,
  (v) => v.includes('"Retry-After": String(budget.retryAfterSeconds)') && v.includes("status: 429"),
);

if (failures.length > 0) {
  console.error("Web hardening check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Web hardening check passed.");