import { ApplicationRef, Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, viewChild, viewChildren } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessRepository } from '../../data-access/repositories/business.repository';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { ConfectionCurtain, confectionSheet } from '../../domain/confection/confection-engine';
import { confectionPages } from '../../domain/confection/confection-pages';
import { BusinessSettings, EMPTY_BUSINESS } from '../../domain/models/business';
import { Rectification } from '../../domain/models/rectification';
import { toUserMessage } from '../../shared/errors';
import { canShareFiles, downloadFiles, PngFile, renderPng, revokeFiles, shareFiles, toFiles, watchZoom } from '../../shared/images/png-export';
import { ConfectionSheetComponent } from './confection-sheet.component';

/**
 * Hoja de confección para fábrica (HU-43): imagen sin precios con las medidas de corte.
 * Se arma con los datos actuales de la rectificación; no se guarda en Supabase (se vuelve a generar cuando se pide).
 */
@Component({
  selector: 'app-confection-page',
  imports: [RouterLink, ConfectionSheetComponent],
  template: `
    <div class="page">
      <a class="back" [routerLink]="['/rectificaciones', id]">‹ Volver a la rectificación</a>
      <h1>Hoja de confección</h1>
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (rect(); as r) {
        @if (!curtains().length) {
          <p class="muted">Esta rectificación no tiene cortinas.</p>
        } @else {
          @if (warnings().length) {
            <div class="alert alert-warn">
              @for (w of warnings(); track w) { <div>{{ w }}</div> }
            </div>
          }
          @if (shots().length) {
            <div class="actions">
              @if (canShare()) { <button type="button" class="btn btn-primary btn-block" (click)="share()">Compartir</button> }
              <button type="button" class="btn btn-block" (click)="download()">Descargar {{ shots().length > 1 ? shots().length + ' imágenes' : 'imagen' }}</button>
            </div>
            <div class="shots">
              @for (s of shots(); track s.url) { <img [src]="s.url" [alt]="'Hoja de confección, imagen ' + ($index + 1)" /> }
            </div>
          } @else {
            <p class="muted">Sin precios. Se calcula con las medidas actuales y las reglas de cada producto (Administración › Catálogo).</p>
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="generate()">{{ busy() ? 'Creando…' : 'Crear imagen' }}</button>
            <div class="preview" #preview>
              <div [style.zoom]="zoom()">
                @for (p of pages(); track $index) {
                  <app-confection-sheet class="pg" [rect]="r" [business]="business()" [logo]="logo()" [rows]="p" [total]="curtains().length" [pageIndex]="$index" [pageCount]="pages().length" />
                }
              </div>
            </div>
          }
        }
      }
    </div>

    @if (rect(); as r) {
      <div class="capture" aria-hidden="true">
        @for (p of pages(); track $index) {
          <app-confection-sheet #cap [rect]="r" [business]="business()" [logo]="logo()" [rows]="p" [total]="curtains().length" [pageIndex]="$index" [pageCount]="pages().length" />
        }
      </div>
    }
  `,
  styles: `
    .back { display: inline-block; color: var(--muted); text-decoration: none; font-weight: 600; }
    .actions { display: grid; gap: 8px; }
    .shots { display: grid; gap: 12px; }
    .shots img, .preview { width: 100%; max-width: 720px; border-radius: 10px; box-shadow: 0 1px 2px rgb(15 29 51 / 8%), 0 4px 16px rgb(15 29 51 / 8%); }
    .shots img { display: block; height: auto; background: #fff; }
    .preview { overflow: hidden; background: #fff; }
    .pg + .pg { border-top: 8px solid var(--bg); }
    .capture { position: fixed; left: -12000px; top: 0; width: 1080px; pointer-events: none; }
  `,
})
export class ConfectionPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly rects = inject(RectificationRepository);
  private readonly catalog = inject(CatalogRepository);
  private readonly biz = inject(BusinessRepository);
  private readonly appRef = inject(ApplicationRef);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly rect = signal<Rectification | null>(null);
  readonly curtains = signal<ConfectionCurtain[]>([]);
  readonly business = signal<BusinessSettings>({ ...EMPTY_BUSINESS });
  readonly logo = signal<string | null>(null);
  readonly shots = signal<PngFile[]>([]);
  readonly zoom = signal(0.5);

  readonly pages = computed(() => confectionPages(this.curtains(), this.rect()?.observations?.length ?? 0));
  readonly warnings = computed(() => {
    const missing = [...new Set(this.curtains().filter((c) => c.missing_rules).map((c) => c.product_code))];
    return missing.length
      ? [`${missing.join(', ')} no tiene reglas de confección: sus medidas de tela salen como «—».${this.auth.isAdmin() ? ' Cárgalas en Administración › Catálogo.' : ''}`]
      : [];
  });

  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  private readonly captures = viewChildren('cap', { read: ElementRef });
  private observer?: ResizeObserver;

  async ngOnInit(): Promise<void> {
    try {
      const [rect, cat, b] = await Promise.all([this.rects.get(this.id), this.catalog.load(), this.biz.get()]);
      const names = {
        options: new Map(cat.products.flatMap((p) => p.product_options.map((o) => [o.id, o.name] as [string, string]))),
        accessories: new Map(cat.accessories.map((a) => [a.id, a.name] as [string, string])),
      };
      this.rect.set(rect);
      this.curtains.set(confectionSheet(rect.locations, cat.products, names));
      this.business.set({ ...EMPTY_BUSINESS, ...b });
      this.logo.set(await this.biz.logoDataUrl(b.logo_path));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
      queueMicrotask(() => (this.observer = watchZoom(this.preview()?.nativeElement, (z) => this.zoom.set(z))));
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    revokeFiles(this.shots());
  }

  canShare(): boolean {
    return canShareFiles(this.shots());
  }

  async generate(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.appRef.tick();
      const els = this.captures().map((ref) => (ref.nativeElement as HTMLElement).querySelector('.sheet') as HTMLElement);
      const blobs = await renderPng(els);
      this.observer?.disconnect();
      this.shots.set(toFiles(blobs, this.fileBase()));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async share(): Promise<void> {
    try {
      await shareFiles(this.shots(), 'Hoja de confección');
    } catch {
      this.error.set('No se pudo compartir. Descarga la imagen y envíala.');
    }
  }

  download(): void {
    downloadFiles(this.shots());
  }

  /** «Confeccion-Pamela-Mendez». Sin tildes ni espacios para que el nombre funcione en cualquier equipo. */
  private fileBase(): string {
    const name = (this.rect()?.customers?.full_name ?? 'cliente')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `Confeccion-${name || 'cliente'}`;
  }
}
