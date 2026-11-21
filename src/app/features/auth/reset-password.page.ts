import { Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { toUserMessage } from '../../shared/errors';
import { AuthLayout } from './auth-layout';

const sameAs = (group: AbstractControl): ValidationErrors | null =>
  group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };

/** Destino del enlace de recuperación: Supabase abre una sesión temporal y aquí se fija la nueva clave. */
@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  template: `
    <app-auth-layout title="Nueva contraseña">
      @if (!hasSession()) {
        <div class="alert alert-warn" role="alert">El enlace venció o ya se usó. Pide uno nuevo.</div>
        <a routerLink="/recuperar" class="btn btn-block">Pedir otro enlace</a>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
          <div class="field">
            <label for="password">Nueva contraseña</label>
            <input id="password" type="password" formControlName="password" autocomplete="new-password" />
            <span class="hint">Mínimo 8 caracteres.</span>
          </div>
          <div class="field">
            <label for="confirm">Repite la contraseña</label>
            <input id="confirm" type="password" formControlName="confirm" autocomplete="new-password" />
            @if (submitted() && form.invalid) {
              <span class="error">{{ form.hasError('mismatch') ? 'Las contraseñas no coinciden.' : 'Usa al menos 8 caracteres.' }}</span>
            }
          </div>
          <button class="btn btn-primary btn-block" type="submit" [disabled]="loading()">Guardar contraseña</button>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ResetPasswordPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = inject(NonNullableFormBuilder).group(
    { password: ['', [Validators.required, Validators.minLength(8)]], confirm: ['', Validators.required] },
    { validators: sameAs },
  );
  readonly hasSession = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  async ngOnInit(): Promise<void> {
    await this.auth.init();
    this.hasSession.set(this.auth.session() !== null);
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      await this.auth.updatePassword(this.form.getRawValue().password);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
