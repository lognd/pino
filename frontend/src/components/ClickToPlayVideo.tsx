// Click-to-play video -- docs/design/15-media-and-gallery.md's hard rule:
// NO <video> element and NO network fetch of video bytes until the user
// clicks the play affordance. Pre-click we render ONLY the poster thumb
// image + a big labeled play button (min 56px, doc 09). On click we mount
// <video controls poster={thumb}> and call .play().
//
// Graceful failure (doc 15): the SAMPLE manifest points its `src` at a file
// that does not resolve yet, so a real play attempt errors. Rather than
// leaving a broken player, the <video>'s onError swaps in a plain-words,
// visible message (MEDIA_COPY.video.unavailableMessage) -- the elderly-first
// "no dead ends" bar (doc 09).

import { useRef, useState } from "react";
import type { MediaItem } from "../content/media";
import { MEDIA_COPY } from "../content/media";

const ASPECT_RATIO: Record<MediaItem["aspect"], string> = {
  landscape: "16 / 9",
  portrait: "3 / 4",
  square: "1 / 1",
};

export interface ClickToPlayVideoProps {
  item: MediaItem;
  className?: string;
}

/** A poster + play button that mounts a real <video> only on click, and
 * shows a plain-words message if the video cannot be loaded. */
export function ClickToPlayVideo({ item, className }: ClickToPlayVideoProps) {
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const boxClass = `relative w-full overflow-hidden border-2 border-mp-border bg-mp-black-true${
    className ? ` ${className}` : ""
  }`;
  const boxStyle = { aspectRatio: ASPECT_RATIO[item.aspect] } as const;

  function activate() {
    setActivated(true);
    // .play() runs on the next tick, after the <video> mounts.
    requestAnimationFrame(() => {
      const el = videoRef.current;
      if (!el) return;
      try {
        const attempt = el.play();
        if (attempt && typeof attempt.catch === "function") {
          attempt.catch(() => setFailed(true));
        }
      } catch {
        setFailed(true);
      }
    });
  }

  if (failed) {
    return (
      <div className={boxClass} style={boxStyle}>
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-[40ch] text-lg font-semibold text-mp-white">
            {MEDIA_COPY.video.unavailableMessage}
          </p>
        </div>
      </div>
    );
  }

  if (!activated) {
    return (
      <button
        type="button"
        onClick={activate}
        aria-label={`${MEDIA_COPY.video.playLabel}: ${item.alt}`}
        className={`group ${boxClass} block cursor-pointer`}
        style={boxStyle}
      >
        <img
          src={item.thumb}
          alt={item.alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-mp-black-true/30 transition-colors group-hover:bg-mp-black-true/50"
        >
          <span className="inline-flex min-h-[56px] items-center gap-3 border-2 border-mp-white bg-mp-red px-5 py-3 text-xl font-bold uppercase text-mp-white">
            {/* CSS triangle, not a glyph -- pixel-exact play mark across
                fonts/platforms (doc 09's plain, high-contrast controls). */}
            <span className="ml-1 block h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-current" />
            {MEDIA_COPY.video.playLabel}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className={boxClass} style={boxStyle}>
      <video
        ref={videoRef}
        src={item.src}
        poster={item.thumb}
        controls
        preload="auto"
        playsInline
        onError={() => setFailed(true)}
        className="h-full w-full bg-mp-black-true object-contain"
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
