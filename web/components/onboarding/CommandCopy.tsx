"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../../lib/clipboard";

/**
 * A command the reader can take away: what it is for, the command itself, and
 * a copy button.
 *
 * The shape is the one the entry page's manual-setup block already uses — a
 * dark plane, a labelled header, the command in mono — so a command looks the
 * same wherever the reader meets it. The difference is the label: this one
 * always names what the command *does* ("Install the CLI"), because on a
 * getting-started page the command alone does not say whether it is safe to
 * paste.
 *
 * The copy uses the site's shared clipboard helper, so a refusal (an
 * insecure context, a denied permission) falls back to a selection and says so
 * rather than pretending it worked.
 */
export function CommandCopy({
  command,
  label,
  note,
}: {
  /** The exact command, copied verbatim. */
  command: string;
  /** What the command does. Shown in the header and used in the button name. */
  label: string;
  /** Optional second line under the label. */
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="on-dark overflow-hidden rounded-panel bg-dark">
      <div className="flex items-center justify-between gap-2 border-b border-dark-rule px-3 py-2">
        <span className="t-mono min-w-0 truncate text-[11px] text-dark-ink-2">{label}</span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(command, `${command} copied`)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }
          }}
          aria-label={copied ? "Copied" : `Copy: ${command}`}
          className="btn shrink-0 border-dark-rule! bg-dark-2! text-dark-ink!"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Keyboard-reachable: a scrollable region a keyboard cannot enter
          hides part of its content from a keyboard-only reader. */}
      <pre
        tabIndex={0}
        aria-label={`${label}: ${command}`}
        className="overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed text-dark-ink"
      >
        <code>{command}</code>
      </pre>
      {note ? <p className="px-3.5 pb-3 pt-0 text-[12px] leading-relaxed text-dark-ink-2">{note}</p> : null}
    </div>
  );
}
