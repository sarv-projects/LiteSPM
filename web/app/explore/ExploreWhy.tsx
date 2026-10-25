"use client";

import React from "react";
import Link from "next/link";
import type { Listing } from "../../lib/telemetry";
import { listingHref } from "../../lib/catalog";
import { availabilityOf } from "../../lib/availability";
import {
  explainMatch,
  MATCH_BODY,
  MATCH_ID,
  MATCH_NAME_EXACT,
  MATCH_NAME_PREFIX,
  MATCH_NAME_TOKEN,
  MATCH_PUBLISHER,
  MATCH_SLUG,
} from "../../lib/searchFormat.mjs";
import { OFFICIAL_SKILLS_CATEGORY } from "../../lib/catalog";

/**
 * Why the leading results are the leading results.
 *
 * It renders AFTER the result set, collapsed — the answer has to precede the
 * analysis of its order. Before that it sat above the rows, expanded, and on a
 * search the first result started around y≈900 at 1440×900: a reader had to
 * pass an essay to see whether anything matched. The content is kept whole
 * because no competitor explains *why* a row ranked; it just is not the thing
 * to read first.
 *
 * The evidence for the *ordering* lives here: each of the first results, the
 * field the query was found in, the fragment around the match, and the class
 * that rank came from. The rule line states the whole order, so the
 * explanation also covers the rows further down without a sentence per row.
 *
 * It is its own file so the filter panel, the result list and the ranking
 * explanation can each be read on their own — the view that held all three
 * was 963 lines, and the one that explained the *ranking* sat next to the code
 * that computed the *filtering*.
 */

/** Human names for the fields `explainMatch` reports. */
const EXPLAIN_FIELD_LABELS: Record<string, string> = {
  name: "name",
  publisher: "publisher",
  slug: "web address",
  summary: "summary",
  category: "category",
  runtime: "runtime",
  transport: "transport",
  id: "ID",
  tool: "tool name or description",
};

/** The class behind each explanation, in words. */
const EXPLAIN_CLASS_LABELS: Record<number, string> = {
  [MATCH_NAME_EXACT]: "exact name",
  [MATCH_NAME_PREFIX]: "name starts with the query",
  [MATCH_NAME_TOKEN]: "name word",
  [MATCH_PUBLISHER]: "publisher name",
  [MATCH_SLUG]: "web address",
  [MATCH_BODY]: "summary or tool text",
  [MATCH_ID]: "ID",
};

export function ExploreWhy({
  entries,
  host,
}: {
  entries: Array<{ item: Listing; reason: ReturnType<typeof explainMatch> }>;
  host: string | null;
}) {
  return (
    <details className="border border-rule bg-sunken px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-medium text-ink">
        Why these results?
      </summary>
      <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
        Results rank by where the query was found — the name first, then the publisher, web
        address and description. Ties go to entries LiteSPM can install, then to publisher
        manifests and publisher skills.
        {host && (
          <>
            {" "}
            Entries that work with <strong className="font-medium text-ink">{host}</strong> rank
            first.
          </>
        )}
      </p>
      <ol className="mt-3 space-y-1.5">
        {entries.map(({ item, reason }, index) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px]">
            <span className="t-mono t-tabular w-4 shrink-0 text-right text-[11px] text-ink-3">
              {index + 1}
            </span>
            <Link
              href={listingHref(item)}
              className="font-medium text-ink hover:text-accent-text hover:underline"
              prefetch={false}
            >
              {item.name}
            </Link>
            <span className="text-ink-3">—</span>
            {reason ? (
              reason.tokens.map((part, partIndex) => (
                <React.Fragment key={`${part.token}-${partIndex}`}>
                  {partIndex > 0 && <span className="text-ink-3">+</span>}
                  <span className="text-ink-2">
                    {EXPLAIN_FIELD_LABELS[part.field] ?? part.field}
                    {part.fragment ? (
                      <>
                        {" “"}
                        <span className="t-mono text-[11.5px]">
                          {part.fragment.text.slice(0, part.fragment.start)}
                          <mark className="bg-transparent font-semibold text-ink underline decoration-accent decoration-2 underline-offset-2">
                            {part.fragment.text.slice(part.fragment.start, part.fragment.end)}
                          </mark>
                          {part.fragment.text.slice(part.fragment.end)}
                        </span>
                        {"”"}
                      </>
                    ) : (
                      " (not shown in the result list)"
                    )}
                  </span>
                  <span className="text-ink-3">
                    {EXPLAIN_CLASS_LABELS[part.className] ?? ""}
                  </span>
                </React.Fragment>
              ))
            ) : (
              <span className="text-ink-3">matched</span>
            )}
            {/* Why this row beat the next one at the same class: the tie-break
                signals, strongest first, exactly as the index weighed them. */}
            <span className="t-mono text-[10.5px] text-ink-3">
              {[
                availabilityOf(item).installable ? "installable" : null,
                item.publisher?.verified ? "publisher manifest" : null,
                item.category === OFFICIAL_SKILLS_CATEGORY ? "publisher skills" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
