"use client";

import React from "react";
import { CirclePlay, FileText } from "lucide-react";
import { useReducedMotion } from "../motion/useInView";

/**
 * The product proof: a recorded walkthrough of LiteSPM doing the thing the
 * page promises — pick an agent, see the config diff, approve it, read the
 * local install record, remove it again.
 *
 * ## Why this is a component with a data shape and not a `<video>` tag
 *
 * The recording does not exist yet. It needs a real machine, a real agent, a
 * real install and a real removal, and a real removal of a real thing that
 * was really installed — a rendering of it would be a fabrication, and the
 * whole argument of this site is that it does not fabricate. So the component
 * is built for the recording and shipped with a clearly-labelled placeholder:
 *
 *  - `recording` is the video's own path, poster and length. `null` until the
 *    recording exists. When it is `null`, the component renders the poster
 *    frame and says so.
 *  - `chapters` are the captions — the five moments the walkthrough covers.
 *    A timestamp is only printed when a real recording supplies one; the
 *    placeholder's chapters carry none, because a timestamp for a video that
 *    does not exist would be an invented detail.
 *  - `transcript` is the words. When there is no recording, these are the
 *    script, and the component labels them as such.
 *
 * ## The poster frame
 *
 * A poster is a still frame, so it is an image — but there is no image yet
 * either, and an empty grey rectangle with a play button on it is a lie: it
 * promises a video. The placeholder is therefore a **storyboard**: the same
 * five moments, listed, inside a frame that says in words that the recording
 * has not been published. It is the same information the poster will carry,
 * minus the pixels, and it cannot be mistaken for a terminal transcript
 * because it is not one — there is no fake output anywhere in this component.
 *
 * ## Reduced motion
 *
 * The component never autoplays, so there is no motion to suppress in the
 * shipped state. The rule is written down anyway, because the moment the
 * recording lands the component will have a video in it: under
 * `prefers-reduced-motion: reduce` the video is not rendered at all and the
 * poster frame plus the full transcript are the reading. `useReducedMotion`
 * starts at `true`, so the server render and the first client render agree and
 * hydration cannot flash a playing video at a reader who asked for none.
 */

export interface DemoChapter {
  id: string;
  title: string;
  /** One line on what the frame shows. */
  body: string;
  /**
   * The timestamp in the recording, as `m:ss`. Printed only when the
   * recording supplies one — see the note above.
   */
  at?: string;
}

export interface DemoLine {
  /** What is on screen, or who is speaking. */
  label: string;
  text: string;
}

export interface ProductDemoData {
  /**
   * The recording itself. `null` until it exists; the component is written so
   * that dropping the file in is the only change needed.
   */
  recording: { src: string; poster: string; duration: string } | null;
  /** The poster frame's image. `null` while the frame is the placeholder. */
  poster: { src: string | null; alt: string };
  /** The captions: the moments the walkthrough covers. */
  chapters: DemoChapter[];
  /** The words, in order. */
  transcript: DemoLine[];
  /**
   * True when the frames are a published recording; false while they are the
   * placeholder. The component says which one the reader is looking at.
   */
  published: boolean;
}

/**
 * The shipped data: the walkthrough the page promises, described rather than
 * recorded.
 *
 * Every line here is a thing LiteSPM does — the plan, the diff, the
 * approval, the ledger entry, the removal — and none of it is a transcript of
 * a screen. When the recording lands, the same five moments get their
 * timestamps and their real words, and `published` flips to `true`.
 */
export const PRODUCT_DEMO: ProductDemoData = {
  recording: null,
  poster: { src: null, alt: "" },
  published: false,
  chapters: [
    {
      id: "pick",
      title: "Pick an agent",
      body: "The setup wizard finds the agents on this machine and asks which one to wire up.",
    },
    {
      id: "diff",
      title: "See the config diff",
      body: "An install plans first: the exact lines it will add to that agent's own config file.",
    },
    {
      id: "approve",
      title: "Approve the change",
      body: "Nothing is written until the plan is approved, and the file is backed up first.",
    },
    {
      id: "record",
      title: "Read the local install record",
      body: "The install is written to a ledger on this machine: what was added, where, and when.",
    },
    {
      id: "remove",
      title: "Remove it again",
      body: "One command takes the entry back out, and a restore puts the whole file back as it was.",
    },
  ],
  transcript: [
    {
      label: "Pick an agent",
      text: "The wizard lists the agents it found on this machine. You choose one, and LiteSPM shows you the config file it is about to touch before it touches it.",
    },
    {
      label: "See the config diff",
      text: "An install is a plan first. The plan carries the exact lines that will be added to the agent's own config file, and nothing is written until that plan is approved.",
    },
    {
      label: "Approve the change",
      text: "Approval is explicit. The file is copied to a backup directory before the edit, and the edit adds one entry - the other servers, comments and formatting in the file are left alone.",
    },
    {
      label: "Read the local install record",
      text: "What was installed is recorded in a ledger on this machine, with the source it came from and the file it was written to. That ledger is the only record of what LiteSPM did; the website cannot read it.",
    },
    {
      label: "Remove it again",
      text: "One command removes the entry LiteSPM wrote and leaves everything else in the file alone. A restore rolls the whole file back to the copy it took before the first edit.",
    },
  ],
};

