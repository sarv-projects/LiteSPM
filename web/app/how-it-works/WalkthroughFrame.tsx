import React from "react";

/**
 * The product walkthrough frame: poster, captions, transcript.
 *
 * ## The contract
 *
 * This is the shape the recording should be published in, and the shape the
 * home page's demo should use too. A component that takes these props can
 * carry either state without changing:
 *
 * ```ts
 * {
 *   title: string;                    // what the frame is called
 *   video?: { src: string; type?: string };   // present = the recording exists
 *   poster?: { src: string; alt: string };    // the still shown before playback
 *   captions: Array<{ time: string; text: string }>;  // one line per beat
 *   transcript: string;                // the spoken text, in full
 *   placeholder: string;               // what to say while there is no video
 * }
 * ```
 *
 * `video` absent means the frame renders the placeholder and says so in
 * plain words. That is the state this page ships in, because the recording
 * has not been made: a real product recording needs a real machine, a real
 * install and a real removal, and a mock-up of one would be the one thing on
 * this site that could not be checked.
 *
 * The captions and the transcript are always in the HTML, whether or not a
 * video exists. A reader with JavaScript off, a screen reader, or no interest
 * in watching anything gets the same beats in the same order, and the frame
 * is complete without the picture.
 *
 * This is a **Server Component**: the transcript is a `<details>` element and
 * the video is a plain `<video controls>`, so the frame needs no JavaScript
 * and ships none.
 */
export interface WalkthroughCaption {
  /** A timestamp for the beat, as `mm:ss`. */
  time: string;
  /** What happens at that moment, in one line. */
  text: string;
}

export interface WalkthroughFrameProps {
  title: string;
  /** Present once the recording exists. Absent = the placeholder state. */
  video?: { src: string; type?: string };
  /** The still shown before playback, and the still in the placeholder. */
  poster?: { src: string; alt: string };
  /** One line per beat, in order. Always rendered. */
  captions: WalkthroughCaption[];
  /** The spoken text, in full. Always rendered, behind a disclosure. */
  transcript: string;
  /** What the frame says while there is no recording. */
  placeholder: string;
}

export function WalkthroughFrame({
  title,
  video,
  poster,
  captions,
  transcript,
  placeholder,
}: WalkthroughFrameProps) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-card border border-rule bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
          <span className="t-mono text-[11px] font-medium uppercase tracking-wider text-ink-2">
            {title}
          </span>
          {video ? (
            <span className="t-mono text-[11px] text-ink-3">Product recording</span>
          ) : (
            <span className="t-mono text-[11px] text-ink-3">Not published yet</span>
          )}
        </div>

        {video ? (
          <video
            className="block w-full bg-sunken"
            controls
            preload="none"
            poster={poster?.src}
            src={video.src}
          >
            {poster ? <img src={poster.src} alt={poster.alt} /> : null}
            Your browser cannot play this video. The transcript below is the same content.
          </video>
        ) : (
          <div className="m-4 rounded-panel border border-dashed border-ink-3 bg-sunken p-5 text-center sm:m-5">
            <p className="t-mono text-[11px] uppercase tracking-wider text-ink-3">
              The recording has not been made
            </p>
            <p className="mx-auto mt-2 max-w-[52ch] text-[13px] leading-relaxed text-ink-2">
              {placeholder}
            </p>
            <p className="mx-auto mt-3 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
              What follows is the script the recording follows: the same beats, in the same order,
              with the commands and the files. It is text, not a picture of a terminal.
            </p>
          </div>
        )}

        <ol className="divide-y divide-rule border-t border-rule">
          {captions.map((caption) => (
            <li
              key={caption.time}
              className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4"
            >
              <span className="t-mono shrink-0 text-[11px] text-ink-3">{caption.time}</span>
              <span className="text-[13px] leading-relaxed text-ink-2">{caption.text}</span>
            </li>
          ))}
        </ol>

        <details className="group border-t border-rule">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-[13px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[40px]">
            Read the transcript
            <span
              aria-hidden="true"
              className="text-ink-3 transition-transform duration-panel ease-out group-open:rotate-90"
            >
              →
            </span>
          </summary>
          <div className="space-y-2 px-4 pb-4 text-[13px] leading-relaxed text-ink-2">
            {transcript.split("\n\n").map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
            ))}
          </div>
        </details>
      </div>

      <figcaption className="mt-2 text-[12px] leading-relaxed text-ink-3">
        A real recording needs a real machine, a real install and a real removal. Until then, this
        page carries the script and says so, rather than showing a mock-up of a terminal.
      </figcaption>
    </figure>
  );
}
