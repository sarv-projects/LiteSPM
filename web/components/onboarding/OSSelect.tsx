"use client";

import React from "react";

/**
 * The second question the setup guide asks: which operating system the reader
 * is on.
 *
 * The answer changes exactly one thing on the page — the file path the guide
 * prints, because the same file lives in a different place on each platform —
 * and the name of the terminal to open. It changes nothing about the reader's
 * machine: there is no detection, no system call and nothing sent anywhere.
 * "Not sure" is a first-class answer: the guide does not assume a platform
 * path until the reader chooses one.
 *
 * A native radio group, not a row of toggle buttons: four mutually exclusive
 * answers are a radio group, and the arrow-key behaviour and the announced
 * role come with the element. The radios are visible and the label wraps them,
 * so the hit area is the whole row rather than the 16 px control.
 */
export type GuideOS = "windows" | "macos" | "linux" | "unsure";

export const OS_CHOICES: Array<{ id: GuideOS; label: string; hint: string }> = [
  { id: "windows", label: "Windows", hint: "PowerShell or Command Prompt" },
  { id: "macos", label: "macOS", hint: "Terminal" },
  { id: "linux", label: "Linux", hint: "any shell" },
  { id: "unsure", label: "Not sure", hint: "no platform path is assumed" },
];

/** The terminal to open, per platform. "Not sure" gets the generic name. */
export function terminalName(os: GuideOS): string {
  switch (os) {
    case "windows":
      return "PowerShell or Command Prompt";
    case "macos":
      return "Terminal";
    case "linux":
      return "a shell";
    default:
      return "a terminal";
  }
}

export function OSSelect({
  value,
  onChange,
}: {
  value: GuideOS;
  onChange: (os: GuideOS) => void;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="text-[14px] font-semibold text-ink">Which operating system?</legend>
      <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
        Sets the paths and the terminal commands in your guide.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OS_CHOICES.map((choice) => (
          <label
            key={choice.id}
            className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-ctl border border-rule bg-surface px-3 py-2 text-[13px] text-ink-2 transition-colors duration-state ease-out hover:border-ink-3 hover:text-ink md:min-h-0"
          >
            <input
              type="radio"
              name="get-started-os"
              value={choice.id}
              checked={value === choice.id}
              onChange={() => onChange(choice.id)}
              className="h-4 w-4 shrink-0 accent-ink"
            />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{choice.label}</span>
              <span className="block text-[12px] text-ink-3">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
