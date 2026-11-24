import { TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog con texto obligatorio', () => {
  it('el botón se habilita solo al escribir el nombre (sin importar mayúsculas)', () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    const f = TestBed.createComponent(ConfirmDialog);
    f.componentRef.setInput('title', '¿Eliminar todo?');
    f.componentRef.setInput('requireText', 'Eduardo Moreno');
    f.componentInstance.open();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const ok = () => el.querySelectorAll('.actions button')[1] as HTMLButtonElement;
    expect(ok().disabled).toBe(true);
    const input = el.querySelector('#confirm-typed') as HTMLInputElement;
    input.value = 'eduardo moreno ';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(ok().disabled).toBe(false);
  });
});
