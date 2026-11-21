import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucidePlus } from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { RectificationStatus, RectificationSummary } from '../../domain/models/rectification';
import { toUserMessage } from '../../shared/errors';
import { formatDate } from '../../shared/format';

type Filter = RectificationStatus | 'todas';

@Component({
  selector: 'app-rectification-list-page',
  imports: [RouterLink, LucidePlus, LucideChevronRight],
  template: `
    <div class="page">
      <div class="spread">
        <h1>Rectificaciones</h1>
        <a routerLink="/rectificaciones/nueva" class="btn btn-primary">
          <svg lucidePlus [size]="18" aria-hidden="true"></svg> Nueva
        </a>
      </div>

      <div class="tabs" role="tablist" aria-label="Filtrar por estado">
        @for (f of filters; track f.value) {
          <button type="button" role="tab" [attr.aria-selected]="filter() === f.value" [class.on]="filter() === f.value" (click)="setFilter(f.value)">
            {{ f.label }}
          </button>
        }
      </div>
      @if (auth.isAdmin()) { <p class="muted" style="margin:0">Como administrador ves las de todos los medidores.</p> }

      @if (error()) {
        <div class="alert alert-error" role="alert">{{ error() }} <button type="button" class="btn btn-ghost" (click)="load()">Reintentar</button></div>
      }

      @if (loading()) {
        <div class="stack" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (items().length === 0 && !error()) {
        <div class="card stack">
          <p style="margin:0">{{ filter() === 'borrador' ? 'No tienes borradores pendientes.' : 'Aún no hay rectificaciones aquí.' }}</p>
          <a routerLink="/rectificaciones/nueva" class="btn btn-primary">Nueva rectificación</a>
        </div>
      } @else {
        <ul class="list">
          @for (r of items(); track r.id) {
            <li>
              <a class="list-item" [routerLink]="['/rectificaciones', r.id]">
                <span class="stack" style="gap:2px">
                  <strong>{{ r.customers?.full_name }}</strong>
                  <span class="muted">{{ r.address_line }} · {{ r.comuna }}</span>
                  <span class="muted">Visita {{ fmt(r.visit_date) }}@if (auth.isAdmin()) { · {{ r.executive_name }} }</span>
                </span>
                <span class="row" style="flex-wrap:nowrap">
                  <span class="chip" [class.draft]="r.status === 'borrador'">{{ r.status === 'borrador' ? 'Borrador' : 'Completa' }}</span>
                  <svg lucideChevronRight [size]="20" aria-hidden="true" color="#5b6b82"></svg>
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .tabs { display: flex; gap: 6px; overflow-x: auto; }
    .tabs button { min-height: 40px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--line-strong); background: #fff; font: 600 14px Inter, sans-serif; color: var(--ink); cursor: pointer; flex: none; }
    .tabs button.on { background: var(--navy); border-color: var(--navy); color: #fff; }
    .chip.draft { background: var(--warn-bg); color: var(--warn); }
  `,
})
export class RectificationListPage implements OnInit {
  private readonly repo = inject(RectificationRepository);
  protected readonly auth = inject(AuthService);
  readonly fmt = formatDate;

  readonly filters: { value: Filter; label: string }[] = [
    { value: 'borrador', label: 'Borradores' },
    { value: 'completa', label: 'Completas' },
    { value: 'todas', label: 'Todas' },
  ];
  readonly filter = signal<Filter>('borrador');
  readonly items = signal<RectificationSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  setFilter(f: Filter): void {
    this.filter.set(f);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const f = this.filter();
      this.items.set(await this.repo.list(f === 'todas' ? {} : { status: f }));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
