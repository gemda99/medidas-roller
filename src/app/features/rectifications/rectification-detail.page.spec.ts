import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { QuotationRepository } from '../../data-access/repositories/quotation.repository';
import { Catalog, Product } from '../../domain/models/catalog';
import { Rectification } from '../../domain/models/rectification';
import { RectificationDetailPage } from './rectification-detail.page';
import { signal } from '@angular/core';

const p = (id: string, kind: 'tela' | 'sistema', extra: Partial<Product> = {}): Product => ({
  id, code: id, name: id, kind, cenefa_mode: 'no', fabricated: true, has_mechanism: true, active: true, sort_order: 0,
  product_components: [], product_options: [], ...extra,
});
const catalog: Catalog = {
  products: [
    p('SE', 'tela'), p('BO', 'tela'), p('RDBO', 'tela', { name: 'Dúo blackout' }),
    p('SE+BO', 'sistema', { name: 'Sistema doble', product_components: [{ role: 'fondo', component_product_id: 'SE' }, { role: 'frente', component_product_id: 'BO' }] }),
  ],
  colors: [],
  accessories: [],
};
const rect: Rectification = {
  id: 'R', customer_id: 'C', executive_id: 'E', executive_name: 'Yo', address_line: 'Calle 1', comuna: 'Maipú',
  address_reference: null, visit_date: '2026-11-21', installation_date: null, observations: null,
  explained_light_entry: false, explained_fabric_position: false, explained_side_measure: false,
  status: 'borrador', created_at: '', updated_at: '2026-11-21T00:00:00Z', customers: { full_name: 'Cliente', phone: '9' },
  locations: [{
    id: 'L', rectification_id: 'R', name: 'Living', notes: null, sort_order: 10,
    curtains: [
      {
        id: 'c1', location_id: 'L', product_id: 'RDBO', label: null, surface: 'concreto', surface_other: null, mounting: 'muro',
        chain_side: 'izquierda', chain_length_m: 1.5, has_cenefa: true, swap_layers: false, notes: 'Bien arriba', sort_order: 0,
        curtain_components: [{ role: 'unica', color_name: 'Beige-3', width_cm: 222, height_cm: 180, fall: 'externa', motorized: false }],
        curtain_options: [], curtain_accessories: [],
      },
      {
        id: 'c2', location_id: 'L', product_id: 'SE+BO', label: null, surface: null, surface_other: null, mounting: null,
        chain_side: null, chain_length_m: null, has_cenefa: false, swap_layers: true, notes: null, sort_order: 1,
        curtain_components: [
          { role: 'fondo', color_name: null, width_cm: 150, height_cm: 160, fall: 'interna', motorized: false },
          { role: 'frente', color_name: null, width_cm: 148, height_cm: 160, fall: 'externa', motorized: true },
        ],
        curtain_options: [], curtain_accessories: [],
      },
    ],
  }],
};

describe('RectificationDetailPage', () => {
  it('muestra cada cortina como un cuadro con sus telas, medidas y caída', async () => {
    await TestBed.configureTestingModule({
      imports: [RectificationDetailPage],
      providers: [
        provideRouter([]),
        { provide: CatalogRepository, useValue: { load: () => Promise.resolve(catalog) } },
        { provide: RectificationRepository, useValue: { get: () => Promise.resolve(structuredClone(rect)) } },
        { provide: QuotationRepository, useValue: { listByRectification: () => Promise.resolve([{ id: 'q1', number: 'COT-2026-0001', rectification_id: 'R', status: 'borrador', total_final: 246425, created_at: '2026-11-21', issued_at: null }]) } },
        { provide: AuthService, useValue: { isAdmin: signal(false) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'R' }) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RectificationDetailPage);
    fixture.detectChanges();
    for (let i = 0; i < 50 && fixture.componentInstance.loading(); i++) await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('article.ccard');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('RDBO');
    expect(cards[0].textContent).toContain('222 × 180');
    expect(cards[0].textContent).toContain('Cadena izq. 1,5 m');
    expect(cards[0].textContent).toContain('Nota: Bien arriba');
    expect(cards[1].textContent).toContain('Atrás · BO');
    expect(cards[1].textContent).toContain('Adelante · SE');
    expect(cards[1].textContent).toContain('Caída interna');
    expect(el.querySelector('a.add-card')?.textContent).toContain('Agregar cortina');
    expect(el.textContent).toContain('COT-2026-0001');
    expect(el.textContent).toContain('$246.425');
  });
});
