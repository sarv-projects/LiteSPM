# Ask AI: Conversational Assistant, Hybrid RAG and Tool Runtime

Status: implementation in progress  
Scope: LiteSPM web Ask AI experience and its server-side orchestration.

## Product contract

Ask AI is a general-purpose conversational assistant embedded in LiteSPM. It is not a catalog-only chatbot. It must answer greetings, identity questions, general explanations and contextual follow-ups without triggering catalog retrieval. LiteSPM product knowledge and catalog discovery are capabilities selected when relevant.

The assistant must distinguish:
- General model knowledge and reasoning.
- Facts retrieved from canonical LiteSPM documentation.
- Structured facts returned by the live package catalog.
- Facts returned by allowlisted host-registry functions.

It must not claim to install a package or modify a local agent configuration from the website.

## Request orchestration

The assistant API route validates and rate-limits requests, retains up to 20 recent turns, classifies the latest user turn, selects relevant retrieval/tools, builds a grounded prompt and streams the final answer.

Intent modes:
- conversation: no retrieval by default; normal chatbot response.
- knowledge: retrieve LiteSPM documentation and attach source IDs.
- catalog: retrieve package listings and attach exact package citations.

Follow-up classification uses prior user turns. A short follow-up should retain the prior product/catalog subject when the current message is underspecified.

## Documentation ingestion and RAG

The assistant knowledge build script runs before the web build and type-check. It reads the root README, SECURITY, STATUS, npm README and canonical ARCH markdown files, excluding the competitive roadmap and internal audit, plan and proposal notes. This prevents unshipped proposals and old review findings from being presented as current product behaviour. It splits documents by headings and paragraphs into bounded chunks with source path, section, line range, token list and a local feature vector.

The generated artifact is web/src/server/litespm/generated/assistant-knowledge.json.

Retrieval combines:
- BM25 scoring with inverse document frequency, document-length normalization and title/section boosts.
- Dense feature-vector cosine similarity as a local baseline.
- A deterministic heading/source reranking pass that prioritizes exact section matches and authoritative project sources; this is not a cross-encoder reranker.
- A bounded top-k evidence set with source metadata.

### Optional semantic embeddings

The repository includes an OpenAI-compatible embeddings adapter. To enable true model embeddings, configure the same values in the build and runtime environments:

