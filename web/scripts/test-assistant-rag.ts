import assert from "node:assert/strict";
import { routeAssistantIntent, assistantSystemPrompt } from "../src/server/litespm/assistant-orchestrator";
import { hasValidKnowledgeCitations, knowledgeCorpusStats, retrieveKnowledge } from "../src/server/litespm/assistant-knowledge";
import { ASSISTANT_FUNCTION_TOOLS, assistantToolForQuestion, executeAssistantFunction, executeAssistantTool, isHostSetupQuestion, isRemoteHostQuestion } from "../src/server/litespm/assistant-tools";
import { HOSTS } from "../src/server/litespm/hosts";
import { buildHostSetupAnswer, buildRemoteHostAnswer } from "../src/server/litespm/assistant-host-answers";
import { chatComplete, chatCompleteWithTools, resetLlmPool } from "../src/server/llm/gateway";
import { retrieveAssistant } from "../src/server/litespm/assistant-retrieval";
import { ensureInstallCommands, installCommandFor, llmFailureMessage, followUpSuggestions } from "../src/server/litespm/assistant-answer";
import { displayPackageName } from "../src/lib/litespm/format";
import { embedTexts } from "../src/server/litespm/assistant-embeddings";

const history = [
  { role: "user" as const, content: "What is LiteSPM?" },
  { role: "assistant" as const, content: "LiteSPM is a package manager." },
  { role: "user" as const, content: "How does it handle rollback?" },
];

assert.equal(routeAssistantIntent("Hi, who are you?").mode, "conversation");
assert.equal(routeAssistantIntent("hello").mode, "conversation");
assert.equal(routeAssistantIntent("Explain how vector databases work").mode, "conversation");
assert.equal(routeAssistantIntent("What is LiteSPM?").mode, "knowledge");
assert.equal(routeAssistantIntent("Explain LiteSPM's security and rollback model").mode, "knowledge");
assert.equal(routeAssistantIntent("Recommend PostgreSQL MCP servers for database administration").mode, "catalog");
assert.equal(routeAssistantIntent("How does it handle rollback?", history).mode, "knowledge");

const stats = knowledgeCorpusStats();
assert.ok(stats.chunks > 500, `expected a substantial docs corpus, got ${stats.chunks}`);
assert.ok(stats.sources >= 35, `expected broad canonical docs coverage, got ${stats.sources}`);
assert.equal(stats.embeddedChunks, 0, "local fallback corpus should not claim model embeddings");
assert.ok(!stats.sourcePaths.some((source) => source.startsWith("docs/") || source.includes("31-COMPETITIVE-LANDSCAPE")), "internal audits and roadmap notes must stay out of the production knowledge corpus");
assert.ok(!assistantSystemPrompt().includes("steer gently back"), "general chatbot prompt must not redirect every topic to the catalog");
assert.ok(assistantSystemPrompt().includes("general-purpose chatbot"), "assistant must identify as a general chatbot");
assert.ok(assistantSystemPrompt().includes("STATUS.md is the current implementation-status authority"), "assistant must distinguish shipped status from architecture targets");
assert.ok(assistantSystemPrompt().includes("Never expose internal delimiters"), "assistant must not leak internal retrieval/tool tags");
assert.equal(hasValidKnowledgeCitations("The release uses keyless Sigstore verification [S1].", 3), true);
assert.equal(hasValidKnowledgeCitations("The release uses a .sigstore.json file.", 3), false, "uncited knowledge answers must be withheld");
assert.equal(hasValidKnowledgeCitations("The release uses Sigstore [S4].", 3), false, "unknown citation identifiers must be rejected");

const rollback = await retrieveKnowledge("restore backup rollback install ledger");
assert.ok(rollback.length > 0, "rollback query should retrieve documentation");
assert.ok(!rollback.some((hit) => hit.source === "TODO.md" || hit.source.startsWith("docs/")), "planning and audit notes must not be treated as shipped product documentation");
assert.ok(rollback.some((hit) => /rollback|restore|backup|ledger/i.test(hit.text + " " + hit.section)),
  "retrieved evidence should discuss rollback, restore, backups or the ledger");

