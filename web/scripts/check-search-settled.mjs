#!/usr/bin/env node
// Reject a `<SearchBar totalMatches=...>` that does not also pass `settled`.
//
// The result count in the search field is a *measurement*, and there is a real
// window in which it has not happened yet: the catalog rows arrive with a lazy
// fetch (~43 MB of shards), MiniSearch then indexes them off-thread, and the
// search itself is debounced by 120 ms. Through all of that, `results` is `[]`
// — because nothing has been searched, not because nothing matched.
//
// `useCatalogSearch` exposes `settled` for exactly this, and its own doc
// comment warns that "a UI that trusted those two rendered a confident 'No
// matches' before any search had happened." Neither caller passed it, so
// `SearchBar` printed `0 found` on a cold load and then `4,809 found` eight
// seconds later, for the same query. `tsc` passed. `next build` passed. The
// lint scripts passed. Only loading the page caught it. That gap is what this
// closes.
//
// It uses the TypeScript compiler API, which is already a devDependency, so it
// adds nothing to the lockfile.
//
// Not a general linter: it checks exactly this rule and nothing else.
//
// Usage: node scripts/check-search-settled.mjs [--root <dir>]

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);
const SCAN = [path.join(webRoot, "app"), path.join(webRoot, "components")];

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

/** The attribute names on a JSX element, e.g. `totalMatches`, `settled`. */
function attributeNames(node) {
  const names = new Set();
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr)) names.add(attr.name.text);
  }
  return names;
}

const problems = [];
let seenBar = 0;

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
    const isBar =
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "SearchBar";
    if (isBar) {
      seenBar += 1;
      const names = attributeNames(node);
      if (names.has("totalMatches") && !names.has("settled")) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        problems.push(
          `${path.relative(webRoot, file)}:${line + 1}  <SearchBar> reports a match count without ` +
            `passing \`settled\``
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const files = SCAN.flatMap((dir) => walk(dir));
if (files.length === 0) {
  console.error(`check-search-settled: found no files under ${SCAN.join(", ")}`);
  process.exit(2);
}

for (const file of files) checkFile(file);

if (problems.length > 0) {
  console.error(`FAIL search count — ${problems.length} SearchBar(s) assert an unsettled count:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nPass `settled={settled}` from `useCatalogSearch` so the field reads \"searching…\" until the\n" +
      "measurement exists. A count printed before the search ran is a number nobody measured."
  );
  process.exit(1);
}

console.log(
  `OK search count — ${seenBar} SearchBar usage(s) across ${files.length} file(s), every match count declares its settled state`
);