- EMBEDDING_API_KEY
- EMBEDDING_BASE_URL (default https://api.openai.com/v1)
- EMBEDDING_MODEL (default text-embedding-3-small)

The build script embeds every documentation chunk in batches. Runtime query embeddings use the same provider/model and are compared only with document vectors from that same space. If no key is configured or the provider is unavailable, retrieval safely falls back to lexical plus local feature-vector scoring.

The current local environment has no embedding-provider credential. Therefore local tests exercise the fallback and mock the embedding API contract; they do not claim that production semantic embeddings are active.

## Catalog retrieval

The existing assistant retrieval and catalog search pipeline remain intact. Catalog results are only fetched for catalog intent. The final answer is checked against retrieved listing IDs; package claims not present in the evidence are replaced with verified matches.

Catalog package cards continue to use exact linkKey values returned by retrieval.

## Function tools

The assistant tool registry is the only tool registry exposed to the assistant. It supports:
- search_catalog
- search_documentation
- list_supported_hosts
- inspect_host

The OpenAI-compatible gateway can request function calls. The route validates JSON arguments, maps names through the explicit allowlist and executes only these read-only functions. Unknown function names, malformed arguments and unknown host IDs fail closed.

No shell, filesystem, arbitrary URL fetch, install, config-write or credential-access tool is exposed to the public chat route. A deterministic host-registry selection remains as a fallback if a provider does not return a valid tool call.

## Conversation history and memory

The chat UI sends recent turns to the server. Optional Memory on stores up to 50 completed messages in browser local storage on the current device. It is opt-in, can be turned off, and has a clear-history action. The server does not persist personal conversation memory or sync it across devices.

## Embedded UI objects

The chat UI supports:
- Existing catalog package cards and comparison matrices.
- Documentation source chips with source path and line ranges.
- metric_cards for grounded values.
- steps for procedural explanations.
- checklist with local interactive checkboxes and progress.
- timeline for ordered events.
- host_cards for verified host-registry entries.

Structured objects are rendered only when the model emits valid supported JSON. Inputs are type-checked and bounded before rendering. Framer Motion animates entry, stagger and checklist progress; reduced-motion preferences should be respected by any future animation additions.

## Evaluation and checks

Run from the web directory:

- npm run predev — rebuild the documentation corpus before local development.\n- npm run pretype-check — rebuild the documentation corpus before type-checking.
- npm run test:assistant — intent routing, five-source retrieval evaluation with MRR, corpus exclusions, tool validation, mocked embeddings and mocked function-calling gateway.
- node scripts/check-assistant-product.mjs — routing and gateway regression gate.
- npm run type-check — Prisma generation and TypeScript.
- npm run lint — ESLint and repository truth/security checks.
- npm run build — corpus generation, Prisma generation and Next.js production build.

The corpus and embedding tests are deterministic. Live provider integration and end-to-end browser rendering must also be checked in a deployed or locally running web server before release.

## Known limitations / release gates

1. The current environment does not contain EMBEDDING_API_KEY; semantic document vectors are not active until a provider is configured at both build and runtime.
2. Local browser history is device-local, opt-in and not server-side account memory.
3. The web assistant exposes read-only tools only. Actual local installation remains a CLI/agent-host operation with LiteSPM's existing preview, backup, approval and ledger safety controls.
4. Before release, validate the real provider's tool-call behavior, streaming, cancellation, citations, catalog grounding and mobile/desktop UI.

## Deferred follow-up work (not part of the current audit pass)

The following are explicitly deferred. Do not describe them as implemented or release-ready until their acceptance criteria and tests pass.

### True semantic retrieval

- Select and configure a real embedding provider/model for both corpus ingestion and runtime query embedding; do not call deterministic local feature vectors semantic embeddings.
- Rebuild and version the corpus with model/dimension metadata, provider failure handling, batching, caching and bounded retries. Never compare vectors from different embedding spaces.
- Evaluate lexical + semantic retrieval (and any reranker) against a materially larger, human-reviewed gold query set. Report Recall@k, MRR/nDCG, latency and cost against the existing lexical + feature-vector baseline before enabling it by default.
- Preserve lexical retrieval as a deterministic fallback. No embedding API key or paid provider is assumed to be available.

### Bounded multi-step tool orchestration

- Replace the current one-selection/one-execution path only after designing a bounded agent loop with a strict read-only allowlist for the public Ask AI endpoint.
- Require schema validation for every call, a small explicit maximum number of tool rounds, per-call and overall timeouts, cancellation propagation, output-size limits, duplicate-call protection and deterministic failure handling.
- Preserve evidence provenance: final answers must distinguish catalog, documentation and registry results, and must not claim an action occurred unless a permitted executor confirms it.
- Add adversarial tests for malformed arguments, unexpected tool names, loops, provider errors, partial results, cancellation, prompt injection in retrieved content and citation/claim grounding. Do not expose install, shell, filesystem, credential or config-write operations to public Ask AI as part of this work.

### Native in-agent marketplace UI across hosts

- The portable MCP `prompts/list` + `prompts/get` implementation publishes a text prompt named `marketplace`; it does **not** create a native slash-command popup, interactive panel or live search UI in every MCP client. The bridge source explicitly states this limitation.
- Pi Agent has a separate companion extension that registers a native `/marketplace` command and custom terminal panel. Treat this as Pi-specific, not proof of cross-host UI support.
- To meet the intended product contract, investigate and implement host-native command/extension integrations where each host supports them. The desired experience is a popup/panel inside the coding agent with a search bar and distinct **Skills**, **Plugins**, **MCPs**, and **Installed** tabs, with working search, details, install/remove flows and host-specific refresh/restart guidance.
- Where a host has no supported native UI extension API, state the limitation honestly and provide a documented fallback; do not label an MCP prompt as an interactive popup.
- Acceptance is per host: install the bridge into a clean sandbox host configuration, restart/reload that host, invoke `/marketplace`, verify the actual rendered UI and keyboard/mouse behavior, search each kind, inspect Installed, and exercise safe install/remove flows. A synthetic MCP handshake test alone is insufficient.

## Audit observations — 2026-11-08

- A local `npm install -g litespm@0.6.0 --force` completed and the npm package test suite verified the published Windows release binary and its Sigstore bundle, including tamper-refusal cases. This verifies installer integrity for that published release; it does not prove compatibility with every existing local state database.
- The installed published `v0.6.0` binary refused the existing local state database because the database is schema v5 while that binary supports only v4. `litespm doctor` failed the database check and `litespm list` refused to migrate backwards. No repair, reset or destructive migration was run.
- The current checkout source supports schema v5: `go run ./cmd/litespm doctor` passed SQLite integrity and reported no database failure. This isolates the observed mismatch to the installed published binary versus the newer local source/database, rather than evidence of a corrupt database.
- The checkout source contains and dispatches `litespm marketplace`; the installed published v0.6.0 binary reports `Unknown command: marketplace`. The local source command opens the web marketplace in the system browser; it is not an in-agent popup.
- The web marketplace route `/marketplace` and its four web tabs are separate from the in-agent command. The live website audit exercised Skills, Plugins, MCP Servers and Installed tabs and searched PostgreSQL successfully.
- The web Ask AI local endpoint was tested with greetings, product/architecture questions, OpenCode installation guidance, host support, PostgreSQL recommendations and uninstall behavior. Some responses were materially unreliable: a host-support answer returned a short fabricated host subset and incorrect remote-transport claims despite the registry being available; one OpenCode setup answer suggested a questionable config path/command; a security answer presented architecture/lockfile features as if they were the npm installer verification flow. These are correctness defects to address before calling Ask AI production-ready.
- The live deployed website's greeting test triggered catalog search for the word `hi` and showed irrelevant listings. This differs from the local checkout's greeting response and indicates production/local behavior drift or a routing defect in the deployed build. Re-test after the next approved deployment.
- Local HTTP route smoke tests returned 200 for `/`, `/marketplace`, `/explore`, `/agents`, all nine documented docs sections, `/insights`, `/compare`, `/publish`, and a nonexistent package route. The catch-all route renders the app shell for unknown paths, so an HTTP 200 alone does not prove a meaningful not-found state. Browser-level interaction and content checks remain necessary.
- The landing hero currently uses a pulsing ambient glow, staggered entrance transitions, count-up statistics and a terminal-style visual. Animation refinement should prioritize purposeful terminal progression and subtle capability-flow motion, while respecting reduced-motion preferences and avoiding distracting perpetual motion. This is a design follow-up, not an assertion that the live hero currently lacks all animation.
- Additional local Ask AI probes reproduced two further failures: “Which agent hosts support remote MCP URLs?” answered that no host was confirmed because it searched unrelated catalog rows instead of using the host registry; “What is the exact command to install LiteSPM into OpenCode and register its MCP bridge?” declined to provide a command even though the repository contains the host setup and bridge commands. The targeted npm-installer verification question did produce a detailed, source-cited Sigstore answer. This confirms intent routing and source selection are inconsistent across closely related product questions.
- The live deployed-site browser run completed navigation through Marketplace, Explore, Agents, Docs, Insights, Compare and Publish. It exercised all four Marketplace tabs and a PostgreSQL search. It completed four Ask AI questions; the fifth was not captured because the browser navigated away during the final question. Do not report all five as passed.

## Remediation pass — 2026-11-08

### Release compatibility remediation

- Bumped the npm wrapper version and lockfile root/package version together from 0.6.0 to **0.6.1**. This is a local release candidate only; no Git tag, GitHub release, npm publish, commit or push was created.
- Added an early release-workflow gate that verifies the release tag, npm package version and npm lockfile version agree **before** binary compilation and before creating a GitHub Release. The workflow already compiles binaries from the exact tagged source commit and runs the complete Go test suite; this ensures the published binary's migration set and CLI surface come from that same release source.
- Built a separate Windows amd64 candidate from the current source with version 0.6.1. Against the existing user state database (schema v5), it reported version v0.6.1, litespm doctor passed SQLite integrity with 8 passes, 2 expected warnings and 0 failures, litespm list --json returned 23 deployments, litespm host list returned 52 adapters, and litespm marketplace --no-open worked.
- The existing globally installed v0.6.0 binary was left untouched. The v0.6.1 candidate was built in the OS temp directory, not installed over it.
- Before the next release is published, the v0.6.1 source must be committed and tagged, and the release workflow must complete its signed GitHub release, npm installer integration tests and npm publication. Until then, npm users remain on v0.6.0.
- Hardened the release workflow's npm test step: it sets `LITESPM_TEST_REQUIRE_RELEASE=1`. In that mode, failure to fetch the exact tag's binary, checksum manifest or Sigstore bundle is a hard test failure, not a skip. Ordinary local pre-release `npm test` remains allowed to skip because the release assets do not exist yet.
- Verified the new gate locally: normal `npm test` passed with three environment-dependent skips; strict mode failed as expected with HTTP 404 because v0.6.1 has not been published. This confirms the release job will not silently publish npm without reachable v0.6.1 assets.
- Current registry check still reports `litespm@0.6.0`; no v0.6.1 GitHub release/tag or npm publication has been created. Local `npm whoami` returned `ENEEDAUTH`. The GitHub Actions `NPM_TOKEN` secret is not readable through the available connection, so its presence remains unverified; it must exist before the official npm publish step can succeed. Do not enable `ALLOW_NPM_SKIP` for an official npm release.
- A fresh local `go test -p 1 ./...` run was stopped after more than two minutes without package output and sustained CPU use, to avoid leaving a heavy process on the development laptop. It is **not** recorded as passed; the release workflow's full Go suite must complete successfully on GitHub Actions.
- The checkout still contains a broad uncommitted working set (92 changed files in the observed status). No commit, tag, push or publication was performed in this pass. Preserve existing edits and do not stage the entire tree indiscriminately when preparing the release commit.

### Ask AI host registry and setup remediation

- Host routing is deterministic and takes precedence over catalog intent classification. The LLM is no longer asked to select or parameterize host registry lookups.
- The host inventory tool now returns all 52 host adapters with exact registry fields: config format, MCP key path, entry shape, home-relative config path, project-scope support, project path, supported OS values, remote URL support, and exact remote transports.
- The registry currently reports **47/52** remote-URL-capable hosts and five local-only hosts. Ask AI computes these counts and transport groups from registry rows rather than memorizing a static number.
- Setup-question detection resolves all 52 canonical host names and aliases to the correct adapter. Tests cover all host names, OpenCode, Cline, Codex, Claude Code and Zed, while refusing to guess a host for a generic question.
- Host setup questions retrieve only current user-facing README/npm documentation, not ARCH design/roadmap sections. The response is assembled deterministically from the selected host adapter and cited CLI docs. It provides litespm host setup <host-id>, the equivalent litespm setup --agent <host-id>, the registry's config format/key/home-relative path and litespm host detect verification.
- Setup answers intentionally omit remote transport fields. Remote URL support describes the host's ability to accept URL-based third-party MCP entries; it must not be confused with LiteSPM's own local bridge registration.
- Remote-host capability questions receive a deterministic registry-derived answer grouped by exact transport, with local-only hosts listed separately. They no longer search catalog listings or ask the LLM to infer host support.
- Live local dev-server checks passed for remote host support, OpenCode bridge setup and Cline bridge setup. The streaming API path returned status, sources, a deterministic answer delta and a done event for the OpenCode setup question.
- Assistant regression tests now cover all 52 host-name setup routes, exact remote transport data, derived remote/local-only totals, deterministic host setup answers, current-doc citations and the prohibition on mixing remote transports into LiteSPM bridge setup instructions.
