import { Component, computed, input } from '@angular/core';
import { ConfectionCurtain } from '../../domain/confection/confection-engine';
import { GuideRow } from '../../domain/confection/installation-pages';
import { BusinessSettings } from '../../domain/models/business';
import { Rectification } from '../../domain/models/rectification';
import { formatDate } from '../../shared/format';
import { formatRut } from '../../shared/validation/rut';

/**
 * Una página de la guía del instalador, 1080 px y SIN precios: dónde va cada cortina, cómo se instala,
 * su medida de terreno, cadena, caída, motor, notas y fotos. Al final, la firma de conformidad del cliente.
 */
@Component({
  selector: 'app-installation-sheet',
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
        <span class="title">GUÍA DE INSTALACIÓN</span>
        <span class="meta">{{ r.installation_date ? date(r.installation_date) : 'Fecha por agendar' }}<span class="sep"></span>{{ total() }} cortinas</span>
      </div>

      @if (first()) {
        <section class="boxes">
          <div class="box">
            <div class="cap">Cliente</div>
            <div class="big">{{ r.customers?.full_name }}</div>
            <div>{{ address() }}</div>
            @if (r.address_reference) { <div class="muted">Ref.: {{ r.address_reference }}</div> }
            @if (r.customers?.phone) { <div class="phone">{{ r.customers?.phone }}</div> }
          </div>
          <div class="box tinted">
            <div class="cap">Trabajo</div>
            <div class="kv"><span>Instalación</span><strong>{{ r.installation_date ? date(r.installation_date) : 'Por agendar' }}</strong></div>
            <div class="kv"><span>Rectificó</span><span>{{ r.executive_name }}</span></div>
            <div class="kv"><span>Visita</span><span>{{ date(r.visit_date) }}</span></div>
          </div>
        </section>
      }

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
              <div class="layer">
                @if (l.label) { <strong class="ll">{{ l.label }} · {{ l.product_code }}</strong> }
                <span class="meas">{{ cm(l.width_cm) }} × {{ cm(l.height_cm) }} cm</span>
                <span class="muted">{{ layerInfo(l) }}</span>
              </div>
            }
            @if (facts(c).length) {
              <div class="facts">
                @for (f of facts(c); track $index) { <span class="fact"><em>{{ f[0] }}</em> {{ f[1] }}</span> }
              </div>
            }
            @if (c.notes) { <div class="note">{{ c.notes }}</div> }
            @if (row.photos.length) {
              <div class="photos">
                @for (p of row.photos; track $index) { <img [src]="p" alt="" /> }
              </div>
            }
          </div>
        }
      }

      @if (last()) {
        @if (r.observations) {
          <section class="obs">
            <div class="cap">Observaciones</div>
            <p>{{ r.observations }}</p>
          </section>
        }
        <section class="sign">
          <div class="cap">Conformidad del cliente</div>
          @if (r.signed_at) {
            <p class="stext">El cliente revisó y aprobó las medidas, colores, ubicación y forma de instalación registradas.</p>
            @if (signature()) { <img [src]="signature()" alt="" class="sig" /> }
            <div class="sline">
              <strong>{{ r.signed_name }}</strong>
              @if (r.signed_rut) { <span>RUT {{ rut(r.signed_rut) }}</span> }
              <span>{{ dateTime(r.signed_at) }}</span>
            </div>
          } @else {
            <p class="stext muted">Rectificación sin firma del cliente.</p>
          }
        </section>
      }

      <footer class="bottom">
        <span>Guía de instalación · sin precios</span>
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
    .band .title { font: 800 32px/1 Inter, sans-serif; letter-spacing: 1.5px; }
    .band .meta { display: flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 600; }
    .band .sep { width: 1px; height: 26px; background: rgb(255 255 255 / 45%); }
    .boxes { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-top: 22px; }
    .box { border: 2px solid var(--line); border-radius: 14px; padding: 16px 22px; font-size: 21px; }
    .box.tinted { background: var(--tint); border-color: transparent; }
    .big { font: 700 27px/1.25 Inter, sans-serif; margin-bottom: 4px; }
    .phone { margin-top: 6px; font-weight: 700; font-size: 24px; color: var(--accent); }
    .cap { font: 700 16px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.6px; color: var(--accent); margin-bottom: 10px; }
    .kv { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 2px 0; }
    .kv > span:first-child { color: var(--muted); }
    .muted { color: var(--muted); }
    .group { margin-top: 22px; padding: 12px 16px; background: var(--accent); color: #fff; border-radius: 10px; font: 700 22px/1.2 Inter, sans-serif; }
    .curtain { padding: 16px 16px 18px; border-bottom: 1px solid var(--line); }
    .ctitle { display: flex; align-items: center; gap: 12px; font-size: 23px; }
    .num { flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--tint); color: var(--accent); font: 700 18px/36px Inter, sans-serif; text-align: center; }
    .code { padding: 2px 10px; border-radius: 8px; background: var(--tint); color: var(--accent); font-weight: 700; font-size: 18px; }
    .layer { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin: 8px 0 0 48px; font-size: 20px; }
    .ll { font-size: 20px; }
    .meas { font-weight: 800; font-size: 24px; }
    .facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0 48px; }
    .fact { padding: 5px 12px; border-radius: 8px; background: var(--tint); font-size: 19px; font-weight: 600; }
    .fact em { font-style: normal; font-weight: 400; color: var(--muted); }
    .note { margin: 10px 0 0 48px; padding: 8px 12px; border-left: 4px solid #d97706; background: #fff7ea; font-size: 20px; white-space: pre-line; }
    .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0 0 48px; }
    .photos img { width: 100%; height: 210px; object-fit: cover; border-radius: 10px; display: block; }
    .obs { margin-top: 24px; padding: 16px 22px; border-radius: 14px; background: var(--tint); }
    .obs p { margin: 0; font-size: 20px; white-space: pre-line; }
    .sign { margin-top: 24px; padding: 18px 22px; border: 2px solid var(--line); border-radius: 14px; }
    .stext { margin: 0 0 10px; font-size: 19px; }
    .sig { display: block; max-width: 420px; max-height: 170px; object-fit: contain; border-bottom: 2px solid #142033; }
    .sline { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; font-size: 19px; color: var(--muted); }
    .sline strong { color: #142033; }
    .bottom { display: flex; justify-content: space-between; gap: 20px; margin: 26px -60px 0; padding: 18px 60px;
      background: var(--accent); color: rgb(255 255 255 / 85%); font-size: 18px; }
  `,
})
export class InstallationSheetComponent {
  readonly rect = input.required<Rectification>();
  readonly business = input.required<BusinessSettings>();
  readonly logo = input<string | null>(null);
  readonly signature = input<string | null>(null);
  readonly rows = input.required<GuideRow[]>();
  readonly total = input(0);
  readonly pageIndex = input(0);
  readonly pageCount = input(1);

  readonly first = computed(() => this.pageIndex() === 0);
  readonly last = computed(() => this.pageIndex() === this.pageCount() - 1);
  readonly address = computed(() => [this.rect().address_line, this.rect().comuna].filter(Boolean).join(', '));

  date(iso: string | null): string {
    return formatDate(iso);
  }
  dateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  rut(r: string): string {
    return formatRut(r);
  }
  cm(n: number): string {
    return String(n).replace('.', ',');
  }
  layerInfo(l: ConfectionCurtain['layers'][number]): string {
    return [l.color_name, l.fall ? `caída ${l.fall}` : null, l.motorized ? 'con motor' : null].filter(Boolean).join(' · ');
  }
  facts(c: ConfectionCurtain): [string, string][] {
    const out: [string, string][] = [];
    if (c.installation) out.push(['Instalación', c.installation]);
    if (c.chain) out.push(['Cadena', c.chain]);
    if (c.cenefa !== null) out.push(['Cenefa', 'sí']);
    const extras = c.extras.filter((e) => e !== 'Cenefa');
    if (extras.length) out.push(['Lleva', extras.join(', ')]);
    return out;
  }
}
