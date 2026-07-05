import { test, expect } from "@playwright/test";

// docs/design/15-media-and-gallery.md system obligations: /gallery
// prerendered (axe-clean + JSON-LD are covered generically by a11y.spec.ts /
// seo.spec.ts via the shared PUBLIC_ROUTES manifest, which now includes
// /gallery); this file covers the media-specific behaviors -- no video bytes
// load pre-click (route interception), a thumbnail click mounts the player,
// and the carousel is fully operable by keyboard only.

test.describe("Gallery page", () => {
  test("serves real prerendered HTML before hydration (raw fetch, no JS)", async ({
    request,
  }) => {
    const res = await request.get("/gallery/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    // Gallery heading + a manifest caption present without any JS execution
    // (guards the blank-SPA-shell failure mode).
    expect(html).toContain("From the Range");
    expect(html).toContain("SAMPLE -- On the range");
    // ImageGallery JSON-LD prerendered.
    expect(html).toContain('"@type":"ImageGallery"');
  });

  test("loads NO video bytes until the play button is clicked", async ({ page }) => {
    const videoRequests: string[] = [];
    // Intercept any request for the sample clip (or any video type) -- none
    // should fire before an explicit play click (doc 15's hard rule).
    await page.route("**/*", (route) => {
      const req = route.request();
      const url = req.url();
      if (url.endsWith(".mp4") || url.endsWith(".webm") || req.resourceType() === "media") {
        videoRequests.push(url);
      }
      return route.continue();
    });

    await page.goto("/gallery");
    // Give lazy media a beat to settle; still zero video requests.
    await page.waitForLoadState("networkidle");
    expect(videoRequests, "video bytes must not load before a play click").toEqual([]);

    // No <video> element should exist yet either.
    expect(await page.locator("video").count()).toBe(0);
  });

  test("clicking a video thumbnail mounts the player", async ({ page }) => {
    await page.goto("/gallery");
    // The grid's video tile is a labeled play button.
    const playButton = page.getByRole("button", { name: /Play video/ }).first();
    await expect(playButton).toBeVisible();
    await playButton.click();
    // A <video> element is now mounted (its src may 404 in this backend-free
    // build -- the component then shows a plain-words message; either way the
    // click-to-play gate reacted, which is what this asserts).
    await expect(async () => {
      const hasVideo = (await page.locator("video").count()) > 0;
      const hasFallback = await page
        .getByText(/This video is not available yet/)
        .isVisible()
        .catch(() => false);
      expect(hasVideo || hasFallback).toBe(true);
    }).toPass();
  });

  test("carousel is operable by keyboard only (arrow keys change the counter)", async ({
    page,
  }) => {
    await page.goto("/gallery");
    const carousel = page.getByRole("group", { name: "Photo and video carousel" });
    await carousel.focus();

    // Counter starts at "1 of N" (N = featured count). Read the first chip.
    const counter = carousel.getByText(/^\d+ of \d+$/).first();
    await expect(counter).toContainText(/^1 of \d+$/);

    await page.keyboard.press("ArrowRight");
    await expect(counter).toContainText(/^2 of \d+$/);

    await page.keyboard.press("ArrowLeft");
    await expect(counter).toContainText(/^1 of \d+$/);
  });
});
