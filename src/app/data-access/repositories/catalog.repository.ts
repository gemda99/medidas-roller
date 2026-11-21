import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Catalog, Product } from '../../domain/models/catalog';

/**
 * Catálogo (productos, colores, accesorios). Cambia poco: se carga una vez por sesión
 * y se vuelve a pedir solo si falló o si se llama a refresh().
 */
@Injectable({ providedIn: 'root' })
export class CatalogRepository {
  private readonly db = inject(SUPABASE);
  private cache: Promise<Catalog> | null = null;

  load(): Promise<Catalog> {
    this.cache ??= this.fetch().catch((e) => {
      this.cache = null;
      throw e;
    });
    return this.cache;
  }

  refresh(): Promise<Catalog> {
    this.cache = null;
    return this.load();
  }

  private async fetch(): Promise<Catalog> {
    const [products, colors, accessories] = await Promise.all([
      this.db
        .from('products')
        .select('id, code, name, kind, cenefa_mode, fabricated, has_mechanism, active, sort_order, conf_fabric_w, conf_fabric_h, conf_tube, conf_bottom, conf_cenefa, conf_roller, product_components!product_components_system_product_id_fkey(role, component_product_id), product_options(id, product_id, name, active, sort_order)')
        .order('sort_order'),
      this.db.from('colors').select('id, name, active').eq('active', true).order('sort_order'),
      this.db.from('accessories').select('id, name, scope, active').eq('active', true).order('sort_order'),
    ]);
    for (const r of [products, colors, accessories]) if (r.error) throw r.error;
    const list = (products.data ?? []) as unknown as Product[];
    for (const p of list) p.product_options.sort((a, b) => a.sort_order - b.sort_order);
    return {
      products: list,
      colors: colors.data ?? [],
      accessories: accessories.data ?? [],
    } as Catalog;
  }
}
