import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PriceListRepository } from '../../data-access/repositories/price-list.repository';
import { PriceList } from '../../domain/models/pricing';
import { toUserMessage } from '../../shared/errors';
import { formatDate } from '../../shared/format';

const STATUS: Record<PriceList['status'], string> = { borrador: 'Borrador', vigente: 'Vigente', archivada: 'Archivado' };

@Component({
  selector: 'app-price-lists-page',
  imports: [RouterLink],
  template: `
    <div class="page">
      <p class="muted" style="margin:0">
        El tarifario <strong>vigente</strong> es el que se usa para cotizar y no se edita. Para cambiar precios,
        crea una copia, ajústala y actívala: el anterior queda archivado y las cotizaciones antiguas no cambian.
      </p>
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }

      @if (!loading() && !vigente()) {
        <div class="alert alert-warn" role="status">Aún no hay tarifario vigente: completa el borrador y actívalo para poder cotizar.</div>
      }

      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div>
      } @else {
        <ul class="list">
          @for (l of lists(); track l.id) {
            <li>
              <a class="list-item" [routerLink]="[l.id]">
                <span class="stack" style="gap:2px">
                  <strong>{{ l.name }}</strong>
                  <span class="muted">
                    @if (l.status === 'vigente') { Desde {{ fmt(l.valid_from) }} }
                    @else if (l.status === 'archivada') { Vigente desde {{ fmt(l.valid_from) }} }
                    @else { Creado {{ fmt(l.created_at) }} }
                  </span>
                </span>
                <span class="chip" [class.ok]="l.status === 'vigente'" [class.draft]="l.status === 'borrador'">{{ label(l) }}</span>
              </a>
            </li>
          }
        </ul>
        @if (vigente(); as v) {
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="copy(v.id)">Crear copia del vigente para cambiar precios</button>
        }
      }
    </div>
  `,
  styles: `
    .chip.ok { background: var(--ok-bg); color: var(--ok); }
    .chip.draft { background: var(--warn-bg); color: var(--warn); }
  `,
})
export class PriceListsPage implements OnInit {
  private readonly repo = inject(PriceListRepository);
  private readonly router = inject(Router);
  readonly fmt = formatDate;
  readonly lists = signal<PriceList[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly vigente = computed(() => this.lists().find((l) => l.status === 'vigente') ?? null);

  label(l: PriceList): string {
    return STATUS[l.status];
  }

  async ngOnInit(): Promise<void> {
    try {
      this.lists.set(await this.repo.list());
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async copy(fromId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const month = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date());
      const id = await this.repo.cloneAsDraft(fromId, `Tarifario ${month}`);
      await this.router.navigate(['/admin/tarifarios', id]);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
