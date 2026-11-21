import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminCatalogRepository } from '../../data-access/repositories/admin-catalog.repository';
import { PriceListRepository } from '../../data-access/repositories/price-list.repository';
import { Accessory, Product } from '../../domain/models/catalog';
import { PriceListSettings, PriceListWithPrices } from '../../domain/models/pricing';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { toUserMessage } from '../../shared/errors';
import { formatClp, parseClp, parseDecimal } from '../../shared/format';

type MoneyKey = 'general_min_price' | 'motor_price' | 'cenefa_price_ml' | 'installation_project_price' | 'installation_per_curtain_price';

/**
 * Editor de un tarifario. Solo los borradores se editan; cada campo se guarda al salir de él.
 * Todos los valores los define el administrador (no hay precios inventados por la app).
 */
@Component({
  selector: 'app-price-list-edit-page',
  imports: [RouterLink, ConfirmDialog],
  templateUrl: './price-list-edit.page.html',
  styles: `
    .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; }
    .money { text-align: right; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; font-size: 15px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    th { font-size: 13px; color: var(--muted); font-weight: 600; }
    td input { width: 100%; min-height: 44px; border: 1px solid var(--line-strong); border-radius: 10px; padding: 0 10px; font: 16px Inter, sans-serif; }
    td input:disabled, .field input:disabled, .field select:disabled { background: #f3f6fa; color: var(--muted); }
    .scroll { overflow-x: auto; }
    .missing { background: var(--danger-bg); }
    .chip.ok { background: var(--ok-bg); color: var(--ok); }
    .chip.draft { background: var(--warn-bg); color: var(--warn); }
    .check { display: flex; gap: 10px; align-items: center; min-height: 44px; }
    .check input { width: 22px; height: 22px; accent-color: var(--navy); }
  `,
})
export class PriceListEditPage implements OnInit {
  private readonly repo = inject(PriceListRepository);
  private readonly catalogRepo = inject(AdminCatalogRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = viewChild.required(ConfirmDialog);

  /** Señal: al crear una copia se navega a otro id y la misma pantalla recarga. */
  readonly id = signal(this.route.snapshot.paramMap.get('id')!);
  readonly fmt = formatClp;
  readonly list = signal<PriceListWithPrices | null>(null);
  readonly products = signal<Product[]>([]);
  readonly accessories = signal<Accessory[]>([]);
  readonly missing = signal<string[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly saved = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly editable = computed(() => this.list()?.status === 'borrador');
  readonly telas = computed(() => this.products().filter((p) => p.kind === 'tela' && p.active));
  readonly sistemas = computed(() => this.products().filter((p) => p.kind === 'sistema' && p.active));

  ngOnInit(): void {
    this.route.paramMap.subscribe((m) => {
      this.id.set(m.get('id')!);
      this.loading.set(true);
      void this.load();
    });
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      const [list, cat] = await Promise.all([this.repo.get(this.id()), this.catalogRepo.loadAll()]);
      this.list.set(list);
      this.products.set(cat.products);
      this.accessories.set(cat.accessories.filter((a) => a.active));
      if (list.status === 'borrador') this.missing.set((await this.repo.missing(this.id())).map((m) => m.code));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  productPrice(productId: string) {
    return this.list()?.product_prices.find((p) => p.product_id === productId) ?? { product_id: productId, price_m2: null, min_price: null };
  }

  accessoryPrice(accessoryId: string): number | null {
    return this.list()?.accessory_prices.find((a) => a.accessory_id === accessoryId)?.unit_price ?? null;
  }

  pct(v: number): string {
    return String(Math.round(v * 10000) / 100).replace('.', ',');
  }

  // ---- Guardado campo a campo ----

  private async save(action: () => Promise<void>, label: string): Promise<void> {
    this.error.set(null);
    this.saved.set(null);
    try {
      await action();
      this.saved.set(`${label}: guardado`);
      const list = await this.repo.get(this.id());
      this.list.set(list);
      this.missing.set((await this.repo.missing(this.id())).map((m) => m.code));
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  private money(raw: string, label: string, allowEmpty = true): number | null | undefined {
    const v = parseClp(raw);
    if (v === null && allowEmpty) return null;
    if (v === null || Number.isNaN(v)) {
      this.error.set(`${label}: escribe un monto en pesos, por ejemplo 21000 o $21.000.`);
      return undefined;
    }
    return v;
  }

  setMoney(key: MoneyKey, raw: string, label: string): void {
    const v = this.money(raw, label, key !== 'general_min_price');
    if (v === undefined) return;
    void this.save(() => this.repo.updateSettings(this.id(), { [key]: v ?? (key === 'general_min_price' ? 0 : null) }), label);
  }

  setSetting<K extends keyof PriceListSettings>(key: K, value: PriceListSettings[K], label: string): void {
    void this.save(() => this.repo.updateSettings(this.id(), { [key]: value } as Partial<PriceListSettings>), label);
  }

  setPercent(key: 'iva_rate' | 'medidor_max_discount_pct', raw: string, label: string): void {
    const n = parseDecimal(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      this.error.set(`${label}: escribe un porcentaje entre 0 y 100.`);
      return;
    }
    this.setSetting(key, key === 'iva_rate' ? n / 100 : n, label);
  }

  setRounding(raw: string): void {
    const n = Number(raw);
    if (n === 1 || n === 10 || n === 100 || n === 1000) this.setSetting('rounding_step', n, 'Redondeo');
  }

  setInt(key: 'remote_control_per_motors', raw: string, label: string): void {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      this.error.set(`${label}: escribe un número entero entre 1 y 100.`);
      return;
    }
    this.setSetting(key, n, label);
  }

  setProductPrice(p: Product, field: 'price_m2' | 'min_price', raw: string): void {
    const label = `${p.code} ${field === 'price_m2' ? 'precio m²' : 'mínimo'}`;
    const v = this.money(raw, label);
    if (v === undefined) return;
    const cur = this.productPrice(p.id);
    const next = { ...cur, [field]: v };
    void this.save(() => this.repo.setProductPrice(this.id(), p.id, next.price_m2, next.min_price), label);
  }

  setAccessoryPrice(a: Accessory, raw: string): void {
    const v = this.money(raw, a.name);
    if (v === undefined) return;
    void this.save(() => this.repo.setAccessoryPrice(this.id(), a.id, v), a.name);
  }

  // ---- Acciones ----

  async activate(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.repo.activate(this.id());
      await this.load();
      this.saved.set('Tarifario activado: desde ahora las cotizaciones usan estos precios.');
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    this.busy.set(true);
    try {
      const id = await this.repo.cloneAsDraft(this.id());
      await this.router.navigate(['/admin/tarifarios', id]);
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
    try {
      await this.repo.remove(this.id());
      await this.router.navigateByUrl('/admin/tarifarios');
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }
}
