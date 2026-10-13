#!/usr/bin/env node
// Reject a component that is exported but reaches no route.
//
// `tsc --noEmit --noUnusedLocals --noUnusedParameters` exits 0 on an exported
// component that no module imports: `noUnusedLocals` exempts exports on purpose
// — a module's public surface may be consumed from outside its own program —
// and this codebase is the whole program. `next build` exits 0 as well: the
// bundler tree-shakes the dead module out of every chunk without a word. So the
// four components this gate was written against — `components/hero/HeroSection.tsx`,
// `components/hero/CategoryRail.tsx`, `components/hero/ProportionBar.tsx` and
// `components/catalog/SectionRow.tsx` — passed every gate the build had.
//
// `ProportionBar` is the instructive one. It *is* imported — by `HeroSection`
// — and `HeroSection` is imported by nothing, so the component is only visible
// by following imports from the router outward and noticing where the trail
// stops. That is what this does.
//
// A word search is not the answer, and this file exists partly to repair that
// mistake: a first attempt grepped the tree for each exported name and reported
// `app/agents/[id]/AgentDetailView.tsx:156`, where the name sits inside a prose
// comment ("matching `HeroSection`'s emphasis treatment"). Comments and string
// literals carry no binding; the compiler's syntax tree sees the difference and
// `grep` does not.
//
// The App Router is the root of the graph. A `page.tsx` or `layout.tsx` is
// reached by its path on disk, never by an import specifier, so treating
// "nothing imports it" as the only evidence would condemn every route. These
// files seed the walk; a component is live when some *reachable* module
// imports it.
//
// It uses the TypeScript compiler API, which is already a devDependency, so it
// adds nothing to the lockfile — `eslint-plugin-import`'s `no-unused-modules`
// would say the same thing from inside a plugin tree this repository does not
// have.
//
// No known limitations: the list below is empty, which is where it belongs.
//
// Not a general linter: it checks exactly this rule and nothing else.
//
// Usage: node scripts/check-orphan-components.mjs [--root <dir>]

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.indexOf("--root");
const webRoot = rootArg === -1 ? path.dirname(here) : path.resolve(process.argv[rootArg + 1]);
const APP = path.join(webRoot, "app");
const SCAN = [APP, path.join(webRoot, "components")];

/** Route filenames the App Router resolves by convention. They start the walk,
 *  and their *default* export is consumed by the framework rather than by a
 *  specifier — which is why a `page.tsx` is never its own orphan. A named
 *  export from a route file is still a named binding and still checkable. */
const ROUTER_FILES = new Set([
  "page",
  "layout",
  "template",
  "not-found",
  "error",
  "global-error",
  "loading",
  "default",
  "route",
  "sitemap",
  "robots",
  "manifest",
  "icon",
  "apple-icon",
  "opengraph-image",
  "twitter-image",
]);

/** A component, by the convention this codebase follows: an uppercase binding. */
const COMPONENT = /^[A-Z]/;

const isRouterFile = (file) =>
  path.dirname(file).startsWith(APP) &&
  ROUTER_FILES.has(path.basename(file).replace(/\.tsx?$/, ""));

/** Unreachable components that are not dead yet — empty, and it should stay
 *  that way.
 *
 *  It held exactly one entry, `components/home/FaqSection.tsx`, excused because
 *  it was unreachable-but-not-dead: it carried an uncommitted copy edit from
 *  2026-10-13 and its directory was under active edit, so the landing page was
 *  expected to re-import it. It did — the FAQ now renders, absorbing the old
 *  trust strip — so the exception is gone rather than widened. If a future
 *  entry lands here, it needs a reason and an owner, not just a name. */
const KNOWN_ORPHANS = new Set([]);

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

const files = SCAN.flatMap((dir) => walk(dir));
if (files.length === 0) {
  console.error(`check-orphan-components: found no files under ${SCAN.join(", ")}`);
  process.exit(2);
}
const fileSet = new Set(files);

/** Resolve a module specifier to one of the scanned files, or null when it
 *  points outside the tree (`next/link`, `react`, `../../lib/format`). `@/x` is
 *  the alias `tsconfig.json` declares; the rest resolve from the importing file.
 *  The candidate list mirrors what `moduleResolution: "bundler"` accepts here:
 *  the exact path, both source extensions, then a directory index. */
