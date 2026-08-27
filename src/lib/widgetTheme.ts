export type WidgetTheme = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  onAccent: string;
  source: "brand" | "fallback";
};

const FALLBACK_ACCENT = "#2563eb";
const FALLBACK_ACCENT_HOVER = "#1d4ed8";
const FALLBACK_ACCENT_SOFT = "#dbeafe";
const FALLBACK_ON_ACCENT = "#ffffff";

function parseHex(color: string): [number, number, number] | null {
  const raw = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(raw);
  if (short) {
    const n = short[1];
    return [
      parseInt(n[0] + n[0], 16),
      parseInt(n[1] + n[1], 16),
      parseInt(n[2] + n[2], 16),
    ];
  }
  const long = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!long) return null;
  const n = long[1];
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function mix(
  color: [number, number, number],
  target: [number, number, number],
  amount: number
): [number, number, number] {
  return [
    color[0] + (target[0] - color[0]) * amount,
    color[1] + (target[1] - color[1]) * amount,
    color[2] + (target[2] - color[2]) * amount,
  ];
}

function readableOnAccent(accent: [number, number, number]): [number, number, number] {
  const white: [number, number, number] = [255, 255, 255];
  const dark: [number, number, number] = [15, 23, 42];
  return contrastRatio(accent, white) >= contrastRatio(accent, dark) ? white : dark;
}

function ensureButtonContrast(accent: [number, number, number]): [number, number, number] {
  let next = accent;
  const on = readableOnAccent(next);
  for (let i = 0; i < 8 && contrastRatio(next, on) < 4.5; i += 1) {
    next = mix(next, on[0] > 200 ? [15, 23, 42] : [255, 255, 255], 0.18);
  }
  if (contrastRatio(next, readableOnAccent(next)) < 4.5) {
    return parseHex(FALLBACK_ACCENT)!;
  }
  return next;
}

const FALLBACK_THEME: WidgetTheme = {
  accent: FALLBACK_ACCENT,
  accentHover: FALLBACK_ACCENT_HOVER,
  accentSoft: FALLBACK_ACCENT_SOFT,
  onAccent: FALLBACK_ON_ACCENT,
  source: "fallback",
};

export function deriveWidgetTheme(primaryColor?: string, secondaryColor?: string): WidgetTheme {
  const parsed = parseHex(primaryColor || "") || parseHex(secondaryColor || "");
  if (!parsed) {
    return FALLBACK_THEME;
  }

  const accentRgb = ensureButtonContrast(parsed);
  const onRgb = readableOnAccent(accentRgb);
  const hoverRgb = mix(accentRgb, onRgb[0] > 200 ? [15, 23, 42] : [255, 255, 255], 0.16);
  const softRgb = mix(accentRgb, [255, 255, 255], 0.82);

  return {
    accent: toHex(accentRgb),
    accentHover: toHex(hoverRgb),
    accentSoft: toHex(softRgb),
    onAccent: toHex(onRgb),
    source: "brand",
  };
}

export function widgetThemeStyle(theme: WidgetTheme): Record<string, string> {
  return {
    "--pt-accent": theme.accent,
    "--pt-accent-hover": theme.accentHover,
    "--pt-accent-soft": theme.accentSoft,
    "--pt-on-accent": theme.onAccent,
  };
}
