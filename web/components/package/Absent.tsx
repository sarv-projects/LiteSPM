/**
 * "No fact here" is stated, never filled in.
 *
 * The package page's rule (ARCH/25 §7.3): a field the snapshot does not carry
 * prints an explicit absent state rather than being omitted, so a reader can
 * tell "the publisher didn't say" apart from "this page forgot to show it".
 * The dotted underline is the shared `.absent` treatment used across the site.
 */
export function Absent({ text = "Not published" }: { text?: string }) {
  return <span className="absent">{text}</span>;
}
