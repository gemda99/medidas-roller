import { Component, computed, input } from '@angular/core';
import { BusinessSettings, textBlocks } from '../../domain/models/business';
import { Quotation } from '../../domain/models/quotation';
import { QuoteLine } from '../../domain/pricing/pricing-engine';
import { ImageRow } from '../../domain/quote-image/quote-pages';
import { formatClp } from '../../shared/format';
import { formatRut } from '../../shared/validation/rut';

const M = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Una página de la imagen de cotización, 1080 px de ancho. Formato compacto: las cortinas de cada
 * ubicación van en tarjetas consecutivas (3 por fila), cada una con su motor, cenefa y accesorios.
 * Todos los estilos van aquí para que la imagen salga igual en cualquier equipo.
 */
@Component({
  selector: 'app-quote-sheet',
  template: `
    @let q = quote();
    @let b = business();
    <article class="sheet" [style.--accent]="b.accent_color || '#0F2A4A'">
      <header class="head">
        <div class="brand">
          @if (logo()) { <img [src]="logo()" alt="" class="logo" /> }
          @else if (b.business_name) { <div class="bname">{{ b.business_name }}</div> }
        </div>
        <div class="doc">
          <div class="title">COTIZACIÓN</div>
          <div class="num">N° {{ q.number }}</div>
          <div class="date">{{ date() }}</div>
        </div>
      </header>

      @if (first()) {
        <section class="info">
          <div class="col">
            <div class="cap">Cliente</div>
            <div class="cname">{{ q.customer_snapshot.full_name }}</div>
            @if (q.customer_snapshot.rut) { <div>RUT {{ rut(q.customer_snapshot.rut) }}</div> }
            <div>{{ address() }}</div>
            @if (q.customer_snapshot.phone) { <div>{{ q.customer_snapshot.phone }}</div> }
          </div>
          <div class="col">
            <div class="cap">Condiciones</div>
            <div class="kv"><span>Validez</span><strong>{{ q.valid_days }} días</strong></div>
            @if (b.delivery_time_text) { <div class="kv"><span>Entrega</span><strong>{{ b.delivery_time_text }}</strong></div> }
            @if (b.warranty_text) { <div class="kv"><span>Garantía</span><strong>{{ b.warranty_text }}</strong></div> }
            @if (q.customer_snapshot.executive_name) { <div class="kv"><span>Ejecutivo</span><span>{{ q.customer_snapshot.executive_name }}</span></div> }
          </div>
          @if (hasBank()) {
            <div class="col bank">
              <div class="cap">Transferencia</div>
              @if (b.bank_name) { <div class="strong">{{ b.bank_name }}</div> }
              @if (b.bank_account_type || b.bank_account_number) { <div>{{ b.bank_account_type }} N° {{ b.bank_account_number }}</div> }
              @if (b.bank_holder) { <div>{{ b.bank_holder }}</div> }
              @if (b.bank_holder_tax_id) { <div>RUT {{ b.bank_holder_tax_id }}</div> }
              @if (b.bank_email) { <div>{{ b.bank_email }}</div> }
            </div>
          }
        </section>
      }

      @for (r of rows(); track $index) {
        @if (r.type === 'group') {
          <div class="group"><span>{{ r.label }}</span></div>
        } @else {
          <div class="cards">
            @for (c of r.cards; track $index) {
              <div class="card">
                <div class="ctop">
                  @if (c.index) { <span class="n">{{ c.index }}</span> }
                  <div class="cdesc">
                    <strong>{{ c.line.description }}</strong>
                    @if (detail(c.line); as d) { <span class="muted">{{ d }}</span> }
                  </div>
                </div>
                @if (c.line.layers?.length) {
                  @for (l of c.line.layers; track $index) {
                    <div class="meas small"><span class="muted">{{ l.label }} · {{ l.product_code }}</span> <span>{{ m(l.width_cm) }} × {{ m(l.height_cm) }} m</span></div>
                  }
                } @else if (c.line.width_cm && c.line.height_cm) {
                  <div class="meas"><span>{{ m(c.line.width_cm) }} × {{ m(c.line.height_cm) }} m</span><span class="muted">{{ m2(c.line.area_m2) }} m²</span></div>
                } @else if (c.line.quantity > 1) {
                  <div class="meas small"><span class="muted">{{ c.line.quantity }} × {{ clp(c.line.unit_price) }}</span></div>
                }
                @for (s of c.subs; track $index) {
                  <div class="subl"><span>+ {{ s.description }}@if (s.quantity > 1) { ×{{ s.quantity }}}</span><span>{{ clp(s.line_total) }}</span></div>
                }
                <div class="ctotal"><span>Total</span><strong>{{ clp(c.total) }}</strong></div>
              </div>
            }
          </div>
        }
      }

      @if (last()) {
        <section class="foot">
          <div class="left">
            <div class="units"><span>Total cortinas</span><strong>{{ curtainCount() }}</strong></div>
            @if (q.notes) { <p class="notes">{{ q.notes }}</p> }
          </div>
          <div class="totals">
            <div class="t"><span>Subtotal</span><span>{{ clp(q.subtotal_products) }}</span></div>
            @if (q.discount_amount) { <div class="t"><span>Descuento</span><span>−{{ clp(q.discount_amount) }}</span></div> }
            @if (q.installation_amount) { <div class="t"><span>Instalación</span><span>{{ clp(q.installation_amount) }}</span></div> }
            @if (q.extras_amount) { <div class="t"><span>Adicionales</span><span>{{ clp(q.extras_amount) }}</span></div> }
            @if (q.iva_mode === 'excluido') {
              <div class="t"><span>Neto</span><span>{{ clp(q.net_amount) }}</span></div>
              <div class="t"><span>IVA {{ ivaPct() }}%</span><span>{{ clp(q.iva_amount) }}</span></div>
            }
            @if (q.manual_adjustment) {
              <div class="t"><span>Ajuste</span><span>{{ q.manual_adjustment < 0 ? '−' : '' }}{{ clp(abs(q.manual_adjustment)) }}</span></div>
            }
            <div class="grand"><span>TOTAL</span><span>{{ clp(q.total_final) }}</span></div>
            @if (q.iva_mode === 'incluido') { <div class="note">Incluye IVA ({{ clp(q.iva_amount) }})</div> }
          </div>
        </section>

        @if (texts().length) {
          <section class="texts">
            @for (sec of texts(); track sec.title) {
              <div class="text">
                <h3>{{ sec.title }}</h3>
                @for (t of sec.blocks; track $index) {
                  @if (t.kind === 'title') { <h4>{{ t.text }}</h4> } @else { <p>{{ t.text }}</p> }
                }
              </div>
            }
          </section>
        }

        @if (b.thank_you_text) { <p class="thanks">{{ b.thank_you_text }}</p> }
      }

      <footer class="bottom">
        <span>{{ contactLine() }}</span>
        @if (pageCount() > 1) { <span>Página {{ pageIndex() + 1 }} de {{ pageCount() }}</span> }
      </footer>
    </article>
  `,
  styles: `
    :host { display: block; }
    .sheet { width: 1080px; box-sizing: border-box; padding: 40px 44px 0; background: #fff; color: #142033;
      font: 400 18px/1.4 Inter, system-ui, sans-serif; font-variant-numeric: tabular-nums;
      --tint: color-mix(in srgb, var(--accent) 6%, #fff); --line: #e3e8ef; --muted: #66768c; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 18px; border-bottom: 4px solid var(--accent); }
    .logo { max-height: 84px; max-width: 360px; object-fit: contain; display: block; }
    .bname { font: 800 32px/1.1 Inter, sans-serif; color: var(--accent); }
    .doc { text-align: right; }
    .title { font: 800 30px/1 Inter, sans-serif; letter-spacing: 2px; color: var(--accent); }
    .num { font: 700 19px/1.3 Inter, sans-serif; margin-top: 6px; }
    .date { color: var(--muted); font-size: 16px; }
    .info { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 14px; margin-top: 18px; font-size: 16px; }
    .col { border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; }
    .col.bank { background: var(--tint); border-color: transparent; color: #2c3b50; }
    .cap { font: 700 12px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.4px; color: var(--accent); margin-bottom: 8px; }
    .cname { font: 700 19px/1.25 Inter, sans-serif; margin-bottom: 2px; }
    .strong { font-weight: 700; color: #142033; }
    .kv { display: flex; justify-content: space-between; gap: 10px; padding: 1px 0; }
    .kv span:first-child { color: var(--muted); }
    .group { display: flex; align-items: center; gap: 12px; margin-top: 18px; font: 700 17px/1.2 Inter, sans-serif; color: var(--accent);
      text-transform: uppercase; letter-spacing: 1px; }
    .group::after { content: ''; flex: 1; height: 2px; background: var(--line); }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; align-items: stretch; }
    .card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 12px; border-top: 4px solid var(--accent); }
    .ctop { display: flex; gap: 10px; align-items: flex-start; }
    .n { flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; font: 700 13px/26px Inter, sans-serif; text-align: center; }
    .cdesc { display: flex; flex-direction: column; min-width: 0; }
    .cdesc strong { font-size: 17px; line-height: 1.25; }
    .muted { color: var(--muted); font-size: 15px; }
    .meas { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 6px 10px; border-radius: 8px; background: var(--tint);
      font-weight: 700; font-size: 18px; }
    .meas.small { font-size: 15px; padding: 3px 10px; }
    .meas.small .muted { font-weight: 400; }
    .subl { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; color: #3a4a60; }
    .ctotal { display: flex; justify-content: space-between; align-items: baseline; margin-top: auto; padding-top: 6px; border-top: 1px solid var(--line); }
    .ctotal span { font-size: 14px; color: var(--muted); }
    .ctotal strong { font-size: 19px; }
    .foot { display: grid; grid-template-columns: 1fr 400px; gap: 22px; margin-top: 22px; align-items: start; }
    .left { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .units { display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; border: 1.5px solid var(--line); border-radius: 10px; font-size: 16px; color: var(--muted); }
    .units strong { font-size: 20px; color: #142033; }
    .notes { margin: 0; padding: 10px 14px; border-left: 4px solid var(--accent); background: var(--tint); font-size: 16px; white-space: pre-line; }
    .totals { background: var(--tint); border-radius: 12px; padding: 14px 18px; }
    .t { display: flex; justify-content: space-between; padding: 3px 0; font-size: 17px; }
    .grand { display: flex; justify-content: space-between; gap: 16px; white-space: nowrap; margin-top: 10px; padding: 12px 16px; border-radius: 10px;
      background: var(--accent); color: #fff; font: 800 26px/1 Inter, sans-serif; }
    .note { text-align: right; color: var(--muted); font-size: 14px; margin-top: 6px; }
    .texts { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 22px; padding-top: 16px; border-top: 2px solid var(--line); }
    .texts:has(> .text:only-child) { grid-template-columns: 1fr; }
    .text h3 { margin: 0 0 6px; font: 700 13px/1.2 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.3px; color: var(--accent); }
    .text h4 { margin: 10px 0 2px; font: 700 15px/1.3 Inter, sans-serif; color: #142033; }
    .text p { position: relative; margin: 3px 0; padding-left: 16px; font-size: 14.5px; line-height: 1.4; color: #3a4a60; }
    .text p::before { content: ''; position: absolute; left: 3px; top: 8px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
    .thanks { margin: 20px 0 0; text-align: center; font: 700 20px/1.3 Inter, sans-serif; color: var(--accent); }
    .bottom { display: flex; justify-content: space-between; gap: 20px; margin: 22px -44px 0; padding: 14px 44px;
      background: var(--accent); color: rgb(255 255 255 / 85%); font-size: 15px; }
  `,
})
export class QuoteImagePageComponent {
  readonly quote = input.required<Quotation>();
  readonly business = input.required<BusinessSettings>();
  readonly logo = input<string | null>(null);
  readonly rows = input.required<ImageRow[]>();
  readonly pageIndex = input(0);
  readonly pageCount = input(1);

