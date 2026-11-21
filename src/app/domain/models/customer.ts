export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  /** Normalizado '12345678-5'; opcional. */
  rut: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  address_line: string;
  comuna: string;
  reference: string | null;
  is_default: boolean;
}

export type CustomerInput = Pick<Customer, 'full_name' | 'phone' | 'rut' | 'email' | 'notes'>;
export type AddressInput = Pick<CustomerAddress, 'address_line' | 'comuna' | 'reference'>;

export interface CustomerWithAddresses extends Customer {
  customer_addresses: CustomerAddress[];
}
