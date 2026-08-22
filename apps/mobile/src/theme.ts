import { Platform, type TextStyle } from "react-native";

/**
 * Design tokens for WhaleX Mobile.
 *
 * Light, quiet, and text-first: the transcript is the product, so the surface
 * gets out of its way. Colour is almost entirely functional — DeepSeek's blue
 * marks what is yours to act on, and the state colours only appear when
 * something is running, waiting, or broken.
 */

export const colors = {
  /** Page ground. */
  bg: "#FFFFFF",
  /** Your own messages, collapsed rows, quiet fills. */
  surface: "#F3F4F6",
  /** Code, inputs, and anything that should read as inset. */
  surface2: "#F7F8FA",
  /** Hairlines. */
  border: "#E6E8EB",
  /** Stronger edge for focus. */
  borderStrong: "#CDD3DA",

  /** Primary text. */
  text: "#16191D",
  /** Secondary: descriptions, collapsed summaries. */
  muted: "#616A75",
  /** Tertiary: timestamps, hints, disabled. */
  faint: "#98A1AC",

  /** DeepSeek blue — the single accent. */
  accent: "#4D6BFE",
  accentSoft: "#EEF1FF",
  /** Live activity. */
  live: "#0EA5E9",
  /** Something is waiting on you. */
  attention: "#C2740B",
  attentionSoft: "#FDF4E3",
  /** Failure and destructive actions. */
  danger: "#D93A45",
  dangerSoft: "#FDF0F1",
  /** Completion. */
  ok: "#12874B",
  okSoft: "#EAF7EF",

  /** Diff shading. */
  addBg: "#E7F6EC",
  addFg: "#12683C",
  delBg: "#FDECEE",
  delFg: "#B3242F",

  /** Syntax, tuned for a light code panel. */
  synKeyword: "#7C3AED",
  synString: "#0B7A5B",
  synNumber: "#B45309",
  synComment: "#8A929B",
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
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

/**
 * IBM Plex — drawn for engineering documentation, which is what an agent
 * transcript is. Loaded at boot; see `fontFallback` for the first frame.
 */
export const font = {
  sans: "PlexSans",
  sansMedium: "PlexSansMedium",
  sansSemi: "PlexSansSemi",
  mono: "PlexMono",
  monoMedium: "PlexMonoMedium",
} as const;

export const type = {
  display: {
    fontFamily: font.sansSemi,
    fontSize: 26,
    lineHeight: 33,
    letterSpacing: -0.5,
    color: colors.text,
  },
  title: {
    fontFamily: font.sansSemi,
    fontSize: 18.5,
    lineHeight: 25,
    letterSpacing: -0.2,
    color: colors.text,
  },
  heading: {
    fontFamily: font.sansSemi,
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.text,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 15.5,
    lineHeight: 24,
    color: colors.text,
  },
  ui: {
    fontFamily: font.sansMedium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  label: {
    fontFamily: font.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: colors.muted,
  },
  caption: {
    fontFamily: font.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.faint,
  },
  mono: {
    fontFamily: font.mono,
    fontSize: 12.8,
    lineHeight: 19,
    color: colors.text,
  },
  monoSmall: {
    fontFamily: font.mono,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
  },
} satisfies Record<string, TextStyle>;

/** Applied before the bundled fonts finish loading. */
export const fontFallback = {
  sans: Platform.select({ ios: "System", default: "sans-serif" }),
  mono: Platform.select({ ios: "Menlo", default: "monospace" }),
};
