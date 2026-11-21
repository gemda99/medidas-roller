import { FormControl } from '@angular/forms';
import { emptyToNull, normalizePhone, phoneValidator, PHONE_PATTERN } from './contact';

describe('validación de contacto', () => {
  it('normaliza teléfonos con guiones, puntos y paréntesis', () => {
    expect(normalizePhone('+56 (9) 1234-5678')).toBe('+56 9 1234 5678');
    expect(normalizePhone(' 9.8765.4321 ')).toBe('9 8765 4321');
  });

  it('acepta formatos chilenos habituales', () => {
    for (const ok of ['+56 9 1234 5678', '912345678', '+56912345678', '22 345 6789']) {
      expect(phoneValidator(new FormControl(ok))).toBeNull();
    }
  });

  it('rechaza teléfonos inválidos', () => {
    for (const bad of ['abc', '1234', '+56 9 1234 5678 9999 1']) {
      expect(phoneValidator(new FormControl(bad))).toEqual({ phone: true });
    }
  });

  it('el patrón coincide con la restricción de la base de datos', () => {
    expect(PHONE_PATTERN.source).toBe('^\\+?[0-9 ]{8,16}$');
  });

  it('convierte vacíos en null', () => {
    expect(emptyToNull('  ')).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
    expect(emptyToNull(' hola ')).toBe('hola');
  });
});
