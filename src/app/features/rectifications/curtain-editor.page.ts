import { Component, computed, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogRepository } from '../../data-access/repositories/catalog.repository';
import { RectificationRepository } from '../../data-access/repositories/rectification.repository';
import { Catalog, ComponentRole, Product } from '../../domain/models/catalog';
import { CurtainPayload, Fall, Rectification } from '../../domain/models/rectification';
import {
  CurtainIssue, componentLabel, duplicatePayload, reshapeComponents, validateCurtain,
} from '../../domain/rectification/curtain-rules';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { Segmented, SegmentOption } from '../../shared/components/segmented';
import { DraftStore } from '../../shared/drafts/draft-store';
import { toUserMessage } from '../../shared/errors';
import { parseDecimal } from '../../shared/format';

type ComponentForm = FormGroup<{
  role: FormControl<ComponentRole>;
  color_name: FormControl<string>;
  width_cm: FormControl<string>;
  height_cm: FormControl<string>;
  fall: FormControl<string>;
  motorized: FormControl<boolean>;
}>;

type FormValue = ReturnType<CurtainEditorPage['form']['getRawValue']>;

const CHAIN_PRESETS = ['1', '1.5', '2'];

@Component({
  selector: 'app-curtain-editor-page',
  imports: [ReactiveFormsModule, RouterLink, Segmented, ConfirmDialog],
  templateUrl: './curtain-editor.page.html',
  styleUrl: './curtain-editor.page.css',
})
export class CurtainEditorPage implements OnInit {
  private readonly repo = inject(RectificationRepository);
  private readonly catalogRepo = inject(CatalogRepository);
  private readonly drafts = inject(DraftStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly auth = inject(AuthService);

  readonly rectId = this.route.snapshot.paramMap.get('id')!;
  readonly curtainId = this.route.snapshot.paramMap.get('cid'); // null = nueva
  readonly isNew = !this.curtainId;

  readonly catalog = signal<Catalog | null>(null);
  readonly rect = signal<Rectification | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly issues = signal<CurtainIssue[]>([]);
  readonly restored = signal(false);
  readonly flash = signal<string | null>(null);
  readonly productId = signal('');

  readonly surfaces: SegmentOption[] = [
    { value: 'concreto', label: 'Concreto' }, { value: 'volcanita', label: 'Volcanita' },
    { value: 'madera', label: 'Madera' }, { value: 'otro', label: 'Otra' },
  ];
  readonly mountings: SegmentOption[] = [{ value: 'interno', label: 'Interno' }, { value: 'muro', label: 'Muro' }, { value: 'cielo', label: 'Cielo' }];
  readonly falls: SegmentOption[] = [{ value: 'interna', label: 'Interna' }, { value: 'externa', label: 'Externa' }];
  readonly sides: SegmentOption[] = [{ value: 'izquierda', label: 'Izquierda' }, { value: 'derecha', label: 'Derecha' }];
  readonly chains: SegmentOption[] = [
    { value: '1', label: '1 m' }, { value: '1.5', label: '1,5 m' }, { value: '2', label: '2 m' }, { value: 'otro', label: 'Otro' },
  ];

  readonly products = computed(() => (this.catalog()?.products ?? []).filter((p) => p.active));
  readonly product = computed<Product | undefined>(() => this.catalog()?.products.find((p) => p.id === this.productId()));
  readonly locations = computed(() => this.rect()?.locations ?? []);
  readonly locked = computed(() => this.rect()?.status === 'completa');
  readonly cortinaAccessories = computed(() => (this.catalog()?.accessories ?? []).filter((a) => a.scope === 'cortina'));

  private readonly confirm = viewChild.required(ConfirmDialog);
  private draftKey = '';
  private submitted = false;

  readonly form = this.fb.group({
    location_id: [''],
    product_id: [''],
    label: [''],
    surface: [''],
    surface_other: [''],
    mounting: [''],
    chain_side: [''],
    chain_length: [''],
    chain_other: [''],
    has_cenefa: [false],
    swap_layers: [false],
    notes: [''],
    components: this.fb.array<ComponentForm>([]),
    option_ids: this.fb.control<string[]>([]),
    accessories: this.fb.control<Record<string, number>>({}),
  });

  get components(): FormArray<ComponentForm> {
    return this.form.controls.components;
  }

  constructor() {
    const sub = this.form.valueChanges.subscribe(() => {
      if (this.draftKey && !this.loading()) this.drafts.save(this.draftKey, this.form.getRawValue());
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  async ngOnInit(): Promise<void> {
    try {
      const [catalog, rect] = await Promise.all([this.catalogRepo.load(), this.repo.get(this.rectId)]);
      this.catalog.set(catalog);
      this.rect.set(rect);
      const all = rect.locations.flatMap((l) => l.curtains);
      const qp = this.route.snapshot.queryParamMap;

      if (this.curtainId) {
        const c = all.find((x) => x.id === this.curtainId);
        if (!c) throw { code: 'PGRST116' };
        this.draftKey = `curtain:${c.id}`;
        this.fill(duplicatePayload(c));
      } else {
        const locationId = qp.get('ubicacion') ?? rect.locations[0]?.id ?? '';
        this.draftKey = `curtain:new:${this.rectId}:${locationId}`;
        // Hereda de la última cortina registrada (DESIGN: valores repetidos se heredan).
        const last = [...all].sort((a, b) => a.sort_order - b.sort_order).pop();
        const base = last ? this.inherit(duplicatePayload(last)) : null;
        this.fill(base ?? this.empty(locationId));
        this.form.controls.location_id.setValue(locationId);
      }

      const draft = this.drafts.load<FormValue>(this.draftKey);
      if (draft) {
        this.setComponentsFromForm(draft.value.components);
        this.form.patchValue(draft.value);
        this.productId.set(draft.value.product_id);
        this.restored.set(true);
      }
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- Construcción del formulario ----------

  private empty(locationId: string): CurtainPayload {
    return {
      location_id: locationId, product_id: '', label: null, surface: '', surface_other: null, mounting: '',
      chain_side: '', chain_length_m: '', has_cenefa: false, swap_layers: false, notes: null, components: [], option_ids: [], accessories: [],
    };
  }

  /** Para «nueva» y «guardar y otra»: conserva producto y configuración; limpia medidas, nota y extras. */
  private inherit(p: CurtainPayload): CurtainPayload {
    return {
      ...p,
      id: undefined,
      label: null,
      notes: null,
      option_ids: [],
      accessories: [],
      components: p.components.map((c) => ({ ...c, width_cm: NaN, height_cm: NaN, motorized: false })),
    };
  }

  private fill(p: CurtainPayload): void {
    const chain = p.chain_length_m === '' ? '' : String(p.chain_length_m);
    this.setComponentsFromForm(
      p.components.map((c) => ({
        role: c.role,
        color_name: c.color_name ?? '',
        width_cm: Number.isFinite(c.width_cm) ? String(c.width_cm).replace('.', ',') : '',
        height_cm: Number.isFinite(c.height_cm) ? String(c.height_cm).replace('.', ',') : '',
        fall: c.fall ?? '',
        motorized: c.motorized,
      })),
    );
    this.form.patchValue({
      location_id: p.location_id,
      product_id: p.product_id,
      label: p.label ?? '',
      surface: p.surface,
      surface_other: p.surface_other ?? '',
      mounting: p.mounting,
      chain_side: p.chain_side,
      chain_length: chain === '' ? '' : CHAIN_PRESETS.includes(chain) ? chain : 'otro',
      chain_other: chain !== '' && !CHAIN_PRESETS.includes(chain) ? chain.replace('.', ',') : '',
      has_cenefa: p.has_cenefa,
      swap_layers: p.swap_layers,
      notes: p.notes ?? '',
      option_ids: p.option_ids,
      accessories: Object.fromEntries(p.accessories.map((a) => [a.accessory_id, a.quantity])),
    });
    this.productId.set(p.product_id);
  }

  private setComponentsFromForm(list: FormValue['components']): void {
    this.components.clear({ emitEvent: false });
    for (const c of list) {
      this.components.push(
        this.fb.group({
          role: this.fb.control<ComponentRole>(c.role),
          color_name: [c.color_name],
          width_cm: [c.width_cm],
          height_cm: [c.height_cm],
          fall: [c.fall ?? ''],
          motorized: [c.motorized],
        }),
        { emitEvent: false },
      );
    }
  }

  // ---------- Interacción ----------

  selectProduct(p: Product): void {
    const current = this.components.getRawValue().map((c) => ({
      role: c.role, color_name: c.color_name || null, width_cm: parseDecimal(c.width_cm), height_cm: parseDecimal(c.height_cm),
      fall: (c.fall || null) as Fall | null, motorized: c.motorized,
    }));
    const next = reshapeComponents(p, current);
    this.setComponentsFromForm(
      next.map((c) => ({
        role: c.role,
        color_name: c.color_name ?? '',
        width_cm: Number.isFinite(c.width_cm) && c.width_cm > 0 ? String(c.width_cm).replace('.', ',') : '',
        height_cm: Number.isFinite(c.height_cm) && c.height_cm > 0 ? String(c.height_cm).replace('.', ',') : '',
        fall: c.fall ?? '',
        motorized: c.motorized,
      })),
    );
    const validOptions = new Set(p.product_options.map((o) => o.id));
    this.form.patchValue({
      product_id: p.id,
      has_cenefa: p.cenefa_mode === 'incluida' ? true : p.cenefa_mode === 'no' ? false : this.form.controls.has_cenefa.value,
      option_ids: this.form.controls.option_ids.value.filter((id) => validOptions.has(id)),
      swap_layers: p.kind === 'sistema' ? this.form.controls.swap_layers.value : false,
      ...(p.has_mechanism ? {} : { chain_side: '', chain_length: '', chain_other: '' }),
    });
    this.productId.set(p.id);
  }

  label(role: ComponentRole): string {
    const p = this.product();
    return p ? componentLabel(role, p, this.catalog()?.products ?? [], this.form.controls.swap_layers.value) : '';
  }

  /** Invierte qué tela va atrás y cuál adelante en un doble (SE atrás/BO adelante o al revés). */
  swapLayers(): void {
    this.form.controls.swap_layers.setValue(!this.form.controls.swap_layers.value);
  }

  toggleOption(id: string): void {
    const cur = this.form.controls.option_ids.value;
    this.form.controls.option_ids.setValue(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  qty(id: string): number {
    return this.form.controls.accessories.value[id] ?? 0;
  }

  bump(id: string, delta: number): void {
    const cur = { ...this.form.controls.accessories.value };
    const next = Math.max(0, Math.min(50, (cur[id] ?? 0) + delta));
    if (next === 0) delete cur[id];
    else cur[id] = next;
    this.form.controls.accessories.setValue(cur);
  }

  issue(field: string): string | null {
    return this.submitted ? (this.issues().find((i) => i.field === field)?.message ?? null) : null;
  }

  discardDraft(): void {
    this.drafts.clear(this.draftKey);
    this.restored.set(false);
    this.loading.set(true);
    void this.ngOnInit();
  }

  // ---------- Guardar ----------

  buildPayload(): CurtainPayload {
    const v = this.form.getRawValue();
    const chain = v.chain_length === 'otro' ? parseDecimal(v.chain_other) : v.chain_length === '' ? NaN : Number(v.chain_length);
    return {
      id: this.curtainId ?? undefined,
      location_id: v.location_id,
      product_id: v.product_id,
      label: v.label.trim() || null,
      surface: v.surface as CurtainPayload['surface'],
      surface_other: v.surface === 'otro' ? v.surface_other.trim() || null : null,
      mounting: v.mounting as CurtainPayload['mounting'],
      chain_side: v.chain_side as CurtainPayload['chain_side'],
      chain_length_m: Number.isFinite(chain) ? chain : '',
      has_cenefa: v.has_cenefa,
      swap_layers: v.swap_layers,
      notes: v.notes.trim() || null,
      components: v.components.map((c) => ({
        role: c.role,
        color_name: c.color_name.trim() || null,
        width_cm: parseDecimal(c.width_cm),
        height_cm: parseDecimal(c.height_cm),
        fall: (c.fall || null) as Fall | null,
        motorized: c.motorized,
      })),
      option_ids: v.option_ids,
      accessories: Object.entries(v.accessories).map(([accessory_id, quantity]) => ({ accessory_id, quantity })),
    };
  }

  async save(andAnother: boolean): Promise<void> {
    this.submitted = true;
    this.error.set(null);
    const payload = this.buildPayload();
    const found = validateCurtain(payload, this.product());
    if (!payload.location_id) found.unshift({ field: 'location', message: 'Elige la ubicación.' });
    this.issues.set(found);
    if (found.length) {
      this.error.set('Revisa los campos marcados.');
      return;
    }
    this.saving.set(true);
    try {
      await this.repo.saveCurtain(payload);
      this.drafts.clear(this.draftKey);
      if (andAnother) {
        const locationId = payload.location_id;
        this.draftKey = `curtain:new:${this.rectId}:${locationId}`;
        this.drafts.clear(this.draftKey);
        this.fill(this.inherit({ ...payload, id: undefined }));
        this.submitted = false;
        this.issues.set([]);
        this.flash.set('Cortina guardada. Registra la siguiente.');
        if (!this.isNew) {
          await this.router.navigate(['/rectificaciones', this.rectId, 'cortinas', 'nueva'], { queryParams: { ubicacion: locationId } });
        }
        window.scrollTo({ top: 0 });
      } else {
        await this.router.navigate(['/rectificaciones', this.rectId]);
      }
    } catch (e) {
      this.error.set(
        navigator.onLine === false
          ? 'Sin señal. Lo escrito queda guardado en el teléfono; toca Guardar cuando vuelva la conexión.'
          : toUserMessage(e),
      );
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(): void {
    this.confirm().open();
  }

  async onDelete(): Promise<void> {
    if (!this.curtainId) return;
    this.saving.set(true);
    try {
      await this.repo.removeCurtain(this.curtainId);
      this.drafts.clear(this.draftKey);
      await this.router.navigate(['/rectificaciones', this.rectId]);
    } catch (e) {
      this.error.set(toUserMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
