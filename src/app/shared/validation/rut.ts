/**
 * RUT chileno: limpiar, validar el dígito verificador y dar formato.
 * Se guarda normalizado ('12345678-5') y se muestra con puntos ('12.345.678-5').
 * La base de datos valida lo mismo con rut_is_valid.
 */

/** '12.345.678-5', '123456785', '12345678-k' → '12345678-5' / '12345678-K'. null si no tiene forma de RUT. */
export function normalizeRut(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').toUpperCase().replace(/[^0-9K]/g, '');
  if (s.length < 8 || s.length > 9) return null;
  const body = s.slice(0, -1);
  const dv = s.slice(-1);
  if (!/^[0-9]+$/.test(body)) return null;
  return `${body}-${dv}`;
}

export function rutCheckDigit(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  return res === 11 ? '0' : res === 10 ? 'K' : String(res);
}

export function isValidRut(raw: string | null | undefined): boolean {
  const n = normalizeRut(raw);
  if (!n) return false;
  const [body, dv] = n.split('-');
  return rutCheckDigit(body) === dv;
}

/** '12345678-5' → '12.345.678-5'. Si no es un RUT, devuelve el texto tal cual. */
export function formatRut(raw: string | null | undefined): string {
  const n = normalizeRut(raw);
  if (!n) return String(raw ?? '');
  const [body, dv] = n.split('-');
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

/** Validador para Reactive Forms: vacío es válido (el RUT es opcional). */
export function rutValidator(control: { value: unknown }): { rut: true } | null {
  const v = String(control.value ?? '').trim();
  return v === '' || isValidRut(v) ? null : { rut: true };
}
