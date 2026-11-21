import { Component, ElementRef, input, output, viewChild } from '@angular/core';

/**
 * Confirmación antes de borrar. Usa <dialog> nativo: atrapa el foco y se cierra con Esc.
 * El texto debe nombrar lo que se borra ("¿Eliminar la dirección Calle 1?").
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog #dlg (close)="onClose()" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{{ title() }}</h2>
      <p>{{ message() }}</p>
      <div class="actions">
        <button type="button" class="btn" (click)="dlg.close('cancel')">Cancelar</button>
        <button type="button" class="btn btn-danger" (click)="dlg.close('ok')">{{ confirmLabel() }}</button>
      </div>
    </dialog>
  `,
  styles: `
    dialog { border: 0; border-radius: 16px; padding: 22px; width: min(92vw, 420px); box-shadow: 0 20px 60px rgba(15,29,51,.25); }
    dialog::backdrop { background: rgba(15,29,51,.45); }
    p { color: var(--muted); margin: 10px 0 18px; }
    .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Eliminar');
  readonly confirmed = output<void>();

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  open(): void {
    this.dlg().nativeElement.returnValue = '';
    this.dlg().nativeElement.showModal();
  }

  protected onClose(): void {
    if (this.dlg().nativeElement.returnValue === 'ok') this.confirmed.emit();
  }
}
