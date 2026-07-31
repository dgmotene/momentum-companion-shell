import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: "#006D77",
          tealDark: "#00505A",
          blue: "#4ECDC4",
          blueTint: "#EAF9F7",
          amber: "#F4A261",
          amberTint: "#FDF1E6",
          amberText: "#9A5B22",
          green: "#52B788",
          greenTint: "#EAF7F0",
          bg: "#FAFAFA",
          bgClaims: "#FAF9F6",
          surface: "#FFFFFF",
          border: "#E7E5E1",
          ink: "#1F2933",
          inkSoft: "#52606D",
          inkFaint: "#8A9199",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Fraunces", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
