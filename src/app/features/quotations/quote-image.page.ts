import { ApplicationRef, Component, ElementRef, inject, OnDestroy, OnInit, signal, viewChild, viewChildren, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessRepository, StoredDocument } from '../../data-access/repositories/business.repository';
import { QuotationRepository } from '../../data-access/repositories/quotation.repository';
import { BusinessSettings, EMPTY_BUSINESS, textBlocks } from '../../domain/models/business';
import { Quotation, STATUS_LABEL } from '../../domain/models/quotation';
import { buildRows, footerHeight, ImageRow, paginate } from '../../domain/quote-image/quote-pages';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { toUserMessage } from '../../shared/errors';
import { canShareFiles, downloadFiles, PngFile, renderPng, revokeFiles, safeName, shareFiles, toFiles, watchZoom, zipFiles } from '../../shared/images/png-export';
import { PhotoRepository } from '../../data-access/repositories/photo.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { confectionPages } from '../../domain/confection/confection-pages';
import { guidePages } from '../../domain/confection/installation-pages';
import { ConfectionSheetComponent } from '../rectifications/confection-sheet.component';
import { InstallationSheetComponent } from '../rectifications/installation-sheet.component';
import { QuoteImagePageComponent } from './quote-image-page.component';

/**
 * Imagen de la cotización (HU-34/35). En borrador muestra la vista previa y permite emitir:
 * al emitir se congela la copia de los datos de la empresa, se generan los PNG y se guardan.
 * Emitida: muestra las imágenes guardadas para compartir por WhatsApp o descargar.
 */