export interface ProductDemoProps {
  /** Overridable so the real recording can be dropped in without a rewrite. */
  data?: ProductDemoData;
}

export function ProductDemo({ data = PRODUCT_DEMO }: ProductDemoProps) {
  const reduced = useReducedMotion();
  // A video is only rendered when there is one AND the reader has not asked
  // for reduced motion. Under reduced motion the poster frame and the full
  // transcript are the reading.
  const video = data.recording && !reduced ? data.recording : null;

  return (
    <figure
      className="overflow-hidden rounded-card border border-rule bg-surface"
      id="product-demo"
      aria-labelledby="product-demo-title"
    >
      {/* The poster frame. */}
      <div
        id="product-demo-poster"
        className="relative aspect-video w-full border-b border-rule bg-sunken"
      >
        {data.poster.src ? (
          <img
            src={data.poster.src}
            alt={data.poster.alt}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Storyboard chapters={data.chapters} />
        )}

        {video && (
          <video
            className="h-full w-full object-cover"
            src={video.src}
            poster={video.poster}
            controls
            preload="none"
            playsInline
          />
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2
            id="product-demo-title"
            className="text-[15px] font-semibold tracking-tight text-ink"
          >
            Watch LiteSPM work
          </h2>
          <span className="t-mono text-[11px] text-ink-3">
            {video ? video.duration : "recording not published yet"}
          </span>
        </div>

        {/*
          The one honest sentence about the state of the proof. A page that
          showed a play button over an empty frame would be promising a video
          that does not exist; this says what is there instead.
        */}
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {data.published
            ? "A real recording: one agent, one install, one removal, on a real machine."
            : "The recording is not published yet — it needs a real machine, a real install and a real removal. These are the five moments it will cover, and the words are below."}
        </p>

        {/* The captions. */}
        <ol id="product-demo-captions" className="mt-4 space-y-2.5">
          {data.chapters.map((chapter) => (
            <li key={chapter.id} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="t-mono mt-px w-7 shrink-0 text-[11px] tabular-nums text-ink-3"
              >
                {chapter.at ?? "··:··"}
              </span>
              <span className="min-w-0">
                <span className="text-[13px] font-medium text-ink">{chapter.title}</span>
                <span className="block text-[12.5px] leading-relaxed text-ink-2">
                  {chapter.body}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* The transcript. Always in the document, so it is readable without
            JavaScript, by a screen reader, and by a reader who has asked for
            reduced motion. */}
        <details id="product-demo-transcript" className="group mt-4 border-t border-rule pt-3">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[36px]">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {data.published ? "Read the transcript" : "The walkthrough, in words"}
            </span>
            <span
              aria-hidden="true"
              className="text-ink-3 transition-transform duration-panel ease-out group-open:rotate-90"
            >
              →
            </span>
          </summary>
          <div className="pb-1">
            {data.transcript.map((line) => (
              <p key={line.label} className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">{line.label}.</span> {line.text}
              </p>
            ))}
            {!data.published && (
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                These are the words the recording will use. No screen has been recorded yet, and
                nothing on this page is a picture of one.
              </p>
            )}
          </div>
        </details>
      </div>
    </figure>
  );
}

/**
 * The placeholder frame: the walkthrough's five moments, in a frame that says
 * what it is.
 *
 * It is deliberately not a terminal. A drawn-up terminal with invented output
 * would be the exact thing this site refuses to publish, and a reader who
 * mistakes it for one would be reading a fabrication.
 */
function Storyboard({ chapters }: { chapters: DemoChapter[] }) {
  return (
    <div className="flex h-full w-full flex-col justify-between p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <CirclePlay className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="t-mono text-[10.5px] uppercase tracking-wider text-ink-3">
          Poster frame — not published
        </span>
      </div>
      <ol className="mt-2 space-y-1">
        {chapters.map((chapter, index) => (
          <li key={chapter.id} className="flex items-baseline gap-2 text-[11.5px] text-ink-2">
            <span className="t-mono shrink-0 tabular-nums text-ink-3">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="truncate">{chapter.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
