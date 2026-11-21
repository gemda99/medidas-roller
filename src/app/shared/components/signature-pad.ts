import { afterNextRender, Component, ElementRef, output, signal, viewChild } from '@angular/core';

/**
 * Recuadro para firmar con el dedo o el mouse (pointer events). Exporta un PNG con fondo blanco.
 * Ajusta la resolución a la pantalla para que la firma no se vea pixelada.
 */
@Component({
  selector: 'app-signature-pad',
  template: `
    <div class="wrap">
      <canvas #canvas aria-label="Recuadro para firmar" role="img"
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up()" (pointerleave)="up()" (pointercancel)="up()"></canvas>
      @if (empty()) { <span class="hint-in" aria-hidden="true">Firme aquí</span> }
      <span class="line" aria-hidden="true"></span>
    </div>
    <button type="button" class="btn" style="min-height:40px" [disabled]="empty()" (click)="clear()">Borrar firma</button>
  `,
  styles: `
    :host { display: grid; gap: 8px; justify-items: start; }
    .wrap { position: relative; width: 100%; height: 200px; border: 2px dashed var(--line-strong); border-radius: 12px; background: #fff; touch-action: none; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
    .hint-in { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); color: #a0aec0; pointer-events: none; }
    .line { position: absolute; left: 24px; right: 24px; bottom: 44px; border-bottom: 1px solid #cbd5e1; pointer-events: none; }
  `,
})
export class SignaturePad {
  readonly changed = output<boolean>();
  readonly empty = signal(true);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private drawing = false;
  private last: { x: number; y: number } | null = null;

  constructor() {
    afterNextRender(() => this.resize());
  }

  private ctx(): CanvasRenderingContext2D {
    return this.canvas().nativeElement.getContext('2d')!;
  }

  private resize(): void {
    const c = this.canvas().nativeElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    const ctx = this.ctx();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f1d33';
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e: PointerEvent): void {
    e.preventDefault();
    this.canvas().nativeElement.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.last = this.point(e);
    const ctx = this.ctx();
    ctx.beginPath();
    ctx.arc(this.last.x, this.last.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0f1d33';
    ctx.fill();
    this.mark();
  }

  move(e: PointerEvent): void {
    if (!this.drawing || !this.last) return;
    e.preventDefault();
    const p = this.point(e);
    const ctx = this.ctx();
    ctx.beginPath();
    ctx.moveTo(this.last.x, this.last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.last = p;
  }

  up(): void {
    this.drawing = false;
    this.last = null;
  }

  private mark(): void {
    if (this.empty()) {
      this.empty.set(false);
      this.changed.emit(true);
    }
  }

  clear(): void {
    const c = this.canvas().nativeElement;
    this.ctx().clearRect(0, 0, c.width, c.height);
    this.empty.set(true);
    this.changed.emit(false);
  }

  /** PNG con fondo blanco, del tamaño del recuadro en pantalla. */
  async toBlob(): Promise<Blob> {
    const src = this.canvas().nativeElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo guardar la firma.'))), 'image/png'),
    );
  }
}
