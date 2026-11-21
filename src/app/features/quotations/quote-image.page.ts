import { ApplicationRef, Component, ElementRef, inject, OnDestroy, OnInit, signal, viewChild, viewChildren, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessRepository, StoredDocument } from '../../data-access/repositories/business.repository';
import { QuotationRepository } from '../../data-access/repositories/quotation.repository';
import { BusinessSettings, conditionLines, EMPTY_BUSINESS } from '../../domain/models/business';
import { Quotation, STATUS_LABEL } from '../../domain/models/quotation';
import { buildRows, footerHeight, ImageRow, paginate } from '../../domain/quote-image/quote-pages';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { toUserMessage } from '../../shared/errors';
import { QuoteImagePageComponent } from './quote-image-page.component';

interface Shot {
  url: string;
  blob: Blob;
  name: string;
}

/**
 * Imagen de la cotización (HU-34/35). En borrador muestra la vista previa y permite emitir:
 * al emitir se congela la copia de los datos de la empresa, se generan los PNG y se guardan.
 * Emitida: muestra las imágenes guardadas para compartir por WhatsApp o descargar.
 */
@Component({
  selector: 'app-quote-image-view',
  imports: [RouterLink, QuoteImagePageComponent, ConfirmDialog],
  template: `
    <div class="page">
      <a class="back" [routerLink]="['/cotizaciones', qid]">← Volver a la cotización</a>
      @if (quote(); as q) {
        <div class="titlebar">
          <h1>{{ q.number }}</h1>
          <span class="badge">{{ statusLabel(q) }}</span>
        </div>
      }
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      @if (info()) { <div class="alert alert-ok" role="status" aria-live="polite">{{ info() }}</div> }

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (quote(); as q) {
        @if (shots().length) {
          <div class="actions">
            @if (canShare()) {
              <button type="button" class="btn btn-primary btn-block" (click)="share()">Compartir por WhatsApp</button>
            }
            <button type="button" class="btn btn-block" (click)="downloadAll()">
              Descargar {{ shots().length > 1 ? shots().length + ' imágenes' : 'imagen' }}
            </button>
            @if (auth.isAdmin()) {
              <button type="button" class="btn btn-block" [disabled]="busy()" (click)="askRegenerate()">Volver a generar</button>
            }
          </div>
          <div class="shots">
            @for (s of shots(); track s.url) { <img [src]="s.url" [alt]="'Imagen ' + ($index + 1) + ' de la cotización ' + q.number" /> }
          </div>
        } @else {
          @if (q.status === 'borrador') {
            <p class="muted">Vista previa. Al emitir, la cotización queda cerrada (ya no se edita) y se guarda la imagen para el cliente.</p>
            @if (missingBusiness()) {
              <div class="alert alert-warn">Faltan datos de la empresa (nombre o logo). @if (auth.isAdmin()) { Complétalos en <a routerLink="/admin/configuracion">Administración → Configuración</a>. }</div>
            }
          } @else {
            <p class="muted">Esta cotización está emitida pero aún no tiene imagen guardada.</p>
          }
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="q.status === 'borrador' ? askIssue() : generate()">
            {{ busy() ? 'Generando…' : q.status === 'borrador' ? 'Emitir y crear imagen' : 'Crear imagen' }}
          </button>
          <div class="preview" #preview>
            <div [style.zoom]="zoom()">
              @for (p of pages(); track $index) {
                <app-quote-sheet class="pg" [quote]="q" [business]="business()" [logo]="logo()" [rows]="p" [pageIndex]="$index" [pageCount]="pages().length" />
              }
            </div>
          </div>
        }
      }
    </div>

    <!-- Copia a tamaño real, fuera de la pantalla, solo para generar los PNG. -->
    @if (quote(); as q) {
      <div class="capture" aria-hidden="true">
        @for (p of pages(); track $index) {
          <app-quote-sheet #cap [quote]="q" [business]="business()" [logo]="logo()" [rows]="p" [pageIndex]="$index" [pageCount]="pages().length" />
        }
      </div>
    }

    <app-confirm-dialog #issueDlg title="¿Emitir la cotización?" message="Queda cerrada: ya no podrás cambiar precios ni descuentos. Si necesitas cambios después, crea una nueva." confirmLabel="Emitir" tone="primary" (confirmed)="issue()" />
    <app-confirm-dialog #regenDlg title="¿Volver a generar la imagen?" message="Se reemplazan las imágenes guardadas por unas nuevas con los mismos datos." confirmLabel="Volver a generar" tone="primary" (confirmed)="regenerate()" />
  `,
  styles: `
    .back { display: inline-block; margin-bottom: 4px; color: var(--muted); text-decoration: none; font-weight: 600; }
    .titlebar { display: flex; align-items: center; gap: 10px; }
    .titlebar h1 { margin: 0; }
    .badge { padding: 2px 10px; border-radius: 99px; background: var(--soft); color: var(--navy); font-weight: 600; font-size: 13px; }
    .actions { display: grid; gap: 8px; }
    .shots { display: grid; gap: 12px; }
    .shots img, .preview { width: 100%; max-width: 720px; border-radius: 10px; box-shadow: 0 1px 2px rgb(15 29 51 / 8%), 0 4px 16px rgb(15 29 51 / 8%); }
    .shots img { display: block; height: auto; background: #fff; }
    .preview { overflow: hidden; background: #fff; }
    .pg + .pg { border-top: 8px solid var(--bg); }
    .capture { position: fixed; left: -12000px; top: 0; width: 1080px; pointer-events: none; }
  `,
})
export class QuoteImagePage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly quotes = inject(QuotationRepository);
  private readonly biz = inject(BusinessRepository);
  private readonly appRef = inject(ApplicationRef);

  readonly qid = this.route.snapshot.paramMap.get('qid') ?? '';
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly quote = signal<Quotation | null>(null);
  readonly business = signal<BusinessSettings>({ ...EMPTY_BUSINESS });
  readonly logo = signal<string | null>(null);
  readonly docs = signal<StoredDocument[]>([]);
  readonly shots = signal<Shot[]>([]);
  readonly zoom = signal(0.5);

  readonly pages = computed<ImageRow[][]>(() => {
    const q = this.quote();
    if (!q) return [];
    const rows = buildRows(q.quotation_items);
    const footer = footerHeight(conditionLines(this.business().conditions_text).length);
    return paginate(rows, footer);
  });
  readonly missingBusiness = computed(() => !this.business().business_name && !this.logo());

  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  private readonly captures = viewChildren('cap', { read: ElementRef });
  private readonly issueDlg = viewChild.required<ConfirmDialog>('issueDlg');
  private readonly regenDlg = viewChild.required<ConfirmDialog>('regenDlg');
  private observer?: ResizeObserver;

  async ngOnInit(): Promise<void> {
    try {
      await this.load();
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
      queueMicrotask(() => this.watchWidth());
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.clearShots();
  }

  statusLabel(q: Quotation): string {
    return STATUS_LABEL[q.status];
  }

  canShare(): boolean {
    const files = this.files();
    return typeof navigator !== 'undefined' && !!navigator.canShare && files.length > 0 && navigator.canShare({ files });
  }

  private async load(): Promise<void> {
    const q = await this.quotes.get(this.qid);
    this.quote.set(q);
    // Emitida: siempre con la copia congelada. Borrador: con los datos actuales (vista previa).
    const b = q.status !== 'borrador' && q.business_snapshot ? q.business_snapshot : await this.biz.get();
    this.business.set({ ...EMPTY_BUSINESS, ...b });
    this.logo.set(await this.biz.logoDataUrl(this.business().logo_path));
    if (q.status !== 'borrador') {
      const docs = await this.biz.listDocuments(q.id);
      this.docs.set(docs);
      await this.showStored(docs, q.number);
    }
  }

  private watchWidth(): void {
    const el = this.preview()?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.observer?.disconnect();
    this.observer = new ResizeObserver(() => this.zoom.set(Math.min(1, el.clientWidth / 1080)));
    this.observer.observe(el);
  }

  askIssue(): void {
    this.issueDlg().open();
  }
  askRegenerate(): void {
    this.regenDlg().open();
  }

  /** Emite (congela datos de la empresa) y luego genera y guarda la imagen. */
  async issue(): Promise<void> {
    const q = this.quote();
    if (!q) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.quotes.issue(q.id);
      const fresh = await this.quotes.get(q.id);
      this.quote.set(fresh);
      if (fresh.business_snapshot) this.business.set({ ...EMPTY_BUSINESS, ...fresh.business_snapshot });
    } catch (e) {
      this.error.set(toUserMessage(e));
      this.busy.set(false);
      return;
    }
    await this.generate();
  }

  /** Genera los PNG desde la copia oculta a tamaño real y los guarda en Storage. */
  async generate(): Promise<void> {
    const q = this.quote();
    if (!q) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.appRef.tick();
      await document.fonts?.ready;
      const { domToBlob } = await import('modern-screenshot');
      const blobs: Blob[] = [];
      for (const ref of this.captures()) {
        const el = (ref.nativeElement as HTMLElement).querySelector('.sheet') as HTMLElement;
        const blob = await domToBlob(el, { type: 'image/png', scale: 1, backgroundColor: '#ffffff', timeout: 15000 });
        if (!blob) throw new Error('No se pudo crear la imagen. Intenta de nuevo.');
        blobs.push(blob);
      }
      await this.biz.saveDocuments(q.rectification_id, q.id, 'cotizacion', blobs);
      this.docs.set(await this.biz.listDocuments(q.id));
      this.setShots(blobs, q.number);
      this.info.set(`Cotización ${q.number} emitida y lista para enviar.`);
    } catch (e) {
      this.error.set(`La cotización quedó emitida, pero la imagen no se guardó: ${toUserMessage(e)}. Toca «Crear imagen» para reintentar.`);
    } finally {
      this.busy.set(false);
    }
  }

  async regenerate(): Promise<void> {
    this.busy.set(true);
    try {
      await this.biz.removeDocuments(this.docs());
      this.docs.set([]);
      this.clearShots();
      this.appRef.tick();
      await this.generate();
    } catch (e) {
      this.error.set(toUserMessage(e));
      this.busy.set(false);
    }
  }

  private async showStored(docs: StoredDocument[], number: string): Promise<void> {
    if (!docs.length) return;
    const blobs = await Promise.all(docs.map((d) => this.biz.downloadDocument(d.storage_path)));
    this.setShots(blobs, number);
  }

  private setShots(blobs: Blob[], number: string): void {
    this.clearShots();
    const n = blobs.length;
    this.shots.set(
      blobs.map((blob, i) => ({ blob, url: URL.createObjectURL(blob), name: n > 1 ? `${number}-${i + 1}de${n}.png` : `${number}.png` })),
    );
  }

  private clearShots(): void {
    for (const s of this.shots()) URL.revokeObjectURL(s.url);
    this.shots.set([]);
  }

  private files(): File[] {
    return this.shots().map((s) => new File([s.blob], s.name, { type: 'image/png' }));
  }

  /** Abre el menú de compartir del teléfono (WhatsApp aparece ahí). Debe llamarse directo desde el toque. */
  async share(): Promise<void> {
    try {
      await navigator.share({ files: this.files(), title: `Cotización ${this.quote()?.number ?? ''}` });
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') this.error.set('No se pudo compartir. Descarga la imagen y envíala por WhatsApp.');
    }
  }

  downloadAll(): void {
    for (const s of this.shots()) {
      const a = document.createElement('a');
      a.href = s.url;
      a.download = s.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }
}
