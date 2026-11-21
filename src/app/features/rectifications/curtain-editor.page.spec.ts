import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { Catalog, Product } from '../../domain/models/catalog';
import { CurtainPayload, Rectification } from '../../domain/models/rectification';
import { DraftStore } from '../../shared/drafts/draft-store';
import { CurtainEditorPage } from './curtain-editor.page';

const p = (id: string, kind: 'tela' | 'sistema', extra: Partial<Product> = {}): Product => ({
  id, code: id, name: id, kind, cenefa_mode: 'opcional', fabricated: true, active: true, sort_order: 0,
  product_components: [], product_options: [], ...extra,
});
const catalog: Catalog = {
  products: [
    p('SE', 'tela'),
    p('BO', 'tela', { product_options: [{ id: 'velcro', product_id: 'BO', name: 'Velcro', active: true, sort_order: 0 }] }),
    p('SE+BO', 'sistema', { cenefa_mode: 'no', product_components: [{ role: 'fondo', component_product_id: 'SE' }, { role: 'frente', component_product_id: 'BO' }] }),
  ],
  colors: [{ id: 'c', name: 'Beige', active: true }],
  accessories: [{ id: 'peso', name: 'Peso', scope: 'cortina', active: true }],
};

function rect(status: 'borrador' | 'completa' = 'borrador'): Rectification {
  return {
    id: 'R', customer_id: 'C', executive_id: 'E', executive_name: 'Yo', address_line: 'Calle', comuna: 'Maipú',
    address_reference: null, visit_date: '2026-11-21', installation_date: null, observations: null,
    explained_light_entry: false, explained_fabric_position: false, explained_side_measure: false,
    status, created_at: '', updated_at: '', customers: { full_name: 'Cliente', phone: '9' },
    locations: [{ id: 'L', rectification_id: 'R', name: 'Living', notes: null, sort_order: 10, curtains: [] }],
  };
}

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key() { return null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

async function render(status: 'borrador' | 'completa' = 'borrador') {
  const saved: CurtainPayload[] = [];
  const storage = new MemoryStorage();
  await TestBed.configureTestingModule({
    imports: [CurtainEditorPage],
    providers: [
      provideRouter([]),
      { provide: CatalogRepository, useValue: { load: () => Promise.resolve(catalog) } },
      { provide: RectificationRepository, useValue: { get: () => Promise.resolve(rect(status)), saveCurtain: (x: CurtainPayload) => (saved.push(x), Promise.resolve('new-id')) } },
      { provide: DraftStore, useValue: new DraftStore(storage) },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'R' }), queryParamMap: convertToParamMap({ ubicacion: 'L' }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(CurtainEditorPage);
  const page = fixture.componentInstance;
  fixture.detectChanges(); // dispara ngOnInit una sola vez, como en la app
  for (let i = 0; i < 50 && page.loading(); i++) await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  router.navigate = (() => Promise.resolve(true)) as typeof router.navigate;
  return { fixture, page, saved, storage };
}

describe('CurtainEditorPage', () => {
  it('no guarda sin producto ni medidas y lo explica', async () => {
    const { fixture, page, saved } = await render();
    await page.save(false);
    fixture.detectChanges();
    expect(saved.length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Elige el producto.');
  });

  it('arma el payload de una cortina simple con coma decimal, opciones y accesorios', async () => {
    const { page, saved } = await render();
    page.selectProduct(catalog.products[1]);
    page.components.at(0).patchValue({ width_cm: '148,5', height_cm: '220', color_name: 'Beige' });
    page.form.patchValue({ surface: 'concreto', mounting: 'muro', chain_side: 'izquierda', chain_length: '1.5', has_cenefa: true });
    page.toggleOption('velcro');
    page.bump('peso', 1);
    page.bump('peso', 1);
    await page.save(false);
    expect(saved.length).toBe(1);
    expect(saved[0]).toMatchObject({
      location_id: 'L', product_id: 'BO', chain_length_m: 1.5, has_cenefa: true, option_ids: ['velcro'],
      accessories: [{ accessory_id: 'peso', quantity: 2 }],
      components: [{ role: 'unica', width_cm: 148.5, height_cm: 220, color_name: 'Beige', motorized: false }],
    });
  });

  it('al elegir un doble aparecen dos telas con las medidas copiadas y sin cenefa', async () => {
    const { page } = await render();
    page.selectProduct(catalog.products[1]);
    page.components.at(0).patchValue({ width_cm: '150', height_cm: '160' });
    page.form.patchValue({ has_cenefa: true });
    page.selectProduct(catalog.products[2]);
    expect(page.components.getRawValue().map((c) => [c.role, c.width_cm])).toEqual([['fondo', '150'], ['frente', '150']]);
    expect(page.form.controls.has_cenefa.value).toBe(false);
  });

  it('cadena vacía (velcro) se envía vacía; cadena «otro» acepta coma', async () => {
    const { page, saved } = await render();
    page.selectProduct(catalog.products[0]);
    page.components.at(0).patchValue({ width_cm: '47', height_cm: '204' });
    await page.save(false);
    expect(saved[0].chain_length_m).toBe('');
    expect(saved[0].chain_side).toBe('');
    page.form.patchValue({ chain_length: 'otro', chain_other: '2,5' });
    await page.save(false);
    expect(saved[1].chain_length_m).toBe(2.5);
  });

  it('«Guardar y otra» conserva producto y configuración y limpia medidas y nota', async () => {
    const { page } = await render();
    page.selectProduct(catalog.products[1]);
    page.components.at(0).patchValue({ width_cm: '170', height_cm: '220', color_name: 'Beige' });
    page.form.patchValue({ mounting: 'muro', notes: 'bien arriba' });
    await page.save(true);
    const v = page.form.getRawValue();
    expect(v.product_id).toBe('BO');
    expect(v.mounting).toBe('muro');
    expect(v.notes).toBe('');
    expect(v.components[0]).toMatchObject({ width_cm: '', height_cm: '', color_name: 'Beige' });
    expect(page.flash()).toContain('Cortina guardada');
  });

  it('guarda borrador local mientras se escribe y lo limpia al guardar', async () => {
    const { page, storage } = await render();
    page.selectProduct(catalog.products[1]);
    page.components.at(0).patchValue({ width_cm: '170', height_cm: '220' });
    expect(storage.getItem('mr:draft:curtain:new:R:L')).toContain('170');
    await page.save(false);
    expect(storage.getItem('mr:draft:curtain:new:R:L')).toBeNull();
  });

  it('con la rectificación completa, los botones de guardar quedan bloqueados', async () => {
    const { fixture } = await render('completa');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('La rectificación está completa');
    const submit = el.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
