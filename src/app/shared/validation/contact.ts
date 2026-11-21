import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Igual a la restricción de la base: + opcional, dígitos y espacios, 8 a 16 caracteres. */
export const PHONE_PATTERN = /^\+?[0-9 ]{8,16}$/;

/** Normaliza un teléfono chileno para guardar: quita guiones, puntos y paréntesis; colapsa espacios. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[().-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const phoneValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = normalizePhone(String(c.value ?? ''));
  if (!v) return null; // "required" se valida aparte
  return PHONE_PATTERN.test(v) ? null : { phone: true };
};

/** Recorta y convierte cadenas vacías en null para campos opcionales. */
export function emptyToNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}
