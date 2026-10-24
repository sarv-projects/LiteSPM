import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListing, uniqueListings, relatedListings, boundedQuery } from './discovery.mjs';

const row = (id, extra = {}) => ({ id, name: 'ActiveCampaign', kind: 'plugin', summary: '', publisher: { name: 'Anthropic', verified: true }, ...extra });
test('distribution marketplace is not attributed as upstream publisher', () => {
  const item = normalizeListing(row('active', { source: 'git:claude-plugins-official', artifact: { repo: 'https://github.com/ActiveCampaign/activecampaign-plugin.git' } }));
  assert.equal(item.publisher.name, 'ActiveCampaign');
  assert.equal(item.publisher.verified, false);
  assert.equal(item.distributor.name, 'Anthropic');
  assert.equal(item.publisher.provenance, 'source-owner');
});
test('duplicates collapse by repository, path and immutable revision', () => {
  const a = row('a', { artifact: { repo: 'https://github.com/acme/tool.git', path: 'plugin', sha: 'abc' } });
  const b = row('b', { artifact: { repo: 'https://github.com/ACME/tool/', path: './plugin/', sha: 'abc' } });
  const c = row('c', { artifact: { ...a.artifact, sha: 'def' } });
  assert.deepEqual(uniqueListings([a, b, c]).map(x => x.id), ['a', 'c']);
});
test('unrelated same-category packages are not recommendations', () => {
  const item = row('github', { name: 'GitHub', summary: 'Review pull requests and issues' });
  const rows = [row('crypto', { name: 'Crypto token', summary: 'Swap currencies' }), row('pr', { name: 'Pull request reviewer', summary: 'Review GitHub issues' })];
  assert.deepEqual(relatedListings(item, rows).map(x => x.id), ['pr']);
});
test('unbroken and oversized queries are bounded consistently', () => {
  assert.equal(boundedQuery('a'.repeat(10000)).length, 256);
  assert.equal(boundedQuery('github'), 'github');
});

test('duplicate identity survives the compact search projection', async () => {
  const { buildDisplayRows, encodeDisplayRows, decodeDisplayRows } = await import('./searchFormat.mjs');
  const a = row('plugin:one:active', { slug: 'one-active', category: 'Tools', artifact: { type: 'git-tree', repo: 'https://github.com/acme/tool', sha: 'abc', pinned: true } });
  const b = { ...a, id: 'plugin:two:active', slug: 'two-active' };
  const c = { ...a, id: 'plugin:three:active', artifact: { ...a.artifact, sha: 'def' } };
  const decoded = decodeDisplayRows(encodeDisplayRows(buildDisplayRows([a,b,c])));
  assert.deepEqual(uniqueListings(Array.from({length: decoded.rowCount}, (_,i) => decoded.rowAt(i))).map(x => x.id), [a.id, c.id]);
});
