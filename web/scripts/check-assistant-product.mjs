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

async function loadGateway() {
  const dir = mkdtempSync(path.join(tmpdir(), "litespm-llm-gateway-"));
  for (const [rel, filename] of [
    ["src/server/llm/providers.ts", "providers.mjs"],
    ["src/server/llm/gateway.ts", "gateway.mjs"],
  ]) {
    const source = readFileSync(path.join(webRoot, rel), "utf8");
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      fileName: rel,
    });
    if (filename === "gateway.mjs") {
      outputText = outputText.replace('from "./providers"', 'from "./providers.mjs"');
    }
    writeFileSync(path.join(dir, filename), outputText);
  }
  return import(pathToFileURL(path.join(dir, "gateway.mjs")).href);
}

const { routeAssistantIntent, assistantSystemPrompt } = await loadModule(
  "src/server/litespm/assistant-orchestrator.ts",
);
const { claimedPackageIds } = await loadModule("src/server/litespm/assistant-grounding.ts");

const failures = [];
const expect = (label, actual, predicate) => {
  if (!predicate(actual)) {
    failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 140)}`);
  }
};
const userTurn = (content) => ({ role: "user", content });

// The Z.AI Web Dev SDK is not a keyless hosted provider: it reads a local
// .z-ai-config file. Exercise the real gateway pool with isolated env values
// so a missing production key cannot be disguised as a healthy "keyless" slot.
const llmEnvPattern = /^(?:NVIDIA_API_KEY(?:_\d+)?|GROQ_API_KEY(?:_\d+)?|GEMINI_API_KEY(?:_\d+)?|OPENROUTER_API_KEY(?:_\d+)?|GROQ_MODELS|NVIDIA_MODEL|GROQ_MODEL|GEMINI_MODEL|OPENROUTER_MODEL|LLM_PROVIDER_ORDER|LLM_ZAI_ENABLED|LLM_GENERIC_JSON|LLM_GENERIC_PROVIDERS|LLM_GENERIC_\d+_(?:NAME|BASE_URL|API_KEY|MODEL|STYLE|PRIORITY))$/;
const savedLlmEnv = new Map(Object.entries(process.env).filter(([key]) => llmEnvPattern.test(key)));
for (const key of savedLlmEnv.keys()) delete process.env[key];
const llmGateway = await loadGateway();
try {
  llmGateway.resetLlmPool();
  expect("no provider is fabricated when deployment credentials are absent", llmGateway.getLlmStatus(),
    (status) => status.credentials.length === 0 && status.order.length === 0);

  process.env.LLM_ZAI_ENABLED = "1";
  llmGateway.resetLlmPool();
  expect("Z.AI SDK is available only after explicit opt-in", llmGateway.getLlmStatus(),
    (status) => status.order.length === 1 && status.order[0] === "zai" && status.credentials[0]?.keyIndex === null);

  process.env.LLM_PROVIDER_ORDER = "misspelled-provider";
  llmGateway.resetLlmPool();
  expect("an invalid explicit provider order fails closed instead of falling back to Z.AI", llmGateway.getLlmStatus(),
    (status) => status.credentials.length === 0);

  process.env.LLM_PROVIDER_ORDER = "groq";
  process.env.GROQ_API_KEY = "test-only-not-a-real-key";
  process.env.GROQ_MODELS = "model-a,model-b";
  delete process.env.LLM_ZAI_ENABLED;
  llmGateway.resetLlmPool();
  expect("two Groq model routes backed by one API key share one key index", llmGateway.getLlmStatus(),
    (status) => status.order.length === 1 && status.order[0] === "groq" && status.credentials.length === 2 && status.credentials.every((credential) => credential.keyIndex === 1));

  process.env.LLM_PROVIDER_ORDER = "local";
  process.env.LLM_GENERIC_JSON = JSON.stringify([{ name: "local", baseUrl: "http://127.0.0.1:8000/v1", model: "test-model" }]);
  llmGateway.resetLlmPool();
  expect("an explicitly keyless OpenAI-compatible endpoint is not reported as an API key", llmGateway.getLlmStatus(),
    (status) => status.credentials.length === 1 && status.credentials[0]?.provider === "local" && status.credentials[0]?.keyIndex === null);
} finally {
  for (const key of Object.keys(process.env)) if (llmEnvPattern.test(key)) delete process.env[key];
  for (const [key, value] of savedLlmEnv) process.env[key] = value;
  llmGateway.resetLlmPool();
}

// Intent routing must keep ordinary chat away from catalog retrieval.
expect("greetings use general conversation", routeAssistantIntent("Hi!").mode, (a) => a === "conversation");
expect("identity questions use general conversation", routeAssistantIntent("Hi, who are you?").mode, (a) => a === "conversation");
expect("general technical questions are not catalog searches", routeAssistantIntent("Explain vector databases").mode, (a) => a === "conversation");
expect("LiteSPM product questions use documentation RAG", routeAssistantIntent("What is LiteSPM?").mode, (a) => a === "knowledge");
expect("installing a named MCP server into an agent is a catalog question, not bridge setup", routeAssistantIntent("How do I install a postgres MCP server into Claude Code?").mode, (a) => a === "catalog");
expect("the site's own vocabulary is answered from documentation", routeAssistantIntent("What is the difference between installable and discovery-only?").mode, (a) => a === "knowledge");
expect("the prompt separates bridge setup from installing a capability", assistantSystemPrompt(), (a) => a.includes("catalog question, not a host setup question") && a.includes("exact install command"));
expect("product security questions use documentation RAG", routeAssistantIntent("Explain LiteSPM security and rollback").mode, (a) => a === "knowledge");
expect("catalog recommendations use catalog retrieval", routeAssistantIntent("Recommend PostgreSQL MCP servers for database administration").mode, (a) => a === "catalog");
expect("social acknowledgements do not trigger retrieval", routeAssistantIntent("Thanks!").mode, (a) => a === "conversation");

const followupHistory = [
  userTurn("What is LiteSPM?"),
  { role: "assistant", content: "LiteSPM is a local-first package manager." },
  userTurn("How does it handle rollback?"),
];
expect("contextual product follow-up uses documentation RAG", routeAssistantIntent("How does it handle rollback?", followupHistory).mode, (a) => a === "knowledge");
expect("assistant identifies itself as a general chatbot", assistantSystemPrompt(), (a) => a.includes("general-purpose chatbot") && !a.includes("steer gently back"));

// The guard must not read documented syntax as an invented package.
expect("the placeholder form is not a claim", claimedPackageIds("Run `litespm install <id>` to add it."), (a) => a.length === 0);
expect("install remove is not a claim", claimedPackageIds("Use `litespm install remove <installId>` to strip it."), (a) => a.length === 0);
expect("prose after the verb is not a claim", claimedPackageIds("Then run litespm install for the package you picked."), (a) => a.length === 0);
expect("a real id is a claim", claimedPackageIds("Run litespm install deepwiki-mcp."), (a) => a.length === 1 && a[0] === "deepwiki-mcp");

const route = readFileSync(path.join(webRoot, "src/app/api/litespm/assistant/route.ts"), "utf8");
if (!route.includes("routeAssistantIntent(lastUser.content, history)")) failures.push("assistant route does not use contextual intent routing");
if (!route.includes("executeAssistantTool(\"knowledge.search\"")) failures.push("assistant route does not call the documentation search tool");
if (!route.includes('executeAssistantTool("catalog.search"')) failures.push("assistant route does not call the catalog search tool");
if (!route.includes("assistantToolForQuestion(lastUser.content)")) failures.push("assistant route does not use the allowlisted host tools");
if (!route.includes("if (catalog)")) failures.push("assistant route does not preserve catalog grounding");
if (!route.includes("knowledgeCitations(knowledge)")) failures.push("assistant route does not return knowledge source citations");

// The public health route must distinguish real API keys from keyless SDK
// adapters and count unique provider/key pairs (not model routes) accurately.
const llmStatusRoute = readFileSync(path.join(webRoot, "src/app/api/litespm/llm/route.ts"), "utf8");
if (!llmStatusRoute.includes("keyIds.size") || !llmStatusRoute.includes("keylessAdapters.size") || !llmStatusRoute.includes("providers: status.order")) {
  failures.push("LLM health route: provider/key inventory is misleading or incomplete");
}

if (failures.length > 0) {
  console.error("Assistant product check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Assistant product check passed.");
