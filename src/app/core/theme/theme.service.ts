import { inject, Injectable, signal } from '@angular/core';
import { BusinessRepository } from '../../data-access/repositories/business.repository';
import { BusinessSettings } from '../../domain/models/business';
import { DEFAULT_THEME, ThemeColors, themeVars } from './theme-colors';

const CACHE_KEY = 'mr-theme';
/** Logos más grandes que esto no se guardan en el teléfono (el límite de localStorage es chico). */
const MAX_CACHED_LOGO = 250_000;

interface CachedTheme extends ThemeColors {
  name: string | null;
  logo: string | null;
}

/**
 * Marca de la empresa en la app: colores de fondo y resaltado, nombre y logo en el menú y en el ingreso.
 * Se guarda una copia en el teléfono para que la pantalla de ingreso ya salga con la marca.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly biz = inject(BusinessRepository);
  readonly name = signal<string | null>(null);
  readonly logo = signal<string | null>(null);

  constructor() {
    const c = this.readCache();
    this.applyColors(c ?? DEFAULT_THEME);
    if (c) {
      this.name.set(c.name);
      this.logo.set(c.logo);
    }
  }

  /** Lee la configuración de la empresa (requiere sesión) y aplica su marca. */
  async refresh(): Promise<void> {
    try {
      const s = await this.biz.get();
      const logo = await this.biz.logoDataUrl(s.logo_path);
      this.set(s, logo);
    } catch {
      /* sin conexión o sin permiso: se queda con lo guardado */
    }
  }

  set(s: Pick<BusinessSettings, 'theme_primary' | 'theme_secondary' | 'business_name'>, logo: string | null): void {
    const colors = { primary: s.theme_primary, secondary: s.theme_secondary };
    this.applyColors(colors);
    this.name.set(s.business_name);
    this.logo.set(logo);
    try {
      const cached: CachedTheme = { ...colors, name: s.business_name, logo: logo && logo.length <= MAX_CACHED_LOGO ? logo : null };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch {
      /* almacenamiento lleno o bloqueado: no es grave */
    }
  }

  /** Vista previa en Configuración, sin guardar. */
  preview(colors: ThemeColors): void {
    this.applyColors(colors);
  }

  private applyColors(colors: ThemeColors): void {
    if (typeof document === 'undefined') return;
    const vars = themeVars(colors);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--navy']);
  }

  private readCache(): CachedTheme | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as CachedTheme) : null;
    } catch {
      return null;
    }
  }
}
