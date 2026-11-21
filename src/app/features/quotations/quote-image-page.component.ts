import { Component, computed, input } from '@angular/core';
import { BusinessSettings, textBlocks } from '../../domain/models/business';
import { Quotation } from '../../domain/models/quotation';
import { QuoteLine } from '../../domain/pricing/pricing-engine';
import { ImageRow } from '../../domain/quote-image/quote-pages';
import { formatClp } from '../../shared/format';

const M = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Una página de la imagen de cotización (HU-32), 1080 px de ancho. Diseño propio para el cliente,
 * ordenado como el presupuesto Excel de Gabriel: medidas en metros, m² y total por cortina.
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
      </header>

      <div class="band">
        <span class="title">COTIZACIÓN</span>
        <span class="meta"><strong>N° {{ q.number }}</strong><span class="sep"></span>{{ date() }}</span>
      </div>

      @if (first()) {
        <section class="boxes">
          <div class="box">
            <div class="cap">Datos del cliente</div>
            <div class="kv"><span>Cliente</span><strong>{{ q.customer_snapshot.full_name }}</strong></div>
            <div class="kv"><span>Dirección</span><span>{{ address() }}</span></div>
            @if (q.customer_snapshot.phone) { <div class="kv"><span>Teléfono</span><span>{{ q.customer_snapshot.phone }}</span></div> }
            @if (q.customer_snapshot.executive_name) { <div class="kv"><span>Ejecutivo</span><span>{{ q.customer_snapshot.executive_name }}</span></div> }
          </div>
          @if (hasBank()) {
            <div class="box bank">
              <div class="cap">Datos de transferencia</div>
              @if (b.bank_name) { <div class="strong">{{ b.bank_name }}</div> }
              @if (b.bank_account_type || b.bank_account_number) { <div>{{ b.bank_account_type }} N° {{ b.bank_account_number }}</div> }
              @if (b.bank_holder) { <div>{{ b.bank_holder }}</div> }
              @if (b.bank_holder_tax_id) { <div>RUT {{ b.bank_holder_tax_id }}</div> }
              @if (b.bank_email) { <div>{{ b.bank_email }}</div> }
            </div>
          }
        </section>

        <section class="chips">
          @if (b.delivery_time_text) { <div class="chip"><span>Entrega aprox.</span><strong>{{ b.delivery_time_text }}</strong></div> }
          @if (b.warranty_text) { <div class="chip"><span>Garantía</span><strong>{{ b.warranty_text }}</strong></div> }
          <div class="chip"><span>Validez</span><strong>{{ q.valid_days }} días</strong></div>
        </section>
      }

      @if (rows().length) {
        <section class="table">
          <div class="tr th">
            <span class="c">#</span><span>Producto</span><span class="c">Ancho (m)</span><span class="c">Alto (m)</span><span class="c">m²</span><span class="r">Total</span>
          </div>
          @for (r of rows(); track $index) {
            @if (r.type === 'group') {
              <div class="group">{{ r.label }}</div>
            } @else if (r.sub) {
              <div class="tr sub">
                <span></span>
                <span>+ {{ r.line.description }}@if (r.line.quantity > 1) { (× {{ r.line.quantity }})}</span>
                <span></span><span></span><span></span>
                <span class="r">{{ clp(r.line.line_total) }}</span>
              </div>
            } @else {
              <div class="tr item" [class.has-layers]="r.line.layers?.length">
                <span class="c">@if (r.index) { <span class="num">{{ r.index }}</span> }</span>
                <span>
                  <strong>{{ r.line.description }}</strong>
                  @if (detail(r.line); as d) { <em>{{ d }}</em> }
                </span>
                @if (r.line.layers?.length) {
                  <span></span><span></span><span></span>
                } @else if (r.line.width_cm && r.line.height_cm) {
                  <span class="c">{{ m(r.line.width_cm) }}</span>
                  <span class="c">{{ m(r.line.height_cm) }}</span>
                  <span class="c">{{ m2(r.line.area_m2) }}</span>
                } @else {
                  <span class="c">@if (r.line.quantity > 1) { {{ r.line.quantity }} u. }</span><span></span><span></span>
                }
                <span class="r"><strong>{{ clp(r.line.line_total) }}</strong></span>
              </div>
              @for (l of r.line.layers ?? []; track $index; let lastLayer = $last) {
                <div class="tr layer" [class.end]="lastLayer">
                  <span></span>
                  <span>{{ l.label }} · {{ l.product_code }}</span>
                  <span class="c">{{ m(l.width_cm) }}</span>
                  <span class="c">{{ m(l.height_cm) }}</span>
                  <span class="c">{{ m2(l.area_m2) }}</span>
                  <span></span>
                </div>
              }
            }
          }
        </section>
      }

      @if (last()) {
        <section class="foot">
          <div class="units">
            <span>Total cortinas</span><strong>{{ curtainCount() }}</strong>
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

        @if (q.notes) { <p class="notes">{{ q.notes }}</p> }

        @for (sec of texts(); track sec.title) {
          <section class="text">
            <h3>{{ sec.title }}</h3>
            @for (t of sec.blocks; track $index) {
              @if (t.kind === 'title') { <h4>{{ t.text }}</h4> } @else { <p>{{ t.text }}</p> }
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
    .sheet { width: 1080px; box-sizing: border-box; padding: 52px 60px 0; background: #fff; color: #142033;
      font: 400 23px/1.4 Inter, 'Segoe UI', Arial, sans-serif; font-variant-numeric: tabular-nums;
      --tint: color-mix(in srgb, var(--accent) 7%, #fff); --line: #e3e8ef; --muted: #66768c; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 32px; min-height: 96px; }
    .logo { max-height: 112px; max-width: 440px; object-fit: contain; display: block; }
    .bname { font: 800 42px/1.1 Inter, sans-serif; color: var(--accent); }
    .contact { display: flex; flex-direction: column; align-items: flex-end; text-align: right; font-size: 20px; color: var(--muted); }
    .contact strong { color: #142033; font-size: 22px; }
    .band { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; padding: 20px 28px;
      background: var(--accent); color: #fff; border-radius: 14px; }
    .band .title { font: 800 38px/1 Inter, sans-serif; letter-spacing: 2px; }
    .band .meta { display: flex; align-items: center; gap: 14px; font-size: 23px; }
    .band .meta strong { font-weight: 700; }
    .band .sep { width: 1px; height: 26px; background: rgb(255 255 255 / 45%); }
    .boxes { display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; margin-top: 24px; }
    .box { border: 2px solid var(--line); border-radius: 14px; padding: 18px 22px; font-size: 21px; }
    .bank { background: var(--tint); border-color: transparent; color: #2c3b50; }
    .strong { font-weight: 700; color: #142033; }
    .cap { font: 700 16px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.6px; color: var(--accent); margin-bottom: 12px; }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 12px; padding: 3px 0; }
    .kv > span:first-child { color: var(--muted); }
    .kv strong { font-size: 24px; }
    .chips { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 14px; margin-top: 16px; }
    .chip { display: flex; flex-direction: column; align-items: center; padding: 12px 10px; border-radius: 12px; background: var(--tint); }
    .chip span { font-size: 17px; color: var(--muted); }
    .chip strong { font-size: 23px; color: var(--accent); }
    .table { margin-top: 26px; }
    .tr { display: grid; grid-template-columns: 52px 1fr 132px 120px 100px 178px; gap: 10px; align-items: center; }
    .th { background: var(--accent); color: #fff; font: 700 17px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: .8px;
      padding: 16px 18px; border-radius: 12px; }
    .group { margin-top: 10px; padding: 12px 18px; background: var(--tint); border-radius: 10px; font: 700 21px/1.2 Inter, sans-serif; color: var(--accent); }
    .item { padding: 16px 18px; border-bottom: 1px solid var(--line); }
    .item.has-layers { border-bottom: 0; padding-bottom: 6px; }
    .item em { display: block; font-style: normal; color: var(--muted); font-size: 19px; margin-top: 2px; }
    .num { display: inline-block; width: 36px; height: 36px; border-radius: 50%; background: var(--tint); color: var(--accent);
      font: 700 18px/36px Inter, sans-serif; text-align: center; }
    .layer { padding: 4px 18px; font-size: 20px; color: #3a4a60; }
    .layer.end { padding-bottom: 14px; border-bottom: 1px solid var(--line); }
    .sub { padding: 10px 18px; font-size: 20px; color: #3a4a60; border-bottom: 1px solid var(--line); }
    .c { text-align: center; }
    .r { text-align: right; }
    .foot { display: grid; grid-template-columns: 1fr 460px; gap: 28px; margin-top: 26px; align-items: start; }
    .units { display: inline-flex; align-items: center; gap: 12px; justify-self: start; padding: 12px 18px; border: 2px solid var(--line);
      border-radius: 12px; font-size: 20px; color: var(--muted); }
    .units strong { font-size: 26px; color: #142033; }
    .totals { background: var(--tint); border-radius: 14px; padding: 18px 24px; }
    .t { display: flex; justify-content: space-between; padding: 5px 0; font-size: 22px; }
    .grand { display: flex; justify-content: space-between; margin-top: 12px; padding: 16px 20px; border-radius: 12px;
      background: var(--accent); color: #fff; font: 800 32px/1 Inter, sans-serif; }
    .note { text-align: right; color: var(--muted); font-size: 18px; margin-top: 8px; }
    .notes { margin: 22px 0 0; padding: 14px 18px; border-left: 4px solid var(--accent); background: var(--tint); font-size: 20px; white-space: pre-line; }
    .text { margin-top: 26px; padding-top: 18px; border-top: 2px solid var(--line); }
    .text h3 { margin: 0 0 8px; font: 700 18px/1.2 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.4px; color: var(--accent); }
    .text h4 { margin: 14px 0 4px; font: 700 19px/1.3 Inter, sans-serif; color: #142033; }
    .text p { position: relative; margin: 4px 0; padding-left: 22px; font-size: 19px; line-height: 1.45; color: #3a4a60; }
    .text p::before { content: ''; position: absolute; left: 4px; top: 11px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    .thanks { margin: 30px 0 0; text-align: center; font: 700 26px/1.3 Inter, sans-serif; color: var(--accent); }
    .bottom { display: flex; justify-content: space-between; gap: 20px; margin: 28px -60px 0; padding: 18px 60px;
      background: var(--accent); color: rgb(255 255 255 / 85%); font-size: 18px; }
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
    return [b.business_name, b.phone, b.email, b.website].filter(Boolean).join('  ·  ');
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
  clp(n: number): string {
    return formatClp(n);
  }
  abs(n: number): number {
    return Math.abs(n);
  }
}
