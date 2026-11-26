/**
 * Colores derivados de la marca de cada empresa. TypeScript puro y probado.
 * El texto sobre el color principal se elige solo (blanco u oscuro) para que siempre se lea.
 */
export interface ThemeColors {
  primary: string;
  secondary: string;
}

export const DEFAULT_THEME: ThemeColors = { primary: '#0F2A4A', secondary: '#2563EB' };

export function isHex(c: string | null | undefined): c is string {
  return !!c && /^#[0-9a-f]{6}$/i.test(c);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Mezcla dos colores; t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Luminancia relativa (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Blanco u oscuro, el que se lea mejor sobre el color. */
export function onColor(bg: string): string {
  return contrast(bg, '#ffffff') >= contrast(bg, '#0f1d33') ? '#ffffff' : '#0f1d33';
}

/** Variables CSS a aplicar en :root. */
export function themeVars(t: ThemeColors): Record<string, string> {
  const primary = isHex(t.primary) ? t.primary : DEFAULT_THEME.primary;
  const secondary = isHex(t.secondary) ? t.secondary : DEFAULT_THEME.secondary;
  const on = onColor(primary);
  return {
    '--navy': primary,
    '--navy-hover': mix(primary, on === '#ffffff' ? '#ffffff' : '#000000', 0.14),
    '--on-navy': on,
    '--on-navy-muted': mix(on, primary, 0.25),
    '--blue': secondary,
    '--blue-dark': mix(secondary, '#000000', 0.15),
    '--on-blue': onColor(secondary),
    '--soft': mix(secondary, '#ffffff', 0.9),
  };
}
