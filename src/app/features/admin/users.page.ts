import { Component, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminCatalogRepository } from '../../data-access/repositories/admin-catalog.repository';
import { Profile, Role } from '../../domain/models/profile';
import { toUserMessage } from '../../shared/errors';

/**
 * Usuarios: cambiar nombre, perfil y activar/desactivar. Crear cuentas se hace en Supabase
 * (Authentication › Users › Add user) porque requiere la clave secreta, que nunca va en la app.
 */
@Component({
  selector: 'app-users-page',
  template: `
    <div class="page">
      <div class="alert alert-warn" role="note">
        Para crear un usuario nuevo: Supabase › Autenticación › Usuarios › Agregar usuario (con «Confirmar automáticamente»).
        Aparece aquí como medidor.
      </div>
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      @if (info()) { <div class="alert alert-ok" role="status">{{ info() }}</div> }
      @for (u of users(); track u.id) {
        <section class="card row u" [class.off]="!u.active">
          <input class="grow" [value]="u.full_name" [attr.aria-label]="'Nombre de ' + u.full_name" (change)="update(u, { full_name: $any($event.target).value.trim() })" />
          <select [value]="u.role" [attr.aria-label]="'Perfil de ' + u.full_name" (change)="update(u, { role: $any($event.target).value })">
            <option value="medidor">Medidor</option>
            <option value="admin">Administrador</option>
          </select>
          <button type="button" class="btn" [disabled]="u.id === me()" (click)="update(u, { active: !u.active })">{{ u.active ? 'Desactivar' : 'Activar' }}</button>
          @if (u.id === me()) { <span class="muted">(tú)</span> }
        </section>
      }
    </div>
  `,
  styles: `
    .u.off { opacity: .6; }
    .grow { flex: 1; min-width: 160px; min-height: 44px; border: 1px solid var(--line-strong); border-radius: 10px; padding: 0 10px; font: 16px Inter, sans-serif; }
    select { min-height: 44px; border: 1px solid var(--line-strong); border-radius: 10px; font: 15px Inter, sans-serif; padding: 0 8px; }
  `,
})
export class UsersPage implements OnInit {
  private readonly repo = inject(AdminCatalogRepository);
  private readonly auth = inject(AuthService);
  readonly users = signal<Profile[]>([]);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly me = () => this.auth.profile()?.id;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.users.set(await this.repo.listProfiles());
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  async update(u: Profile, patch: Partial<{ full_name: string; role: Role; active: boolean }>): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    if (patch.full_name !== undefined && patch.full_name.length < 2) return;
    try {
      await this.repo.updateProfile(u.id, patch);
      this.info.set('Guardado.');
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
    await this.load();
  }
}
