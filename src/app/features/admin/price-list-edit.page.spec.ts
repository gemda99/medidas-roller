import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminCatalogRepository } from '../../data-access/repositories/admin-catalog.repository';
import { PriceListRepository } from '../../data-access/repositories/price-list.repository';
import { Product } from '../../domain/models/catalog';
import { PriceListWithPrices } from '../../domain/models/pricing';
import { PriceListEditPage } from './price-list-edit.page';

const prod = (id: string, kind: 'tela' | 'sistema'): Product => ({
  id, code: id, name: id, kind, cenefa_mode: 'no', fabricated: true, has_mechanism: true, active: true, sort_order: 0,
  product_components: [], product_options: [],
});

const list = (status: PriceListWithPrices['status']): PriceListWithPrices => ({
  id: 'P', name: 'Tarifario inicial', status, valid_from: null, activated_at: null, created_at: '2026-11-21',
  general_min_price: 40000, motor_price: 100000, remote_control_per_motors: 15, cenefa_price_ml: 10000,
  installation_mode: 'proyecto', installation_project_price: 50000, installation_per_curtain_price: null,
  iva_rate: 0.19, iva_mode_default: 'excluido', rounding_step: 1, medidor_discount_enabled: false,
  medidor_max_discount_pct: 0, notes: null,
  product_prices: [{ product_id: 'BO', price_m2: 21000, min_price: null }, { product_id: 'SE+BO', price_m2: null, min_price: 70000 }],
  accessory_prices: [],
});

async function render(status: PriceListWithPrices['status']) {
  const calls: unknown[][] = [];
  await TestBed.configureTestingModule({
    imports: [PriceListEditPage],
    providers: [
      provideRouter([]),
      {
        provide: PriceListRepository,
        useValue: {
          get: () => Promise.resolve(list(status)),
          missing: () => Promise.resolve([{ code: 'SE', name: 'SE' }]),
          setProductPrice: (...a: unknown[]) => (calls.push(a), Promise.resolve()),
          updateSettings: (...a: unknown[]) => (calls.push(a), Promise.resolve()),
        },
      },
      { provide: AdminCatalogRepository, useValue: { loadAll: () => Promise.resolve({ products: [prod('SE', 'tela'), prod('BO', 'tela'), prod('SE+BO', 'sistema')], colors: [], accessories: [] }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'P' }) }, paramMap: of(convertToParamMap({ id: 'P' })) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PriceListEditPage);
  fixture.detectChanges();
  for (let i = 0; i < 50 && fixture.componentInstance.loading(); i++) await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, calls, el: fixture.nativeElement as HTMLElement };
}

describe('PriceListEditPage', () => {
  it('borrador: muestra precios en pesos y qué falta para activar', async () => {
    const { el } = await render('borrador');
    expect(el.textContent).toContain('falta el precio por m² de: SE');
    const bo = el.querySelector('input[aria-label="Precio por m² BO"]') as HTMLInputElement;
    expect(bo.value).toBe('$21.000');
    expect(bo.disabled).toBe(false);
    const activate = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Activar')) as HTMLButtonElement;
    expect(activate.disabled).toBe(true);
  });

  it('guarda montos escritos como $23.000 y rechaza texto inválido', async () => {
    const { page, calls } = await render('borrador');
    page.setProductPrice(prod('BO', 'tela'), 'price_m2', '$23.000');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0]).toEqual(['P', 'BO', 23000, null]);
    page.setProductPrice(prod('BO', 'tela'), 'price_m2', 'veinte mil');
    expect(page.error()).toContain('escribe un monto en pesos');
    expect(calls.length).toBe(1);
  });

  it('vigente: todo queda de solo lectura y ofrece crear copia', async () => {
    const { el } = await render('vigente');
    expect(el.textContent).toContain('está en uso y no se edita');
    const inputs = [...el.querySelectorAll('input')] as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.disabled)).toBe(true);
  });
});
