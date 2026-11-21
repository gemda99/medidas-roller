import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SegmentOption {
  value: string;
  label: string;
}

/**
 * Botones segmentados para elegir con un toque (superficie, instalación, caída, cadena).
 * Con `clearable`, tocar la opción elegida la desmarca (para datos opcionales).
 */
@Component({
  selector: 'app-segmented',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Segmented), multi: true }],
  template: `
    <div class="seg" role="radiogroup" [attr.aria-label]="label()"
         [style.grid-template-columns]="'repeat(' + options().length + ', minmax(0, 1fr))'">
      @for (o of options(); track o.value) {
        <button type="button" role="radio" [attr.aria-checked]="value() === o.value"
                [class.on]="value() === o.value" [disabled]="disabled()" (click)="pick(o.value)">
          {{ o.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .seg { display: grid; border: 1px solid var(--line-strong); border-radius: 12px; overflow: hidden; background: #fff; }
    button { min-height: 44px; border: 0; background: #fff; color: var(--ink); font: 600 14px Inter, sans-serif; cursor: pointer; padding: 0 4px; }
    button + button { border-left: 1px solid var(--line-strong); }
    button.on { background: var(--navy); color: #fff; }
    button:focus-visible { outline: 3px solid var(--blue); outline-offset: -3px; }
  `,
})
export class Segmented implements ControlValueAccessor {
  readonly options = input.required<SegmentOption[]>();
  readonly label = input('');
  readonly clearable = input(false);

  protected readonly value = signal<string>('');
  protected readonly disabled = signal(false);
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  pick(v: string): void {
    const next = this.clearable() && this.value() === v ? '' : v;
    this.value.set(next);
    this.onChange(next);
    this.onTouched();
  }

  writeValue(v: string | null): void {
    this.value.set(v ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }
}
