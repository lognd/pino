import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Carousel } from "../../src/components/Carousel";
import { MEDIA, MEDIA_COPY } from "../../src/content/media";

// docs/design/15-media-and-gallery.md test obligations: carousel keyboard
// navigation + counter math, and video component does not create a <video>
// element pre-click.

function counterText(total: number, current: number) {
  return MEDIA_COPY.carousel.counterTemplate
    .replace("{current}", String(current))
    .replace("{total}", String(total));
}

describe("Carousel keyboard navigation + counter", () => {
  it("shows an 'N of M' counter and advances/wraps with arrow keys", () => {
    render(<Carousel items={MEDIA} />);
    const region = screen.getByRole("group", { name: MEDIA_COPY.carousel.regionLabel });
    const total = MEDIA.length;

    // Counter chips render for both edge-peek control bar; the first "N of M"
    // present is the current position. Starts at 1 of N.
    expect(screen.getAllByText(counterText(total, 1)).length).toBeGreaterThan(0);

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(screen.getAllByText(counterText(total, 2)).length).toBeGreaterThan(0);

    fireEvent.keyDown(region, { key: "ArrowLeft" });
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    // Wrapped backwards from index 0 -> last item.
    expect(screen.getAllByText(counterText(total, total)).length).toBeGreaterThan(0);
  });

  it("advances with the labeled Next button", () => {
    render(<Carousel items={MEDIA} />);
    const total = MEDIA.length;
    fireEvent.click(screen.getByRole("button", { name: MEDIA_COPY.carousel.nextLabel }));
    expect(screen.getAllByText(counterText(total, 2)).length).toBeGreaterThan(0);
  });

  it("renders NO <video> element until the play button is clicked", () => {
    const { container } = render(<Carousel items={MEDIA} />);
    // The manifest contains a video item, but its slide shows only a
    // click-to-play button + poster image pre-click. (The video slide is
    // aria-hidden as a non-current slide, so query the DOM directly rather
    // than the accessibility tree.)
    expect(container.querySelector("video")).toBeNull();
    const playButton = [...container.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") ?? "").includes(MEDIA_COPY.video.playLabel),
    );
    expect(playButton).toBeDefined();
  });
});
