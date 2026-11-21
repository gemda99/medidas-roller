import { Component, computed, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowDown, LucideArrowUp, LucideCamera, LucideCopy, LucidePencil, LucidePlus, LucideTrash2,
} from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { Catalog } from '../../domain/models/catalog';
import { Curtain, Location, Rectification, RectificationGeneral } from '../../domain/models/rectification';
import { completionIssues, curtainCard, CurtainCard, curtainSummary, duplicatePayload } from '../../domain/rectification/curtain-rules';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { DraftStore } from '../../shared/drafts/draft-store';
import { toUserMessage } from '../../shared/errors';
import { formatDate } from '../../shared/format';

/** Nombres frecuentes para crear una ubicación con un toque. */
const QUICK_LOCATIONS = ['Living', 'Comedor', 'Hab. principal', 'Hab. 1', 'Hab. 2', 'Cocina', 'Oficina'];

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';
type Pending =
  | { kind: 'location'; location: Location }
  | { kind: 'curtain'; curtain: Curtain }
  | { kind: 'rectification' };

@Component({
  selector: 'app-rectification-detail-page',
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialog, LucidePlus, LucidePencil, LucideTrash2, LucideArrowUp, LucideArrowDown, LucideCopy, LucideCamera],
  templateUrl: './rectification-detail.page.html',
  styleUrl: './rectification-detail.page.css',
})
export class RectificationDetailPage implements OnInit {
  private readonly repo = inject(RectificationRepository);
  private readonly catalogRepo = inject(CatalogRepository);
  private readonly drafts = inject(DraftStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly fmt = formatDate;
  readonly quick = QUICK_LOCATIONS;

  readonly rect = signal<Rectification | null>(null);
  readonly catalog = signal<Catalog | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly saveState = signal<SaveState>('idle');
  readonly showGeneral = signal(false);
  readonly newLocation = signal('');
  readonly renaming = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly pending = signal<Pending | null>(null);
  readonly completeIssues = signal<string[]>([]);

  readonly curtainCount = computed(() => this.rect()?.locations.reduce((n, l) => n + l.curtains.length, 0) ?? 0);
  readonly locked = computed(() => this.rect()?.status === 'completa');
  readonly canDelete = computed(() => this.auth.isAdmin() || this.rect()?.status === 'borrador');

  private readonly confirm = viewChild.required(ConfirmDialog);
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private get draftKey() { return `rect:${this.id}:general`; }

  readonly general = inject(NonNullableFormBuilder).group({
    visit_date: [''],
    installation_date: [''],
    observations: [''],
    explained_light_entry: [false],
    explained_fabric_position: [false],
    explained_side_measure: [false],
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.saveTimer);
      if (this.saveState() === 'saving') void this.flushGeneral();
    });
    this.general.valueChanges.subscribe(() => {
      if (!this.rect()) return;
      this.drafts.save(this.draftKey, this.general.getRawValue());
      this.saveState.set('saving');
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => void this.flushGeneral(), 800);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [r, c] = await Promise.all([this.repo.get(this.id), this.catalogRepo.load()]);
      this.catalog.set(c);
      this.applyRect(r, true);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private applyRect(r: Rectification, resetForm: boolean): void {
    this.rect.set(r);
    if (r.status === 'completa') this.general.disable({ emitEvent: false });
    else this.general.enable({ emitEvent: false });
    if (!resetForm) return;
    const draft = this.drafts.load<ReturnType<typeof this.general.getRawValue>>(this.draftKey);
    const fromDb = {
      visit_date: r.visit_date ?? '',
      installation_date: r.installation_date ?? '',
      observations: r.observations ?? '',
      explained_light_entry: r.explained_light_entry,
      explained_fabric_position: r.explained_fabric_position,
      explained_side_measure: r.explained_side_measure,
    };
    this.general.reset(fromDb, { emitEvent: false });
    // Si quedó un borrador sin enviar (se cortó la señal), se restaura y se reintenta.
    if (draft && new Date(draft.savedAt) > new Date(r.updated_at)) {
      this.general.reset(draft.value, { emitEvent: false });
      this.showGeneral.set(true);
      void this.flushGeneral();
    } else {
      this.drafts.clear(this.draftKey);
    }
  }

  private async flushGeneral(): Promise<void> {
    const v = this.general.getRawValue();
    const input: Partial<RectificationGeneral> = {
      visit_date: v.visit_date || undefined,
      installation_date: v.installation_date || null,
      observations: v.observations.trim() || null,
      explained_light_entry: v.explained_light_entry,
      explained_fabric_position: v.explained_fabric_position,
      explained_side_measure: v.explained_side_measure,
    };
    this.saveState.set('saving');
    try {
      await this.repo.updateGeneral(this.id, input);
      this.drafts.clear(this.draftKey);
      this.saveState.set('saved');
      const r = this.rect();
      if (r) this.rect.set({ ...r, ...input, visit_date: input.visit_date ?? r.visit_date } as Rectification);
    } catch (e) {
      this.saveState.set(navigator.onLine === false ? 'offline' : 'error');
      if (this.saveState() === 'error') this.error.set(toUserMessage(e));
    }
  }

  retrySave(): void {
    void this.flushGeneral();
  }

  summary(c: Curtain): string {
    return curtainSummary(c, this.catalog()?.products.find((p) => p.id === c.product_id));
  }

  private readonly names = computed(() => {
    const c = this.catalog();
    return {
      options: new Map((c?.products ?? []).flatMap((p) => p.product_options.map((o) => [o.id, o.name] as [string, string]))),
      accessories: new Map((c?.accessories ?? []).map((a) => [a.id, a.name] as [string, string])),
    };
  });

  card(c: Curtain): CurtainCard {
    const products = this.catalog()?.products ?? [];
    return curtainCard(c, products.find((p) => p.id === c.product_id), products, this.names());
  }

  // ---- Ubicaciones ----
  async addLocation(name = this.newLocation()): Promise<void> {
    const r = this.rect();
    const clean = name.trim();
    if (!r || !clean) return;
    await this.run(async () => {
      const max = r.locations.reduce((m, l) => Math.max(m, l.sort_order), 0);
      const loc = await this.repo.addLocation(r.id, clean, max + 10);
      this.rect.set({ ...r, locations: [...r.locations, loc] });
      this.newLocation.set('');
    }, false);
  }

  startRename(l: Location): void {
    this.renaming.set(l.id);
    this.renameValue.set(l.name);
  }

  async saveRename(l: Location): Promise<void> {
    const name = this.renameValue().trim();
    if (!name || name === l.name) {
      this.renaming.set(null);
      return;
    }
    await this.run(() => this.repo.renameLocation(l.id, name));
    this.renaming.set(null);
  }

  async move(l: Location, delta: -1 | 1): Promise<void> {
    await this.run(() => this.repo.moveLocation(l.id, delta));
  }

  // ---- Cortinas ----
  async duplicate(c: Curtain): Promise<void> {
    await this.run(() => this.repo.saveCurtain(duplicatePayload(c)));
  }

  // ---- Estado ----
  async complete(): Promise<void> {
    const r = this.rect();
    if (!r) return;
    const issues = completionIssues(r.locations);
    this.completeIssues.set(issues);
    if (issues.length) return;
    await this.run(() => this.repo.setStatus(r.id, 'completa'));
  }

  async reopen(): Promise<void> {
    await this.run(() => this.repo.setStatus(this.id, 'borrador'));
  }

  // ---- Borrar con confirmación ----
  ask(p: Pending): void {
    this.pending.set(p);
    this.confirm().open();
  }

  confirmTitle(): string {
    const p = this.pending();
    if (!p) return '';
    if (p.kind === 'location') return `¿Eliminar la ubicación ${p.location.name}?`;
    if (p.kind === 'curtain') return `¿Eliminar la cortina ${this.summary(p.curtain)}?`;
    return '¿Eliminar esta rectificación completa?';
  }

  confirmMessage(): string {
    const p = this.pending();
    if (p?.kind === 'location' && p.location.curtains.length) {
      const n = p.location.curtains.length;
      return `Se borran también sus ${n} cortina${n === 1 ? '' : 's'}. No se puede deshacer.`;
    }
    if (p?.kind === 'rectification') return `Se borran sus ubicaciones y ${this.curtainCount()} cortinas. No se puede deshacer.`;
    return 'No se puede deshacer.';
  }

  async onConfirmed(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    if (p.kind === 'location') await this.run(() => this.repo.removeLocation(p.location.id));
    if (p.kind === 'curtain') await this.run(() => this.repo.removeCurtain(p.curtain.id));
    if (p.kind === 'rectification') {
      this.busy.set(true);
      try {
        await this.repo.remove(this.id);
        this.drafts.clear(this.draftKey);
        await this.router.navigateByUrl('/rectificaciones');
      } catch (e) {
        this.error.set(toUserMessage(e));
      } finally {
        this.busy.set(false);
      }
    }
  }

  /** Ejecuta una acción, muestra errores y (opcional) recarga el árbol sin tocar el formulario. */
  private async run(action: () => Promise<unknown>, reload = true): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      if (reload) this.applyRect(await this.repo.get(this.id), false);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
