import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideClipboardList, LucideHouse, LucideLogOut, LucideSettings, LucideUsers } from '@lucide/angular';
import { AuthService } from '../auth/auth.service';

/**
 * Marco de la app con sesión: menú lateral en computador y barra inferior en teléfono.
 * Solo muestra secciones ya construidas; las siguientes se agregan en su sprint.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideHouse, LucideUsers, LucideLogOut, LucideClipboardList, LucideSettings],
  template: `
    <div class="layout">
      <nav class="side" aria-label="Menú principal">
        <div class="brand">Medidas Roller</div>
        <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
          <svg lucideHouse [size]="20" aria-hidden="true"></svg> Inicio
        </a>
        <a routerLink="/rectificaciones" routerLinkActive="on">
          <svg lucideClipboardList [size]="20" aria-hidden="true"></svg> Rectificaciones
        </a>
        <a routerLink="/clientes" routerLinkActive="on">
          <svg lucideUsers [size]="20" aria-hidden="true"></svg> Clientes
        </a>
        @if (auth.isAdmin()) {
          <a routerLink="/admin" routerLinkActive="on">
            <svg lucideSettings [size]="20" aria-hidden="true"></svg> Administración
          </a>
        }
        <div class="who">
          <strong>{{ auth.profile()?.full_name }}</strong>
          <span>{{ auth.isAdmin() ? 'Administrador' : 'Medidor' }}</span>
        </div>
        <button type="button" class="out" (click)="signOut()">
          <svg lucideLogOut [size]="20" aria-hidden="true"></svg> Cerrar sesión
        </button>
      </nav>

      <main class="content">
        @if (offline()) {
          <div class="offline" role="status">Sin conexión. Lo que escribas se guarda en el teléfono hasta que vuelva la señal.</div>
        }
        <router-outlet />
      </main>

      <nav class="bottom" aria-label="Menú principal">
        <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
          <svg lucideHouse [size]="22" aria-hidden="true"></svg><span>Inicio</span>
        </a>
        <a routerLink="/rectificaciones" routerLinkActive="on">
          <svg lucideClipboardList [size]="22" aria-hidden="true"></svg><span>Rectificaciones</span>
        </a>
        <a routerLink="/clientes" routerLinkActive="on">
          <svg lucideUsers [size]="22" aria-hidden="true"></svg><span>Clientes</span>
        </a>
        @if (auth.isAdmin()) {
          <a routerLink="/admin" routerLinkActive="on">
            <svg lucideSettings [size]="22" aria-hidden="true"></svg><span>Admin</span>
          </a>
        }
        <button type="button" (click)="signOut()">
          <svg lucideLogOut [size]="22" aria-hidden="true"></svg><span>Salir</span>
        </button>
      </nav>
    </div>
  `,
  styleUrl: './shell.css',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly offline = signal(typeof navigator !== 'undefined' && navigator.onLine === false);

  constructor() {
    const update = () => this.offline.set(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/ingresar');
  }
}
