import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerRepository } from '../../data-access/repositories/customer.repository';
import { Customer } from '../../domain/models/customer';
import { CustomerListPage } from './customer-list.page';

const sample: Customer[] = [
  { id: '1', full_name: 'Cliente Uno', phone: '+56 9 1111 1111', email: null, notes: null, created_at: '' },
];

async function render(search: (t: string) => Promise<Customer[]>) {
  await TestBed.configureTestingModule({
    imports: [CustomerListPage],
    providers: [provideRouter([]), { provide: CustomerRepository, useValue: { search } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(CustomerListPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CustomerListPage', () => {
  it('lista los clientes', async () => {
    const el = await render(() => Promise.resolve(sample));
    expect(el.textContent).toContain('Cliente Uno');
  });

  it('sin clientes muestra un estado vacío con acción', async () => {
    const el = await render(() => Promise.resolve([]));
    expect(el.textContent).toContain('Aún no hay clientes');
  });

  it('si falla la red muestra el error y Reintentar', async () => {
    const el = await render(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(el.textContent).toContain('No hay conexión');
    expect(el.textContent).toContain('Reintentar');
  });
});
