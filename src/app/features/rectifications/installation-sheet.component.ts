import { Component, input } from '@angular/core';
import { ConfectionCurtain } from '../../domain/confection/confection-engine';
import { guideFacts, GuideRow } from '../../domain/confection/installation-pages';
import { JobInfo } from '../../domain/confection/work-snapshot';
import { BusinessSettings } from '../../domain/models/business';
import { formatDate } from '../../shared/format';
import { formatRut } from '../../shared/validation/rut';

/**
 * Una página de la guía del instalador, 1080 px y SIN precios. Mismo formato que la cotización:
 * por ubicación, las cortinas en tarjetas consecutivas (3 por fila) con medida, instalación, cadena,
 * caída, motor, notas y fotos. Al final, la firma de conformidad del cliente.
 */
@Component({
  selector: 'app-installation-sheet',
  template: `
    @let r = job();
    @let b = business();
    <article class="sheet" [style.--accent]="b.accent_color || '#0F2A4A'">
      <header class="head">
        <div>
          @if (logo()) { <img [src]="logo()" alt="" class="logo" /> }
          @else if (b.business_name) { <div class="bname">{{ b.business_name }}</div> }
        </div>
        <div class="doc">
          <div class="title">GUÍA DE INSTALACIÓN</div>
          <div class="num">{{ r.installation_date ? date(r.installation_date) : 'Fecha por agendar' }} · {{ total() }} cortinas</div>
        </div>
      </header>

      @if (first()) {
        <section class="info">
          <div class="col">
            <div class="cap">Cliente</div>
            <div class="cname">{{ r.customer_name }}</div>
            <div>{{ r.address }}</div>
            @if (r.address_reference) { <div class="muted">Ref.: {{ r.address_reference }}</div> }
            @if (r.phone) { <div class="phone">{{ r.phone }}</div> }
          </div>
          <div class="col tinted">
            <div class="cap">Trabajo</div>
            <div class="kv"><span>Instalación</span><strong>{{ r.installation_date ? date(r.installation_date) : 'Por agendar' }}</strong></div>
            <div class="kv"><span>Rectificó</span><span>{{ r.executive_name }}</span></div>
            <div class="kv"><span>Visita</span><span>{{ date(r.visit_date) }}</span></div>
          </div>
        </section>
      }

      @for (row of rows(); track $index) {
        @if (row.type === 'group') {
          <div class="group"><span>{{ row.label }}</span></div>
        } @else {
          <div class="cards">
            @for (card of row.cards; track card.curtain.curtain_id) {
              @let c = card.curtain;
              <div class="card">
                <div class="ctop">
                  <span class="n">{{ c.index }}</span>
                  <div class="cdesc">
                    <strong>{{ c.product_name }}</strong>
                    <span class="muted">{{ c.product_code }}@if (c.label) { · {{ c.label }} }</span>
                  </div>
                </div>
                @for (l of c.layers; track $index) {
                  <div class="meas">
                    @if (l.label) { <span class="ll">{{ l.label }} · {{ l.product_code }}</span> }
                    <strong>{{ cm(l.width_cm) }} × {{ cm(l.height_cm) }} cm</strong>
                    <span class="muted">{{ layerInfo(l) }}</span>
                  </div>
                }
                @for (f of facts(c); track $index) {
                  <div class="fact"><span>{{ f[0] }}</span><strong>{{ f[1] }}</strong></div>
                }
                @if (c.notes) { <div class="note">{{ c.notes }}</div> }
                @if (card.photos.length) {
                  <img class="photo" [src]="card.photos[0]" alt="" />
                  @if (card.photos.length > 1) {
                    <div class="thumbs">@for (p of card.photos.slice(1); track $index) { <img [src]="p" alt="" /> }</div>
                  }
                }
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
    .sheet { width: 1080px; box-sizing: border-box; padding: 40px 44px 0; background: #fff; color: #142033;
      font: 400 17px/1.4 Inter, system-ui, sans-serif; font-variant-numeric: tabular-nums;
      --tint: color-mix(in srgb, var(--accent) 6%, #fff); --line: #e3e8ef; --muted: #66768c; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 18px; border-bottom: 4px solid var(--accent); }
    .logo { max-height: 80px; max-width: 340px; object-fit: contain; display: block; }
    .bname { font: 800 30px/1.1 Inter, sans-serif; color: var(--accent); }
    .doc { text-align: right; }
    .title { font: 800 26px/1 Inter, sans-serif; letter-spacing: 1.5px; color: var(--accent); }
    .num { font: 600 17px/1.3 Inter, sans-serif; margin-top: 6px; color: #3a4a60; }
    .info { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; margin-top: 18px; font-size: 16px; }
    .col { border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; }
    .col.tinted { background: var(--tint); border-color: transparent; }
    .cap { font: 700 12px/1 Inter, sans-serif; text-transform: uppercase; letter-spacing: 1.4px; color: var(--accent); margin-bottom: 8px; }
    .cname { font: 700 20px/1.25 Inter, sans-serif; margin-bottom: 2px; }
    .phone { margin-top: 4px; font-weight: 700; font-size: 19px; color: var(--accent); }
    .kv { display: flex; justify-content: space-between; gap: 10px; padding: 1px 0; }
    .kv span:first-child { color: var(--muted); }
    .muted { color: var(--muted); font-size: 14.5px; }
    .group { display: flex; align-items: center; gap: 12px; margin-top: 18px; font: 700 17px/1.2 Inter, sans-serif; color: var(--accent);
      text-transform: uppercase; letter-spacing: 1px; }
    .group::after { content: ''; flex: 1; height: 2px; background: var(--line); }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; align-items: stretch; }
    .card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 12px; border-top: 4px solid var(--accent); min-width: 0; }
    .ctop { display: flex; gap: 10px; align-items: flex-start; }
    .n { flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; font: 700 13px/26px Inter, sans-serif; text-align: center; }
    .cdesc { display: flex; flex-direction: column; min-width: 0; }
    .cdesc strong { font-size: 17px; line-height: 1.25; }
    .meas { display: flex; flex-direction: column; padding: 6px 10px; border-radius: 8px; background: var(--tint); }
    .meas strong { font-size: 19px; }
    .meas .ll { font-size: 13px; font-weight: 700; color: var(--accent); }
    .fact { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; }
    .fact span { color: var(--muted); }
    .fact strong { text-align: right; }
    .note { padding: 6px 10px; border-left: 3px solid #d97706; background: #fff7ea; font-size: 14.5px; white-space: pre-line; }
    .photo { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; display: block; margin-top: auto; }
    .thumbs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .thumbs img { width: 100%; height: 66px; object-fit: cover; border-radius: 6px; display: block; }
    .obs { margin-top: 20px; padding: 12px 16px; border-radius: 12px; background: var(--tint); }
    .obs p { margin: 0; font-size: 16px; white-space: pre-line; }
    .sign { margin-top: 18px; padding: 14px 18px; border: 1.5px solid var(--line); border-radius: 12px; }
    .stext { margin: 0 0 8px; font-size: 15px; }
    .sig { display: block; max-width: 360px; max-height: 140px; object-fit: contain; border-bottom: 2px solid #142033; }
    .sline { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 6px; font-size: 15px; color: var(--muted); }
    .sline strong { color: #142033; }
    .bottom { display: flex; justify-content: space-between; gap: 20px; margin: 22px -44px 0; padding: 14px 44px;
      background: var(--accent); color: rgb(255 255 255 / 85%); font-size: 15px; }
  `,
})
export class InstallationSheetComponent {
  readonly job = input.required<JobInfo>();
  readonly business = input.required<BusinessSettings>();
  readonly logo = input<string | null>(null);
  readonly signature = input<string | null>(null);
  readonly rows = input.required<GuideRow[]>();
  readonly total = input(0);
  readonly pageIndex = input(0);
  readonly pageCount = input(1);

  first(): boolean {
    return this.pageIndex() === 0;
  }
  last(): boolean {
    return this.pageIndex() === this.pageCount() - 1;
  }
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
    return guideFacts(c);
  }
}
