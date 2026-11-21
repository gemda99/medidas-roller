import { ApplicationRef, Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, viewChild, viewChildren } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessRepository } from '../../data-access/repositories/business.repository';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { PhotoRepository } from '../../data-access/repositories/photo.repository';
import { QuotationRepository } from '../../data-access/repositories/quotation.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { ConfectionCurtain, confectionSheet } from '../../domain/confection/confection-engine';
import { confectionPages } from '../../domain/confection/confection-pages';
import { guidePages } from '../../domain/confection/installation-pages';
import { BusinessSettings, EMPTY_BUSINESS } from '../../domain/models/business';
import { QuotationSummary } from '../../domain/models/quotation';
import { Rectification } from '../../domain/models/rectification';
import { toUserMessage } from '../../shared/errors';
import {
  canShareFiles, downloadFiles, PngFile, renderPng, revokeFiles, safeName, shareFiles, toFiles, watchZoom, zipFiles,
} from '../../shared/images/png-export';
import { ConfectionSheetComponent } from './confection-sheet.component';
import { InstallationSheetComponent } from './installation-sheet.component';

type Tab = 'confeccion' | 'guia' | 'zip';

/**
 * Documentos de la rectificación, sin precios: hoja de confección (fábrica), guía de instalación (instalador)
 * y un ZIP con todo (cotización emitida + confección + guía). Se generan con los datos actuales; no se guardan.
 */
