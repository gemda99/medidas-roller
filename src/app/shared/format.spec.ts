import { formatDate, parseDecimal, todayInSantiago } from './format';

describe('formatos', () => {
  it('fecha ISO a dd-mm-aaaa sin correr el día', () => {
    expect(formatDate('2026-11-18')).toBe('18-11-2026');
    expect(formatDate('2026-11-18T02:00:00Z')).toBe('18-11-2026');
    expect(formatDate(null)).toBe('');
  });

  it('hoy en Santiago aunque en UTC ya sea mañana', () => {
    // 21-11-2026 01:00 UTC = 20-11-2026 22:00 en Santiago (UTC-3)
    expect(todayInSantiago(new Date('2026-11-21T01:00:00Z'))).toBe('2026-11-20');
  });

  it('decimales con coma o punto', () => {
    expect(parseDecimal('148,5')).toBe(148.5);
    expect(parseDecimal(' 170 ')).toBe(170);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
  });
});

import { formatClp, parseClp } from './format';

describe('pesos chilenos', () => {
  it('formatea con punto de miles y sin decimales', () => {
    expect(formatClp(21000)).toBe('$21.000');
    expect(formatClp(246425)).toBe('$246.425');
    expect(formatClp(null)).toBe('');
  });
  it('lee montos escritos con o sin $ y puntos', () => {
    expect(parseClp('$21.000')).toBe(21000);
    expect(parseClp('100000')).toBe(100000);
    expect(parseClp('  ')).toBeNull();
    expect(parseClp('21,5')).toBeNaN();
    expect(parseClp('-5')).toBeNaN();
  });
});
