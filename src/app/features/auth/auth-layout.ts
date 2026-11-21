import { Component, input } from '@angular/core';

/** Marco común de las pantallas sin sesión. Sin marca fija: el nombre comercial se configura después. */
@Component({
  selector: 'app-auth-layout',
  template: `
    <main class="wrap">
      <section class="card box">
        <div class="brand">Medidas Roller</div>
        <h1>{{ title() }}</h1>
        @if (subtitle()) { <p class="muted">{{ subtitle() }}</p> }
        <ng-content />
      </section>
    </main>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 20px; background: var(--navy); }
    .box { width: 100%; max-width: 400px; padding: 28px 24px; display: flex; flex-direction: column; gap: 12px; }
    .brand { font-weight: 800; color: var(--navy); font-size: 14px; letter-spacing: .3px; }
    p { margin: 0 0 4px; }
  `,
})
export class AuthLayout {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
