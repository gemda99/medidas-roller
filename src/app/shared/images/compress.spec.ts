import { fitWithin } from './compress';

describe('fitWithin', () => {
  it('reduce fotos grandes manteniendo la proporción', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it('no agranda fotos chicas', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('tamaños inválidos dan cero', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});
