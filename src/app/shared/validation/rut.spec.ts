import { formatRut, isValidRut, normalizeRut, rutCheckDigit, rutValidator } from './rut';

describe('RUT', () => {
  it('normaliza con o sin puntos, guion y k minúscula', () => {
    expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
    expect(normalizeRut('123456785')).toBe('12345678-5');
    expect(normalizeRut('10.000.013-k')).toBe('10000013-K');
    expect(normalizeRut('123')).toBeNull();
  });
  it('valida el dígito verificador (igual que la base)', () => {
    expect(rutCheckDigit('12345678')).toBe('5');
    expect(isValidRut('12.345.678-5')).toBe(true);
    expect(isValidRut('10000013-K')).toBe(true);
    expect(isValidRut('11111111-1')).toBe(true);
    expect(isValidRut('12345678-4')).toBe(false);
  });
  it('formatea con puntos y el validador acepta vacío', () => {
    expect(formatRut('12345678-5')).toBe('12.345.678-5');
    expect(formatRut('7654321-6')).toBe('7.654.321-6');
    expect(rutValidator({ value: '' })).toBeNull();
    expect(rutValidator({ value: '12345678-4' })).toEqual({ rut: true });
  });
});