const hostSetupDocs = await retrieveKnowledge("LiteSPM host setup connect agent host list detect bridge registration command", 8);
assert.ok(hostSetupDocs.some((hit) => hit.source === "README.md" || hit.source === "npm/README.md"), "host setup retrieval must surface the current user-facing CLI instructions");
assert.ok(!hostSetupDocs.every((hit) => hit.source.startsWith("ARCH/")), "host setup retrieval must not rely only on architecture/roadmap documents");
const publicHostSetupDocs = hostSetupDocs.filter((hit) => ["README.md", "npm/README.md", "STATUS.md", "SECURITY.md"].includes(hit.source));
const openCodeDetail = await executeAssistantTool("hosts.inspect", { hostId: "opencode" });
const openCodeSetupAnswer = buildHostSetupAnswer(openCodeDetail, publicHostSetupDocs);
assert.ok(openCodeSetupAnswer?.includes("litespm host setup opencode"), "OpenCode setup answer must provide the actual host setup command");
assert.ok(openCodeSetupAnswer?.includes("mcp.servers"), "OpenCode setup answer must use the registry config key");
assert.ok(openCodeSetupAnswer?.includes("opencode.json"), "OpenCode setup answer must use the registry config path");
assert.ok(openCodeSetupAnswer?.toLowerCase().includes("registry default home-relative config path"), "registry paths must be labelled as defaults, not resolved per-machine paths");
assert.ok(openCodeSetupAnswer?.includes("resolves the actual config file"), "setup answer must defer final path resolution to the host adapter");
assert.ok(!openCodeSetupAnswer?.includes("streamable-http"), "host setup answer must not confuse remote MCP transports with the local LiteSPM bridge");
assert.ok(/\[S\d+\]/.test(openCodeSetupAnswer ?? ""), "host setup instructions must cite current user-facing documentation");

const security = await retrieveKnowledge("security policy signatures trust roots provenance");
assert.ok(security.length > 0, "security query should retrieve documentation");

const retrievalEvaluation = [
  { query: "MCP host configuration paths and supported agent adapters", expected: "ARCH/30-DATA-DRIVEN-BRIDGE-TARGETS.md" },
  { query: "security policy signatures trust roots provenance", expected: "ARCH/05-SECURITY.md" },
  { query: "npm package install usage and uninstall cleanup", expected: "npm/README.md" },
  { query: "CLI command surface litespm init list search install remove update verify doctor", expected: "ARCH/38-CLI-PRODUCT-SURFACE.md" },
  { query: "release bundle signatures cosign self update verification", expected: "ARCH/22-PLATFORM-RELEASE-MIGRATIONS.md" },
  { query: "What is the difference between installable and discovery-only?", expected: "site/faq.md" },
  { query: "How are listings ranked and what is the LiteSPM score?", expected: "site/faq.md" },
  { query: "Why does litespm say it needs an interactive terminal?", expected: "site/faq.md" },
];
let reciprocalRankSum = 0;
for (const testCase of retrievalEvaluation) {
  const hits = await retrieveKnowledge(testCase.query, 8);
  const rank = hits.findIndex((hit) => hit.source === testCase.expected);
  assert.ok(rank >= 0, `retrieval evaluation missed ${testCase.expected} for query: ${testCase.query}`);
  reciprocalRankSum += 1 / (rank + 1);
}
const retrievalMrr = reciprocalRankSum / retrievalEvaluation.length;
assert.ok(retrievalMrr >= 0.733, `retrieval MRR regressed below the 0.733 baseline: ${retrievalMrr.toFixed(3)}`);
assert.ok(retrievalMrr >= 0.2, `retrieval MRR too low: ${retrievalMrr.toFixed(3)}`);

