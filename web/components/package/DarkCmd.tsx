import { CopyButton } from "./CopyButton";

/**
 * A command line on the dark surface: monospaced, selectable, copyable.
 *
 * Shared by the install panel and the management panel so the two ways of
 * showing a command cannot drift apart. It was private to `AddSteps` until the
 * management panel needed the identical treatment.
 */
export function DarkCmd({
  text,
  label,
  message,
}: {
  text: string;
  label: string;
  message: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-2 border border-dark-rule bg-dark-2 px-3 py-2.5">
      <span className="t-mono shrink-0 text-[12px] text-dark-ink-2" aria-hidden="true">
        $
      </span>
      <code className="t-mono min-w-0 flex-1 break-all text-[12px] text-dark-ink select-all">{text}</code>
      <CopyButton text={text} label={label} message={message} />
    </div>
  );
}
