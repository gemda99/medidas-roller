import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminCatalogRepository } from '../../data-access/repositories/admin-catalog.repository';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { PriceListRepository } from '../../data-access/repositories/price-list.repository';
import { QuotationRepository } from '../../data-access/repositories/quotation.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { CustomerSnapshot, Quotation, STATUS_LABEL } from '../../domain/models/quotation';
import { Rectification } from '../../domain/models/rectification';
import {
  calculateQuote, InstallationMode, IvaMode, PricingSnapshot, QuoteLine, QuoteOptions, QuoteResult,
} from '../../domain/pricing/pricing-engine';
import { buildSnapshot, curtainInputs } from '../../domain/pricing/snapshot';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { Segmented, SegmentOption } from '../../shared/components/segmented';
import { toUserMessage } from '../../shared/errors';
import { formatClp, formatDate, parseClp, parseDecimal } from '../../shared/format';

interface LineGroup {
  location: string;
  lines: QuoteLine[];
}

/**
 * Cotización (HU-27 a HU-30). Nueva: usa el tarifario vigente y lo copia dentro de la cotización.
 * Borrador guardado: recalcula con SU copia (no con el tarifario actual) salvo que se pida actualizar.
 * Emitida/aceptada/rechazada: solo lectura, con las líneas guardadas.
 */