@Component({
  selector: 'app-documents-page',
  imports: [RouterLink, ConfectionSheetComponent, InstallationSheetComponent],
  template: `
    <div class="page">
      <a class="back" [routerLink]="['/rectificaciones', id]">‹ Volver a la rectificación</a>
      <h1>Documentos</h1>
      <div class="tabs" role="tablist" aria-label="Documento">
        @for (t of tabs; track t.value) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.value" [class.on]="tab() === t.value" (click)="setTab(t.value)">{{ t.label }}</button>
        }
      </div>
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (rect(); as r) {
        @if (!curtains().length) {
          <p class="muted">Esta rectificación no tiene cortinas.</p>
        } @else {
          @switch (tab()) {
            @case ('confeccion') {
              @if (missingRules().length) {
                <div class="alert alert-warn">{{ missingRules().join(', ') }} no tiene reglas de confección: sus medidas de tela salen como «—».@if (auth.isAdmin()) { Cárgalas en Administración › Catálogo. }</div>
              }
              @if (confShots().length) {
                <div class="actions">
                  @if (canShare(confShots())) { <button type="button" class="btn btn-primary btn-block" (click)="share(confShots(), 'Hoja de confección')">Compartir</button> }
                  <button type="button" class="btn btn-block" (click)="download(confShots())">Descargar</button>
                </div>
                <div class="shots">@for (s of confShots(); track s.url) { <img [src]="s.url" alt="Hoja de confección" /> }</div>
              } @else {
                <p class="muted">Para la fábrica, sin precios: medidas de tela, tubo y G polvo según las reglas de cada producto.</p>
                <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="makeConf()">{{ busy() ? 'Creando…' : 'Crear imagen de confección' }}</button>
                <div class="preview" #preview>
                  <div [style.zoom]="zoom()">
                    @for (p of confPages(); track $index) {
                      <app-confection-sheet class="pg" [rect]="r" [business]="business()" [logo]="logo()" [rows]="p" [total]="curtains().length" [pageIndex]="$index" [pageCount]="confPages().length" />
                    }
                  </div>
                </div>
              }
            }
            @case ('guia') {
              @if (guideShots().length) {
                <div class="actions">
                  @if (canShare(guideShots())) { <button type="button" class="btn btn-primary btn-block" (click)="share(guideShots(), 'Guía de instalación')">Compartir</button> }
                  <button type="button" class="btn btn-block" (click)="download(guideShots())">Descargar</button>
                </div>
                <div class="shots">@for (s of guideShots(); track s.url) { <img [src]="s.url" alt="Guía de instalación" /> }</div>
              } @else {
                <p class="muted">Para el instalador, sin precios: ubicación, medida, instalación, cadena, caída, notas y hasta 3 fotos por cortina. Al final, la firma del cliente.</p>
                @if (!r.signed_at) { <div class="alert alert-warn">La rectificación no tiene firma del cliente.</div> }
                <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !photosReady()" (click)="makeGuide()">
                  {{ !photosReady() ? 'Cargando fotos…' : busy() ? 'Creando…' : 'Crear guía de instalación' }}
                </button>
                @if (photosReady()) {
                  <div class="preview" #preview>
                    <div [style.zoom]="zoom()">
                      @for (p of guidePagesList(); track $index) {
                        <app-installation-sheet class="pg" [rect]="r" [business]="business()" [logo]="logo()" [signature]="signature()" [rows]="p" [total]="curtains().length" [pageIndex]="$index" [pageCount]="guidePagesList().length" />
                      }
                    </div>
                  </div>
                }
              }
            }
            @case ('zip') {
              <section class="card stack">
                <h2>Todo en un archivo</h2>
                <p class="muted" style="margin:0">Un ZIP con:</p>
                <ul class="incl">
                  <li>{{ quoteForZip() ? 'Cotización ' + quoteForZip()!.number : 'Sin cotización emitida (no se incluye)' }}</li>
                  <li>Hoja de confección</li>
                  <li>Guía de instalación{{ rect()?.signed_at ? ' con la firma del cliente' : '' }}</li>
                </ul>
                <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !photosReady()" (click)="makeZip()">
                  {{ !photosReady() ? 'Cargando fotos…' : busy() ? 'Armando el ZIP…' : 'Crear ZIP' }}
                </button>
                @if (zip(); as z) {
                  <div class="actions">
                    @if (canShareZip()) { <button type="button" class="btn btn-block" (click)="shareZip()">Compartir {{ z.name }}</button> }
                    <button type="button" class="btn btn-block" (click)="downloadZip()">Descargar {{ z.name }} · {{ size(z.blob.size) }}</button>
                  </div>
                }
              </section>
            }
          }
        }
      }
    </div>

    <!-- Copias a tamaño real, fuera de la pantalla, solo para generar los PNG. -->
    @if (rect(); as r) {
      <div class="capture" aria-hidden="true">
        @for (p of confPages(); track $index) {
          <app-confection-sheet #capConf [rect]="r" [business]="business()" [logo]="logo()" [rows]="p" [total]="curtains().length" [pageIndex]="$index" [pageCount]="confPages().length" />
        }
        @if (photosReady()) {
          @for (p of guidePagesList(); track $index) {
            <app-installation-sheet #capGuide [rect]="r" [business]="business()" [logo]="logo()" [signature]="signature()" [rows]="p" [total]="curtains().length" [pageIndex]="$index" [pageCount]="guidePagesList().length" />
          }
        }
      </div>
    }
  `,
  styles: `
    .tabs { display: flex; gap: 6px; overflow-x: auto; }
    .tabs button { flex: none; min-height: 44px; padding: 0 16px; border-radius: 99px; border: 1px solid var(--line-strong); background: #fff;
      font: 600 14px Inter, sans-serif; color: var(--ink); cursor: pointer; }
    .tabs button.on { background: var(--navy); border-color: var(--navy); color: #fff; }
    .back { display: inline-block; color: var(--muted); text-decoration: none; font-weight: 600; }
    .actions { display: grid; gap: 8px; }
    .shots { display: grid; gap: 12px; }
    .shots img, .preview { width: 100%; max-width: 720px; border-radius: 10px; box-shadow: 0 1px 2px rgb(15 29 51 / 8%), 0 4px 16px rgb(15 29 51 / 8%); }
    .shots img { display: block; height: auto; background: #fff; }
    .preview { overflow: hidden; background: #fff; }
    .pg + .pg { border-top: 8px solid var(--bg); }
    .incl { margin: 0; padding-left: 20px; }
    .capture { position: fixed; left: -12000px; top: 0; width: 1080px; pointer-events: none; }
  `,
})
export class DocumentsPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly rects = inject(RectificationRepository);
  private readonly catalog = inject(CatalogRepository);
  private readonly biz = inject(BusinessRepository);
  private readonly photosRepo = inject(PhotoRepository);
  private readonly quotes = inject(QuotationRepository);
  private readonly appRef = inject(ApplicationRef);

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'confeccion', label: 'Confección' },
    { value: 'guia', label: 'Instalador' },
    { value: 'zip', label: 'Todo (ZIP)' },
  ];
  readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('ver') as Tab) || 'confeccion');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly rect = signal<Rectification | null>(null);
  readonly curtains = signal<ConfectionCurtain[]>([]);
  readonly business = signal<BusinessSettings>({ ...EMPTY_BUSINESS });
  readonly logo = signal<string | null>(null);
  readonly signature = signal<string | null>(null);
  readonly photos = signal<Map<string, string[]> | null>(null);
  readonly quoteList = signal<QuotationSummary[]>([]);
  readonly confShots = signal<PngFile[]>([]);
  readonly guideShots = signal<PngFile[]>([]);
  readonly zip = signal<{ name: string; blob: Blob } | null>(null);
  readonly zoom = signal(0.5);

  readonly photosReady = computed(() => this.photos() !== null);
  readonly confPages = computed(() => confectionPages(this.curtains(), this.rect()?.observations?.length ?? 0));
  readonly guidePagesList = computed(() =>
    guidePages(this.curtains(), this.photos() ?? new Map(), {
      observationsLength: this.rect()?.observations?.length ?? 0,
      signed: !!this.rect()?.signed_at,
    }),
  );
  readonly missingRules = computed(() => [...new Set(this.curtains().filter((c) => c.missing_rules).map((c) => c.product_code))]);
  /** La cotización más reciente ya emitida o aceptada (la que se envió al cliente). */
  readonly quoteForZip = computed(() => this.quoteList().find((q) => q.status === 'emitida' || q.status === 'aceptada') ?? null);

  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  private readonly capConf = viewChildren('capConf', { read: ElementRef });
  private readonly capGuide = viewChildren('capGuide', { read: ElementRef });
  private observer?: ResizeObserver;
  private photosLoading = false;

  async ngOnInit(): Promise<void> {
    try {
      const [rect, cat, b, quotes] = await Promise.all([
        this.rects.get(this.id),
        this.catalog.load(),
        this.biz.get(),
        this.quotes.listByRectification(this.id),
      ]);
      const names = {
        options: new Map(cat.products.flatMap((p) => p.product_options.map((o) => [o.id, o.name] as [string, string]))),
        accessories: new Map(cat.accessories.map((a) => [a.id, a.name] as [string, string])),
      };
      this.rect.set(rect);
      this.curtains.set(confectionSheet(rect.locations, cat.products, names));
      this.business.set({ ...EMPTY_BUSINESS, ...b });
      this.quoteList.set(quotes);
      const [logo, sig] = await Promise.all([this.biz.logoDataUrl(b.logo_path), this.rects.signatureDataUrl(rect.signature_path)]);
      this.logo.set(logo);
      this.signature.set(sig);
      if (this.tab() !== 'confeccion') void this.loadPhotos();
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
      this.watch();
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    revokeFiles(this.confShots());
    revokeFiles(this.guideShots());
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    if (t !== 'confeccion') void this.loadPhotos();
    this.watch();
  }

  private watch(): void {
    queueMicrotask(() => {
      this.observer?.disconnect();
      this.observer = watchZoom(this.preview()?.nativeElement, (z) => this.zoom.set(z));
    });
  }

  private async loadPhotos(): Promise<void> {
    if (this.photosLoading || this.photos()) return;
    this.photosLoading = true;
    try {
      this.photos.set(await this.photosRepo.thumbnailsFor(this.curtains().map((c) => c.curtain_id)));
    } catch (e) {
      // Sin fotos la guía igual sirve: se avisa y se sigue.
      this.photos.set(new Map());
      this.error.set(`No se pudieron cargar las fotos; la guía sale sin ellas. (${toUserMessage(e)})`);
    } finally {
      this.photosLoading = false;
      this.watch();
    }
  }

  private elements(refs: readonly ElementRef[]): HTMLElement[] {
    return refs.map((ref) => (ref.nativeElement as HTMLElement).querySelector('.sheet') as HTMLElement);
  }

  private base(): string {
    return safeName(this.rect()?.customers?.full_name ?? 'cliente', 'cliente');
  }

  private async capture(kind: 'conf' | 'guide'): Promise<Blob[]> {
    this.appRef.tick();
    return renderPng(this.elements(kind === 'conf' ? this.capConf() : this.capGuide()));
  }

  async makeConf(): Promise<void> {
    await this.run(async () => this.confShots.set(toFiles(await this.capture('conf'), `Confeccion-${this.base()}`)));
  }

  async makeGuide(): Promise<void> {
    await this.run(async () => this.guideShots.set(toFiles(await this.capture('guide'), `Instalacion-${this.base()}`)));
  }

  async makeZip(): Promise<void> {
    await this.run(async () => {
      const entries: { name: string; blob: Blob }[] = [];
      const q = this.quoteForZip();
      if (q) {
        const docs = await this.biz.listDocuments(q.id);
        const blobs = await Promise.all(docs.map((d) => this.biz.downloadDocument(d.storage_path)));
        blobs.forEach((blob, i) => entries.push({ name: `1-Cotizacion-${q.number}${blobs.length > 1 ? `-${i + 1}` : ''}.png`, blob }));
      }
      const conf = await this.capture('conf');
      conf.forEach((blob, i) => entries.push({ name: `2-Confeccion${conf.length > 1 ? `-${i + 1}` : ''}.png`, blob }));
      const guide = await this.capture('guide');
      guide.forEach((blob, i) => entries.push({ name: `3-Instalacion${guide.length > 1 ? `-${i + 1}` : ''}.png`, blob }));
      this.zip.set({ name: `Rectificacion-${this.base()}.zip`, blob: await zipFiles(entries) });
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  canShare(files: PngFile[]): boolean {
    return canShareFiles(files);
  }

  async share(files: PngFile[], title: string): Promise<void> {
    try {
      await shareFiles(files, title);
    } catch {
      this.error.set('No se pudo compartir. Descarga la imagen y envíala.');
    }
  }

  download(files: PngFile[]): void {
    downloadFiles(files);
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

  size(bytes: number): string {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`;
  }
}
