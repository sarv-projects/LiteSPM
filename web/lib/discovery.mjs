/** Shared by export, browser and edge: presentation never changes install data. */
export const MAX_QUERY_LENGTH = 256;
export const boundedQuery = (value) => String(value ?? '').slice(0, MAX_QUERY_LENGTH);

function repository(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
    const [owner, repo] = url.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, url: `https://github.com/${owner}/${repo.replace(/\.git$/, '')}` };
  } catch { return null; }
}

export function normalizeListing(item) {
  if (item.kind !== 'plugin' || item.distributor) return item;
  const upstream = repository(item.artifact?.repo);
  if (!upstream) return item;
  // A marketplace listing proves distribution, not authorship. Attribute the
  // explicit source owner and retain the original listing provenance separately.
  const name = String(item.publisher?.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const owner = upstream.owner.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name === owner || `${name}s` === owner) return item;
  return { ...item, distributor: item.publisher, publisher: {
    name: upstream.owner, url: upstream.url, verified: false, provenance: 'source-owner',
  } };
}

export function listingIdentity(item) {
  const upstream = repository(item.artifact?.repo);
  if (!upstream) return item.id;
  const path = String(item.artifact?.path ?? '').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
  const revision = item.artifact?.sha || item.artifact?.ref || item.version || '';
  return [item.kind, upstream.url.toLowerCase(), path, revision, item.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')].join('|');
}

export function uniqueListings(rows) {
  const seen = new Set();
  return rows.filter(item => {
    const key = listingIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const STOP = new Set('the and for with from your that this server servers mcp agent agents tool tools plugin plugins skill skills'.split(' '));
function words(item) {
  return new Set(`${item.name} ${item.summary ?? ''}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(w => !STOP.has(w)) ?? []);
}

export function relatedListings(item, rows) {
  const own = words(item);
  return uniqueListings(rows).filter(row => row.id !== item.id && listingIdentity(row) !== listingIdentity(item))
    .map(row => ({ row, score: [...words(row)].filter(w => own.has(w)).length }))
    .filter(({ row, score }) => score >= 2 && !/\b(wip|fixture|placeholder|test server)\b/i.test(`${row.name} ${row.summary}`))
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .map(({ row }) => row);
}
