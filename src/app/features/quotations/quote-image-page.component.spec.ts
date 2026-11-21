import { TestBed } from '@angular/core/testing';
import { EMPTY_BUSINESS } from '../../domain/models/business';
import { buildRows } from '../../domain/quote-image/quote-pages';
import { QuoteImagePageComponent } from './quote-image-page.component';

const line: any = { kind: 'cortina', curtain_id: 'c1', location_name: 'Living', description: 'Roller Blackout', product_code: 'BO',
  color_name: 'Blanco', width_cm: 170, height_cm: 220, area_m2: 3.74, base_price: 78540, min_price_applied: false,
  unit_price: 78540, quantity: 1, line_total: 78540, sort_order: 0 };
const quote = (iva: string): any => ({ id: 'q', number: 'COT-2026-0001', status: 'emitida', created_at: '2026-11-21T15:00:00Z',
  issued_at: '2026-11-21T15:00:00Z', iva_mode: iva, subtotal_products: 78540, discount_amount: 0, installation_amount: 0,
  extras_amount: 0, net_amount: 78540, iva_amount: iva === 'sin' ? 0 : 14923, manual_adjustment: 0, total_final: iva === 'excluido' ? 93463 : 78540,
  valid_days: 15, notes: null, pricing_snapshot: { iva_rate: 0.19 }, quotation_items: [line],
  customer_snapshot: { full_name: 'Pamela Méndez', phone: '', address_line: 'Calle 1', comuna: 'Ñuñoa', address_reference: null, executive_name: '' } });

function render(iva: string, pageIndex = 0, pageCount = 1) {
  const f = TestBed.createComponent(QuoteImagePageComponent);
  f.componentRef.setInput('quote', quote(iva));
  f.componentRef.setInput('business', { ...EMPTY_BUSINESS, business_name: 'Empresa', thank_you_text: 'Gracias' });
  f.componentRef.setInput('rows', buildRows([line]));
  f.componentRef.setInput('pageIndex', pageIndex);
  f.componentRef.setInput('pageCount', pageCount);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
}

describe('imagen de cotización', () => {
  it('IVA excluido: muestra neto, IVA y total', () => {
    const t = render('excluido');
    expect(t).toContain('Pamela Méndez');
    expect(t).toContain('Blanco · BO');
    expect(t).toContain('IVA 19%');
    expect(t).toContain('$93.463');
  });

  it('sin IVA: no menciona IVA', () => {
    expect(render('sin')).not.toContain('IVA');
  });

  it('IVA incluido: lo indica bajo el total', () => {
    expect(render('incluido')).toContain('Incluye IVA');
  });

  it('páginas intermedias: sin totales y con numeración', () => {
    const t = render('excluido', 0, 2);
    expect(t).not.toContain('TOTAL');
    expect(t).toContain('Página 1 de 2');
  });
});
