export type ProductKind = 'tela' | 'sistema';
export type CenefaMode = 'no' | 'opcional' | 'incluida';
export type ComponentRole = 'unica' | 'fondo' | 'frente';

export interface ProductOption {
  id: string;
  product_id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface ProductComponent {
  role: Exclude<ComponentRole, 'unica'>;
  component_product_id: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  kind: ProductKind;
  cenefa_mode: CenefaMode;
  fabricated: boolean;
  /** false = solo tela (velcro con contrapeso): sin motor, cadena ni mecanismo. */
  has_mechanism: boolean;
  active: boolean;
  sort_order: number;
  /** Reglas de confección en cm sobre la medida de terreno; null = la pieza no aplica (HU-42). */
  conf_fabric_w?: number | null;
  conf_fabric_h?: number | null;
  conf_tube?: number | null;
  conf_bottom?: number | null;
  conf_cenefa?: number | null;
  conf_roller?: number | null;
  product_components: ProductComponent[];
  product_options: ProductOption[];
}

export interface Color {
  id: string;
  name: string;
  active: boolean;
}

export interface Accessory {
  id: string;
  name: string;
  scope: 'cortina' | 'cotizacion';
  active: boolean;
}

export interface Catalog {
  products: Product[];
  colors: Color[];
  accessories: Accessory[];
}
