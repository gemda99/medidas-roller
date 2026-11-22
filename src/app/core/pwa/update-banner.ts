import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Aviso de versión nueva (app instalada). La app guarda una copia para abrir rápido; cuando se
 * publica una versión nueva en Vercel, se descarga en segundo plano y aquí se ofrece actualizar.
 * También revisa al volver a abrir la app (por ejemplo, al sacarla del segundo plano).
 */
@Component({
  selector: 'app-update-banner',
  template: `
    @if (ready()) {
      <div class="bar" role="status" aria-live="polite">
        <span>Hay una versión nueva de la app.</span>
        <button type="button" (click)="reload()">Actualizar</button>
      </div>
    }
  `,
  styles: `
    .bar { position: fixed; left: 50%; top: calc(10px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 100;
      display: flex; align-items: center; gap: 12px; width: min(94vw, 460px); padding: 10px 12px 10px 16px; border-radius: 12px;
      background: #142033; color: #fff; font-size: 14px; box-shadow: 0 8px 24px rgb(0 0 0 / 25%); }
    .bar span { flex: 1; }
    button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: #fff; color: #142033; font: 700 14px Inter, sans-serif; cursor: pointer; }
  `,
})
export class UpdateBanner {
  private readonly sw = inject(SwUpdate, { optional: true });
  readonly ready = signal(false);

  constructor() {
    const sw = this.sw;
    if (!sw?.isEnabled) return;
    sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.ready.set(true));
    const check = () => {
      if (document.visibilityState === 'visible') void sw.checkForUpdate().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', check);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', check));
  }

  reload(): void {
    document.location.reload();
  }
}
