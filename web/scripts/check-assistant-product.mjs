#!/usr/bin/env node
// Gate: the assistant answers product questions from the knowledge base, and
// documented syntax is never mistaken for an invented package.
//
// The product branch shipped once as dead code — `productAnswer` existed, no
// route imported it, and every meta question ("what is LiteSPM?") went through
// BM25 and was discarded by the grounding guard. Both modules are
// dependency-free TypeScript, so this gate transpiles them with the repo's own
// typescript devDependency and exercises the real code, then checks the route
// still reaches for them before retrieval.
//
// Usage: node scripts/check-assistant-product.mjs

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
  const dir = mkdtempSync(path.join(tmpdir(), "litespm-assistant-"));
  const file = path.join(dir, "module.mjs");
  writeFileSync(file, outputText);
  return import(pathToFileURL(file).href);
}

const { productAnswer, productAnswerForConversation } = await loadModule(
  "src/server/litespm/assistant-product.ts",
);
const { claimedPackageIds } = await loadModule("src/server/litespm/assistant-grounding.ts");

const failures = [];
const expect = (label, actual, predicate) => {
  if (!predicate(actual)) {
    failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 140)}`);
  }
};
const userTurn = (content) => ({ role: "user", content });

// Product questions name LiteSPM and must answer from the knowledge base.
expect("product answers 'what is litespm'", productAnswer("what is litespm"), (a) =>
  typeof a === "string" && a.includes("open-source package manager"),
);
expect("product answers 'how do I install LiteSPM'", productAnswer("how do I install LiteSPM"), (a) =>
  typeof a === "string" && a.includes("npm install -g litespm"),
);
expect("product answers 'how does litespm work'", productAnswer("how does litespm work"), (a) =>
  typeof a === "string" && a.includes("four steps"),
);

// Catalog questions that merely mention LiteSPM stay on the retrieval path.
expect("the Postgres chip stays a catalog query", productAnswer("What can LiteSPM install for working with Postgres?"), (a) => a === null);
expect("a find-question stays a catalog query", productAnswer("find skills for react with litespm"), (a) => a === null);

// Follow-ups require this conversation to have made LiteSPM the subject.
expect("a follow-up after LiteSPM is answered", productAnswerForConversation([userTurn("what is litespm"), userTurn("how does it work?")]), (a) =>
  typeof a === "string" && a.includes("four steps"),
);
expect("a follow-up after a package question stays catalog", productAnswerForConversation([userTurn("tell me about semgrep"), userTurn("how does it work?")]), (a) => a === null);
expect("a catalog turn ends the product thread", productAnswerForConversation([userTurn("what is litespm"), userTurn("which skills help with PDF documents?"), userTurn("how do I install it?")]), (a) => a === null);
expect("undoing an install stays product-shaped", productAnswerForConversation([userTurn("what is litespm"), userTurn("how do I undo an install?")]), (a) =>
  typeof a === "string" && a.includes("restore"),
);

// The guard must not read documented syntax as an invented package, while a
// real unretrieved id still trips it.
expect("the placeholder form is not a claim", claimedPackageIds("Run `litespm install <id>` to add it."), (a) => a.length === 0);
expect("install remove is not a claim", claimedPackageIds("Use `litespm install remove <installId>` to strip it."), (a) => a.length === 0);
expect("prose after the verb is not a claim", claimedPackageIds("Then run litespm install for the package you picked."), (a) => a.length === 0);
expect("a real id is a claim", claimedPackageIds("Run litespm install deepwiki-mcp."), (a) => a.length === 1 && a[0] === "deepwiki-mcp");

// Dead wiring is the exact regression this gate exists for: the route must ask
// the product branch before it builds the retrieval context, in both the
// streamed and the buffered response.
const route = readFileSync(path.join(webRoot, "src/app/api/litespm/assistant/route.ts"), "utf8");
const productAt = route.indexOf("productAnswerForConversation(history)");
const retrievalAt = route.indexOf("await buildContext(");
if (productAt === -1) {
  failures.push("assistant route: productAnswerForConversation(history) is never called (dead product branch)");
}
if (!route.includes("if (product)")) {
  failures.push("assistant route: no product answer is served");
}
if ((route.split("if (product)").length - 1) < 2) {
  failures.push("assistant route: the product branch is missing from the streamed or buffered response");
}
if (!route.includes("claimedPackageIds(answer)")) {
  failures.push("assistant route: the grounding guard no longer uses claimedPackageIds");
}
if (productAt !== -1 && retrievalAt !== -1 && productAt > retrievalAt) {
  failures.push("assistant route: the product branch runs after retrieval");
}

if (failures.length > 0) {
  console.error("Assistant product check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Assistant product check passed.");
