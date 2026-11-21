import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export const isSupabaseConfigured = (): boolean =>
  Boolean(environment.supabaseUrl && environment.supabaseAnonKey);

/**
 * Cliente único de Supabase. Solo usa la clave anon: la seguridad real está en RLS.
 * Se inyecta como token para poder reemplazarlo por un doble en las pruebas.
 */
export const SUPABASE = new InjectionToken<SupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient(
      environment.supabaseUrl || 'http://localhost:54321',
      environment.supabaseAnonKey || 'sin-configurar',
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
    ),
});
