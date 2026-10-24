// Execute the actual TypeScript aggregators through Node, outside Playwright's
// CommonJS transform of transitive .mjs imports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { uniqueListings } from '../lib/discovery.mjs';

const require = createRequire(import.meta.url);
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename
);
const { tallyHosts } = require('../lib/hostIdentity.ts');
const { categoryIndex, kindBreakdown } = require('../lib/catalog.ts');
const { taxonomyIndex, classifyListing } = require('../lib/taxonomy.ts');
const base = {
  id: 'plugin:first', name: 'Host union fixture', slug: 'host-union', kind: 'plugin',
  summary: 'Host union fixture', category: 'Testing', publisher: { name: 'Fixture', verified: false },
  stars: null, version: '1.0.0', artifact: { repo: 'https://github.com/example/fixture', sha: 'abc' },
  compatibleHosts: ['Claude Code', 'Example Host A'],
};
const counts = tallyHosts([
  base,
  { ...base, id: 'plugin:second', compatibleHosts: ['Codex', 'example host a'] },
  { ...base, id: 'plugin:revision', artifact: { ...base.artifact, sha: 'def' }, compatibleHosts: ['Claude Code'] },
]);
assert.equal(counts.get('claude-code')?.total, 2);
assert.equal(counts.get('codex')?.total, 1);
assert.equal([...counts.values()].find(host => host.name === 'Example Host A')?.total, 1);

const rows = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const categories = categoryIndex(rows);
for (const facet of categories) {
  const expected = uniqueListings(rows.filter(row => row.category?.trim() === facet.name));
  assert.equal(facet.count, expected.length, facet.name);
  for (const kind of ['mcp', 'skill', 'plugin']) {
    assert.equal(facet.byKind[kind], expected.filter(row => row.kind === kind).length, `${facet.name}/${kind}`);
  }
}
console.log(`OK facet counts — duplicate host declarations retain their union; ${categories.length} category totals and kind counts match their filtered results`);

const taxonomy = taxonomyIndex(rows);
assert.equal(taxonomy.total, uniqueListings(rows).length);
for (const facet of taxonomy.facets) {
  const expected = uniqueListings(rows.filter(row => classifyListing(row) === facet.id));
  assert.equal(facet.count, expected.length, facet.id);
  for (const kind of ['mcp', 'skill', 'plugin']) {
    assert.equal(facet.byKind[kind], expected.filter(row => row.kind === kind).length, `${facet.id}/${kind}`);
  }
}
for (const facet of kindBreakdown(rows)) {
  assert.equal(facet.count, uniqueListings(rows.filter(row => row.kind === facet.kind)).length, facet.kind);
}
console.log('OK goal/kind counts — every goal and kind count matches its filtered catalog results');
