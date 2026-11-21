export type PriceListStatus = 'borrador' | 'vigente' | 'archivada';
export type InstallationMode = 'proyecto' | 'cortina' | 'manual';
export type IvaMode = 'excluido' | 'incluido' | 'sin';

export interface PriceListSettings {
  name: string;
  general_min_price: number;
  motor_price: number | null;
  remote_control_per_motors: number;
  cenefa_price_ml: number | null;
  installation_mode: InstallationMode;
  installation_project_price: number | null;
  installation_per_curtain_price: number | null;
  iva_rate: number;
  iva_mode_default: IvaMode;
  rounding_step: 1 | 10 | 100 | 1000;
  medidor_discount_enabled: boolean;
  medidor_max_discount_pct: number;
  notes: string | null;
}

export interface PriceList extends PriceListSettings {
  id: string;
  status: PriceListStatus;
  valid_from: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface ProductPrice {
  product_id: string;
  price_m2: number | null;
  min_price: number | null;
}

export interface AccessoryPrice {
  accessory_id: string;
  unit_price: number | null;
}

export interface PriceListWithPrices extends PriceList {
  product_prices: ProductPrice[];
  accessory_prices: AccessoryPrice[];
}
