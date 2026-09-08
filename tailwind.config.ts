import type { Config } from "tailwindcss";

/** Reference a CSS variable RGB triplet with alpha support */
const rgb = (varName: string) => `rgb(var(--maestro-${varName}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        maestro: {
          bg: rgb("bg"),
          surface: rgb("surface"),
          card: rgb("card"),
          border: rgb("border"),
          text: rgb("text"),
          muted: rgb("muted"),
          accent: rgb("accent"),
          blue: rgb("blue"),
          green: rgb("green"),
          red: rgb("red"),
          orange: rgb("orange"),
          yellow: rgb("yellow"),
          purple: rgb("purple"),
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
