#!/usr/bin/env node
// Reject a Hook called after a top-level early return.
//
// This is the one React rule worth enforcing in this repository without adding
// an ESLint tree, and it is not hypothetical: the client-side `document.title`
// effect in `app/package/PackageView.tsx` was first written below
// `if (!item) return`, which changed the number of Hooks between the unresolved
// and resolved renders. React threw error #310 ("rendered more hooks than
// during the previous render") and the page rendered **nothing** — `h1=null`,
// empty title, body reading "Application error".
//
// `tsc --noUnusedLocals --noUnusedParameters` exited 0 on that code. `next
// build` exited 0 on that code. Only loading the page caught it. That gap is
// what this closes.
//
// It uses the TypeScript compiler API, which is already a devDependency, so it
// adds nothing to the lockfile — `eslint-config-next` would have pulled in
// eslint-plugin-react, -import, -jsx-a11y, -react-hooks, @next/eslint-plugin-next,
// @typescript-eslint/parser, @typescript-eslint/eslint-plugin and two resolvers
// to say the same thing.
//
// Not a general linter: it checks exactly this rule and nothing else.
//
// Usage: node scripts/check-hook-order.mjs [--root <dir>]

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);
// lib/ holds real hooks too (useCatalogSearch, useInView, usePlatformOs), and a
// hook after an early return is the same bug wherever it lives. The gate used
// to scan only app/ and components/, so a hook-order bug in lib/ shipped.
const SCAN = [
  path.join(webRoot, "app"),
  path.join(webRoot, "components"),
  path.join(webRoot, "lib"),
];

/** A Hook is an identifier call whose name is `use` followed by a capital, or
 *  `use` alone — React's own convention, and the one this codebase follows. */
const HOOK = /^use[A-Z0-9]/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** True when the statement unconditionally leaves the function. A bare
 *  `return;` or `return <jsx/>;` both qualify; `if (x) { return; }` is a
 *  conditional return and is exactly the shape that causes the bug, so any
 *  return reachable before a Hook counts. */
function containsReturn(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isReturnStatement(n)) {
      found = true;
      return;
    }
    // Do not descend into nested functions: their returns leave themselves,
    // not the component, and Hooks inside them are governed by their own rules.
    if (n !== node && (ts.isFunctionLike(n) || ts.isClassLike(n))) return;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** The first Hook call inside this node, not descending into nested functions. */
function firstHook(node) {
  let hit = null;
  const visit = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && HOOK.test(n.expression.text)) {
      hit = n;
      return;
    }
    if (n !== node && (ts.isFunctionLike(n) || ts.isClassLike(n))) return;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return hit;
}

const problems = [];

function checkFunction(node, source, file) {
  if (!node.body || !ts.isBlock(node.body)) return;
  const statements = node.body.statements;

  let earlyReturn = null;
  for (const statement of statements) {
    // A Hook in this statement, before any return has been seen, is fine.
    const hookHere = firstHook(statement);
    if (hookHere && earlyReturn) {
      const { line } = source.getLineAndCharacterOfPosition(hookHere.getStart(source));
      const { line: returnLine } = source.getLineAndCharacterOfPosition(
        earlyReturn.getStart(source)
      );
      const name = node.name && ts.isIdentifier(node.name) ? node.name.text : "(anonymous)";
      problems.push(
        `${path.relative(webRoot, file)}:${line + 1}  Hook \`${hookHere.expression.text}\` runs after ` +
          `the return on line ${returnLine + 1} — React error #310 (${name})`
      );
      return;
    }
    if (!hookHere && containsReturn(statement)) earlyReturn = statement;
  }
}

function checkFile(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      checkFunction(node, source, file);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const files = SCAN.flatMap((dir) => walk(dir));
if (files.length === 0) {
  console.error(`check-hook-order: found no files under ${SCAN.join(", ")}`);
  process.exit(2);
}

for (const file of files) checkFile(file);

if (problems.length > 0) {
  console.error(`FAIL hook order — ${problems.length} Hook(s) after an early return:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nA Hook must run on every render. Move it above the early returns and let its\n" +
      "dependency array express the missing value instead of a guard."
  );
  process.exit(1);
}

console.log(`OK hook order — ${files.length} file(s) scanned, no Hook follows an early return`);
