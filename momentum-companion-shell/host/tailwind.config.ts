import type { Config } from "tailwindcss";
import { colors, fontFamily, radius, shadow } from "../shared/theme";

// `colors` carries both naming schemes: the flat `brand-*` set the login and
// dashboard screens use, and the nested `teal-dark` / `ink-soft` set the
// companion-facing components use. Same hex values either way; see
// shared/theme.ts.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors,
      fontFamily,
      borderRadius: { card: radius.card, bubble: radius.bubble, btn: radius.btn },
      boxShadow: { card: shadow.card, sm: shadow.sm, pill: shadow.pill },
    },
  },
  plugins: [],
};
export default config;
