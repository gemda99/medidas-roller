import { Component, computed, input } from '@angular/core';
import { ConfectionCurtain } from '../../domain/confection/confection-engine';
import { ConfectionRow } from '../../domain/confection/confection-pages';
import { BusinessSettings } from '../../domain/models/business';
import { Rectification } from '../../domain/models/rectification';
import { formatDate } from '../../shared/format';

/**
 * Una página de la hoja de confección (HU-43), 1080 px de ancho y SIN precios.
 * Ordenada como la pestaña «Confección» del Excel: medidas de terreno, de tela, tubo y G polvo.
 */
@Component({
  selector: 'app-confection-sheet',
  template: `
    @let r = rect();
    @let b = business();
    <article class="sheet" [style.--accent]="b.accent_color || '#0F2A4A'">
      <header class="head">
        <div>
          @if (logo()) { <img [src]="logo()" alt="" class="logo" /> }
          @else if (b.business_name) { <div class="bname">{{ b.business_name }}</div> }
        </div>
        <div class="contact">
          @if (b.phone) { <span>{{ b.phone }}</span> }
          @if (b.email) { <span>{{ b.email }}</span> }
        </div>
      </header>

      <div class="band">
        <span class="title">CONFECCIÓN</span>
        <span class="meta">{{ r.customers?.full_name }}<span class="sep"></span>{{ total() }} cortinas</span>
      </div>

      @if (first()) {
        <section class="boxes">
          <div class="box">
            <div class="cap">Cliente</div>
            <div class="kv"><span>Nombre</span><strong>{{ r.customers?.full_name }}</strong></div>
            <div class="kv"><span>Dirección</span><span>{{ address() }}</span></div>
            @if (r.customers?.phone) { <div class="kv"><span>Teléfono</span><span>{{ r.customers?.phone }}</span></div> }
          </div>
          <div class="box tinted">
            <div class="cap">Trabajo</div>
            <div class="kv"><span>Visita</span><span>{{ date(r.visit_date) }}</span></div>
            <div class="kv"><span>Instalación</span><strong>{{ r.installation_date ? date(r.installation_date) : 'Por agendar' }}</strong></div>
            <div class="kv"><span>Ejecutivo</span><span>{{ r.executive_name }}</span></div>
          </div>
        </section>
      }

      @if (rows().length) {
        <section class="table">
          <div class="tr th">
            <span class="c">#</span><span>Producto · tela</span><span class="c">Terreno (cm)</span><span class="c">Tela (cm)</span><span class="c">Tubo</span><span class="c">G polvo</span>
          </div>
          @for (row of rows(); track $index) {
            @if (row.type === 'group') {
              <div class="group">{{ row.label }}</div>
            } @else {
              @let c = row.curtain;
              <div class="curtain">
                <div class="ctitle">
                  <span class="num">{{ c.index }}</span>
                  <strong>{{ c.product_name }}</strong>
                  <span class="code">{{ c.product_code }}</span>
                  @if (c.label) { <span class="muted">· {{ c.label }}</span> }
                </div>
                @for (l of c.layers; track $index) {
                  <div class="tr layer">
                    <span></span>
                    <span class="ldesc">
                      @if (l.label) { <strong>{{ l.label }} · {{ l.product_code }}</strong> }
                      <span>{{ layerInfo(l) }}</span>
                    </span>
                    <span class="c">{{ cm(l.width_cm) }} × {{ cm(l.height_cm) }}</span>
                    <span class="c strong">{{ l.fabric_w !== null ? cm(l.fabric_w) + ' × ' + cm(l.fabric_h) : '—' }}</span>
                    <span class="c strong">{{ cmOr(l.tube) }}</span>
                    <span class="c strong">{{ cmOr(l.bottom) }}</span>
                  </div>
                }
                @if (facts(c).length) {
                  <div class="facts">
                    @for (f of facts(c); track $index) { <span class="fact"><em>{{ f[0] }}</em> {{ f[1] }}</span> }
                  </div>
                }
                @if (c.external) { <div class="warn">Fabricación externa: solo medidas de terreno.</div> }
                @if (c.missing_rules) { <div class="warn">Sin reglas de confección para {{ c.product_code }}: medidas de tela por confirmar.</div> }
                @if (c.notes) { <div class="note">{{ c.notes }}</div> }
              </div>
            }
          }
        </section>
      }

      @if (last()) {
        @if (r.observations) {
          <section class="obs">
            <div class="cap">Observaciones</div>
            <p>{{ r.observations }}</p>
          </section>
        }
        <p class="legend">Tela = ancho y alto a cortar · Tubo y G polvo = largo en cm · Medidas calculadas con las reglas de cada producto.</p>
      }

      <footer class="bottom">
        <span>{{ footerLine() }}</span>
        @if (pageCount() > 1) { <span>Página {{ pageIndex() + 1 }} de {{ pageCount() }}</span> }
      </footer>
    </article>
  `,
  styles: `
    :host { display: block; }
    .sheet { width: 1080px; box-sizing: border-box; padding: 52px 60px 0; background: #fff; color: #142033;
      font: 400 22px/1.4 Inter, system-ui, sans-serif; font-variant-numeric: tabular-nums;
      --tint: color-mix(in srgb, var(--accent) 7%, #fff); --line: #e3e8ef; --muted: #66768c; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 32px; min-height: 80px; }
    .logo { max-height: 90px; max-width: 360px; object-fit: contain; display: block; }
    .bname { font: 800 36px/1.1 Inter, sans-serif; color: var(--accent); }
    .contact { display: flex; flex-direction: column; align-items: flex-end; font-size: 19px; color: var(--muted); }
    .band { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-top: 24px; padding: 20px 28px;
      background: var(--accent); color: #fff; border-radius: 14px; }
    .band .title { font: 800 36px/1 Inter, sans-serif; letter-spacing: 2px; }
    .band .meta { display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 600; }
    .band .sep { width: 1px; height: 26px; background: rgb(255 255 255 / 45%); }
    .boxes { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-top: 22px; }
    .box { border: 2px solid var(--line); border-radius: 14px; padding: 16px 22px; font-size: 21px; }
    .box.tinted { background: var(--tint); border-color: transparent; }
    .cap { font: 700 16px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.6px; color: var(--accent); margin-bottom: 10px; }
    .kv { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 2px 0; }
    .kv > span:first-child { color: var(--muted); }
    .table { margin-top: 24px; }
    .tr { display: grid; grid-template-columns: 44px 1fr 168px 168px 104px 112px; gap: 10px; align-items: center; }
    .th { background: var(--accent); color: #fff; font: 700 16px/1.1 Inter, sans-serif; text-transform: uppercase; letter-spacing: .6px;
      padding: 15px 16px; border-radius: 12px; }
    .group { margin-top: 10px; padding: 12px 16px; background: var(--tint); border-radius: 10px; font: 700 21px/1.2 Inter, sans-serif; color: var(--accent); }
    .curtain { padding: 14px 16px 16px; border-bottom: 1px solid var(--line); }
    .ctitle { display: flex; align-items: center; gap: 12px; font-size: 22px; }
    .num { flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--accent); color: #fff; font: 700 18px/36px Inter, sans-serif; text-align: center; }
    .code { padding: 2px 10px; border-radius: 8px; background: var(--tint); color: var(--accent); font-weight: 700; font-size: 18px; }
    .muted { color: var(--muted); }
    .layer { padding: 10px 0 0; font-size: 21px; }
    .ldesc { display: flex; flex-direction: column; font-size: 19px; color: #3a4a60; }
    .ldesc strong { color: #142033; font-size: 20px; }
    .strong { font-weight: 700; }
    .facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0 54px; }
    .fact { padding: 4px 12px; border-radius: 8px; background: var(--tint); font-size: 18px; }
    .fact em { font-style: normal; color: var(--muted); }
    .warn { margin: 10px 0 0 54px; padding: 6px 12px; border-radius: 8px; background: #fff3df; color: #8a4f00; font-size: 18px; font-weight: 600; }
    .note { margin: 10px 0 0 54px; padding-left: 12px; border-left: 3px solid var(--accent); font-size: 19px; color: #3a4a60; white-space: pre-line; }
    .c { text-align: center; }
    .obs { margin-top: 24px; padding: 16px 22px; border-radius: 14px; background: var(--tint); }
    .obs p { margin: 0; font-size: 20px; white-space: pre-line; }
    .legend { margin: 20px 0 0; font-size: 17px; color: var(--muted); text-align: center; }
    .bottom { display: flex; justify-content: space-between; gap: 20px; margin: 26px -60px 0; padding: 18px 60px;
      background: var(--accent); color: rgb(255 255 255 / 85%); font-size: 18px; }
  `,
})
export class ConfectionSheetComponent {
  readonly rect = input.required<Rectification>();
  readonly business = input.required<BusinessSettings>();
  readonly logo = input<string | null>(null);
  readonly rows = input.required<ConfectionRow[]>();
  readonly total = input(0);
  readonly pageIndex = input(0);
  readonly pageCount = input(1);

