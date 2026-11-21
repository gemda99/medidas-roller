import { ComponentRole } from './catalog';

export type RectificationStatus = 'borrador' | 'completa';
export type Surface = 'concreto' | 'volcanita' | 'madera' | 'otro';
export type Mounting = 'interno' | 'muro' | 'cielo';
export type Fall = 'interna' | 'externa';
export type ChainSide = 'izquierda' | 'derecha';

export interface CurtainComponent {
  id?: string;
  role: ComponentRole;
  product_id?: string;
  color_name: string | null;
  width_cm: number;
  height_cm: number;
  fall: Fall | null;
  motorized: boolean;
}

export interface Curtain {
  id: string;
  location_id: string;
  product_id: string;
  label: string | null;
  surface: Surface | null;
  surface_other: string | null;
  mounting: Mounting | null;
  chain_side: ChainSide | null;
  chain_length_m: number | null;
  has_cenefa: boolean;
  /** Doble invertido: la tela que el producto pone adelante va atrás. */
  swap_layers: boolean;
  notes: string | null;
  sort_order: number;
  curtain_components: CurtainComponent[];
  curtain_options: { product_option_id: string }[];
  curtain_accessories: { accessory_id: string; quantity: number }[];
  curtain_photos?: { id: string }[];
}

export interface Location {
  id: string;
  rectification_id: string;
  name: string;
  notes: string | null;
  sort_order: number;
  curtains: Curtain[];
}

export interface RectificationGeneral {
  visit_date: string;
  installation_date: string | null;
  observations: string | null;
  explained_light_entry: boolean;
  explained_fabric_position: boolean;
  explained_side_measure: boolean;
}

export interface RectificationSummary extends RectificationGeneral {
  id: string;
  customer_id: string;
  executive_id: string;
  executive_name: string;
  address_line: string;
  comuna: string;
  address_reference: string | null;
  status: RectificationStatus;
  created_at: string;
  updated_at: string;
  /** Firma de conformidad del cliente (al completar). */
  signature_path: string | null;
  signed_name: string | null;
  signed_rut: string | null;
  signed_at: string | null;
  customers: { full_name: string; phone: string; rut?: string | null } | null;
}

export interface Rectification extends RectificationSummary {
  locations: Location[];
}

/** Lo que se envía a la función save_curtain. */
export interface CurtainPayload {
  id?: string;
  location_id: string;
  product_id: string;
  label: string | null;
  surface: Surface | '';
  surface_other: string | null;
  mounting: Mounting | '';
  chain_side: ChainSide | '';
  chain_length_m: number | '';
  has_cenefa: boolean;
  swap_layers: boolean;
  notes: string | null;
  components: Omit<CurtainComponent, 'id' | 'product_id'>[];
  option_ids: string[];
  accessories: { accessory_id: string; quantity: number }[];
}
