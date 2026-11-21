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
