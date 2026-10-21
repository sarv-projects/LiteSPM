#!/usr/bin/env node
// Reject a result count that does not also declare its `settled` state.
//
// Two components print a measured count:
//
//   <SearchBar totalMatches=...>   the count in the search field ("N found")
//   <ExtensionGrid count=...>      the result-count line above the rows
//
// Both are *measurements*, and there is a real window in which neither has
// happened yet: the search index arrives with a lazy fetch (2.7 MiB gzipped),
// the display rows hydrate from the projection, and the search itself is
// debounced by 120 ms. Through all of that, `results` is `[]` and any count
// derived from it is `0` — because nothing has been searched, not because
// nothing matched.
//
// `useCatalogSearch` exposes `settled` for exactly this, and its own doc
// comment warns that "a UI that trusted those two rendered a confident 'No
// matches' before any search had happened." The SearchBar rule was added
// first: neither caller passed `settled`, so `SearchBar` printed `0 found` on
// a cold load and then `4,809 found` eight seconds later, for the same query.
// The grid rule closes the other half of the same hole: on a cold
// `/explore/?q=github` the header printed `0 entries` for ~1.5s while the
// SearchBar beside it read "searching…", then `26,864 entries` — the same
// defect one element over, and this script did not see it because it only
// looked at `SearchBar`. `tsc` passed. `next build` passed. The lint scripts
// passed. Only loading the page caught it. That gap is what this closes.
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

/**
 * Every component that prints a count derived from a search. `countProp` is
 * the attribute carrying the figure; `settled` is the attribute that says the
 * figure is a measurement of the current inputs.
 */
const RULES = [
  { component: "SearchBar", countProp: "totalMatches", what: "a match count" },
  { component: "ExtensionGrid", countProp: "count", what: "an entry count" },
  // SearchResults prints a measured count of its own, with the same
  // `settled` prop. The gate covered the other two components and not this
  // one, so a settled-count bug here passed every check.
  { component: "SearchResults", countProp: "totalMatches", what: "a match count" },
];

const problems = [];
/** Per-component count of usages seen, for the success line. */
const seen = Object.fromEntries(RULES.map((rule) => [rule.component, 0]));

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
    const isElement =
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName);
    if (isElement) {
      for (const rule of RULES) {
        if (node.tagName.text !== rule.component) continue;
        seen[rule.component] += 1;
        const names = attributeNames(node);
        if (names.has(rule.countProp) && !names.has("settled")) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          problems.push(
            `${path.relative(webRoot, file)}:${line + 1}  <${rule.component}> reports ${rule.what} ` +
              `without passing \`settled\``
          );
        }
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
  console.error(`FAIL search count — ${problems.length} count(s) assert an unsettled figure:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nPass `settled={settled}` from `useCatalogSearch` so the count reads \"searching…\" until the\n" +
      "measurement exists. A count printed before the search ran is a number nobody measured."
  );
  process.exit(1);
}

const summary = RULES.map((rule) => `${seen[rule.component]} ${rule.component} usage(s)`).join(", ");
console.log(
  `OK search count — ${summary} across ${files.length} file(s), every printed count declares its settled state`
);
