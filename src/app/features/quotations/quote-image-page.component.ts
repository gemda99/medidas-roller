import { Component, computed, input } from '@angular/core';
import { BusinessSettings, conditionLines } from '../../domain/models/business';
import { Quotation } from '../../domain/models/quotation';
import { ImageRow } from '../../domain/quote-image/quote-pages';
import { QuoteLine } from '../../domain/pricing/pricing-engine';
import { formatClp } from '../../shared/format';

/**
 * Una página de la imagen de cotización (HU-32), 1080 px de ancho. Diseño propio para el cliente:
 * no es una captura de la app. Todos los estilos van aquí para que la imagen salga igual en cualquier equipo.
 */
@Component({
  selector: 'app-quote-sheet',
  template: `
    @let q = quote();
    @let b = business();
    <article class="sheet" [style.--accent]="b.accent_color || '#0F2A4A'">
      <header class="head" [class.compact]="!first()">
        <div class="brand">
          @if (logo()) { <img [src]="logo()" alt="" class="logo" /> }
          @else if (b.business_name) { <div class="bname">{{ b.business_name }}</div> }
          @if (first()) {
            <div class="contact">
              @if (logo() && b.business_name) { <strong>{{ b.business_name }}</strong> }
              @if (b.tax_id) { <span>RUT {{ b.tax_id }}</span> }
              @if (b.phone) { <span>{{ b.phone }}</span> }
              @if (b.email) { <span>{{ b.email }}</span> }
              @if (b.website) { <span>{{ b.website }}</span> }
              @if (b.address) { <span>{{ b.address }}</span> }
            </div>
          }
        </div>
        <div class="doc">
          <div class="title">COTIZACIÓN</div>
          <div class="num">N° {{ q.number }}</div>
          <div class="date">{{ date() }}</div>
        </div>
      </header>

      @if (first()) {
        <section class="boxes">
          <div class="box">
            <div class="cap">Cliente</div>
            <div class="big">{{ q.customer_snapshot.full_name }}</div>
            <div>{{ q.customer_snapshot.address_line }}@if (q.customer_snapshot.comuna) {, {{ q.customer_snapshot.comuna }}}</div>
            @if (q.customer_snapshot.phone) { <div>{{ q.customer_snapshot.phone }}</div> }
            @if (q.customer_snapshot.executive_name) { <div class="muted">Atendido por {{ q.customer_snapshot.executive_name }}</div> }
          </div>
          <div class="box">
            <div class="cap">Condiciones</div>
            <div class="kv"><span>Validez</span><strong>{{ q.valid_days }} días</strong></div>
            @if (b.delivery_time_text) { <div class="kv"><span>Entrega</span><strong>{{ b.delivery_time_text }}</strong></div> }
            @if (b.warranty_text) { <div class="kv"><span>Garantía</span><strong>{{ b.warranty_text }}</strong></div> }
          </div>
        </section>
      }

      @if (rows().length) {
        <section class="items">
          <div class="thead"><span>Detalle</span><span>Medidas</span><span class="r">Total</span></div>
          @for (r of rows(); track $index) {
            @if (r.type === 'group') {
              <div class="group">{{ r.label }}</div>
            } @else if (r.sub) {
              <div class="row sub">
                <span>{{ r.line.description }}@if (r.line.quantity > 1) { × {{ r.line.quantity }}}</span>
                <span></span>
                <span class="r">{{ clp(r.line.line_total) }}</span>
              </div>
            } @else {
              <div class="row">
                <span>
                  <strong>{{ r.line.description }}</strong>
                  @if (detail(r.line); as d) { <em>{{ d }}</em> }
                </span>
                <span>
                  @if (r.line.layers?.length) {
                    @for (l of r.line.layers; track $index) { <div>{{ l.label }}: {{ l.width_cm }} × {{ l.height_cm }} cm</div> }
                  } @else if (r.line.width_cm && r.line.height_cm) {
                    {{ r.line.width_cm }} × {{ r.line.height_cm }} cm
                  } @else if (r.line.quantity > 1) {
                    {{ r.line.quantity }} × {{ clp(r.line.unit_price) }}
                  }
                </span>
                <span class="r"><strong>{{ clp(r.line.line_total) }}</strong></span>
              </div>
            }
          }
        </section>
      }

      @if (last()) {
        <section class="foot">
          <div class="bank">
            @if (hasBank()) {
              <div class="cap">Datos para transferencia</div>
              @if (b.bank_name) { <div>{{ b.bank_name }}</div> }
              @if (b.bank_account_type || b.bank_account_number) { <div>{{ b.bank_account_type }} {{ b.bank_account_number }}</div> }
              @if (b.bank_holder) { <div>{{ b.bank_holder }}</div> }
              @if (b.bank_holder_tax_id) { <div>RUT {{ b.bank_holder_tax_id }}</div> }
              @if (b.bank_email) { <div>{{ b.bank_email }}</div> }
            }
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
        @if (conditions().length) {
          <ul class="conds">
            @for (c of conditions(); track $index) { <li>{{ c }}</li> }
          </ul>
        }
        @if (q.notes) { <p class="notes">{{ q.notes }}</p> }
        @if (b.thank_you_text) { <p class="thanks">{{ b.thank_you_text }}</p> }
      }

      @if (pageCount() > 1) { <div class="pager">Página {{ pageIndex() + 1 }} de {{ pageCount() }}</div> }
    </article>
  `,
  styles: `
    :host { display: block; }
    .sheet { width: 1080px; box-sizing: border-box; padding: 56px 60px 48px; background: #fff; color: #142033;
      font: 400 24px/1.4 Inter, 'Segoe UI', Arial, sans-serif; }
    .head { display: flex; justify-content: space-between; gap: 32px; padding-bottom: 28px; border-bottom: 6px solid var(--accent); }
    .head.compact { padding-bottom: 18px; }
    .brand { display: flex; flex-direction: column; gap: 10px; }
    .logo { max-height: 110px; max-width: 420px; object-fit: contain; align-self: flex-start; }
    .bname { font: 800 40px/1.1 Inter, sans-serif; color: var(--accent); }
    .contact { display: flex; flex-direction: column; font-size: 21px; color: #4a5a70; }
    .contact strong { color: #142033; font-size: 23px; }
    .doc { text-align: right; flex: none; }
    .title { font: 800 44px/1 Inter, sans-serif; letter-spacing: 1px; color: var(--accent); }
    .num { font: 700 28px/1.3 Inter, sans-serif; margin-top: 10px; }
    .date { color: #4a5a70; font-size: 22px; }
    .boxes { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; margin-top: 28px; }
    .box { border: 2px solid #e1e7f0; border-radius: 16px; padding: 18px 22px; font-size: 22px; }
    .cap { font: 700 17px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.5px; color: #6a7a90; margin-bottom: 10px; }
    .big { font: 700 28px/1.25 Inter, sans-serif; margin-bottom: 4px; }
    .muted { color: #6a7a90; }
    .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
    .kv span { color: #6a7a90; }
    .items { margin-top: 30px; }
    .thead, .row { display: grid; grid-template-columns: 1fr 300px 190px; gap: 16px; }
    .thead { background: var(--accent); color: #fff; font: 700 19px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1px;
      padding: 16px 20px; border-radius: 12px; }
    .group { font: 700 23px/1 Inter, sans-serif; color: var(--accent); padding: 22px 20px 10px; border-bottom: 2px solid #e1e7f0; }
    .row { padding: 16px 20px; border-bottom: 1px solid #edf1f6; align-items: start; }
    .row em { display: block; font-style: normal; color: #6a7a90; font-size: 20px; }
    .row.sub { padding: 10px 20px 10px 44px; font-size: 21px; color: #4a5a70; }
    .r { text-align: right; }
    .foot { display: grid; grid-template-columns: 1fr 440px; gap: 28px; margin-top: 30px; align-items: start; }
    .bank { font-size: 21px; color: #344358; }
    .totals { background: #f4f7fb; border-radius: 16px; padding: 18px 24px; }
    .t { display: flex; justify-content: space-between; padding: 5px 0; font-size: 23px; }
    .grand { display: flex; justify-content: space-between; margin-top: 12px; padding: 16px 20px; border-radius: 12px;
      background: var(--accent); color: #fff; font: 800 32px/1 Inter, sans-serif; }
    .note { text-align: right; color: #6a7a90; font-size: 19px; margin-top: 8px; }
    .conds { margin: 30px 0 0; padding-left: 28px; font-size: 20px; color: #344358; }
    .conds li { margin: 4px 0; }
    .notes { margin: 18px 0 0; font-size: 21px; color: #344358; white-space: pre-line; }
    .thanks { margin: 30px 0 0; text-align: center; font: 700 26px/1.3 Inter, sans-serif; color: var(--accent); }
    .pager { margin-top: 26px; text-align: right; font-size: 18px; color: #8a98ab; }
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
  readonly conditions = computed(() => conditionLines(this.business().conditions_text));
  readonly ivaPct = computed(() => Math.round((this.quote().pricing_snapshot?.iva_rate ?? 0.19) * 100));
  readonly hasBank = computed(() => {
    const b = this.business();
    return !!(b.bank_name || b.bank_account_number || b.bank_holder);
  });

  /** "Blanco · BO": color y código del producto en una línea. */
  detail(l: QuoteLine): string {
    return [l.color_name, l.kind === 'cortina' ? l.product_code : null].filter(Boolean).join(' · ');
  }

  clp(n: number): string {
    return formatClp(n);
  }
  abs(n: number): number {
    return Math.abs(n);
  }
}