@Component({
  selector: 'app-quotation-editor-page',
  imports: [FormsModule, RouterLink, Segmented, ConfirmDialog],
  templateUrl: './quotation-editor.page.html',
  styleUrl: './quotation-editor.page.css',
})
export class QuotationEditorPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rectRepo = inject(RectificationRepository);
  private readonly quotes = inject(QuotationRepository);
  private readonly prices = inject(PriceListRepository);
  private readonly catalog = inject(CatalogRepository);
  private readonly adminCatalog = inject(AdminCatalogRepository);
  protected readonly auth = inject(AuthService);
  private readonly confirm = viewChild.required(ConfirmDialog);

  readonly clp = formatClp;
  readonly fmtDate = formatDate;
  readonly statusLabel = STATUS_LABEL;

  readonly quoteId = signal<string | null>(this.route.snapshot.paramMap.get('qid'));
  readonly rectId = signal<string>(this.route.snapshot.paramMap.get('id') ?? '');
  readonly rect = signal<Rectification | null>(null);
  readonly saved = signal<Quotation | null>(null);
  readonly snapshot = signal<PricingSnapshot | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  // Opciones de la cotización
  readonly installationMode = signal<InstallationMode>('proyecto');
  readonly installationManual = signal<number | null>(null);
  readonly discountType = signal<QuoteOptions['discount_type']>('ninguno');
  readonly discountValue = signal(0);
  readonly ivaMode = signal<IvaMode>('excluido');
  readonly manualAdjustment = signal(0);
  readonly quoteAccessories = signal<Record<string, number>>({});
  readonly extras = signal<QuoteOptions['extras']>([]);
  readonly validDays = signal(10);
  readonly notes = signal('');
  readonly reason = signal('');
  readonly newExtra = signal({ name: '', quantity: '1', price: '' });

  readonly installationOptions: SegmentOption[] = [
    { value: 'proyecto', label: 'Proyecto' }, { value: 'cortina', label: 'Por cortina' }, { value: 'manual', label: 'Manual' },
  ];
  readonly ivaOptions: SegmentOption[] = [
    { value: 'excluido', label: 'Se suma' }, { value: 'incluido', label: 'Incluido' }, { value: 'sin', label: 'Sin IVA' },
  ];

  readonly editable = computed(() => !this.saved() || this.saved()!.status === 'borrador');
  readonly isAdmin = computed(() => this.auth.isAdmin());
  readonly canDiscount = computed(() => this.isAdmin() || !!this.snapshot()?.medidor_discount_enabled);
  readonly maxDiscount = computed(() => (this.isAdmin() ? 100 : this.snapshot()?.medidor_max_discount_pct ?? 0));

  readonly options = computed<QuoteOptions>(() => ({
    installation_mode: this.installationMode(),
    installation_manual: this.installationManual(),
    discount_type: this.discountType(),
    discount_value: this.discountValue(),
    iva_mode: this.ivaMode(),
    manual_adjustment: this.isAdmin() ? this.manualAdjustment() : 0,
    quote_accessories: this.quoteAccessories(),
    extras: this.extras(),
  }));

  /** Resultado en vivo (editable) o el guardado (solo lectura). */
  readonly result = computed<QuoteResult | null>(() => {
    const s = this.snapshot();
    const r = this.rect();
    if (!this.editable()) return this.savedResult();
    if (!s || !r) return null;
    return calculateQuote(curtainInputs(r), s, this.options());
  });

  readonly groups = computed<LineGroup[]>(() => {
    const lines = this.result()?.lines ?? [];
    const out: LineGroup[] = [];
    for (const l of lines) {
      const key = l.location_name || 'Adicionales';
      let g = out.find((x) => x.location === key);
      if (!g) out.push((g = { location: key, lines: [] }));
      g.lines.push(l);
    }
    return out;
  });

  readonly quoteAccessoryList = computed(() =>
    Object.entries(this.snapshot()?.accessories ?? {})
      .filter(([, a]) => a.scope === 'cotizacion')
      .map(([id, a]) => ({ id, ...a })),
  );

  readonly discountIssue = computed(() => {
    if (this.discountType() !== 'porcentaje') return null;
    const v = this.discountValue();
    if (v < 0 || v > this.maxDiscount()) return `El descuento máximo es ${this.maxDiscount()}%.`;
    return null;
  });

  async ngOnInit(): Promise<void> {
    try {
      const qid = this.quoteId();
      if (qid) {
        const q = await this.quotes.get(qid);
        this.saved.set(q);
        this.rectId.set(q.rectification_id);
        this.snapshot.set(q.pricing_snapshot);
        this.applyOptions(q);
        if (q.status === 'borrador') this.rect.set(await this.rectRepo.get(q.rectification_id));
      } else {
        const [rect, vigente, cat] = await Promise.all([
          this.rectRepo.get(this.rectId()),
          this.prices.getVigente(),
          this.catalogForSnapshot(),
        ]);
        this.rect.set(rect);
        if (!vigente) {
          this.error.set('No hay un tarifario vigente. El administrador debe activar uno en Administración › Tarifarios.');
          return;
        }
        const snap = buildSnapshot(vigente, cat.products, cat.accessories);
        this.snapshot.set(snap);
        this.installationMode.set(snap.installation_mode_default ?? 'proyecto');
        this.ivaMode.set(snap.iva_mode_default ?? 'excluido');
      }
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** El admin incluye productos inactivos (por si la rectificación usa uno antiguo); el medidor, el catálogo activo. */
  private async catalogForSnapshot() {
    if (this.isAdmin()) return this.adminCatalog.loadAll();
    return this.catalog.load();
  }

  private applyOptions(q: Quotation): void {
    const o = q.options ?? {};
    this.installationMode.set(q.installation_mode);
    this.installationManual.set(o.installation_manual ?? null);
    this.discountType.set(q.discount_type);
    this.discountValue.set(q.discount_value);
    this.ivaMode.set(q.iva_mode);
    this.manualAdjustment.set(q.manual_adjustment);
    this.quoteAccessories.set(o.quote_accessories ?? {});
    this.extras.set(o.extras ?? []);
    this.validDays.set(q.valid_days);
    this.notes.set(q.notes ?? '');
  }

  private savedResult(): QuoteResult | null {
    const q = this.saved();
    if (!q) return null;
    return {
      lines: q.quotation_items,
      subtotal_products: q.subtotal_products,
      discount_amount: q.discount_amount,
      installation_amount: q.installation_amount,
      extras_amount: q.extras_amount,
      net_amount: q.net_amount,
      iva_amount: q.iva_amount,
      total_calculated: q.total_calculated,
      manual_adjustment: q.manual_adjustment,
      total_final: q.total_final,
      motors: 0,
      suggested_quote_accessories: {},
      errors: [],
      warnings: [],
    };
  }

  // ---- Controles ----

  setInstallationManual(raw: string): void {
    const v = parseClp(raw);
    this.installationManual.set(v === null || Number.isNaN(v) ? null : v);
  }

  setDiscountPercent(raw: string): void {
    const v = parseDecimal(raw);
    this.discountType.set(Number.isFinite(v) && v > 0 ? 'porcentaje' : 'ninguno');
    this.discountValue.set(Number.isFinite(v) && v > 0 ? v : 0);
  }

  setDiscountAmount(raw: string): void {
    const v = parseClp(raw);
    const ok = v !== null && !Number.isNaN(v) && v > 0;
    this.discountType.set(ok ? 'monto' : 'ninguno');
    this.discountValue.set(ok ? v! : 0);
  }

  setAdjustment(raw: string): void {
    const s = raw.trim();
    const neg = s.startsWith('-');
    const v = parseClp(s.replace(/^[-+]/, ''));
    this.manualAdjustment.set(v === null || Number.isNaN(v) ? 0 : neg ? -v : v);
  }

  qty(id: string): number {
    return this.quoteAccessories()[id] ?? this.result()?.suggested_quote_accessories[id] ?? 0;
  }

  bump(id: string, delta: number): void {
    this.quoteAccessories.update((m) => ({ ...m, [id]: Math.max(0, Math.min(99, this.qty(id) + delta)) }));
  }

  addExtra(): void {
    const e = this.newExtra();
    const price = parseClp(e.price);
    const qty = Number(e.quantity);
    if (!e.name.trim() || price === null || Number.isNaN(price) || !Number.isInteger(qty) || qty < 1) {
      this.error.set('Para un adicional escribe nombre, cantidad (entero) y precio en pesos.');
      return;
    }
    this.error.set(null);
    this.extras.update((list) => [...list, { name: e.name.trim(), quantity: qty, unit_price: price }]);
    this.newExtra.set({ name: '', quantity: '1', price: '' });
  }

  removeExtra(i: number): void {
    this.extras.update((list) => list.filter((_, j) => j !== i));
  }

  updateNewExtra(key: 'name' | 'quantity' | 'price', value: string): void {
    this.newExtra.update((e) => ({ ...e, [key]: value }));
  }

  lineDetail(l: QuoteLine): string {
    if (l.kind !== 'cortina') return l.quantity > 1 ? `${l.quantity} × ${this.clp(l.unit_price)}` : '';
    const parts: string[] = [];
    if (l.layers?.length) parts.push(l.layers.map((x) => `${x.label} ${x.product_code} ${fmtCm(x.width_cm)} × ${fmtCm(x.height_cm)}`).join(' + '));
    else if (l.width_cm && l.height_cm) parts.push(`${fmtCm(l.width_cm)} × ${fmtCm(l.height_cm)} cm · ${String(l.area_m2).replace('.', ',')} m²`);
    if (l.color_name) parts.push(l.color_name);
    return parts.join(' · ');
  }

  // ---- Guardar y estados ----

  private customerSnapshot(): CustomerSnapshot | null {
    const r = this.rect();
    if (!r) return this.saved()?.customer_snapshot ?? null;
    return {
      full_name: r.customers?.full_name ?? '',
      phone: r.customers?.phone ?? '',
      rut: r.customers?.rut ?? null,
      address_line: r.address_line,
      comuna: r.comuna,
      address_reference: r.address_reference,
      executive_name: r.executive_name,
    };
  }

  async save(): Promise<void> {
    const res = this.result();
    const snap = this.snapshot();
    const cust = this.customerSnapshot();
    if (!res || !snap || !cust) return;
    if (res.errors.length) {
      this.error.set('No se puede guardar: ' + res.errors.join(' '));
      return;
    }
    if (this.discountIssue()) {
      this.error.set(this.discountIssue());
      return;
    }
    if (res.lines.length === 0) {
      this.error.set('La rectificación no tiene cortinas para cotizar.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.quotes.save({
        id: this.saved()?.id,
        rectification_id: this.rectId(),
        price_list_id: snap.price_list_id,
        options: this.options(),
        result: res,
        valid_days: this.validDays(),
        notes: this.notes().trim() || null,
        adjustment_reason: this.reason().trim() || null,
        customer_snapshot: cust,
        pricing_snapshot: snap,
      });
      if (!this.saved()) {
        await this.router.navigate(['/cotizaciones', r.id], { replaceUrl: true });
      }
      this.saved.set(await this.quotes.get(r.id));
      this.quoteId.set(r.id);
      this.info.set(`Cotización ${r.number} guardada.`);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Guarda el borrador (si se puede) y abre la vista de imagen, donde se emite. */
  async toImage(): Promise<void> {
    await this.save();
    const id = this.quoteId();
    if (id && !this.error()) await this.router.navigate(['/cotizaciones', id, 'imagen']);
  }

  /** Borrador: reemplaza su copia de precios por la del tarifario vigente. */
  async refreshPrices(): Promise<void> {
    this.busy.set(true);
    try {
      const [vigente, cat] = await Promise.all([this.prices.getVigente(), this.catalogForSnapshot()]);
      if (!vigente) throw { code: 'P0001', message: 'No hay un tarifario vigente.' };
      this.snapshot.set(buildSnapshot(vigente, cat.products, cat.accessories));
      this.info.set(`Precios actualizados a «${vigente.name}». Guarda para conservar el cambio.`);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async setStatus(status: 'aceptada' | 'rechazada'): Promise<void> {
    const q = this.saved();
    if (!q) return;
    this.busy.set(true);
    try {
      await this.quotes.setStatus(q.id, status);
      this.saved.set(await this.quotes.get(q.id));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  askDelete(): void {
    this.confirm().open();
  }

  async remove(): Promise<void> {
    const q = this.saved();
    if (!q) return;
    try {
      await this.quotes.remove(q.id);
      await this.router.navigate(['/rectificaciones', q.rectification_id]);
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }
}

function fmtCm(n: number): string {
  return String(n).replace('.', ',');
}
