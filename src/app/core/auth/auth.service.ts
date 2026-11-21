import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SUPABASE } from '../../data-access/supabase/supabase.client';
import { Profile } from '../../domain/models/profile';

/**
 * Estado de sesión y perfil. Expone signals de solo lectura.
 * La autorización real la hace RLS; aquí solo se decide qué mostrar.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);

  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _ready = signal(false);
  private initPromise: Promise<void> | null = null;

  readonly session = this._session.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isLoggedIn = computed(() => this._session() !== null && this._profile()?.active === true);
  readonly isAdmin = computed(() => this.isLoggedIn() && this._profile()?.role === 'admin');

  /** Carga la sesión guardada una sola vez; los guards esperan esta promesa. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      const { data } = await this.supabase.auth.getSession();
      await this.applySession(data.session);
      this.supabase.auth.onAuthStateChange((_event, session) => {
        // Diferido para no llamar a Supabase dentro del callback (recomendación de supabase-js).
        setTimeout(() => void this.applySession(session));
      });
      this._ready.set(true);
    })();
    return this.initPromise;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    await this.applySession(data.session);
    if (!this._profile()?.active) {
      await this.supabase.auth.signOut();
      this._session.set(null);
      throw { message: 'Tu usuario está desactivado. Habla con el administrador.', code: 'P0001' };
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this._session.set(null);
    this._profile.set(null);
  }

  async sendPasswordReset(email: string): Promise<void> {
    const redirectTo = `${window.location.origin}/nueva-clave`;
    const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  private async applySession(session: Session | null): Promise<void> {
    this._session.set(session);
    if (!session) {
      this._profile.set(null);
      return;
    }
    if (this._profile()?.id === session.user.id) return;
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, role, active')
      .eq('id', session.user.id)
      .maybeSingle();
    this._profile.set(error || !data ? null : (data as Profile));
  }
}