  readonly first = computed(() => this.pageIndex() === 0);
  readonly last = computed(() => this.pageIndex() === this.pageCount() - 1);
  readonly date = computed(() =>
    new Date(this.quote().issued_at ?? this.quote().created_at)
      .toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }),
  );
  readonly address = computed(() => {
    const c = this.quote().customer_snapshot;
    return [c.address_line, c.comuna].filter(Boolean).join(', ');
  });
  readonly curtainCount = computed(() => this.quote().quotation_items.filter((l) => l.kind === 'cortina').length);
  readonly texts = computed(() =>
    [
      { title: 'Condiciones generales', blocks: textBlocks(this.business().conditions_text) },
      { title: 'Garantía', blocks: textBlocks(this.business().warranty_details_text) },
    ].filter((s) => s.blocks.length),
  );
  readonly contactLine = computed(() => {
    const b = this.business();
    return [b.business_name, b.tax_id ? `RUT ${b.tax_id}` : null, b.phone, b.email, b.website].filter(Boolean).join('  ·  ');
  });
  readonly ivaPct = computed(() => Math.round((this.quote().pricing_snapshot?.iva_rate ?? 0.19) * 100));
  readonly hasBank = computed(() => {
    const b = this.business();
    return !!(b.bank_name || b.bank_account_number || b.bank_holder);
  });

  /** "Blanco · BO": color y código del producto en una línea. */
  detail(l: QuoteLine): string {
    return [l.color_name, l.kind === 'cortina' ? l.product_code : null].filter(Boolean).join(' · ');
  }

  /** Centímetros a metros con coma, como el Excel: 170 → 1,70. */
  m(cm: number | null): string {
    return cm ? M.format(cm / 100) : '';
  }
  m2(a: number | null): string {
    return a ? M.format(a) : '';
  }
  rut(r: string): string {
    return formatRut(r);
  }
  clp(n: number): string {
    return formatClp(n);
  }
  abs(n: number): number {
    return Math.abs(n);
  }
}
