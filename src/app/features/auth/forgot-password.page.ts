import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { toUserMessage } from '../../shared/errors';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout title="Recuperar contraseña" subtitle="Te enviaremos un enlace para crear una nueva.">
      @if (sent()) {
        <div class="alert alert-ok" role="status">
          Si el correo está registrado, te llegará un enlace en unos minutos. Revisa también el spam.
        </div>
        <a routerLink="/ingresar" class="btn btn-block">Volver a ingresar</a>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
          <div class="field">
            <label for="email">Correo</label>
            <input id="email" type="email" formControlName="email" autocomplete="email" inputmode="email"
                   [class.invalid]="invalid()" />
            @if (invalid()) { <span class="error">Escribe un correo válido.</span> }
          </div>
          <button class="btn btn-primary btn-block" type="submit" [disabled]="loading()">
            {{ loading() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
          <a routerLink="/ingresar" class="muted" style="text-align:center">Volver a ingresar</a>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  readonly form = inject(NonNullableFormBuilder).group({ email: ['', [Validators.required, Validators.email]] });
  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  invalid(): boolean {
    const c = this.form.controls.email;
    return c.invalid && (c.touched || this.submitted());
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      await this.auth.sendPasswordReset(this.form.getRawValue().email);
      this.sent.set(true);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