  readonly first = computed(() => this.pageIndex() === 0);
  readonly last = computed(() => this.pageIndex() === this.pageCount() - 1);
  readonly address = computed(() => [this.rect().address_line, this.rect().comuna].filter(Boolean).join(', '));
  readonly footerLine = computed(() => {
    const b = this.business();
    return ['Hoja de confección', b.business_name].filter(Boolean).join('  ·  ');
  });

  date(iso: string | null): string {
    return formatDate(iso);
  }
  cm(n: number | null): string {
    return n === null ? '' : String(n).replace('.', ',');
  }
  cmOr(n: number | null): string {
    return n === null ? '—' : this.cm(n);
  }
  layerInfo(l: ConfectionCurtain['layers'][number]): string {
    return [l.color_name ?? 'Color por confirmar', l.fall ? `caída ${l.fall}` : null, l.motorized ? 'motor' : null].filter(Boolean).join(' · ');
  }
  facts(c: ConfectionCurtain): [string, string][] {
    const out: [string, string][] = [];
    if (c.chain) out.push(['Cadena', c.chain]);
    if (c.installation) out.push(['Instalación', c.installation]);
    if (c.cenefa !== null) out.push(['Cenefa', this.cm(c.cenefa)]);
    for (const l of c.layers) if (l.roller !== null) out.push([`Rodillo${l.label ? ' ' + l.label.toLowerCase() : ''}`, this.cm(l.roller)]);
    const extras = c.extras.filter((e) => e !== 'Cenefa');
    if (extras.length) out.push(['Extras', extras.join(', ')]);
    return out;
  }
}
