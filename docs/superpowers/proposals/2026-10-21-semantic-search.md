# Semantic search on the catalog site — the free options, sized

> **Status:** proposal, 2026-10-21. Nothing here is implemented. The site is a
> Next.js static export (`web/next.config.ts` `output: "export"`), so "semantic
> search" either runs **in the browser** or needs a backend the project does not
> have. Everything below is priced in bytes and milliseconds, against this
> repository's real numbers and its standing rules: no invented popularity, no
> compatibility claim the catalog cannot support, no passive-visit fetch, and no
> regression of the ~107 kB First Load JS baseline.

## 0. Where search stands today, measured

| Fact | Value | Where |
|---|---|---|
| Rows | 69,376 (638 plugins, rest MCP + skills) | `web/data/catalog.json` |
| First search payload | 2.80 MiB gzip, 0 long tasks | postings index + 68-row display shards, `web/lib/searchFormat.mjs` |
| Filter path payload | ~5 MiB gzip (whole display projection) | `web/lib/catalogData.ts` `fetchDisplayRows` |
| Query engine | lexical postings (BM25-style), no stemming beyond the index's own normalisation | `web/lib/searchFormat.mjs` |
| Cost of a query | one pass over the postings list, <10 ms warm | measured 2026-10-19 |

Lexical search answers "postgres", "pdf", "kubernetes". It does not answer
"send mail from my agent" (the row may say *SMTP*), "keep notes in one place"
(*knowledge base*), or "make my screenshots prettier" (*image upscaling*).
That is the gap semantic search closes, and it is the gap a *discovery* site is
judged on.

## 1. The constraint that decides everything

The catalog is published as immutable, CDN-cached files and the site is
exported statically. Therefore:

* a hosted vector index (Qdrant Cloud free 1 GB, Pinecone Starter 2 GB, Upstash,
  Turbopuffer, …) **cannot be queried from the page without shipping a key or
  adding a server**. A key in a static bundle is a public key, and a proxy is a
  backend with its own bill and outage surface. Reject for now; revisit only if
  the project ever accepts a tiny Worker proxy.
* the document vectors must be a **static artifact**, versioned with the release
  (the site already does this for `catalog-*.json` with `?v=<datasetDigest>`).
* the **query** must be embedded in the browser, from the query text alone.

That leaves one family: a build-time embedding pass plus client-side query
embedding and brute-force scoring.

## 2. Sizing the artifact (this is the whole argument)

69,376 rows, and a row's searchable text is its name + summary + category
(~30 tokens on average).

