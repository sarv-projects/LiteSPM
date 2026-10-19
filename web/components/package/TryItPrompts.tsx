import type { Listing } from "../../lib/telemetry";
import { tryPrompts } from "../../lib/tryPrompts";
import { CopyButton } from "./CopyButton";

/**
 * "Try it": what to paste into your agent once the entry is installed.
 *
 * The prompts come from `lib/tryPrompts` — an example built from the
 * publisher's own first sentence only when that sentence states an action, and
 * a first-look prompt that works for anything installed. When the record
 * supports no example, only the first-look prompt renders; nothing is
 * assembled from parts to fill the gap.
 *
 * Only installable entries get this section: there is nothing to try for a row
 * the CLI refuses. The section renders inside the client view (and therefore
 * in the pre-rendered HTML of `/package/<key>/`), and every claim beside a
 * prompt is the same sentence the prompt itself is derived from.
 */
export function TryItPrompts({ item }: { item: Listing }) {
  const prompts = tryPrompts(item);
  if (prompts.length === 0) return null;

  return (
    <section id="pkg-try" aria-labelledby="pkg-try-title" className="mt-9">
      <div className="section-head">
        <h2 id="pkg-try-title">Try it after you install it</h2>
        <span className="section-note">paste into your agent</span>
      </div>

      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
        Once the install above has run, paste one of these into the agent you installed it for.
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {prompts.map((prompt) => (
          <li key={prompt.id} className="flex flex-col border border-rule-2 bg-surface p-3.5">
            <p className="t-mono text-[10px] uppercase tracking-wider text-ink-3">
              {prompt.label}
            </p>
            <p className="mt-1.5 flex-1 select-all text-[13.5px] leading-relaxed text-ink">
              {prompt.prompt}
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{prompt.basis}</p>
            <div className="mt-2.5">
              <CopyButton
                text={prompt.prompt}
                label={`Copy the ${prompt.label.toLowerCase()} prompt`}
                message="Prompt copied"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