assert.equal(assistantToolForQuestion("What hosts does LiteSPM support?")?.name, "hosts.list");
assert.equal(assistantToolForQuestion("Which MCP hosts does LiteSPM support?")?.name, "hosts.list", "MCP host capability questions must use the host registry, not package search");
assert.equal(assistantToolForQuestion("Show me the Claude Code CLI host configuration")?.name, "hosts.inspect");
assert.equal(assistantToolForQuestion("Which agent hosts support remote MCP URLs?")?.name, "hosts.list", "remote MCP support questions must use the host registry");
assert.equal(assistantToolForQuestion("Which hosts support Streamable HTTP?")?.name, "hosts.list");
assert.equal(assistantToolForQuestion("How do I install LiteSPM into OpenCode and register its MCP bridge?")?.name, "hosts.inspect");
assert.equal(assistantToolForQuestion("Connect LiteSPM to Codex")?.name, "hosts.inspect");
assert.equal(assistantToolForQuestion("Set up Claude Code for LiteSPM")?.name, "hosts.inspect");
assert.equal(assistantToolForQuestion("How do I connect Cline?")?.name, "hosts.inspect", "supported host aliases should resolve even when display names contain suffixes");
assert.equal(assistantToolForQuestion("How do I configure Zed for LiteSPM?")?.name, "hosts.inspect");
for (const host of HOSTS) {
  assert.equal(assistantToolForQuestion(`How do I connect ${host.name}?`)?.name, "hosts.inspect", `host setup routing must resolve ${host.id}`);
}
assert.equal(assistantToolForQuestion("How do I configure an agent?"), null, "generic agent questions must not invent a host selection");
assert.equal(isHostSetupQuestion("How do I install LiteSPM into OpenCode and register its MCP bridge?"), true);
assert.equal(isHostSetupQuestion("Which agent hosts support remote MCP URLs?"), false);
assert.equal(isRemoteHostQuestion("Which agent hosts support remote MCP URLs?"), true);
assert.equal(isRemoteHostQuestion("How do I install LiteSPM into OpenCode?"), false);
const hostList = await executeAssistantTool("hosts.list", {});
assert.equal(hostList.ok, true);
assert.ok((hostList.data as { counts: { mcpHosts: number } }).counts.mcpHosts >= 40, "host registry tool should return the full host inventory");
const hostInventory = hostList.data as { mcpHosts: Array<{ id: string; remote: boolean; remoteTransports: string[] }>; remoteSummary: { supportedCount: number; localOnlyCount: number; supportedHostIds: string[]; localOnlyHostIds: string[] } };
const hostRows = hostInventory.mcpHosts;
assert.equal(hostInventory.remoteSummary.supportedCount + hostInventory.remoteSummary.localOnlyCount, hostRows.length, "remote/local-only host totals must account for the full registry");
assert.equal(hostInventory.remoteSummary.supportedCount, hostRows.filter((host) => host.remote).length, "remote host summary must be derived from registry rows");
assert.deepEqual(hostInventory.remoteSummary.localOnlyHostIds.sort(), hostRows.filter((host) => !host.remote).map((host) => host.id).sort());
const remoteAnswer = buildRemoteHostAnswer(hostList);
assert.ok(remoteAnswer?.includes(`${hostInventory.remoteSummary.supportedCount} of ${hostRows.length} supported MCP hosts`), "remote host answer must use registry-derived counts");
assert.ok(remoteAnswer?.includes("Local-only:"), "remote host answer must identify local-only adapters");
assert.ok(remoteAnswer?.includes("Streamable HTTP") || remoteAnswer?.includes("streamable-http"), "remote host answer must include registry transport names");
assert.ok(hostRows.every((host) => Array.isArray(host.remoteTransports)), "host list must include exact remote transport support");
assert.ok(hostRows.some((host) => host.id === "opencode" && host.remote && host.remoteTransports.includes("streamable-http")), "OpenCode registry transport must be exposed");
assert.ok(hostRows.some((host) => host.id === "claude-code" && host.remoteTransports.includes("sse") && host.remoteTransports.includes("streamable-http")), "Claude Code registry transports must be exposed");
const hostDetail = await executeAssistantTool("hosts.inspect", { hostId: "claude-code" });
assert.equal(hostDetail.ok, true, "known host inspection should succeed");
const unknownHost = await executeAssistantTool("hosts.inspect", { hostId: "not-a-real-host" });
assert.equal(unknownHost.ok, false, "unknown host inspection must fail closed");
assert.equal((await executeAssistantFunction("list_supported_hosts", {})).ok, true);
assert.equal(ASSISTANT_FUNCTION_TOOLS.length, 4, "only four allowlisted read-only functions should be exposed");
const invalidSearch = await executeAssistantTool("catalog.search", { query: " " });
assert.equal(invalidSearch.ok, false, "tool arguments must be validated");

