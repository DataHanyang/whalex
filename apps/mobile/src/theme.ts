import { Platform, type TextStyle } from "react-native";

/**
 * Design tokens for WhaleX Mobile.
 *
 * The app is a readout for a machine working somewhere else, so the surface
 * reads as a deep-water instrument panel rather than a messaging app: a
 * blue-black ground, surfaces that lift with tinted elevation, and colour used
 * almost entirely to carry state (live / needs you / failed) instead of
 * decoration. `sonar` is the one true accent; everything else is semantic.
 */

export const colors = {
  /** App ground. Blue-black, never neutral — it sits under everything. */
  abyss: "#0B0F14",
  /** Raised surface: tool rows, list rows, cards. */
  hull: "#131A22",
  /** Higher surface: sheets, inputs, code blocks. */
  hull2: "#1B242E",
  /** Hairlines and card edges. */
  line: "#26313D",
  /** Stronger edge for focus and active states. */
  lineStrong: "#35435291",

  /** Primary text. */
  foam: "#E6EDF3",
  /** Secondary text: descriptions, meta. */
  mist: "#8FA3B5",
  /** Tertiary: timestamps, hints, disabled. */
  deep: "#5A6B7C",

  /** The accent: live activity, links, primary actions. */
  sonar: "#38BDF8",
  sonarSoft: "#0E2A3C",
  /** Attention — something is waiting on you. */
  beacon: "#F5A524",
  beaconSoft: "#3A2A0C",
  /** Failure and destructive actions. */
  coral: "#F2555A",
  coralSoft: "#3A1418",
  /** Completion. */
  kelp: "#34D399",
  kelpSoft: "#0C2E23",

  /** Diff shading — tuned to stay legible on `hull2`. */
  addBg: "#0F2E20",
  addFg: "#7EE2B8",
  delBg: "#331519",
  delFg: "#FF9DA2",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * IBM Plex — a family drawn for engineering documentation, which is what an
 * agent transcript actually is. Loaded at boot; `fallback` keeps the app
 * legible for the frame before the fonts resolve.
 */
export const font = {
  sans: "PlexSans",
  sansMedium: "PlexSansMedium",
  sansSemi: "PlexSansSemi",
  mono: "PlexMono",
  monoMedium: "PlexMonoMedium",
} as const;

const monoFallback = Platform.select({ ios: "Menlo", default: "monospace" });

export const type = {
  display: {
    fontFamily: font.sansSemi,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.foam,
  },
  title: {
    fontFamily: font.sansSemi,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.2,
    color: colors.foam,
  },
  heading: {
    fontFamily: font.sansSemi,
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.foam,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 23,
    color: colors.foam,
  },
  ui: {
    fontFamily: font.sansMedium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.foam,
  },
  label: {
    fontFamily: font.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: colors.mist,
  },
  caption: {
    fontFamily: font.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.deep,
  },
  mono: {
    fontFamily: font.mono,
    fontSize: 12.8,
    lineHeight: 19,
    color: colors.foam,
  },
  monoSmall: {
    fontFamily: font.mono,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.mist,
  },
} satisfies Record<string, TextStyle>;

/** Applied before the bundled fonts finish loading. */
export const fontFallback = {
  sans: Platform.select({ ios: "System", default: "sans-serif" }),
  mono: monoFallback,
};
