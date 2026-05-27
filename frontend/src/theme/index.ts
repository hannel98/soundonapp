export const colors = {
  bg: "#0A0A0C",
  surface: "#141417",
  elevated: "#1C1C20",
  primary: "#FFB800",
  accent: "#FF3B30",
  token: "#00FF66",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A0A5",
  textTertiary: "#5C5C62",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  h1: { fontSize: 36, fontWeight: "900" as const, letterSpacing: -1.2, color: colors.textPrimary },
  h2: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6, color: colors.textPrimary },
  h3: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.textSecondary },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.5, color: colors.textSecondary, textTransform: "uppercase" as const },
};
