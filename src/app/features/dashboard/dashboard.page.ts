import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideUserPlus, LucideUsers } from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';

/** Inicio. Crece con cada sprint (borradores, cotizaciones recientes). */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, LucideUserPlus, LucideUsers],
  template: `
    <div class="page">
      <div class="stack" style="gap:4px">
        <span class="muted">Hola,</span>
        <h1>{{ auth.profile()?.full_name }}</h1>
      </div>
      <a routerLink="/clientes/nuevo" class="btn btn-primary btn-block" style="min-height:56px; font-size:16px">
        <svg lucideUserPlus [size]="20" aria-hidden="true"></svg> Nuevo cliente
      </a>
      <a routerLink="/clientes" class="btn btn-block">
        <svg lucideUsers [size]="20" aria-hidden="true"></svg> Ver clientes
      </a>
      <p class="muted">La rectificación y la cotización se activan en los próximos sprints.</p>
    </div>
  `,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
}