function resolve(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? path.join(webRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

/** A binding initialized by a function, an arrow, a class, or a call that wraps
 *  one (`memo(…)`, `forwardRef(…)`). `export const metadata = {…}` is a plain
 *  object and is not a component, however it is named. */
function isComponentValue(initializer) {
  if (!initializer) return false;
  return (
    ts.isArrowFunction(initializer) ||
    ts.isFunctionExpression(initializer) ||
    ts.isClassExpression(initializer) ||
    ts.isCallExpression(initializer)
  );
}

const modules = new Map();

function analyze(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  /** Imported module → the bindings taken from it (`*` = the whole module: a
   *  namespace import, `export * from`, or a `dynamic(() => import(…))` whose
   *  chunk is consumed without naming anything). */
  const imported = new Map();
  const exported = [];
  const edge = (target) => {
    let names = imported.get(target);
    if (!names) imported.set(target, (names = new Set()));
    return names;
  };
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const isExported = (node) =>
    (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = (node) =>
    (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  /** A non-router default export is imported as `default`, so that is the
   *  binding it must be matched against — while the report keeps the name the
   *  author wrote. A route file's default is the framework's, not a binding. */
  const record = (name, line, isDefaultExport) => {
    if (isDefaultExport && isRouterFile(file)) return;
    if (name === null && !isDefaultExport) return;
    if (name !== null && !COMPONENT.test(name)) return;
    exported.push({
      name: name ?? "(anonymous default)",
      matchAs: isDefaultExport ? "default" : name,
      line,
    });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolve(node.moduleSpecifier.text, file);
      if (target) {
        const names = edge(target);
        const clause = node.importClause;
        if (clause?.name) names.add("default");
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) names.add("*");
        else if (bindings) {
          for (const element of bindings.elements) {
            names.add((element.propertyName ?? element.name).text);
          }
        }
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const target = resolve(node.moduleSpecifier.text, file);
      if (target) {
        const names = edge(target);
        if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) names.add("*");
        else {
          for (const element of node.exportClause.elements) {
            names.add((element.propertyName ?? element.name).text);
          }
        }
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        const target = resolve(argument.text, file);
        if (target) edge(target).add("*");
      }
    } else if (ts.isExportAssignment(node) && !node.isExportEquals) {
      record(ts.isIdentifier(node.expression) ? node.expression.text : null, lineOf(node), true);
    } else if (ts.isFunctionDeclaration(node) && isExported(node)) {
      record(node.name?.text ?? null, lineOf(node), isDefault(node));
    } else if (ts.isVariableStatement(node) && isExported(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isComponentValue(declaration.initializer)) {
          record(declaration.name.text, lineOf(declaration), false);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imported, exported };
}

for (const file of files) modules.set(file, analyze(file));

const reachable = new Set();
const queue = files.filter(isRouterFile);
while (queue.length > 0) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  for (const target of modules.get(file).imported.keys()) {
    if (!reachable.has(target)) queue.push(target);
  }
}

/** file → bindings a *reachable* module imports from it. */
const used = new Map();
const usedWhole = new Set();
for (const file of reachable) {
  for (const [target, names] of modules.get(file).imported) {
    if (names.has("*")) usedWhole.add(target);
    else {
      let set = used.get(target);
      if (!set) used.set(target, (set = new Set()));
      for (const name of names) set.add(name);
    }
  }
}

const problems = [];
const excused = [];
for (const file of files) {
  const relative = path.relative(webRoot, file).split(path.sep).join("/");
  for (const { name, matchAs, line } of modules.get(file).exported) {
    if (usedWhole.has(file) || used.get(file)?.has(matchAs)) continue;
    const why = reachable.has(file)
      ? "exported, but no module imports it"
      : "module unreachable from any route";
    const problem = `${relative}:${line}  ${name} — ${why}`;
    if (KNOWN_ORPHANS.has(relative)) excused.push(problem);
    else problems.push(problem);
  }
}

problems.sort();
excused.sort();

if (problems.length > 0) {
  console.error(`FAIL orphan components — ${problems.length} exported component(s) nothing reaches:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nAn exported component is reachable only if a module the App Router reaches\n" +
      "imports it. Delete the component, or import it from a live route — `tsc` and\n" +
      "`next build` both exit 0 either way, which is why this runs."
  );
  process.exit(1);
}

console.log(
  `OK orphan components — ${files.length} file(s) scanned, every exported component is reachable` +
    (excused.length === 0 ? "" : `, ${excused.length} excused by KNOWN_ORPHANS`)
);
for (const problem of excused) console.log(`  - ${problem}`);
