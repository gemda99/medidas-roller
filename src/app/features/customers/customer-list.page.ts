import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucidePlus, LucideSearch, LucideChevronRight } from '@lucide/angular';
import { CustomerRepository } from '../../data-access/repositories/customer.repository';
import { Customer } from '../../domain/models/customer';
import { toUserMessage } from '../../shared/errors';

@Component({
  selector: 'app-customer-list-page',
  imports: [RouterLink, LucidePlus, LucideSearch, LucideChevronRight],
  template: `
    <div class="page">
      <div class="spread">
        <h1>Clientes</h1>
        <a routerLink="/clientes/nuevo" class="btn btn-primary">
          <svg lucidePlus [size]="18" aria-hidden="true"></svg> Nuevo cliente
        </a>
      </div>

      <div class="field">
        <label for="q" class="sr-only">Buscar cliente</label>
        <div class="search">
          <svg lucideSearch [size]="18" aria-hidden="true"></svg>
          <input id="q" type="search" placeholder="Nombre o teléfono" [value]="term()"
                 (input)="onSearch($any($event.target).value)" autocomplete="off" />
        </div>
      </div>

      @if (error()) {
        <div class="alert alert-error" role="alert">
          {{ error() }} <button type="button" class="btn btn-ghost" (click)="load()">Reintentar</button>
        </div>
      }

      @if (loading()) {
        <div class="stack" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (customers().length === 0 && !error()) {
        <div class="card stack empty">
          @if (term()) {
            <p>No hay clientes que coincidan con «{{ term() }}».</p>
            <a [routerLink]="['/clientes/nuevo']" [queryParams]="{ nombre: term() }" class="btn">Crear «{{ term() }}»</a>
          } @else {
            <p>Aún no hay clientes. Crea el primero para registrar su rectificación.</p>
            <a routerLink="/clientes/nuevo" class="btn btn-primary">Nuevo cliente</a>
          }
        </div>
      } @else {
        <ul class="list">
          @for (c of customers(); track c.id) {
            <li>
              <a class="list-item" [routerLink]="['/clientes', c.id]">
                <span class="stack" style="gap:2px">
                  <strong>{{ c.full_name }}</strong>
                  <span class="muted">{{ c.phone }}</span>
                </span>
                <svg lucideChevronRight [size]="20" aria-hidden="true" color="#5b6b82"></svg>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--line-strong); border-radius: 10px; padding: 0 12px; color: var(--muted); }
    .search input { border: 0; outline: none; min-height: 48px; flex: 1; font: 16px Inter, sans-serif; background: transparent; }
    .search:focus-within { outline: 3px solid #bcd3fb; border-color: var(--blue); }
    .empty p { margin: 0; }
  `,
})
export class CustomerListPage implements OnInit {
  private readonly repo = inject(CustomerRepository);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;

  readonly term = signal('');
  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit(): void {
    void this.load();
  }

  onSearch(value: string): void {
    this.term.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  async load(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.repo.search(this.term());
      if (id === this.requestId) this.customers.set(rows);
    } catch (e) {
      if (id === this.requestId) this.error.set(toUserMessage(e));
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
}
