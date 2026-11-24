import { NgTemplateOutlet } from '@angular/common';
import { RutPipe } from '../../shared/pipes/rut.pipe';
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucidePencil, LucidePhone, LucidePlus, LucideStar, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import { CustomerRepository } from '../../data-access/repositories/customer.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { RectificationSummary } from '../../domain/models/rectification';
import { formatDate } from '../../shared/format';
import { COMUNAS_RM } from '../../domain/comunas';
import { CustomerAddress, CustomerWithAddresses } from '../../domain/models/customer';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { toUserMessage } from '../../shared/errors';
import { emptyToNull } from '../../shared/validation/contact';

type Pending = { kind: 'address'; address: CustomerAddress } | { kind: 'customer' };

@Component({
  selector: 'app-customer-detail-page',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, ConfirmDialog, LucidePencil, LucidePhone, LucidePlus, LucideStar, LucideTrash2, RutPipe],
  templateUrl: './customer-detail.page.html',
})
export class CustomerDetailPage implements OnInit {
  private readonly repo = inject(CustomerRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly rectifications = inject(RectificationRepository);
  readonly fmt = formatDate;
  /** Rectificaciones del cliente visibles para este usuario (RLS: el medidor ve solo las suyas). */
  readonly works = signal<RectificationSummary[]>([]);

  readonly comunas = COMUNAS_RM;
  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly customer = signal<CustomerWithAddresses | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  /** null = sin formulario; 'new' = nueva dirección; id = editando esa dirección. */
  readonly editing = signal<string | null>(null);
  readonly pending = signal<Pending | null>(null);
  readonly telHref = computed(() => 'tel:' + (this.customer()?.phone ?? '').replace(/\s/g, ''));

  private readonly confirm = viewChild.required(ConfirmDialog);
  private readonly submitted = signal(false);

  readonly addressForm = inject(NonNullableFormBuilder).group({
    address_line: ['', [Validators.required, Validators.minLength(3)]],
    comuna: ['', [Validators.required, Validators.minLength(2)]],
    reference: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [c, works] = await Promise.all([
        this.repo.getById(this.id),
        this.rectifications.list({ customerId: this.id, limit: 50 }),
      ]);
      this.customer.set(c);
      this.works.set(works);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(): void {
    this.submitted.set(false);
    this.addressForm.reset();
    this.editing.set('new');
  }

  startEdit(a: CustomerAddress): void {
    this.submitted.set(false);
    this.addressForm.reset({ address_line: a.address_line, comuna: a.comuna, reference: a.reference ?? '' });
    this.editing.set(a.id);
  }

  bad(name: 'address_line' | 'comuna'): boolean {
    const c = this.addressForm.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async saveAddress(): Promise<void> {
    this.submitted.set(true);
    if (this.addressForm.invalid) return;
    const v = this.addressForm.getRawValue();
    const input = { address_line: v.address_line.trim(), comuna: v.comuna.trim(), reference: emptyToNull(v.reference) };
    await this.run(async () => {
      const editing = this.editing();
      if (editing === 'new') {
        const isFirst = (this.customer()?.customer_addresses.length ?? 0) === 0;
        await this.repo.addAddress(this.id, input, isFirst);
      } else if (editing) {
        await this.repo.updateAddress(editing, input);
      }
      this.editing.set(null);
    });
  }

  async makeDefault(a: CustomerAddress): Promise<void> {
    await this.run(() => this.repo.setDefaultAddress(a.id));
  }

  askDeleteAddress(a: CustomerAddress): void {
    this.pending.set({ kind: 'address', address: a });
    this.confirm().open();
  }

  askDeleteCustomer(): void {
    this.pending.set({ kind: 'customer' });
    this.confirm().open();
  }

  confirmTitle(): string {
    const p = this.pending();
    if (!p) return '';
    return p.kind === 'customer'
      ? `¿Eliminar a ${this.customer()?.full_name}?`
      : `¿Eliminar la dirección ${p.address.address_line}?`;
  }

  deleteMessage(): string {
    if (this.pending()?.kind !== 'customer') return 'Esta acción no se puede deshacer.';
    const n = this.works().length;
    return n
      ? `Se borran sus direcciones y sus ${n} ${n === 1 ? 'rectificación' : 'rectificaciones'} con cortinas, fotos, firmas y todas sus cotizaciones (también emitidas o aceptadas). No se puede deshacer.`
      : 'Se borran también sus direcciones. Esta acción no se puede deshacer.';
  }

  async onConfirmed(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    if (p.kind === 'customer') {
      this.busy.set(true);
      try {
        if (this.works().length) await this.repo.purge(this.id);
        else await this.repo.remove(this.id);
        await this.router.navigateByUrl('/clientes');
      } catch (e) {
        this.error.set(toUserMessage(e));
      } finally {
        this.busy.set(false);
      }
      return;
    }
    await this.run(() => this.repo.removeAddress(p.address.id));
  }

  /** Ejecuta una acción, muestra el error si falla y recarga la ficha. */
  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.customer.set(await this.repo.getById(this.id));
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
