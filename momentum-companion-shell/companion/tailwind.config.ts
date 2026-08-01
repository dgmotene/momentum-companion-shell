import type { Config } from "tailwindcss";
import { colors, fontFamily, radius, shadow } from "../shared/theme";

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
