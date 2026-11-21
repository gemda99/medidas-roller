import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Accessory, CenefaMode, Color, Product, ProductKind } from '../../domain/models/catalog';
import { CatalogRepository } from './catalog.repository';
import { Profile, Role } from '../../domain/models/profile';

export interface NewProduct {
  code: string;
  name: string;
  kind: ProductKind;
  cenefa_mode: CenefaMode;
  fabricated: boolean;
  has_mechanism: boolean;
  fondo_id?: string;
  frente_id?: string;
}

type ProductPatch = Partial<Pick<Product, 'name' | 'cenefa_mode' | 'fabricated' | 'has_mechanism' | 'active' | 'sort_order' | 'conf_fabric_w' | 'conf_fabric_h' | 'conf_tube' | 'conf_bottom' | 'conf_cenefa' | 'conf_roller'>>;

/**
 * Escrituras del administrador sobre catálogo y usuarios. RLS rechaza cualquier escritura de un medidor.
 * Después de cada cambio se refresca la caché del catálogo para que el editor de cortinas lo vea.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogRepository {
  private readonly db = inject(SUPABASE);
  private readonly catalog = inject(CatalogRepository);

  /** Catálogo completo, incluidos inactivos (el editor de cortinas solo ve activos). */
  async loadAll(): Promise<{ products: Product[]; colors: Color[]; accessories: Accessory[] }> {
    const [p, c, a] = await Promise.all([
      this.db
        .from('products')
        .select('id, code, name, kind, cenefa_mode, fabricated, has_mechanism, active, sort_order, conf_fabric_w, conf_fabric_h, conf_tube, conf_bottom, conf_cenefa, conf_roller, product_components!product_components_system_product_id_fkey(role, component_product_id), product_options(id, product_id, name, active, sort_order)')
        .order('sort_order'),
      this.db.from('colors').select('id, name, active').order('sort_order'),
      this.db.from('accessories').select('id, name, scope, active').order('sort_order'),
    ]);
    for (const r of [p, c, a]) if (r.error) throw r.error;
    return {
      products: (p.data ?? []) as unknown as Product[],
      colors: (c.data ?? []) as Color[],
      accessories: (a.data ?? []) as Accessory[],
    };
  }

  private async done<T>(op: PromiseLike<{ error: unknown; data?: T }>): Promise<T | undefined> {
    const { error, data } = await op;
    if (error) throw error;
    void this.catalog.refresh().catch(() => undefined);
    return data;
  }

  async createProduct(p: NewProduct, sortOrder: number): Promise<void> {
    const { data, error } = await this.db
      .from('products')
      .insert({
        code: p.code.trim().toUpperCase(), name: p.name.trim(), kind: p.kind, cenefa_mode: p.cenefa_mode,
        fabricated: p.fabricated, has_mechanism: p.has_mechanism, sort_order: sortOrder,
      })
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    if (p.kind === 'sistema' && p.fondo_id && p.frente_id) {
      await this.done(
        this.db.from('product_components').insert([
          { system_product_id: id, role: 'fondo', component_product_id: p.fondo_id },
          { system_product_id: id, role: 'frente', component_product_id: p.frente_id },
        ]),
      );
    } else {
      void this.catalog.refresh().catch(() => undefined);
    }
  }

  updateProduct(id: string, patch: ProductPatch) {
    return this.done(this.db.from('products').update(patch).eq('id', id));
  }

  addOption(productId: string, name: string) {
    return this.done(this.db.from('product_options').insert({ product_id: productId, name: name.trim() }));
  }

  /** Si la opción ya se usó en cortinas, se desactiva en vez de borrarse. */
  async removeOption(id: string): Promise<'borrada' | 'desactivada'> {
    const { error } = await this.db.from('product_options').delete().eq('id', id);
    if (!error) {
      void this.catalog.refresh().catch(() => undefined);
      return 'borrada';
    }
    if ((error as { code?: string }).code !== '23503') throw error;
    await this.done(this.db.from('product_options').update({ active: false }).eq('id', id));
    return 'desactivada';
  }

  addColor(name: string, sortOrder: number) {
    return this.done(this.db.from('colors').insert({ name: name.trim(), sort_order: sortOrder }));
  }

  updateColor(id: string, patch: Partial<Pick<Color, 'name' | 'active'>>) {
    return this.done(this.db.from('colors').update(patch).eq('id', id));
  }

  addAccessory(name: string, scope: Accessory['scope'], sortOrder: number) {
    return this.done(this.db.from('accessories').insert({ name: name.trim(), scope, sort_order: sortOrder }));
  }

  updateAccessory(id: string, patch: Partial<Pick<Accessory, 'name' | 'scope' | 'active'>>) {
    return this.done(this.db.from('accessories').update(patch).eq('id', id));
  }

  // ---- Usuarios (perfiles). Crear cuentas se hace en Supabase › Authentication. ----

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.db.from('profiles').select('id, full_name, role, active').order('full_name');
    if (error) throw error;
    return (data ?? []) as Profile[];
  }

  async updateProfile(id: string, patch: Partial<{ full_name: string; role: Role; active: boolean }>): Promise<void> {
    const { error } = await this.db.from('profiles').update(patch).eq('id', id);
    if (error) throw error;
  }
}
