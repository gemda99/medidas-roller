import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { toUserMessage } from '../../shared/errors';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout title="Ingresar" subtitle="Accede con el correo que te entregó el administrador.">
      <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
        @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
        <div class="field">
          <label for="email">Correo</label>
          <input id="email" type="email" formControlName="email" autocomplete="username" inputmode="email"
                 [class.invalid]="showError('email')" />
          @if (showError('email')) { <span class="error">Escribe un correo válido.</span> }
        </div>
        <div class="field">
          <label for="password">Contraseña</label>
          <input id="password" type="password" formControlName="password" autocomplete="current-password"
                 [class.invalid]="showError('password')" />
          @if (showError('password')) { <span class="error">Escribe tu contraseña.</span> }
        </div>
        <button class="btn btn-primary btn-block" type="submit" [disabled]="loading()">
          {{ loading() ? 'Ingresando…' : 'Ingresar' }}
        </button>
        <a routerLink="/recuperar" class="muted" style="text-align:center">¿Olvidaste tu contraseña?</a>
      </form>
    </app-auth-layout>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  showError(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email, password);
      const back = this.route.snapshot.queryParamMap.get('volver');
      await this.router.navigateByUrl(back?.startsWith('/') ? back : '/');
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