| Encoding | Bytes/row | Total | Note |
|---|---|---|---|
| float32, 384 dims | 1,536 | **106 MB** | never shipping this |
| int8, 384 dims | 384 | 26.6 MB | 4× smaller, ~99.99% of the quality (Cohere's measurement) |
| binary, 384 dims | 48 | **3.3 MB** | 32× smaller, 1 bit/dim, needs int8 rescoring |
| int8, 256 dims | 256 | 17.8 MB | Matryoshka truncation or a 256-dim model |
| binary, 256 dims | 32 | **2.2 MB** | the smallest defensible artifact |

Standard recipe (Qdrant, Weaviate, Hugging Face all document it): **binary for
recall over the whole set, int8 (or float32) for rescoring the top ~256**.
Hamming distance over 69,376 × 32 bytes is ~2.2 M byte operations — a few
milliseconds in a `Uint8Array` loop, no WASM needed. Rescoring 256 vectors is
noise. So the vector artifact is **2–4 MB**, one fetch, cached by digest.

The expensive part is not the documents. It is the **query encoder**:

| Encoder | Download | Query cost | Runtime |
|---|---|---|---|
| Static embeddings (Model2Vec / `potion`, ~8M params, 256 dims) | **~8 MB** int8 | token lookup + mean pooling, **<1 ms** | plain JS, no ONNX |
| `all-MiniLM-L6-v2`, q8 ONNX | ~23 MB | 10–30 ms WASM, ~5 ms WebGPU | `transformers.js` + ONNX Runtime Web |
| `bge-small-en-v1.5`, q8 ONNX | ~33 MB | 15–40 ms WASM | same, slightly better retrieval |

Model2Vec distils a sentence transformer into per-token vectors, so "embedding a
query" is `mean(vectors[tokenize(q)])` — thirty lines of TypeScript, no model
runtime, no WASM download, deterministic. It gives up some quality against a
transformer and costs ~8 MB for the token table.

## 3. The four options, judged

| Option | Bytes on first semantic query | Quality | New dependency | Verdict |
|---|---|---|---|---|
| **A. Static embeddings, client-side** (potion/Model2Vec 256d; binary + int8 docs) | ~8 MB model + 2.2 MB vectors | good; weaker on long, abstract queries | none (own tokenizer + dot products) | **recommended** |
| **B. Transformer embeddings, client-side** (`transformers.js`, MiniLM-L6 q8; binary + int8 docs) | ~23 MB model + runtime JS + 3.3 MB vectors | best of the free client-side set | `@huggingface/transformers` (~1–2 MB JS, WASM/WebGPU) | strong second; measure A against it |
| **C. Hosted vector DB free tier** (Qdrant Cloud 1 GB / Pinecone Starter 2 GB) | 0 to the browser | best | a server or a leaked key | **reject** for a static site |
| **D. No model: build-time intent/synonym expansion** (~50–200 kB table) | 0.2 MB | shallow — it is curated lexical expansion, not semantics | none | ship first if 8 MB is judged too much |

Note on every claim in the table: the sizes are arithmetic from dimensions and
parameter counts, not measurements on this dataset. The first task in the plan
below is to measure them, because a proposal that quotes a download size it has
not built is exactly the kind of claim this repository bans.

## 4. Recommended shape (A, with B behind the same interface)

1. **Build-time pass.** `scripts/build_semantic_index.py` (the Python producer
   already owns the dataset) embeds `name + summary + category` per row with a
   pinned model revision, quantizes to int8 **and** binary, and writes
   `web/public/v1/semantic/<datasetDigest>/vectors.bin` plus `meta.json`
   (`model`, `revision`, `dims`, `quantization`, `count`, `rowOrderDigest` where
   the digest is over the id list in vector order, `textFields`). Rows stay in
   the dataset's published order, so vector row *i* is row *i* of the existing
   ordered shards — no id table, no extra bytes.
2. **Client.** `web/lib/semanticSearch.ts` + a Web Worker. On the first semantic
   query only: fetch `meta.json` + `vectors.bin` (digest-versioned, immutable
   cache), decode binary → `Uint8Array`, Hamming top-256, int8 cosine rescore,
   then fuse with the lexical ranking (reciprocal rank fusion; weights stated in
   code, not tuned invisibly). Only ids come out; the existing row hydration and
   card rendering are reused unchanged.
3. **UI.** A `Meaning` toggle next to the sort control, with the download size
   printed **before** the click (`Downloads 2.6 MB once — matched by meaning, not
   popularity`). Semantic-only results must never borrow a popularity signal:
   the ordering is stated in words, and "no match" stays honest.
4. **Fallback.** No model, no vectors: the lexical index is untouched and stays
   the default. If the fetch fails, the toggle says so and nothing silently
   degrades into a different ranking.

## 5. Acceptance gates (each one falsifiable)

| Gate | Threshold | How |
|---|---|---|
| Passive visit | 0 semantic bytes | network panel on a cold visit; assert in `web/tests/` |
| First Load JS | unchanged (~107 kB shared) | `npm run build` route table; model + worker must be dynamic chunks |
| Retrieval | recall@10 on a 40-query gold set ≥ lexical + 15 points | `scripts/eval_semantic_search.py`, both arms on the same dataset |
| Latency | p95 ≤ 150 ms after load, mid-range laptop | worker timing over the gold set |
| Honesty | every displayed count/order reproducible from the artifact | `rowOrderDigest` + count checked at load; mismatch = no semantic results, with a reason |
| Determinism | same dataset + same model revision ⇒ identical `vectors.bin` | rebuild twice, compare SHA-256 |

## 6. Risks and the honest answers

* **8–23 MB is a lot to download.** It is only on an explicit toggle, and the
  cost is printed before it is paid. Option D (curated expansion) is the answer
  if that is still too much.
* **Multilingual rows.** The dataset carries Chinese, Japanese and other
  summaries; an English-only static model degrades them. Either pick a
  multilingual static model (bigger) or scope the toggle honestly ("English
  summaries") — do not ship a silent regression.
* **Embedding drift.** Vectors are keyed by `datasetDigest` and the build fails
  if the count or order disagrees with the dataset, so a stale cache cannot mix
  with a new release.
* **This does not fix the 5 MiB filter projection.** The browse path still
  hydrates every row; the facet artifact in `TODO.md` is a prerequisite for the
  latency gate on the filter path, and the two should not be conflated.

## 7. Cost

$0 in infrastructure: the vectors are build artifacts on the same free static
host as the catalog, the query encoder runs in the user's browser, and no query
leaves the machine — which is also the correct privacy answer for a tool whose
whole premise is local-first.
