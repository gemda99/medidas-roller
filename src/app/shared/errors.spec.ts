import { toUserMessage } from './errors';

describe('toUserMessage', () => {
  it('credenciales inválidas', () => {
    expect(toUserMessage({ message: 'Invalid login credentials' })).toBe('El correo o la contraseña no coinciden.');
  });
  it('sin conexión', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'))).toContain('No hay conexión');
  });
  it('RLS sin permiso', () => {
    expect(toUserMessage({ code: '42501', message: 'new row violates row-level security policy' })).toContain('no tiene permiso');
  });
  it('restricción de formato', () => {
    expect(toUserMessage({ code: '23514', message: 'check constraint' })).toContain('formato inválido');
  });
  it('mensaje propio de la base (P0001) se muestra tal cual', () => {
    expect(toUserMessage({ code: 'P0001', message: 'Debe quedar al menos un administrador activo' })).toBe(
      'Debe quedar al menos un administrador activo',
    );
  });
  it('error desconocido: mensaje genérico sin detalles técnicos', () => {
    expect(toUserMessage({ message: 'relation "x" does not exist', code: '42P01' })).toBe(
      'Algo salió mal. Vuelve a intentar en unos segundos.',
    );
  });
  it('avisa cuando falta actualizar la base (función o columna inexistente)', () => {
    expect(toUserMessage({ code: 'PGRST202', message: 'Could not find the function public.admin_delete_rectification' })).toContain('aplicar_');
  });
});
