/** Formatos de presentación en español de Chile. */

/** '2026-11-18' → '18-11-2026' (sin pasar por Date para no mover el día por zona horaria). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}-${m}-${y}` : iso;
}

/** Fecha de hoy en Santiago como 'YYYY-MM-DD', para inputs type=date. */
export function todayInSantiago(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Lee números escritos con coma o punto: '148,5' → 148.5. Vacío o inválido → NaN. */
export function parseDecimal(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').trim().replace(',', '.');
  return s === '' ? NaN : Number(s);
}
