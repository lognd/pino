// Melpino image/video carousel -- docs/design/15-media-and-gallery.md +
// doc 09's hard-edged, elderly-first, NO-auto-advance rules. Mechanics
// cribbed from ~/projects/logand.app (translate-based track, swipe threshold,
// reduced-motion instant swap) but the VISUAL STYLE is melpino's own, NOT
// logand's (explicit user instruction "change the carousel style"): radius 0,
// 2px borders, hard offset shadows, the --mp-skew counter chip, red only as
// the active-control accent, big LABELED prev/next (never bare chevrons), a
// visible "N of M" text counter (never dots-only).
//
// Three finished variants behind a `variant` prop so a human can pick one in
// /carousel-lab (dev-only): "edge-peek" (default, neighbors peek at the
// frame edges), "full-bleed" (one image edge-to-edge with an overlaid skewed
// counter chip), "filmstrip" (main stage + a clickable thumbnail rail).
// Manual navigation ONLY -- no autoplay for anyone, ever.

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../content/media";
import { MEDIA_COPY, formatCounter } from "../content/media";
import { LazyMedia } from "./LazyMedia";
import { ClickToPlayVideo } from "./ClickToPlayVideo";

export type CarouselVariant = "edge-peek" | "full-bleed" | "filmstrip";

export interface CarouselProps {
  items: MediaItem[];
  variant?: CarouselVariant;
  /** Optional aria-label override for the region (defaults to the copy). */
  ariaLabel?: string;
}

const SWIPE_THRESHOLD_PX = 50;

/** Renders the media for one slide -- image via LazyMedia, video via the
 * click-to-play gate (doc 15). One place so every variant treats media the
 * same way. */
function SlideMedia({ item, fit = "cover" }: { item: MediaItem; fit?: "cover" | "contain" }) {
  if (item.kind === "video") return <ClickToPlayVideo item={item} />;
  return <LazyMedia src={item.src} alt={item.alt} aspect={item.aspect} fit={fit} />;
}

/** Shared controls: labeled prev/next + a skewed "N of M" counter chip. */
function CarouselControls({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const btn =
    "inline-flex min-h-[48px] items-center gap-2 border-2 border-mp-white bg-mp-black-true px-4 py-2 text-lg font-bold uppercase text-mp-white hover:border-mp-red hover:text-mp-red-text";
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <button type="button" onClick={onPrev} className={btn}>
        <span aria-hidden="true">&larr;</span>
        {MEDIA_COPY.carousel.prevLabel}
      </button>
      {/* Skewed counter chip -- the --mp-skew accent, red key-line, PLAIN
          text "N of M" (never dots-only), per doc 15. */}
      <p
        aria-live="polite"
        className="-skew-mp border-2 border-mp-red bg-mp-surface px-4 py-2 text-lg font-bold uppercase text-mp-white"
      >
        <span className="inline-block skew-x-[8deg]">
          {formatCounter(MEDIA_COPY.carousel.counterTemplate, index + 1, total)}
        </span>
      </p>
      <button type="button" onClick={onNext} className={btn}>
        {MEDIA_COPY.carousel.nextLabel}
        <span aria-hidden="true">&rarr;</span>
      </button>
    </div>
  );
}

export function Carousel({ items, variant = "edge-peek", ariaLabel }: CarouselProps) {
  const [index, setIndex] = useState(0);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (items.length === 0) return null;
  const total = items.length;

  function goTo(i: number) {
    setIndex(((i % total) + total) % total);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (total <= 1) return;
    // A pointerdown on a real control inside a slide (the video play button)
    // must NOT be captured for dragging (logand's own note) -- else the
    // capture eats the button's click.
    if ((e.target as HTMLElement).closest("button")) return;
    dragStartRef.current = { x: e.clientX, width: trackRef.current?.clientWidth || 1 };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;
    setDragOffsetPx(e.clientX - dragStartRef.current.x);
  }

  function endDrag() {
    if (!dragStartRef.current) return;
    if (dragOffsetPx <= -SWIPE_THRESHOLD_PX) goTo(index + 1);
    else if (dragOffsetPx >= SWIPE_THRESHOLD_PX) goTo(index - 1);
    dragStartRef.current = null;
    setIsDragging(false);
    setDragOffsetPx(0);
  }

  const dragPercent = dragStartRef.current
    ? (dragOffsetPx / dragStartRef.current.width) * 100
    : 0;

  // edge-peek shows a slice of the neighbors: each slide is 84% wide, offset
  // so the current one is centered. full-bleed/filmstrip use 100%-wide slides.
  const slideBasis = variant === "edge-peek" ? 84 : 100;
  const peekPad = variant === "edge-peek" ? (100 - slideBasis) / 2 : 0;
  const transform = `translateX(calc(${peekPad}% + ${-index * slideBasis}% + ${dragPercent}%))`;
  const transition = isDragging || reducedMotionRef.current ? "none" : "transform 300ms ease-out";

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel ?? MEDIA_COPY.carousel.regionLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="focus:outline-none"
    >
      <div
        className={
          variant === "full-bleed"
            ? "relative w-full overflow-hidden border-2 border-mp-white bg-mp-black-true shadow-[8px_8px_0_0_var(--mp-black-true)]"
            : "relative w-full overflow-hidden"
        }
      >
        <div
          ref={trackRef}
          className="flex w-full touch-pan-y"
          style={{ transform, transition }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {items.map((item, i) => (
            <div
              key={`${item.src}-${i}`}
              className="flex-shrink-0 px-2"
              style={{ width: `${slideBasis}%` }}
              aria-hidden={i === index ? undefined : true}
            >
              <SlideMedia item={item} fit={variant === "full-bleed" ? "contain" : "cover"} />
              {item.caption && variant !== "full-bleed" && (
                <p className="mt-2 text-lg text-mp-white">{item.caption}</p>
              )}
            </div>
          ))}
        </div>

        {variant === "full-bleed" && (
          <>
            {/* Overlaid skewed counter chip, red key-line -- the only place
                red appears on this variant (active-accent rule). */}
            <p className="-skew-mp pointer-events-none absolute right-4 top-4 border-2 border-mp-red bg-mp-black-true/80 px-3 py-1 text-lg font-bold uppercase text-mp-white">
              <span className="inline-block skew-x-[8deg]">
                {formatCounter(MEDIA_COPY.carousel.counterTemplate, index + 1, total)}
              </span>
            </p>
            {items[index]?.caption && (
              <p className="absolute inset-x-0 bottom-0 bg-mp-black-true/80 px-4 py-3 text-lg text-mp-white">
                {items[index].caption}
              </p>
            )}
          </>
        )}
      </div>

      <CarouselControls
        index={index}
        total={total}
        onPrev={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
      />

      {variant === "filmstrip" && (
        <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {items.map((item, i) => (
            <li key={`thumb-${item.src}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={formatCounter(
                  MEDIA_COPY.carousel.thumbSelectTemplate,
                  i + 1,
                  total,
                )}
                aria-current={i === index ? "true" : undefined}
                className={`block h-16 w-24 overflow-hidden border-2 ${
                  i === index ? "border-mp-red" : "border-mp-border hover:border-mp-white"
                }`}
              >
                <img
                  src={item.thumb}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
