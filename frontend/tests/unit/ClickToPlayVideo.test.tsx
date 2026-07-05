import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClickToPlayVideo } from "../../src/components/ClickToPlayVideo";
import { MEDIA, MEDIA_COPY, type MediaItem } from "../../src/content/media";

// docs/design/15-media-and-gallery.md: no <video> element pre-click, and a
// graceful plain-words message when the video cannot be loaded.

const videoItem: MediaItem = MEDIA.find((m) => m.kind === "video")!;

describe("ClickToPlayVideo", () => {
  it("renders only a poster + labeled play button pre-click (no <video>)", () => {
    const { container } = render(<ClickToPlayVideo item={videoItem} />);
    expect(container.querySelector("video")).toBeNull();
    const button = screen.getByRole("button", {
      name: new RegExp(MEDIA_COPY.video.playLabel),
    });
    expect(button).toBeInTheDocument();
    // The poster thumb is the only image loaded pre-click.
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(videoItem.thumb);
    expect(img!.getAttribute("loading")).toBe("lazy");
  });

  it("shows a plain-words message when the video fails to load", () => {
    const { container } = render(<ClickToPlayVideo item={videoItem} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(MEDIA_COPY.video.playLabel) }));

    // A <video> may or may not still be mounted depending on how play()
    // resolved in this environment; drive the documented failure path
    // explicitly by firing its error event if it exists.
    const video = container.querySelector("video");
    if (video) {
      fireEvent.error(video);
    }
    expect(screen.getByText(MEDIA_COPY.video.unavailableMessage)).toBeInTheDocument();
  });
});
