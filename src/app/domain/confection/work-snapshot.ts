/**
 * Copia del trabajo que se guarda en la cotización (pedido del 22-11): confección e instalación salen
 * de la cotización aceptada, con las mismas medidas con que se calcularon los precios.
 */
import { Catalog } from '../models/catalog';
import { Rectification } from '../models/rectification';
import { ConfectionCurtain, confectionSheet } from './confection-engine';

/** Datos del trabajo para encabezados y firma (sin depender de la rectificación viva). */
export interface JobInfo {
  customer_name: string;
  phone: string | null;
  address: string;
  address_reference: string | null;
  visit_date: string | null;
  installation_date: string | null;
  executive_name: string | null;
  observations: string | null;
  signed_name: string | null;
  signed_rut: string | null;
  signed_at: string | null;
  signature_path: string | null;
}

export interface WorkSnapshot {
  version: 1;
  job: JobInfo;
  curtains: ConfectionCurtain[];
  /** Rutas en Storage de las fotos de cada cortina (curtain_id → rutas). */
  photos: Record<string, string[]>;
}

export function jobInfo(r: Rectification): JobInfo {
  return {
    customer_name: r.customers?.full_name ?? '',
    phone: r.customers?.phone ?? null,
    address: [r.address_line, r.comuna].filter(Boolean).join(', '),
    address_reference: r.address_reference,
    visit_date: r.visit_date,
    installation_date: r.installation_date,
    executive_name: r.executive_name,
    observations: r.observations,
    signed_name: r.signed_name,
    signed_rut: r.signed_rut,
    signed_at: r.signed_at,
    signature_path: r.signature_path,
  };
}

export function buildWorkSnapshot(r: Rectification, catalog: Pick<Catalog, 'products' | 'accessories'>): WorkSnapshot {
  const names = {
    options: new Map(catalog.products.flatMap((p) => p.product_options.map((o) => [o.id, o.name] as [string, string]))),
    accessories: new Map(catalog.accessories.map((a) => [a.id, a.name] as [string, string])),
  };
  const photos: Record<string, string[]> = {};
  for (const l of r.locations) {
    for (const c of l.curtains) {
      const paths = (c.curtain_photos ?? []).map((p) => p.storage_path).filter((p): p is string => !!p);
      if (paths.length) photos[c.id] = paths;
    }
  }
  return { version: 1, job: jobInfo(r), curtains: confectionSheet(r.locations, catalog.products, names), photos };
}
