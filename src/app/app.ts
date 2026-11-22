import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateBanner } from './core/pwa/update-banner';
import { isSupabaseConfigured } from './data-access/supabase/supabase.client';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateBanner],
  template: `
    <app-update-banner />
    @if (configured) {
      <router-outlet />
    } @else {
      <main class="page">
        <div class="alert alert-warn" role="alert">
          <strong>Falta configurar Supabase.</strong>
          Crea el archivo <code>.env</code> a partir de <code>.env.example</code> (o las variables en Vercel) y vuelve a iniciar.
        </div>
      </main>
    }
  `,
})
export class App {
  protected readonly configured = isSupabaseConfigured();
}
