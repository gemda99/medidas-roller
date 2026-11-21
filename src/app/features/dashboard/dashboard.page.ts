import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideClipboardPlus, LucideUserPlus } from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { RectificationSummary } from '../../domain/models/rectification';
import { toUserMessage } from '../../shared/errors';
import { formatDate } from '../../shared/format';

/** Inicio: acceso rápido a una nueva rectificación y a los borradores pendientes. */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, LucideUserPlus, LucideClipboardPlus],
  template: `
    <div class="page">
      <div class="stack" style="gap:4px">
        <span class="muted">Hola,</span>
        <h1>{{ auth.profile()?.full_name }}</h1>
      </div>
      <a routerLink="/rectificaciones/nueva" class="btn btn-primary btn-block" style="min-height:56px; font-size:16px">
        <svg lucideClipboardPlus [size]="20" aria-hidden="true"></svg> Nueva rectificación
      </a>
      <a routerLink="/clientes/nuevo" class="btn btn-block">
        <svg lucideUserPlus [size]="20" aria-hidden="true"></svg> Nuevo cliente
      </a>

      <section class="stack">
        <div class="spread"><h2>Borradores pendientes</h2><a routerLink="/rectificaciones">Ver todas</a></div>
        @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
        @if (loading()) {
          <div class="skeleton"></div>
        } @else if (drafts().length === 0) {
          <div class="card"><p class="muted" style="margin:0">No tienes borradores. Las rectificaciones en curso aparecerán aquí.</p></div>
        } @else {
          <ul class="list">
            @for (r of drafts(); track r.id) {
              <li>
                <a class="list-item" [routerLink]="['/rectificaciones', r.id]">
                  <span class="stack" style="gap:2px">
                    <strong>{{ r.customers?.full_name }}</strong>
                    <span class="muted">{{ r.comuna }} · visita {{ fmt(r.visit_date) }}</span>
                  </span>
                  <span class="chip">Continuar</span>
                </a>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly repo = inject(RectificationRepository);
  readonly fmt = formatDate;
  readonly drafts = signal<RectificationSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.drafts.set(await this.repo.list({ status: 'borrador', limit: 5 }));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
