import type { Config } from "tailwindcss";

// Tailwind reads color values from the CSS variables defined in
// src/styles/tokens.css (see docs/design/09-design-system.md, the source
// of truth for every value below). Keep this file's palette/name keys in
// sync with tokens.css var names -- do not hand-roll a second copy of a
// color anywhere else.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mp: {
          black: "var(--mp-black)",
          "black-true": "var(--mp-black-true)",
          surface: "var(--mp-surface)",
          white: "var(--mp-white)",
          muted: "var(--mp-muted)",
          red: "var(--mp-red)",
          "red-press": "var(--mp-red-press)",
          border: "var(--mp-border)",
          success: "var(--mp-success)",
          warn: "var(--mp-warn)",
        },
      },
      fontFamily: {
        // Display: Barlow Condensed 800/900 italic -- H1/H2, section
        // headers, wordmark textual siblings (doc 09).
        display: ["Barlow Condensed", "ui-sans-serif", "sans-serif"],
        // Body/UI: Barlow 400/600 -- everything else (doc 09).
        body: ["Barlow", "ui-sans-serif", "sans-serif"],
      },
      borderRadius: {
        // Border-radius is 0 EVERYWHERE per doc 09 -- buttons, cards,
        // inputs, images. Overriding Tailwind's whole radius scale to 0
        // means a stray `rounded-lg` typo can't sneak a soft corner back
        // in; there is no non-zero radius utility left to reach for.
        none: "0",
        DEFAULT: "0",
        sm: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
        full: "0",
      },
      skew: {
        // The one sanctioned diagonal-cut angle (doc 09's --mp-skew),
        // echoing the wordmark's italic lean. Use `-skew-mp` everywhere a
        // slant is needed instead of picking a new angle per component.
        mp: "-8deg",
      },
    },
  },
  plugins: [],
} satisfies Config;
