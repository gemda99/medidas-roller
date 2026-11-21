import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminCatalogRepository } from '../../data-access/repositories/admin-catalog.repository';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { PriceListRepository } from '../../data-access/repositories/price-list.repository';
import { QuotationRepository, SaveQuotationInput } from '../../data-access/repositories/quotation.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { Catalog, Product } from '../../domain/models/catalog';
import { PriceListWithPrices } from '../../domain/models/pricing';
import { Curtain, Rectification } from '../../domain/models/rectification';
import { QuotationEditorPage } from './quotation-editor.page';

const BO: Product = {
  id: 'BO', code: 'BO', name: 'Roller Blackout', kind: 'tela', cenefa_mode: 'opcional', fabricated: true, has_mechanism: true,
  active: true, sort_order: 0, product_components: [], product_options: [],
};
const catalog: Catalog = { products: [BO], colors: [], accessories: [] };
const curtain = (id: string): Curtain => ({
  id, location_id: 'L', product_id: 'BO', label: null, surface: null, surface_other: null, mounting: null, chain_side: null,
  chain_length_m: null, has_cenefa: false, swap_layers: false, notes: null, sort_order: 0,
  curtain_components: [{ role: 'unica', color_name: 'Por confirmar', width_cm: 170, height_cm: 220, fall: null, motorized: false }],
  curtain_options: [], curtain_accessories: [],
});
const rect: Rectification = {
  id: 'R', customer_id: 'C', executive_id: 'E', executive_name: 'Yo', address_line: 'Calle 1', comuna: 'La Reina',
  address_reference: null, visit_date: '2026-11-21', installation_date: null, observations: null,
  explained_light_entry: false, explained_fabric_position: false, explained_side_measure: false, status: 'borrador',
  created_at: '', updated_at: '', customers: { full_name: 'Cliente ejemplo', phone: '+56 9 0000 0000' },
  locations: [{ id: 'L', rectification_id: 'R', name: 'Living', notes: null, sort_order: 0, curtains: [curtain('a'), curtain('b')] }],
};
const vigente = (discount = false): PriceListWithPrices => ({
  id: 'P', name: 'Tarifario inicial', status: 'vigente', valid_from: '2026-11-21', activated_at: null, created_at: '',
  general_min_price: 40000, motor_price: 100000, remote_control_per_motors: 15, cenefa_price_ml: 10000,
  installation_mode: 'proyecto', installation_project_price: 50000, installation_per_curtain_price: null, iva_rate: 0.19,
  iva_mode_default: 'excluido', rounding_step: 1, medidor_discount_enabled: discount, medidor_max_discount_pct: 10, notes: null,
  product_prices: [{ product_id: 'BO', price_m2: 21000, min_price: null }], accessory_prices: [],
});

async function render(opts: { admin?: boolean; discount?: boolean } = {}) {
  const saved: SaveQuotationInput[] = [];
  await TestBed.configureTestingModule({
    imports: [QuotationEditorPage],
    providers: [
      provideRouter([]),
      { provide: RectificationRepository, useValue: { get: () => Promise.resolve(structuredClone(rect)) } },
      { provide: PriceListRepository, useValue: { getVigente: () => Promise.resolve(vigente(opts.discount)) } },
      { provide: CatalogRepository, useValue: { load: () => Promise.resolve(catalog) } },
      { provide: AdminCatalogRepository, useValue: { loadAll: () => Promise.resolve(catalog) } },
      {
        provide: QuotationRepository,
        useValue: {
          save: (x: SaveQuotationInput) => (saved.push(x), Promise.resolve({ id: 'Q', number: 'COT-2026-0001' })),
          get: () => Promise.resolve({ id: 'Q', number: 'COT-2026-0001', status: 'borrador', rectification_id: 'R', quotation_items: [] }),
        },
      },
      { provide: AuthService, useValue: { isAdmin: signal(!!opts.admin) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'R' }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(QuotationEditorPage);
  fixture.detectChanges();
  for (let i = 0; i < 50 && fixture.componentInstance.loading(); i++) await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  router.navigate = (() => Promise.resolve(true)) as typeof router.navigate;
  return { fixture, page: fixture.componentInstance, saved, el: fixture.nativeElement as HTMLElement };
}

describe('QuotationEditorPage', () => {
  it('cotiza la rectificación con el tarifario vigente: caso del Excel $246.425', async () => {
    const { el, page } = await render();
    expect(page.result()?.total_final).toBe(246425);
    expect(el.textContent).toContain('$78.540');
    expect(el.textContent).toContain('$246.425');
    expect(el.textContent).toContain('Precios: Tarifario inicial');
  });

  it('guarda con la copia de precios y los datos del cliente', async () => {
    const { page, saved } = await render();
    await page.save();
    expect(saved.length).toBe(1);
    expect(saved[0].pricing_snapshot.products['BO'].price_m2).toBe(21000);
    expect(saved[0].customer_snapshot).toMatchObject({ full_name: 'Cliente ejemplo', comuna: 'La Reina' });
    expect(saved[0].result.total_final).toBe(246425);
  });

  it('medidor: sin descuento habilitado no ve el campo; con descuento, no puede pasar el máximo', async () => {
    let r = await render();
    expect(r.el.textContent).not.toContain('Descuento (%)');
    TestBed.resetTestingModule();
    r = await render({ discount: true });
    r.fixture.detectChanges();
    expect(r.el.textContent).toContain('máximo 10%');
    r.page.setDiscountPercent('15');
    await r.page.save();
    expect(r.saved.length).toBe(0);
    expect(r.page.error()).toContain('máximo es 10%');
    r.page.setDiscountPercent('10');
    await r.page.save();
    expect(r.saved[0].result.discount_amount).toBe(15708);
  });

  it('el ajuste manual solo cuenta para el administrador', async () => {
    let r = await render();
    r.page.manualAdjustment.set(-6425);
    expect(r.page.result()?.total_final).toBe(246425);
    TestBed.resetTestingModule();
    r = await render({ admin: true });
    r.page.manualAdjustment.set(-6425);
    expect(r.page.result()?.total_final).toBe(240000);
  });
});
