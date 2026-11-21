import { Injectable } from '@angular/core';

const PREFIX = 'mr:draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface Draft<T> {
  value: T;
  savedAt: number;
}

/**
 * Borradores locales (HU-19): lo escrito se guarda en el teléfono mientras se edita,
 * para no perderlo si se cae la señal, se cierra la app o se recarga la página.
 * Se borra al guardar con éxito. Vence a los 7 días.
 */
@Injectable({ providedIn: 'root', useFactory: () => new DraftStore(DraftStore.defaultStorage()) })
export class DraftStore {
  constructor(private readonly storage: Storage | null = DraftStore.defaultStorage()) {}

  static defaultStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T, now = Date.now()): void {
    try {
      this.storage?.setItem(PREFIX + key, JSON.stringify({ value, savedAt: now } satisfies Draft<T>));
    } catch {
      // Sin espacio o almacenamiento bloqueado: la app sigue funcionando sin borrador.
    }
  }

  load<T>(key: string, now = Date.now()): Draft<T> | null {
    try {
      const raw = this.storage?.getItem(PREFIX + key);
      if (!raw) return null;
      const d = JSON.parse(raw) as Draft<T>;
      if (typeof d?.savedAt !== 'number' || now - d.savedAt > MAX_AGE_MS) {
        this.clear(key);
        return null;
      }
      return d;
    } catch {
      return null;
    }
  }

  clear(key: string): void {
    try {
      this.storage?.removeItem(PREFIX + key);
    } catch {
      /* nada que hacer */
    }
  }
}
