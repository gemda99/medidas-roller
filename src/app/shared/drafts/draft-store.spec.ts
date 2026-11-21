import { DraftStore } from './draft-store';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('DraftStore', () => {
  it('guarda, recupera y borra un borrador', () => {
    const s = new DraftStore(new MemoryStorage());
    s.save('cortina:1', { ancho: 170 }, 1000);
    expect(s.load<{ ancho: number }>('cortina:1', 2000)).toEqual({ value: { ancho: 170 }, savedAt: 1000 });
    s.clear('cortina:1');
    expect(s.load('cortina:1')).toBeNull();
  });

  it('descarta borradores de más de 7 días', () => {
    const s = new DraftStore(new MemoryStorage());
    s.save('x', 1, 0);
    expect(s.load('x', 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('no falla si el almacenamiento no existe o está lleno', () => {
    const none = new DraftStore(null);
    none.save('x', 1);
    expect(none.load('x')).toBeNull();
    const full = new MemoryStorage();
    full.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => new DraftStore(full).save('x', 1)).not.toThrow();
  });

  it('ignora datos corruptos', () => {
    const st = new MemoryStorage();
    st.setItem('mr:draft:x', '{no es json');
    expect(new DraftStore(st).load('x')).toBeNull();
  });
});
