import { Component, inject, OnInit, signal } from '@angular/core';
import { BusinessRepository } from '../../data-access/repositories/business.repository';
import { BusinessSettings, EMPTY_BUSINESS } from '../../domain/models/business';
import { toUserMessage } from '../../shared/errors';
import { ThemeService } from '../../core/theme/theme.service';
import { DEFAULT_THEME } from '../../core/theme/theme-colors';

type Field = { key: keyof BusinessSettings; label: string; hint?: string; type?: 'text' | 'email' | 'tel' | 'area' };

/** Configuración de la empresa para la imagen de cotización (HU-31). Cada campo se guarda al salir de él. */
@Component({
  selector: 'app-business-settings-page',
  template: `
    <div class="page">
      <p class="muted" style="margin:0">Estos datos aparecen en la app y en las imágenes que se envían. Las cotizaciones ya emitidas guardan su propia copia y no cambian.</p>
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      @if (saved()) { <div class="alert alert-ok" role="status" aria-live="polite">{{ saved() }}</div> }

      <section class="card stack">
        <h2>Logo</h2>
        <div class="row">
          @if (logo()) { <img [src]="logo()" alt="Logo actual" class="logo" /> } @else { <span class="muted">Sin logo: se mostrará el nombre comercial.</span> }
          <label class="btn">
            {{ logo() ? 'Cambiar logo' : 'Subir logo' }}
            <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" (change)="uploadLogo($event)" />
          </label>
        </div>
        <span class="hint">PNG o JPG de hasta 2 MB. Ideal: fondo transparente, horizontal.</span>
      </section>

      @for (sec of sections; track sec.title) {
        <section class="card stack">
          <h2>{{ sec.title }}</h2>
          <div class="grid">
            @for (f of sec.fields; track f.key) {
              <div class="field" [class.wide]="f.type === 'area'">
                <label [for]="f.key">{{ f.label }}</label>
                @if (f.type === 'area') {
                  <textarea [id]="f.key" rows="6" [value]="val(f.key)" (change)="save(f, $any($event.target).value)"></textarea>
                } @else {
                  <input [id]="f.key" [type]="f.type ?? 'text'" [value]="val(f.key)" (change)="save(f, $any($event.target).value)" />
                }
                @if (f.hint) { <span class="hint">{{ f.hint }}</span> }
              </div>
            }
          </div>
        </section>
      }

      <section class="card stack">
        <h2>Colores</h2>
        <div class="colors">
          <label class="color">
            <input type="color" [value]="data().theme_primary" (input)="previewTheme('theme_primary', $any($event.target).value)" (change)="saveColor('theme_primary', $any($event.target).value)" />
            <span><strong>Fondo de la app</strong><span class="muted">Menú, encabezados y botones principales.</span></span>
          </label>
          <label class="color">
            <input type="color" [value]="data().theme_secondary" (input)="previewTheme('theme_secondary', $any($event.target).value)" (change)="saveColor('theme_secondary', $any($event.target).value)" />
            <span><strong>Resaltado</strong><span class="muted">Opción activa del menú, enlaces y marcas.</span></span>
          </label>
          <label class="color">
            <input type="color" [value]="data().accent_color" (change)="saveColor('accent_color', $any($event.target).value)" />
            <span><strong>Imágenes</strong><span class="muted">Títulos y total de la cotización, confección y guía.</span></span>
          </label>
        </div>
        <button type="button" class="btn" style="justify-self:start" (click)="resetTheme()">Volver a los colores originales</button>
        <span class="hint">El texto sobre el fondo cambia solo a blanco u oscuro para que siempre se lea.</span>
      </section>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
    .wide { grid-column: 1 / -1; }
    .logo { max-height: 64px; max-width: 220px; object-fit: contain; background: #f3f6fa; border-radius: 8px; padding: 6px; }
    input[type=color] { flex: none; width: 56px; height: 44px; border: 1px solid var(--line-strong); border-radius: 10px; padding: 2px; }
    .colors { display: grid; gap: 12px; }
    .color { display: flex; align-items: center; gap: 12px; cursor: pointer; }
    .color > span { display: flex; flex-direction: column; }
  `,
})
export class BusinessSettingsPage implements OnInit {
  private readonly repo = inject(BusinessRepository);
  private readonly theme = inject(ThemeService);
  readonly data = signal<BusinessSettings>({ ...EMPTY_BUSINESS });
  readonly logo = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);

  readonly sections: { title: string; fields: Field[] }[] = [
    {
      title: 'Empresa',
      fields: [
        { key: 'business_name', label: 'Nombre comercial' },
        { key: 'tax_id', label: 'RUT' },
        { key: 'phone', label: 'Teléfono', type: 'tel' },
        { key: 'email', label: 'Correo', type: 'email' },
        { key: 'website', label: 'Sitio web o Instagram' },
        { key: 'address', label: 'Dirección (opcional)' },
      ],
    },
    {
      title: 'Datos para transferencia',
      fields: [
        { key: 'bank_name', label: 'Banco' },
        { key: 'bank_account_type', label: 'Tipo de cuenta', hint: 'Ej.: Cuenta corriente, Cuenta Vista' },
        { key: 'bank_account_number', label: 'Número de cuenta' },
        { key: 'bank_holder', label: 'Titular' },
        { key: 'bank_holder_tax_id', label: 'RUT del titular' },
        { key: 'bank_email', label: 'Correo para comprobantes', type: 'email' },
      ],
    },
    {
      title: 'Condiciones',
      fields: [
        { key: 'delivery_time_text', label: 'Tiempo de entrega', hint: 'Ej.: 3 a 5 días hábiles' },
        { key: 'warranty_text', label: 'Garantía (resumen)', hint: 'Ej.: 5 años. Va en el encabezado de la imagen.' },
        { key: 'conditions_text', label: 'Condiciones generales', type: 'area', hint: 'Una por línea. Una línea que termina en «:» se muestra como subtítulo.' },
        { key: 'warranty_details_text', label: 'Garantía detallada', type: 'area', hint: 'Cobertura y casos no cubiertos, una por línea. Ej.: «Casos no cubiertos:» como subtítulo.' },
        { key: 'thank_you_text', label: 'Mensaje de cierre' },
      ],
    },
  ];

  async ngOnInit(): Promise<void> {
    try {
      const d = await this.repo.get();
      this.data.set(d);
      this.logo.set(await this.repo.logoDataUrl(d.logo_path));
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  val(key: keyof BusinessSettings): string {
    return String(this.data()[key] ?? '');
  }

  async save(f: Field, raw: string): Promise<void> {
    const value = raw.trim() || null;
    if (value === (this.data()[f.key] ?? null)) return;
    await this.run({ [f.key]: value } as Partial<BusinessSettings>, f.label);
  }

  previewTheme(key: 'theme_primary' | 'theme_secondary', hex: string): void {
    const d = { ...this.data(), [key]: hex };
    this.theme.preview({ primary: d.theme_primary, secondary: d.theme_secondary });
  }

  async saveColor(key: 'accent_color' | 'theme_primary' | 'theme_secondary', hex: string): Promise<void> {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    await this.run({ [key]: hex.toUpperCase() } as Partial<BusinessSettings>, 'Color');
    this.theme.set(this.data(), this.logo());
  }

  async resetTheme(): Promise<void> {
    await this.run({ theme_primary: DEFAULT_THEME.primary, theme_secondary: DEFAULT_THEME.secondary }, 'Colores');
    this.theme.set(this.data(), this.logo());
  }

  private async run(patch: Partial<BusinessSettings>, label: string): Promise<void> {
    this.error.set(null);
    this.saved.set(null);
    try {
      await this.repo.update(patch);
      this.data.update((d) => ({ ...d, ...patch }));
      this.saved.set(`${label}: guardado`);
      if ('business_name' in patch) this.theme.set(this.data(), this.logo());
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  async uploadLogo(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.error.set('El logo pesa más de 2 MB. Usa una imagen más liviana.');
      return;
    }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    try {
      const path = await this.repo.uploadLogo(file, ext);
      this.data.update((d) => ({ ...d, logo_path: path }));
      this.logo.set(await this.repo.logoDataUrl(path));
      this.theme.set(this.data(), this.logo());
      this.saved.set('Logo guardado');
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }
}
