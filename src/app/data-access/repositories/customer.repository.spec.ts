import { buildSearchFilter } from './customer.repository';

describe('buildSearchFilter', () => {
  it('sin texto no filtra', () => {
    expect(buildSearchFilter('   ')).toBeNull();
  });
  it('busca por nombre', () => {
    expect(buildSearchFilter('María')).toBe('full_name.ilike."%María%"');
  });
  it('con 3 o más dígitos busca también por teléfono sin espacios', () => {
    expect(buildSearchFilter('9 1234')).toBe('full_name.ilike."%9 1234%",phone_digits.like."%91234%"');
  });
  it('quita caracteres que alteran el filtro de PostgREST', () => {
    const f = buildSearchFilter('a,b)"or(1=1%_');
    expect(f).toBe('full_name.ilike."%a b or 1 1%"');
  });
});