// Exercise the actual OpenAI-compatible function-call path using a mocked
// provider response. This verifies the gateway never executes arbitrary code.
const llmKeys = ["LLM_PROVIDER_ORDER", "GROQ_API_KEY", "GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_MODELS"];
const savedKeys = new Map(llmKeys.map((key) => [key, process.env[key]]));
const originalFetchForTools = globalThis.fetch;
try {
  for (const key of llmKeys) delete process.env[key];
  process.env.LLM_PROVIDER_ORDER = "groq";
  process.env.GROQ_API_KEY = "unit-test-key";
  process.env.GROQ_MODELS = "test-tool-model";
  resetLlmPool();
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: null, tool_calls: [{ id: "call_test", function: { name: "list_supported_hosts", arguments: "{}" } }] } }],
  }), { status: 200 })) as typeof fetch;
  const toolCall = await chatCompleteWithTools({
    system: "Use one read-only function.",
    messages: [{ role: "user", content: "List all supported hosts." }],
    tools: ASSISTANT_FUNCTION_TOOLS,
    toolChoice: "required",
  });
  assert.equal(toolCall.ok, true, "tool-capable gateway call should succeed");
  assert.equal(toolCall.ok && toolCall.toolCalls?.[0]?.name, "list_supported_hosts");
} finally {
  globalThis.fetch = originalFetchForTools;
  for (const key of llmKeys) {
    const value = savedKeys.get(key);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  resetLlmPool();
}
// Exercise the optional embeddings client with a fake provider response. No
// real API key or network request is needed for this test.
const previousFetch = globalThis.fetch;
const previousEmbeddingKey = process.env.EMBEDDING_API_KEY;
try {
  process.env.EMBEDDING_API_KEY = "unit-test-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.25, 0.5, 0.75] }] }), { status: 200 })) as typeof fetch;
  const vectors = await embedTexts(["semantic test query"]);
  assert.deepEqual(vectors, [[0.25, 0.5, 0.75]], "embedding adapter should return the provider vector");
} finally {
  globalThis.fetch = previousFetch;
  if (previousEmbeddingKey === undefined) delete process.env.EMBEDDING_API_KEY;
  else process.env.EMBEDDING_API_KEY = previousEmbeddingKey;
}


// ---------------------------------------------------------------------------
// Regression: routing decisions (no LLM involved)
// ---------------------------------------------------------------------------
// 1. "Install <named capability> into <agent>" is a CATALOG question. It used to
//    hit the host-setup shortcut, which answered "this does not install a
//    separate third-party MCP package" - the opposite of the question.
const installIntoAgent = [
  "How do I install a postgres MCP server into Claude Code?",
  "Install the GitHub MCP server in Cursor",
  "add playwright to cline",
  "I want a skill for pdf in codex",
  "Install a plugin into OpenCode",
];
for (const question of installIntoAgent) {
  assert.equal(isHostSetupQuestion(question), false, `host-setup shortcut must not fire for: ${question}`);
  assert.equal(assistantToolForQuestion(question), null, `host registry tool must not be selected for: ${question}`);
  assert.equal(routeAssistantIntent(question).mode, "catalog", `must route to catalog search: ${question}`);
}
// ...while genuine "connect LiteSPM to <agent>" questions keep the shortcut.
for (const question of [
  "Connect LiteSPM to Claude Code",
  "How do I set up Claude Code with LiteSPM?",
  "How do I install LiteSPM into OpenCode and register its MCP bridge?",
  "How do I connect LiteSPM's MCP bridge to Cursor?",
  "How do I connect GitHub Copilot CLI?",
]) {
  assert.equal(isHostSetupQuestion(question), true, `genuine bridge setup must still be a host-setup question: ${question}`);
}
// 2. Definitions of the site's own vocabulary route to documentation, never to general knowledge.
for (const question of [
  "What is the difference between installable and discovery-only?",
  "What does Discovery only mean?",
  "How are listings ranked?",
  "What is the LiteSPM score?",
]) {
  const routed = routeAssistantIntent(question);
  assert.equal(routed.mode, "knowledge", `site vocabulary must be answered from the docs: ${question}`);
}
assert.ok(assistantSystemPrompt().includes("I don't know") || assistantSystemPrompt().includes("doesn't say"), "prompt must prefer admitting a gap over inventing");
assert.ok(assistantSystemPrompt().includes("Installing a capability"), "prompt must carry the install-recommendation rules");

// ---------------------------------------------------------------------------
// Regression: the FAQ / methodology text is in the corpus and retrievable
// ---------------------------------------------------------------------------
assert.ok(knowledgeCorpusStats().sourcePaths.includes("site/faq.md"), "FAQ and methodology text must be part of the knowledge corpus");
for (const question of [
  "What is the difference between installable and discovery-only?",
  "Why are some packages marked Installable while others are Discovery-Only?",
  "How are listings ranked? What is the LiteSPM score?",
]) {
  const hits = await retrieveKnowledge(question, 7);
  assert.ok(hits.slice(0, 3).some((hit) => hit.source === "site/faq.md"), `site/faq.md must rank in the top 3 for: ${question}`);
}
const definition = (await retrieveKnowledge("What is the difference between installable and discovery-only?", 3))
  .map((hit) => hit.text).join("\n");
assert.ok(/verified source or launch line|install plan/i.test(definition), "retrieved evidence must carry the real definition");

// ---------------------------------------------------------------------------
// Regression: catalog recommendations follow the site's ordering
// ---------------------------------------------------------------------------
const browser = await retrieveAssistant("Recommend an MCP server for browser testing");
assert.ok(browser.hits.length >= 3, "browser testing must find catalog rows");
assert.ok(browser.hits.slice(0, 3).some((hit) => hit.installable && (hit.rankScore ?? 0) >= 60),
  "a high-ranked installable server (Playwright, Browserbase) must appear in the top 3");
assert.ok((browser.hits[0]?.rankScore ?? 0) >= 40, `an obscure low-rank row must not lead (got ${browser.hits[0]?.name} @ ${browser.hits[0]?.rankScore})`);
assert.ok(browser.hits.slice(0, 4).every((hit) => hit.installable), "installable rows lead the recommendation");

const postgres = await retrieveAssistant("How do I install a postgres MCP server into Claude Code?");
assert.equal(postgres.intent.host, "claude-code");
assert.ok(!postgres.queries.some((q) => /claude/i.test(q)), `host names must not become search terms: ${postgres.queries.join(" | ")}`);
assert.ok(postgres.hits.length >= 3 && postgres.hits.slice(0, 3).every((hit) => /postgres|neon|sql/i.test(`${hit.name} ${hit.summary}`)), "postgres install must retrieve postgres servers");
assert.ok(postgres.hits.slice(0, 4).some((hit) => (hit.rankScore ?? 0) >= 50), "a vendor-grade postgres server must be near the top");
const top = postgres.hits[0]!;
assert.equal(installCommandFor(top, "claude-code"), `litespm install ${top.id} --agent claude-code`);
assert.ok(!/^io\.github\./i.test(displayPackageName("io.github.hubertgajewski/playwright-report-mcp")), "display names must drop registry namespaces");
assert.equal(installCommandFor({ id: "x:y", linkKey: "y", name: "y", installable: false }, "cursor"), null, "discovery-only rows have no install command");

// The deterministic backstop adds the exact command for a package the answer names but forgot to command.
const sample = postgres.hits.slice(0, 2);
const named = ensureInstallCommands(`Try ${displayPackageName(sample[0]!.name)} first.`, sample, "claude-code");
assert.ok(named.includes(`litespm install ${sample[0]!.id} --agent claude-code`), "install command must be appended");
assert.ok(named.includes(`#/package/${encodeURIComponent(sample[0]!.linkKey)}`), "details link must be appended");
assert.equal(ensureInstallCommands("No packages mentioned here.", sample, "claude-code"), "No packages mentioned here.");
assert.equal(ensureInstallCommands(named, sample, "claude-code"), named, "backstop is idempotent");
assert.ok(followUpSuggestions("catalog", sample, "Claude Code CLI").length >= 2 && followUpSuggestions("catalog", sample).length <= 3, "follow-up chips: 2-3 questions");
assert.deepEqual(followUpSuggestions("conversation", []), []);

// ---------------------------------------------------------------------------
// Regression: gateway fails over across keys; friendly retry on rate limits
// ---------------------------------------------------------------------------
{
  const keys = ["LLM_PROVIDER_ORDER", "GROQ_API_KEY", "GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_MODELS"];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  const realFetch = globalThis.fetch;
  const resetHealth = () => { delete (globalThis as { __litespmLlmHealth?: unknown }).__litespmLlmHealth; resetLlmPool(); };
  try {
    for (const key of keys) delete process.env[key];
    process.env.LLM_PROVIDER_ORDER = "groq";
    process.env.GROQ_API_KEY_1 = "unit-key-1";
    process.env.GROQ_API_KEY_2 = "unit-key-2";
    process.env.GROQ_API_KEY_3 = "unit-key-3";
    process.env.GROQ_MODELS = "model-a";
    const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }] }), { status: 200 });

    // Keys 1 and 2 are rate limited; key 3 answers. The request must succeed.
    resetHealth();
    const seen: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      seen.push(auth);
      return auth.endsWith("unit-key-3") ? ok() : new Response("{}", { status: 429, headers: { "retry-after": "7" } });
    }) as typeof fetch;
    const failover = await chatComplete({ system: "s", messages: [{ role: "user", content: "ping" }] });
    assert.equal(failover.ok, true, "a 429 on two keys must fail over to the third");
    assert.ok(new Set(seen).size >= 1 && seen[seen.length - 1]!.endsWith("unit-key-3"));

    // Every key rate limited: a retry time is reported (it used to be 0 -> "could not reach any provider").
    resetHealth();
    globalThis.fetch = (async () => new Response("{}", { status: 429, headers: { "retry-after": "7" } })) as typeof fetch;
    const exhausted = await chatComplete({ system: "s", messages: [{ role: "user", content: "ping" }] });
    assert.equal(exhausted.ok, false);
    assert.ok(!exhausted.ok && exhausted.retryInMs > 0, "fresh 429s on every key must produce a retry time");
    const friendly = llmFailureMessage(exhausted as { retryInMs: number; attempts: Array<{ outcome: string }> });
    assert.ok(/busy|rate limited/i.test(friendly.message) && /\d+s/.test(friendly.message), `friendly retry message expected, got: ${friendly.message}`);
    assert.equal(friendly.retryable, true);

    // Cooldown is per model: a 429 for model-a must not block model-b on the same key.
    process.env.GROQ_MODELS = "model-a,model-b";
    process.env.GROQ_API_KEY_2 = "";
    process.env.GROQ_API_KEY_3 = "";
    resetHealth();
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      return body.model === "model-a" ? new Response("{}", { status: 429 }) : ok();
    }) as typeof fetch;
    const perModel = await chatComplete({ system: "s", messages: [{ role: "user", content: "ping" }] });
    assert.equal(perModel.ok, true, "a rate-limited model must not take the key's other models down with it");
  } finally {
    globalThis.fetch = realFetch;
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete (globalThis as { __litespmLlmHealth?: unknown }).__litespmLlmHealth;
    resetLlmPool();
  }
}
console.log(JSON.stringify({
  status: "passed",
  corpus: stats,
  intentCases: 7 + installIntoAgent.length + 9,
  retrievalCases: retrievalEvaluation.length + 2,
  retrievalMrr: Number(retrievalMrr.toFixed(3)),
  toolCases: 11,
  embeddingCases: 1,
  topRollbackSources: rollback.slice(0, 3).map((hit) => hit.source + ":" + hit.section),
}, null, 2));
