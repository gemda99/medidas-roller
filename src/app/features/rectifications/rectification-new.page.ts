import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomerRepository } from '../../data-access/repositories/customer.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { Customer, CustomerWithAddresses } from '../../domain/models/customer';
import { toUserMessage } from '../../shared/errors';
import { todayInSantiago } from '../../shared/format';

/**
 * Nueva rectificación en 2 toques: elegir cliente y dirección. La dirección se copia
 * a la rectificación (cambios futuros del cliente no alteran este trabajo).
 */
@Component({
  selector: 'app-rectification-new-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      <a routerLink="/rectificaciones" class="muted">‹ Rectificaciones</a>
      <h1>Nueva rectificación</h1>
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }

      @if (!customer()) {
        <section class="card stack">
          <h2>1. Cliente</h2>
          <div class="field">
            <label for="q">Buscar por nombre o teléfono</label>
            <input id="q" type="search" [ngModel]="term()" (ngModelChange)="onSearch($event)" autocomplete="off" />
          </div>
          @if (searching()) { <div class="skeleton"></div> }
          @for (c of results(); track c.id) {
            <button type="button" class="btn btn-block pick" (click)="choose(c)">
              <strong>{{ c.full_name }}</strong><span class="muted">{{ c.phone }}</span>
            </button>
          }
          <a [routerLink]="['/clientes/nuevo']" [queryParams]="term() ? { nombre: term() } : {}" class="btn btn-block">
            + Crear cliente nuevo
          </a>
        </section>
      } @else {
        <section class="card stack">
          <div class="spread">
            <h2>1. Cliente</h2>
            <button type="button" class="btn btn-ghost" (click)="customer.set(null)">Cambiar</button>
          </div>
          <strong>{{ customer()!.full_name }}</strong>
        </section>

        <section class="card stack">
          <h2>2. Dirección de la visita</h2>
          @if (customer()!.customer_addresses.length === 0) {
            <p class="muted" style="margin:0">El cliente no tiene direcciones.</p>
            <a [routerLink]="['/clientes', customer()!.id]" class="btn">Agregar dirección al cliente</a>
          }
          @for (a of customer()!.customer_addresses; track a.id) {
            <label class="addr" [class.on]="addressId() === a.id">
              <input type="radio" name="addr" [value]="a.id" [checked]="addressId() === a.id" (change)="addressId.set(a.id)" />
              <span class="stack" style="gap:0">
                <strong>{{ a.address_line }}</strong>
                <span class="muted">{{ a.comuna }}@if (a.reference) { · {{ a.reference }} }</span>
              </span>
            </label>
          }
          <div class="field">
            <label for="visit">Fecha de visita</label>
            <input id="visit" type="date" [(ngModel)]="visitDate" />
          </div>
        </section>

        <button type="button" class="btn btn-primary btn-block" [disabled]="saving() || !addressId()" (click)="create()">
          {{ saving() ? 'Creando…' : 'Crear y agregar ubicaciones' }}
        </button>
      }
    </div>
  `,
  styles: `
    .pick { justify-content: space-between; }
    .addr { display: flex; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--line-strong); border-radius: 12px; cursor: pointer; min-height: 56px; }
    .addr.on { border-color: var(--navy); background: var(--soft); }
    .addr input { width: 22px; height: 22px; accent-color: var(--navy); }
  `,
})
export class RectificationNewPage implements OnInit {
  private readonly customers = inject(CustomerRepository);
  private readonly repo = inject(RectificationRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly term = signal('');
  readonly results = signal<Customer[]>([]);
  readonly searching = signal(false);
  readonly customer = signal<CustomerWithAddresses | null>(null);
  readonly addressId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  visitDate = todayInSantiago();

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.queryParamMap.get('cliente');
    if (id) {
      await this.choose({ id } as Customer);
    } else {
      await this.search();
    }
  }

  onSearch(v: string): void {
    this.term.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.search(), 300);
  }

  private async search(): Promise<void> {
    this.searching.set(true);
    try {
      this.results.set(await this.customers.search(this.term(), 8));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.searching.set(false);
    }
  }

  async choose(c: Customer): Promise<void> {
    this.error.set(null);
    try {
      const full = await this.customers.getById(c.id);
      this.customer.set(full);
      this.addressId.set(full.customer_addresses.find((a) => a.is_default)?.id ?? full.customer_addresses[0]?.id ?? null);
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  async create(): Promise<void> {
    const c = this.customer();
    const a = c?.customer_addresses.find((x) => x.id === this.addressId());
    if (!c || !a) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = await this.repo.create({
        customer_id: c.id,
        address_line: a.address_line,
        comuna: a.comuna,
        address_reference: a.reference,
        visit_date: this.visitDate || todayInSantiago(),
      });
      await this.router.navigate(['/rectificaciones', id]);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
