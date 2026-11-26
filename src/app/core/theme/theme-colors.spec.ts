import { contrast, DEFAULT_THEME, mix, onColor, themeVars } from './theme-colors';

describe('colores de la marca', () => {
  it('los colores por defecto reproducen el diseño actual', () => {
    const v = themeVars(DEFAULT_THEME);
    expect(v['--navy']).toBe('#0F2A4A');
    expect(v['--on-navy']).toBe('#ffffff');
    expect(v['--blue']).toBe('#2563EB');
  });

  it('sobre un color claro el texto pasa a oscuro, y siempre se lee (contraste ≥ 4,5)', () => {
    for (const c of ['#FACC15', '#F5F5F5', '#22C55E', '#B91C1C', '#0F2A4A', '#7C3AED', '#00A3E0']) {
      expect(contrast(c, onColor(c))).toBeGreaterThanOrEqual(4.5);
    }
    expect(onColor('#FACC15')).toBe('#0f1d33');
    expect(onColor('#B91C1C')).toBe('#ffffff');
  });

  it('mezcla y valores inválidos', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(themeVars({ primary: 'rojo', secondary: '' })['--navy']).toBe('#0F2A4A');
  });
});
