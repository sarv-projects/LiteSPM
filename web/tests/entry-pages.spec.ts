// The P0 this suite exists for.
//
// `/package/?slug=<id>` once served one generic "Entry detail" shell to cold
// loads, shared links, crawlers and no-JS readers — every one of the 69,376
// entries was the same document, the flagship GitHub MCP server included. The
// fix has two halves and this file tests both:
//
//   * the bounded pre-rendered set (`/package/<key>/`, a real file per entry);
//   * the edge Worker (`worker/index.js`), which rewrites the shipped shell
//     with the entry's own title, description, canonical and no-JS identity
//     block for every key outside that set — including colon-bearing ids,
//     which cannot be static directory names.
//
// The assertion is on the *served HTML*, fetched with no JavaScript at all,
// because that is what a crawler, a link preview and a no-JS reader get.

import { expect, test } from "./support/site";
import { flagshipEntry, htmlContains, nonPreRenderedEntry, preRenderedEntry } from "./support/catalog";

const preRendered = preRenderedEntry();
const nonPreRendered = nonPreRenderedEntry();
const flagship = flagshipEntry();

const cases = [
  { label: "pre-rendered entry", entry: preRendered, url: preRendered.href },
  { label: "non-pre-rendered entry", entry: nonPreRendered, url: nonPreRendered.href },
  { label: "colon-bearing flagship (canonical path)", entry: flagship, url: flagship.href },
  { label: "colon-bearing flagship (legacy query form)", entry: flagship, url: flagship.queryHref },
];

for (const { label, entry, url } of cases) {
  test(`${label}: served HTML names the entry and carries its title`, async ({ request }) => {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    const html = await response.text();

    // The generic shell the P0 shipped had the same title for every entry.
    expect(html).not.toMatch(/<title>Entry detail/);
    expect(html).toContain(`<title>${entry.row.name} · LiteSPM Market</title>`);
    expect(htmlContains(html, entry.row.name)).toBe(true);

    // The identity is structured, not only visible: one SoftwareApplication
    // block naming the entry (the client view removes the Worker's injected
    // copy once it resolves, so exactly one exists in the served HTML).
    const jsonLd = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
    const blocks = jsonLd
      .map((tag) => tag.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""))
      .map((raw) => {
        try {
          return JSON.parse(raw.replace(/\\u003c/g, "<"));
        } catch {
          return null;
        }
      })
      .flat()
      .filter(Boolean) as Array<Record<string, unknown>>;
    const software = blocks.filter((block) => block["@type"] === "SoftwareApplication");
    expect(software.length).toBeGreaterThanOrEqual(1);
    expect(software.some((block) => block.name === entry.row.name)).toBe(true);
  });
}

test("colon-bearing flagship: the query form and the canonical form are the same entry", async ({
  request,
}) => {
  const [canonical, query] = await Promise.all([
    request.get(flagship.href),
    request.get(flagship.queryHref),
  ]);
  expect(canonical.status()).toBe(200);
  expect(query.status()).toBe(200);
  const canonicalHtml = await canonical.text();
  const queryHtml = await query.text();
  expect(canonicalHtml).toContain(`<title>${flagship.row.name} · LiteSPM Market</title>`);
  expect(queryHtml).toContain(`<title>${flagship.row.name} · LiteSPM Market</title>`);
  // The canonical link points at the path form from both spellings.
  for (const html of [canonicalHtml, queryHtml]) {
    expect(html).toMatch(
      new RegExp(
        `<link rel="canonical" href="[^"]*${flagship.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`
      )
    );
  }
});

test("non-pre-rendered entry: the Worker's no-JS block names it for a reader without scripting", async ({
  request,
}) => {
  const response = await request.get(nonPreRendered.href);
  const html = await response.text();
  const summary = nonPreRendered.row.summary!.trim();
  expect(html).toMatch(/<noscript>/);
  // The block sits inside the layout's noscript element: name, summary and a
  // link to the entry, readable with scripting off.
  expect(htmlContains(html, summary)).toBe(true);
  expect(html).toContain("Open this entry");
});

for (const { label, entry } of [
  { label: "pre-rendered entry", entry: preRendered },
  { label: "non-pre-rendered entry", entry: nonPreRendered },
  { label: "colon-bearing flagship", entry: flagship },
]) {
  test(`${label}: a cold browser load renders the entry's own page`, async ({ page }) => {
    await page.goto(entry.href);
    await expect(page.locator("#pkg-title")).toHaveText(entry.row.name);
    await expect(page).toHaveTitle(`${entry.row.name} · LiteSPM Market`);
    // The page's own structured data is present after hydration, too.
    await expect(page.locator('script[type="application/ld+json"]')).not.toHaveCount(0);
  });
}

test("an unknown key answers with the 404 document, not a generic entry shell", async ({
  request,
}) => {
  const response = await request.get("/package/definitely-not-a-real-key-xyz/");
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).not.toContain("Entry detail · LiteSPM Market");
});
