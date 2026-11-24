import { FilePaths, removeFiles } from './storage-cleanup';
import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import {
  AddressInput,
  Customer,
  CustomerAddress,
  CustomerInput,
  CustomerWithAddresses,
} from '../../domain/models/customer';

const CUSTOMER_COLUMNS = 'id, full_name, phone, rut, email, notes, created_at';
const ADDRESS_COLUMNS = 'id, customer_id, address_line, comuna, reference, is_default';

/**
 * Arma el filtro `or` de PostgREST para buscar por nombre, teléfono o RUT.
 * Deja solo letras, dígitos y espacios: así no se puede inyectar sintaxis del filtro
 * (comas, paréntesis, comillas) ni comodines de LIKE.
 */
export function buildSearchFilter(term: string): string | null {
  const clean = term.replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const parts = [`full_name.ilike."%${clean}%"`];
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 3) parts.push(`phone_digits.like."%${digits}%"`);
  // RUT: «12.345.678-5», «12345678-5», «12345678» o «123456785». Se busca por el comienzo del RUT guardado.
  const hasDash = term.includes('-');
  const rutDigits = (hasDash ? term.split('-')[0] : term).replace(/\D/g, '');
  if (rutDigits.length >= 6 && rutDigits.length <= 9) {
    parts.push(`rut.like."${rutDigits}%"`);
    // Sin guion puede venir con el dígito verificador pegado: también se prueba sin el último dígito.
    if (!hasDash && rutDigits.length >= 8) parts.push(`rut.like."${rutDigits.slice(0, -1)}-%"`);
  }
  return parts.join(',');
}

/** Acceso a datos de clientes. Los componentes nunca llaman a Supabase directamente. */
@Injectable({ providedIn: 'root' })
export class CustomerRepository {
  private readonly db = inject(SUPABASE);

  async search(term: string, limit = 50): Promise<Customer[]> {
    let q = this.db.from('customers').select(CUSTOMER_COLUMNS).order('full_name').limit(limit);
    const filter = buildSearchFilter(term);
    if (filter) q = q.or(filter);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Customer[];
  }

  async getById(id: string): Promise<CustomerWithAddresses> {
    const { data, error } = await this.db
      .from('customers')
      .select(`${CUSTOMER_COLUMNS}, customer_addresses(${ADDRESS_COLUMNS})`)
      .eq('id', id)
      .single();
    if (error) throw error;
    const c = data as unknown as CustomerWithAddresses;
    c.customer_addresses.sort((a, b) => Number(b.is_default) - Number(a.is_default));
    return c;
  }

  /** Crea el cliente y su dirección principal en una sola transacción (función en la base). */
  async createWithAddress(input: CustomerInput, address: AddressInput): Promise<Customer> {
    const { data, error } = await this.db
      .rpc('create_customer_with_address', {
        p_full_name: input.full_name,
        p_phone: input.phone,
        p_email: input.email,
        p_notes: input.notes,
        p_address_line: address.address_line,
        p_comuna: address.comuna,
        p_reference: address.reference,
        p_rut: input.rut,
      })
      .single();
    if (error) throw error;
    return data as Customer;
  }

  async update(id: string, input: CustomerInput): Promise<void> {
    const { error } = await this.db.from('customers').update(input).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const r = await this.db.from('rectifications').select('id', { count: 'exact', head: true }).eq('customer_id', id);
    if (r.error) throw r.error;
    if (r.count) {
      throw {
        code: 'P0001',
        message: `Este cliente tiene ${r.count} ${r.count === 1 ? 'rectificación' : 'rectificaciones'}. Elimínalas primero o usa «Eliminar todo».`,
      };
    }
    const { data, error } = await this.db.from('customers').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw { code: '42501', message: 'permission denied' };
  }

  /** Solo administrador: borra el cliente con sus rectificaciones, cotizaciones, fotos e imágenes. */
  async purge(id: string): Promise<void> {
    const { data, error } = await this.db.rpc('admin_delete_customer', { p_id: id });
    if (error) throw error;
    await removeFiles(this.db, data as FilePaths);
  }

  async addAddress(customerId: string, input: AddressInput, isDefault = false): Promise<CustomerAddress> {
    const { data, error } = await this.db
      .from('customer_addresses')
      .insert({ ...input, customer_id: customerId, is_default: isDefault })
      .select(ADDRESS_COLUMNS)
      .single();
    if (error) throw error;
    return data as CustomerAddress;
  }

  async updateAddress(id: string, input: AddressInput): Promise<void> {
    const { error } = await this.db.from('customer_addresses').update(input).eq('id', id);
    if (error) throw error;
  }

  async removeAddress(id: string): Promise<void> {
    const { error } = await this.db.from('customer_addresses').delete().eq('id', id);
    if (error) throw error;
  }

  async setDefaultAddress(id: string): Promise<void> {
    const { error } = await this.db.rpc('set_default_address', { p_address_id: id });
    if (error) throw error;
  }
}
