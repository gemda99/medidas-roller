import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomerRepository } from '../../data-access/repositories/customer.repository';
import { COMUNAS_RM } from '../../domain/comunas';
import { toUserMessage } from '../../shared/errors';
import { emptyToNull, normalizePhone, phoneValidator } from '../../shared/validation/contact';

/** Crear o editar un cliente. Al crear, pide también la primera dirección (queda como principal). */
@Component({
  selector: 'app-customer-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page">
      <a [routerLink]="id ? ['/clientes', id] : ['/clientes']" class="muted">‹ Volver</a>
      <h1>{{ id ? 'Editar cliente' : 'Nuevo cliente' }}</h1>

      @if (loadError()) {
        <div class="alert alert-error" role="alert">{{ loadError() }}</div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }

          <section class="card stack">
            <div class="field">
              <label for="full_name">Nombre</label>
              <input id="full_name" formControlName="full_name" autocomplete="name" [class.invalid]="bad('full_name')" />
              @if (bad('full_name')) { <span class="error">Escribe el nombre (mínimo 2 letras).</span> }
            </div>
            <div class="field">
              <label for="phone">Teléfono</label>
              <input id="phone" type="tel" inputmode="tel" formControlName="phone" autocomplete="tel"
                     placeholder="+56 9 1234 5678" [class.invalid]="bad('phone')" />
              @if (bad('phone')) { <span class="error">Escribe un teléfono válido, por ejemplo +56 9 1234 5678.</span> }
            </div>
            <div class="field">
              <label for="email">Correo <span class="muted">(opcional)</span></label>
              <input id="email" type="email" inputmode="email" formControlName="email" autocomplete="email" [class.invalid]="bad('email')" />
              @if (bad('email')) { <span class="error">Revisa el formato del correo.</span> }
            </div>
            <div class="field">
              <label for="notes">Notas <span class="muted">(opcional)</span></label>
              <textarea id="notes" formControlName="notes"></textarea>
            </div>
          </section>

          @if (!id) {
            <section class="card stack" formGroupName="address">
              <h2>Dirección</h2>
              <div class="field">
                <label for="address_line">Calle y número</label>
                <input id="address_line" formControlName="address_line" autocomplete="street-address"
                       [class.invalid]="badAddress('address_line')" />
                @if (badAddress('address_line')) { <span class="error">Escribe la dirección.</span> }
              </div>
              <div class="field">
                <label for="comuna">Comuna</label>
                <input id="comuna" formControlName="comuna" list="comunas" autocomplete="address-level2"
                       [class.invalid]="badAddress('comuna')" />
                <datalist id="comunas">@for (c of comunas; track c) { <option [value]="c"></option> }</datalist>
                @if (badAddress('comuna')) { <span class="error">Escribe la comuna.</span> }
              </div>
              <div class="field">
                <label for="reference">Referencia <span class="muted">(opcional)</span></label>
                <input id="reference" formControlName="reference" placeholder="Depto, torre, casa esquina…" />
              </div>
            </section>
          }

          <button class="btn btn-primary btn-block" type="submit" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : 'Guardar cliente' }}
          </button>
        </form>
      }
    </div>
  `,
})
export class CustomerFormPage implements OnInit {
  private readonly repo = inject(CustomerRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly comunas = COMUNAS_RM;
  readonly id = this.route.snapshot.paramMap.get('id');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  private readonly submitted = signal(false);

  readonly form = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    phone: ['', [Validators.required, phoneValidator]],
    email: ['', [Validators.email]],
    notes: ['', [Validators.maxLength(1000)]],
    address: this.fb.group({
      address_line: ['', [Validators.required, Validators.minLength(3)]],
      comuna: ['', [Validators.required, Validators.minLength(2)]],
      reference: [''],
    }),
  });

  async ngOnInit(): Promise<void> {
    if (!this.id) {
      const nombre = this.route.snapshot.queryParamMap.get('nombre');
      if (nombre) this.form.controls.full_name.setValue(nombre);
      return;
    }
    this.form.controls.address.disable(); // al editar, las direcciones se manejan en la ficha
    try {
      const c = await this.repo.getById(this.id);
      this.form.patchValue({ full_name: c.full_name, phone: c.phone, email: c.email ?? '', notes: c.notes ?? '' });
    } catch (e) {
      this.loadError.set(toUserMessage(e));
    }
  }

  bad(name: 'full_name' | 'phone' | 'email'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  badAddress(name: 'address_line' | 'comuna'): boolean {
    const c = this.form.controls.address.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const customer = {
      full_name: v.full_name.trim(),
      phone: normalizePhone(v.phone),
      email: emptyToNull(v.email),
      notes: emptyToNull(v.notes),
    };
    this.saving.set(true);
    try {
      if (this.id) {
        await this.repo.update(this.id, customer);
        await this.router.navigate(['/clientes', this.id]);
      } else {
        const created = await this.repo.createWithAddress(customer, {
          address_line: v.address.address_line.trim(),
          comuna: v.address.comuna.trim(),
          reference: emptyToNull(v.address.reference),
        });
        await this.router.navigate(['/clientes', created.id]);
      }
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