@Component({
  selector: 'app-quote-image-view',
  imports: [RouterLink, QuoteImagePageComponent, ConfirmDialog, ConfectionSheetComponent, InstallationSheetComponent],
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

        <!-- Fábrica e instalación: solo con la cotización aceptada, con las medidas de esta cotización. -->
        @if (q.status === 'aceptada') {
          <section class="card stack work" aria-labelledby="work-title">
            <h2 id="work-title">Fábrica e instalación</h2>
            @if (!q.work_snapshot) {
              <p class="muted" style="margin:0">Esta cotización se emitió antes de guardar la copia de las cortinas. Para tener confección e instalación, crea y emite una cotización nueva.</p>
            } @else if (workBusy()) {
              <p class="muted" style="margin:0" aria-live="polite">Creando la hoja de confección y la guía del instalador con las medidas de esta cotización…</p>
            } @else if (confShots().length || guideShots().length) {
              <p class="muted" style="margin:0">Hechas con las medidas aprobadas en {{ q.number }}. Si la rectificación cambia, emite una cotización nueva.</p>
              @if (confShots().length) {
                <h3>Confección (fábrica)</h3>
                <div class="actions two-col">
                  @if (canShareList(confShots())) { <button type="button" class="btn btn-primary" (click)="shareList(confShots(), 'Confección ' + q.number)">Compartir</button> }
                  <button type="button" class="btn" (click)="downloadList(confShots())">Descargar</button>
                </div>
                <div class="shots">@for (s of confShots(); track s.url) { <img [src]="s.url" [alt]="'Confección ' + q.number" /> }</div>
              }
              @if (guideShots().length) {
                <h3>Guía del instalador</h3>
                <div class="actions two-col">
                  @if (canShareList(guideShots())) { <button type="button" class="btn btn-primary" (click)="shareList(guideShots(), 'Instalación ' + q.number)">Compartir</button> }
                  <button type="button" class="btn" (click)="downloadList(guideShots())">Descargar</button>
                </div>
                <div class="shots">@for (s of guideShots(); track s.url) { <img [src]="s.url" [alt]="'Guía de instalación ' + q.number" /> }</div>
              }
              @if (auth.isAdmin()) {
                <button type="button" class="btn btn-block" [disabled]="busy()" (click)="regenerateWork()">Volver a generar confección e instalación</button>
              }
            } @else {
              <button type="button" class="btn btn-primary btn-block" (click)="generateWork()">Crear confección e instalación</button>
            }
          </section>
        }

        @if (shots().length && q.status !== 'borrador') {
          <section class="card stack">
            <h2>Todo en un archivo</h2>
            <p class="muted" style="margin:0">ZIP con la cotización{{ confShots().length ? ', la confección y la guía del instalador' : '' }}.</p>
            <button type="button" class="btn btn-block" [disabled]="busy() || workBusy()" (click)="makeZip()">Crear ZIP</button>
            @if (zip(); as z) {
              <div class="actions">
                @if (canShareZip()) { <button type="button" class="btn btn-primary btn-block" (click)="shareZip()">Compartir {{ z.name }}</button> }
                <button type="button" class="btn btn-block" (click)="downloadZip()">Descargar {{ z.name }}</button>
              </div>
            }
          </section>
        }
      }
    </div>

    <!-- Copia a tamaño real, fuera de la pantalla, solo para generar los PNG. -->
    @if (quote(); as q) {
      <div class="capture" aria-hidden="true">
        @for (p of pages(); track $index) {
          <app-quote-sheet #cap [quote]="q" [business]="business()" [logo]="logo()" [rows]="p" [pageIndex]="$index" [pageCount]="pages().length" />
        }
        @if (work(); as w) {
          @for (p of confPages(); track $index) {
            <app-confection-sheet #capConf [job]="w.job" [business]="business()" [logo]="logo()" [rows]="p" [total]="w.curtains.length" [pageIndex]="$index" [pageCount]="confPages().length" />
          }
          @if (photos(); as ph) {
            @for (p of guidePagesList(); track $index) {
              <app-installation-sheet #capGuide [job]="w.job" [business]="business()" [logo]="logo()" [signature]="signature()" [rows]="p" [total]="w.curtains.length" [pageIndex]="$index" [pageCount]="guidePagesList().length" />
            }
          }
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
    .work h3 { margin: 8px 0 0; font-size: 16px; }
    .two-col { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    .capture { position: fixed; left: -12000px; top: 0; width: 1080px; pointer-events: none; }
  `,
})
export class QuoteImagePage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly quotes = inject(QuotationRepository);
  private readonly biz = inject(BusinessRepository);
  private readonly appRef = inject(ApplicationRef);
  private readonly photosRepo = inject(PhotoRepository);
  private readonly rects = inject(RectificationRepository);

  readonly qid = this.route.snapshot.paramMap.get('qid') ?? '';
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly quote = signal<Quotation | null>(null);
  readonly business = signal<BusinessSettings>({ ...EMPTY_BUSINESS });
  readonly logo = signal<string | null>(null);
  readonly docs = signal<StoredDocument[]>([]);
  readonly shots = signal<PngFile[]>([]);
  readonly zoom = signal(0.5);

  readonly pages = computed<ImageRow[][]>(() => {
    const q = this.quote();
    if (!q) return [];
    const rows = buildRows(q.quotation_items);
    const b = this.business();
    const footer = footerHeight(textBlocks(b.conditions_text), textBlocks(b.warranty_details_text));
    return paginate(rows, footer);
  });
  readonly missingBusiness = computed(() => !this.business().business_name && !this.logo());

  // ---- Fábrica e instalación (cotización aceptada) ----
  readonly work = computed(() => this.quote()?.work_snapshot ?? null);
  readonly photos = signal<Map<string, string[]> | null>(null);
  readonly signature = signal<string | null>(null);
  readonly workBusy = signal(false);
  readonly confShots = signal<PngFile[]>([]);
  readonly guideShots = signal<PngFile[]>([]);
  readonly zip = signal<{ name: string; blob: Blob } | null>(null);
  readonly confPages = computed(() => {
    const w = this.work();
    return w ? confectionPages(w.curtains, w.job.observations?.length ?? 0) : [];
  });
  readonly guidePagesList = computed(() => {
    const w = this.work();
    return w ? guidePages(w.curtains, this.photos() ?? new Map(), { observationsLength: w.job.observations?.length ?? 0, signed: !!w.job.signed_at }) : [];
  });
  private readonly capConf = viewChildren('capConf', { read: ElementRef });
  private readonly capGuide = viewChildren('capGuide', { read: ElementRef });

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
    revokeFiles(this.confShots());
    revokeFiles(this.guideShots());
  }

  statusLabel(q: Quotation): string {
    return STATUS_LABEL[q.status];
  }

  canShare(): boolean {
    return canShareFiles(this.shots());
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
    if (q.status === 'aceptada' && q.work_snapshot) {
      const [conf, inst] = await Promise.all([this.biz.listDocuments(q.id, 'confeccion'), this.biz.listDocuments(q.id, 'instalacion')]);
      if (conf.length && inst.length) {
        const base = safeName(q.work_snapshot.job.customer_name, 'cliente');
        this.confShots.set(toFiles(await Promise.all(conf.map((d) => this.biz.downloadDocument(d.storage_path))), `Confeccion-${q.number}-${base}`));
        this.guideShots.set(toFiles(await Promise.all(inst.map((d) => this.biz.downloadDocument(d.storage_path))), `Instalacion-${q.number}-${base}`));
      } else {
        // Recién aceptada: se crean solas con las medidas de esta cotización.
        void this.generateWork();
      }
    }
  }

  /** Carga fotos y firma de la copia, genera confección + instalación y las guarda junto a la cotización. */
  async generateWork(): Promise<void> {
    const q = this.quote();
    const w = q?.work_snapshot;
    if (!q || !w || this.workBusy()) return;
    this.workBusy.set(true);
    this.error.set(null);
    try {
      if (!this.photos()) {
        const [photos, sig] = await Promise.all([this.photosRepo.thumbnailsFromPaths(w.photos ?? {}), this.rects.signatureDataUrl(w.job.signature_path)]);
        this.photos.set(photos);
        this.signature.set(sig);
      }
      this.appRef.tick();
      const el = (refs: readonly ElementRef[]) => refs.map((r) => (r.nativeElement as HTMLElement).querySelector('.sheet') as HTMLElement);
      const conf = await renderPng(el(this.capConf()));
      const guide = await renderPng(el(this.capGuide()));
      await this.biz.saveDocuments(q.rectification_id, q.id, 'confeccion', conf);
      await this.biz.saveDocuments(q.rectification_id, q.id, 'instalacion', guide);
      const base = safeName(w.job.customer_name, 'cliente');
      revokeFiles(this.confShots());
      revokeFiles(this.guideShots());
      this.confShots.set(toFiles(conf, `Confeccion-${q.number}-${base}`));
      this.guideShots.set(toFiles(guide, `Instalacion-${q.number}-${base}`));
    } catch (e) {
      this.error.set(`No se pudieron crear la confección y la guía: ${toUserMessage(e)}`);
    } finally {
      this.workBusy.set(false);
    }
  }

  /** Solo administrador: borra las imágenes de fábrica e instalación y las vuelve a crear desde la misma copia. */
  async regenerateWork(): Promise<void> {
    const q = this.quote();
    if (!q) return;
    try {
      const [conf, inst] = await Promise.all([this.biz.listDocuments(q.id, 'confeccion'), this.biz.listDocuments(q.id, 'instalacion')]);
      await this.biz.removeDocuments([...conf, ...inst]);
      revokeFiles(this.confShots());
      revokeFiles(this.guideShots());
      this.confShots.set([]);
      this.guideShots.set([]);
      await this.generateWork();
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  canShareList(files: PngFile[]): boolean {
    return canShareFiles(files);
  }
  async shareList(files: PngFile[], title: string): Promise<void> {
    try {
      await shareFiles(files, title);
    } catch {
      this.error.set('No se pudo compartir. Descarga las imágenes y envíalas.');
    }
  }
  downloadList(files: PngFile[]): void {
    downloadFiles(files);
  }

  /** ZIP con la cotización y, si está aceptada, la confección y la guía. */
  async makeZip(): Promise<void> {
    const q = this.quote();
    if (!q) return;
    this.busy.set(true);
    try {
      const entries = [
        ...this.shots().map((f) => ({ name: `1-${f.name}`, blob: f.blob })),
        ...this.confShots().map((f) => ({ name: `2-${f.name}`, blob: f.blob })),
        ...this.guideShots().map((f) => ({ name: `3-${f.name}`, blob: f.blob })),
      ];
      const who = safeName(q.work_snapshot?.job.customer_name ?? q.customer_snapshot.full_name, 'cliente');
      this.zip.set({ name: `${q.number}-${who}.zip`, blob: await zipFiles(entries) });
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
  private zipFile(): File | null {
    const z = this.zip();
    return z ? new File([z.blob], z.name, { type: 'application/zip' }) : null;
  }
  canShareZip(): boolean {
    const f = this.zipFile();
    return !!f && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [f] });
  }
  async shareZip(): Promise<void> {
    const f = this.zipFile();
    if (!f) return;
    try {
      await navigator.share({ files: [f], title: f.name });
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') this.error.set('No se pudo compartir el ZIP. Descárgalo.');
    }
  }
  downloadZip(): void {
    const z = this.zip();
    if (!z) return;
    const url = URL.createObjectURL(z.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = z.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private watchWidth(): void {
    this.observer?.disconnect();
    this.observer = watchZoom(this.preview()?.nativeElement, (z) => this.zoom.set(z));
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
      const els = this.captures().map((ref) => (ref.nativeElement as HTMLElement).querySelector('.sheet') as HTMLElement);
      const blobs = await renderPng(els);
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
    this.shots.set(toFiles(blobs, number));
  }

  private clearShots(): void {
    revokeFiles(this.shots());
    this.shots.set([]);
  }

  /** Abre el menú de compartir del teléfono (WhatsApp aparece ahí). Debe llamarse directo desde el toque. */
  async share(): Promise<void> {
    try {
      await shareFiles(this.shots(), `Cotización ${this.quote()?.number ?? ''}`);
    } catch {
      this.error.set('No se pudo compartir. Descarga la imagen y envíala por WhatsApp.');
    }
  }

  downloadAll(): void {
    downloadFiles(this.shots());
  }
}
