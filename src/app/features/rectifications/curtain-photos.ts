import { Component, DestroyRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { LucideCamera, LucideTrash2 } from '@lucide/angular';
import { CurtainPhoto, PhotoRepository } from '../../data-access/repositories/photo.repository';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { toUserMessage } from '../../shared/errors';
import { compressImage, CompressedImage } from '../../shared/images/compress';

interface Pending extends CompressedImage {
  preview: string;
}

/**
 * Fotos de una cortina (HU-21). Abre la cámara del teléfono o la galería, comprime antes de subir.
 * En una cortina nueva (sin id todavía) las fotos esperan y se suben al guardar: uploadPending().
 */
@Component({
  selector: 'app-curtain-photos',
  imports: [LucideCamera, LucideTrash2, ConfirmDialog],
  template: `
    <div class="field">
      <span class="lbl">Fotos</span>
      @if (error()) { <span class="error">{{ error() }}</span> }
      <div class="grid">
        @for (p of photos(); track p.id) {
          <figure class="ph">
            @if (p.url) { <a [href]="p.url" target="_blank" rel="noopener"><img [src]="p.url" alt="Foto de la cortina" loading="lazy" /></a> }
            @if (!disabled()) {
              <button type="button" class="del" aria-label="Eliminar foto" (click)="askRemove(p)"><svg lucideTrash2 [size]="16" aria-hidden="true"></svg></button>
            }
          </figure>
        }
        @for (p of pending(); track p.preview; let i = $index) {
          <figure class="ph pending">
            <img [src]="p.preview" alt="Foto por subir" />
            <figcaption>Se sube al guardar</figcaption>
            <button type="button" class="del" aria-label="Quitar foto" (click)="dropPending(i)"><svg lucideTrash2 [size]="16" aria-hidden="true"></svg></button>
          </figure>
        }
        @if (!disabled()) {
          <label class="add" [class.busy]="busy()">
            <svg lucideCamera [size]="22" aria-hidden="true"></svg>
            <span>{{ busy() ? 'Procesando…' : 'Agregar' }}</span>
            <input type="file" accept="image/*" capture="environment" multiple (change)="onFiles($event)" [disabled]="busy()" />
          </label>
        }
      </div>
    </div>
    <app-confirm-dialog title="¿Eliminar esta foto?" message="No se puede deshacer." (confirmed)="remove()" />
  `,
  styles: `
    .lbl { font-size: 14px; font-weight: 600; }
    .grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .ph { position: relative; margin: 0; width: 92px; height: 92px; border-radius: 12px; overflow: hidden; background: #d6e0ee; }
    .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ph figcaption { position: absolute; inset: auto 0 0 0; background: rgba(15,29,51,.7); color: #fff; font-size: 10px; padding: 2px 4px; }
    .del { position: absolute; top: 4px; right: 4px; width: 32px; height: 32px; border-radius: 99px; border: 0; background: rgba(255,255,255,.92); color: var(--danger); display: grid; place-items: center; cursor: pointer; }
    .add { width: 92px; height: 92px; border-radius: 12px; border: 1.5px dashed #8fa3bf; background: #fff; color: var(--navy); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font: 600 13px Inter, sans-serif; cursor: pointer; position: relative; }
    .add input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .add.busy { opacity: .6; }
  `,
})
export class CurtainPhotos {
  private readonly repo = inject(PhotoRepository);

  readonly rectificationId = input.required<string>();
  readonly curtainId = input<string | null>(null);
  readonly disabled = input(false);

  readonly photos = signal<CurtainPhoto[]>([]);
  readonly pending = signal<Pending[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private toRemove: CurtainPhoto | null = null;
  private readonly confirm = viewChild.required(ConfirmDialog);

  constructor() {
    effect(() => {
      const id = this.curtainId();
      if (id) void this.refresh(id);
      else this.photos.set([]);
    });
    inject(DestroyRef).onDestroy(() => this.clearPending());
  }

  get pendingCount(): number {
    return this.pending().length;
  }

  private async refresh(id: string): Promise<void> {
    try {
      this.photos.set(await this.repo.list(id));
    } catch (e) {
      this.error.set(toUserMessage(e));
    }
  }

  async onFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      for (const f of files) {
        const img = await compressImage(f);
        const id = this.curtainId();
        if (id) await this.repo.upload(this.rectificationId(), id, img);
        else this.pending.update((list) => [...list, { ...img, preview: URL.createObjectURL(img.blob) }]);
      }
      const id = this.curtainId();
      if (id) await this.refresh(id);
    } catch (e) {
      this.error.set(e instanceof Error && !('code' in e) ? 'No se pudo procesar la foto. Prueba con otra.' : toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  dropPending(i: number): void {
    const p = this.pending()[i];
    if (p) URL.revokeObjectURL(p.preview);
    this.pending.update((list) => list.filter((_, j) => j !== i));
  }

  /** Sube las fotos en espera a la cortina recién guardada. Devuelve cuántas fallaron. */
  async uploadPending(curtainId: string): Promise<number> {
    let failed = 0;
    for (const p of this.pending()) {
      try {
        await this.repo.upload(this.rectificationId(), curtainId, p);
      } catch {
        failed++;
      }
    }
    this.clearPending();
    return failed;
  }

  clearPending(): void {
    for (const p of this.pending()) URL.revokeObjectURL(p.preview);
    this.pending.set([]);
  }

  askRemove(p: CurtainPhoto): void {
    this.toRemove = p;
    this.confirm().open();
  }

  async remove(): Promise<void> {
    const p = this.toRemove;
    const id = this.curtainId();
    if (!p || !id) return;
    this.busy.set(true);
    try {
      await this.repo.remove(p);
      await this.refresh(id);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
