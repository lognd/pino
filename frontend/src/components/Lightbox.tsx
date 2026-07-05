// Minimal accessible image lightbox -- docs/design/15-media-and-gallery.md:
// a focus-trapped dialog with Esc-to-close and a big labeled close button,
// no keyboard traps. Kept deliberately small (image + caption + close). Only
// images use this; videos in the grid keep their own click-to-play gate.
//
// Focus management (doc 09's elderly-first / keyboard bar): on open, focus
// moves to the close button; Tab/Shift+Tab cycle within the dialog; Esc and
// a backdrop click both close and return focus to the trigger (handled by
// the caller re-focusing after `onClose`).

import { useEffect, useRef } from "react";
import type { MediaItem } from "../content/media";
import { MEDIA_COPY } from "../content/media";

export interface LightboxProps {
  item: MediaItem;
  onClose: () => void;
}

export function Lightbox({ item, onClose }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      // Return focus to whatever opened the dialog (the grid tile).
      previouslyFocused?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus trap: keep Tab within the dialog's focusable elements.
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-mp-black-true/90 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={MEDIA_COPY.lightbox.dialogLabel}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full max-w-4xl flex-col border-2 border-mp-white bg-mp-black-true"
      >
        <div className="flex items-center justify-end border-b-2 border-mp-border p-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[48px] items-center gap-2 border-2 border-mp-white bg-mp-black-true px-4 py-2 text-lg font-bold uppercase text-mp-white hover:border-mp-red hover:text-mp-red-text"
          >
            <span aria-hidden="true">&times;</span>
            {MEDIA_COPY.lightbox.closeLabel}
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-2">
          <img
            src={item.src}
            alt={item.alt}
            decoding="async"
            className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
          />
          {item.caption && <p className="mt-3 text-lg text-mp-white">{item.caption}</p>}
        </div>
      </div>
    </div>
  );
}
