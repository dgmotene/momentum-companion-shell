// Lumina's design tokens, lifted from lumina-wireframe.html so the built
// product and the approved wireframe cannot drift apart.
//
// Shared by the host and the companion. They are separate origins and separate
// builds, but the user sees one product, so the palette has one definition.
//
// Two naming schemes, same hex values:
//
//   brand.*   flat camelCase (brand-tealDark, brand-inkSoft). Used by the
//             host's login and dashboard screens.
//   nested    grouped (teal-dark, ink-soft). Used by the companion.
//
// Keeping both is deliberate. They arrived from two people working in
// parallel, both are in use, and unifying them would mean touching every
// className in the product for no user-visible gain. One source of truth for
// the colours matters; one naming convention does not.

// ---------------------------------------------------------------------------
// Momentum blue.
//
// The product previously ran on the wireframe's teal (#006D77). Momentum's own
// identity is blue, so the primary ramp below is blue and the teal is gone.
//
// ASSUMPTION: these hexes are a Momentum-style blue ramp, not values read off
// an official brand guide. If you have the guide, correct the four constants
// here and the entire product follows: host and companion both build their
// Tailwind palette from this file, so nothing else needs touching.
//
// Why the keys below are still called `teal*`: every className in both apps
// spells `brand-teal`, `teal-dark`, `teal-tint`. Renaming the tokens would mean
// editing hundreds of classNames for no user-visible gain, which is the same
// trade-off already documented for the two naming schemes further down. The
// honest names live here; the legacy keys alias onto them.
// ---------------------------------------------------------------------------

const momentum = {
  /** Primary. Buttons, links, active states, gradient start. */
  blue: "#0033A0",
  /** Darker step. Hover states and the middle of the brand gradient. */
  blueDark: "#00246E",
  /** Lighter step. Gradient end, avatar fills, accent washes. */
  blueLight: "#4C8FD8",
  /** Palest wash. Page grounds and quiet tinted panels. */
  blueTint: "#EBF1FB",
} as const;

/** Raw values. Single source of truth for both schemes below. */
const raw = {
  // Legacy key names, Momentum blue values. See the note above.
  teal: momentum.blue,
  tealDark: momentum.blueDark,
  // `blue` has always meant "the lighter accent" in this palette, and still
  // does. Keeping that meaning is what lets the brand gradient
  // (from-brand-teal via-brand-tealDark to-brand-blue) stay a real gradient.
  blue: momentum.blueLight,
  blueTint: momentum.blueTint,
  amber: "#F4A261",
  amberTint: "#FDF1E6",
  amberText: "#9A5B22",
  amberBorder: "#F0C48A",
  green: "#52B788",
  greenTint: "#EAF7F0",
  greenText: "#1B6B45",
  bg: "#FAFAFA",
  // Claims screens use a warmer ground than the rest of the product. A
  // bereaved person should not be looking at the same clinical white as
  // someone adjusting a premium.
  bgClaims: "#FAF9F6",
  surface: "#FFFFFF",
  border: "#E7E5E1",
  ink: "#1F2933",
  inkSoft: "#52606D",
  inkFaint: "#8A9199",
} as const;

/** Flat scheme: `brand-tealDark`, `brand-inkSoft`, etc. */
export const brand = raw;

/** Nested scheme: `teal-dark`, `ink-soft`, `amber-tint`, etc. */
export const colors = {
  brand: raw,
  teal: {
    DEFAULT: raw.teal,
    dark: raw.tealDark,
    light: raw.blue,
    tint: raw.blueTint,
  },
  // Caution / needs-a-human. Used for the beneficiary banner and for any
  // change held back for human review.
  amber: {
    DEFAULT: raw.amber,
    tint: raw.amberTint,
    text: raw.amberText,
    border: raw.amberBorder,
  },
  // Confirmed / done. Never used for an estimate or an unassessed claim.
  green: {
    DEFAULT: raw.green,
    tint: raw.greenTint,
    text: raw.greenText,
  },
  ink: {
    DEFAULT: raw.ink,
    soft: raw.inkSoft,
    faint: raw.inkFaint,
  },
  surface: raw.surface,
  canvas: raw.bg,
  claims: raw.bgClaims,
  line: raw.border,
} as const;

export const radius = {
  card: "14px",
  bubble: "20px",
  btn: "10px",
} as const;

export const shadow = {
  card: "0 4px 24px rgba(20,30,30,0.06)",
  sm: "0 2px 10px rgba(20,30,30,0.05)",
  // Tinted with the primary (#0033A0), so a raised element reads as brand
  // rather than as a grey drop shadow.
  pill: "0 6px 20px rgba(0,51,160,0.18)",
} as const;

/**
 * The primary as rgba, for the handful of places that need a translucent brand
 * colour inside an arbitrary Tailwind value (shadows, radial gradients).
 * Exported so those call sites stop hardcoding the hex channel by channel.
 */
export const brandRgb = {
  blue: "0,51,160",
  blueDark: "0,36,110",
  blueLight: "76,143,216",
} as const;

// Not `as const`: Tailwind's config type wants mutable string arrays here.
export const fontFamily: Record<string, string[]> = {
  sans: ["Inter", "system-ui", "sans-serif"],
  serif: ["Fraunces", "serif"],
};
