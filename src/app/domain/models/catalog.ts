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
  active: boolean;
  sort_order: number;
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
