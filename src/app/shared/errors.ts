/**
 * Traduce errores de Supabase/PostgREST/red a mensajes en español,
 * sin culpar al usuario y sin detalles técnicos.
 */
export function toUserMessage(error: unknown): string {
  const e = (error ?? {}) as { message?: string; code?: string; status?: number; name?: string };
  const msg = (e.message ?? String(error ?? '')).toLowerCase();

  if (e.name === 'TypeError' && msg.includes('fetch')) return 'No hay conexión. Revisa la señal y vuelve a intentar.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'No hay conexión. Revisa la señal y vuelve a intentar.';
  if (msg.includes('invalid login credentials')) return 'El correo o la contraseña no coinciden.';
  if (msg.includes('email not confirmed')) return 'Esta cuenta aún no está confirmada. Pide al administrador que la active.';
  if (msg.includes('rate limit') || e.status === 429) return 'Demasiados intentos. Espera un minuto y vuelve a intentar.';
  if (msg.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (msg.includes('same password')) return 'La nueva contraseña debe ser distinta a la anterior.';
  if (e.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied'))
    return 'Tu usuario no tiene permiso para esta acción.';
  if (e.code === '23505') return msg.includes('rut') ? 'Ya existe un cliente con ese RUT. Búscalo en Clientes.' : 'Ese dato ya existe.';
  if (e.code === '23514') return 'Hay un dato con formato inválido. Revisa el formulario.';
  if (e.code === '23503') return 'No se puede completar porque hay datos relacionados.';
  if (e.code === 'P0001' && e.message) return e.message;
  if (e.code === 'PGRST116') return 'No encontramos ese registro.';
  // Función o columna que la base aún no tiene: falta ejecutar un «aplicar_….sql» en Supabase.
  if (e.code === 'PGRST202' || e.code === 'PGRST204' || e.code === '42883' || e.code === '42703')
    return 'La base de datos no está actualizada para esta función. El administrador debe ejecutar el último archivo «aplicar_….sql» en Supabase.';
  return 'Algo salió mal. Vuelve a intentar en unos segundos.';
}
