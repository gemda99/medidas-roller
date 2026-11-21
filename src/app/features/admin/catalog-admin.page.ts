import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCatalogRepository, NewProduct } from '../../data-access/repositories/admin-catalog.repository';
import { Accessory, CenefaMode, Color, Product } from '../../domain/models/catalog';
import { toUserMessage } from '../../shared/errors';

type Tab = 'productos' | 'colores' | 'accesorios';

const emptyProduct = (): NewProduct => ({
  code: '', name: '', kind: 'tela', cenefa_mode: 'no', fabricated: true, has_mechanism: true,
});

/**
 * Catálogo administrable (HU-22, HU-44): productos y sus opciones, colores y accesorios.
 * Nada se borra si ya se usó: se desactiva, para no romper rectificaciones antiguas.
 */
@Component({
  selector: 'app-catalog-admin-page',
  imports: [FormsModule],
  templateUrl: './catalog-admin.page.html',
  styles: `
    .tabs { display: flex; gap: 6px; }
    .tabs button { min-height: 40px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--line-strong); background: #fff; font: 600 14px Inter, sans-serif; cursor: pointer; }
    .tabs button.on { background: var(--soft); border-color: var(--navy); color: var(--navy); }
    .prod { display: flex; flex-direction: column; gap: 10px; }
    .prod.off { opacity: .6; }
    .head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .code { font-weight: 800; font-size: 18px; color: var(--navy); min-width: 64px; }
    .grow { flex: 1; min-width: 160px; min-height: 44px; border: 1px solid var(--line-strong); border-radius: 10px; padding: 0 10px; font: 16px Inter, sans-serif; }
    .flags { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 14px; }
    .flags label { display: flex; gap: 8px; align-items: center; min-height: 36px; }
    .flags input[type=checkbox] { width: 20px; height: 20px; accent-color: var(--navy); }
    .flags select { min-height: 36px; border: 1px solid var(--line-strong); border-radius: 8px; font: 14px Inter, sans-serif; padding: 0 6px; }
    .opts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .opt { display: inline-flex; align-items: center; gap: 4px; background: var(--soft); border-radius: 99px; padding: 2px 4px 2px 12px; font-size: 13px; font-weight: 600; }
    .opt button { border: 0; background: none; width: 28px; height: 28px; border-radius: 99px; cursor: pointer; color: var(--danger); font-size: 16px; }
    .opt.off { opacity: .5; text-decoration: line-through; }
    .mini { min-height: 36px; border: 1px solid var(--line-strong); border-radius: 99px; padding: 0 12px; font: 14px Inter, sans-serif; width: 160px; }
    .row-item { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
    .row-item.off .grow { color: var(--muted); }
    .new { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 10px; }
  `,
})
export class CatalogAdminPage implements OnInit {
  private readonly repo = inject(AdminCatalogRepository);

  readonly tab = signal<Tab>('productos');
  readonly products = signal<Product[]>([]);
  readonly colors = signal<Color[]>([]);
  readonly accessories = signal<Accessory[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly telas = computed(() => this.products().filter((p) => p.kind === 'tela' && p.active));

  newProduct = emptyProduct();
  newColor = '';
  newAccessory = '';
  newAccessoryScope: Accessory['scope'] = 'cortina';
  readonly showNew = signal(false);
  readonly optionDraft = signal<Record<string, string>>({});

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const c = await this.repo.loadAll();
      this.products.set(c.products);
      this.colors.set(c.colors);
      this.accessories.set(c.accessories);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async run(action: () => Promise<unknown>, ok?: string): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    try {
      await action();
      if (ok) this.info.set(ok);
      await this.load();
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  componentCode(p: Product, role: 'fondo' | 'frente'): string {
    const id = p.product_components.find((c) => c.role === role)?.component_product_id;
    return this.products().find((x) => x.id === id)?.code ?? '?';
  }

  // ---- Productos ----
  rename(p: Product, name: string): void {
    if (name.trim().length >= 2 && name.trim() !== p.name) void this.run(() => this.repo.updateProduct(p.id, { name: name.trim() }));
  }
  setCenefa(p: Product, mode: CenefaMode): void {
    void this.run(() => this.repo.updateProduct(p.id, { cenefa_mode: mode }));
  }
  setFlag(p: Product, key: 'has_mechanism' | 'fabricated' | 'active', value: boolean): void {
    void this.run(() => this.repo.updateProduct(p.id, { [key]: value }));
  }

  createProduct(): void {
    const n = this.newProduct;
    if (!/^[A-Za-z0-9+]{1,12}$/.test(n.code.trim())) {
      this.error.set('El código usa solo letras, números o «+» (máximo 12), por ejemplo VC-BO o SE+BO.');
      return;
    }
    if (n.name.trim().length < 2) {
      this.error.set('Escribe el nombre del producto.');
      return;
    }
    if (n.kind === 'sistema' && (!n.fondo_id || !n.frente_id)) {
      this.error.set('Elige la tela de atrás y la de adelante del doble.');
      return;
    }
    const max = this.products().reduce((m, p) => Math.max(m, p.sort_order), 0);
    void this.run(async () => {
      await this.repo.createProduct(n, max + 10);
      this.newProduct = emptyProduct();
      this.showNew.set(false);
    }, `Producto ${n.code.toUpperCase()} creado. Recuerda ponerle precio en un tarifario.`);
  }

  setOptionDraft(productId: string, value: string): void {
    this.optionDraft.update((d) => ({ ...d, [productId]: value }));
  }
  addOption(p: Product): void {
    const name = (this.optionDraft()[p.id] ?? '').trim();
    if (name.length < 2) return;
    void this.run(async () => {
      await this.repo.addOption(p.id, name);
      this.setOptionDraft(p.id, '');
    });
  }
  removeOption(id: string): void {
    void this.run(async () => {
      const r = await this.repo.removeOption(id);
      if (r === 'desactivada') this.info.set('La opción ya se usó en cortinas: quedó desactivada en vez de borrarse.');
    });
  }

  // ---- Colores ----
  addColor(): void {
    const name = this.newColor.trim();
    if (!name) return;
    const max = this.colors().length * 10 + 10;
    void this.run(async () => {
      await this.repo.addColor(name, max);
      this.newColor = '';
    });
  }
  renameColor(c: Color, name: string): void {
    if (name.trim() && name.trim() !== c.name) void this.run(() => this.repo.updateColor(c.id, { name: name.trim() }));
  }
  toggleColor(c: Color): void {
    void this.run(() => this.repo.updateColor(c.id, { active: !c.active }));
  }

  // ---- Accesorios ----
  addAccessory(): void {
    const name = this.newAccessory.trim();
    if (name.length < 2) return;
    void this.run(async () => {
      await this.repo.addAccessory(name, this.newAccessoryScope, this.accessories().length * 10 + 10);
      this.newAccessory = '';
    }, 'Accesorio creado. Ponle precio en un tarifario.');
  }
  renameAccessory(a: Accessory, name: string): void {
    if (name.trim().length >= 2 && name.trim() !== a.name) void this.run(() => this.repo.updateAccessory(a.id, { name: name.trim() }));
  }
  setAccessory(a: Accessory, patch: Partial<Pick<Accessory, 'scope' | 'active'>>): void {
    void this.run(() => this.repo.updateAccessory(a.id, patch));
  }
}
