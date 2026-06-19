import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldpackStore } from './worldpackStore';
import { createEmptyWorldpack } from '@/lib/worldpack';

beforeEach(() => {
  useWorldpackStore.setState({ worldpacks: [], activeId: null });
});

describe('worldpackStore', () => {
  it('imports a published pack as a private draft with a fresh id', () => {
    const src = { ...createEmptyWorldpack({ name: 'Sold System' }), published: true, price: 50 };
    const pack = useWorldpackStore.getState().importPack(JSON.stringify(src));
    expect(pack).toBeTruthy();
    expect(pack!.published).toBe(false); // imports start unlisted
    expect(pack!.id).not.toBe(src.id); // fresh id, no clobber
    expect(pack!.name).toBe('Sold System');
    expect(useWorldpackStore.getState().worldpacks).toHaveLength(1);
  });

  it('rejects invalid import input', () => {
    expect(useWorldpackStore.getState().importPack('not json')).toBeNull();
    expect(useWorldpackStore.getState().importPack(42)).toBeNull();
    expect(useWorldpackStore.getState().worldpacks).toHaveLength(0);
  });

  it('clears activeId when the active pack is removed', () => {
    const p = createEmptyWorldpack({ name: 'A' });
    useWorldpackStore.getState().save(p);
    useWorldpackStore.getState().setActive(p.id);
    expect(useWorldpackStore.getState().activeId).toBe(p.id);
    useWorldpackStore.getState().remove(p.id);
    expect(useWorldpackStore.getState().activeId).toBeNull();
  });

  it('duplicates a pack as an unlisted copy with a new id', () => {
    const p = { ...createEmptyWorldpack({ name: 'Orig' }), published: true };
    useWorldpackStore.getState().save(p);
    const copy = useWorldpackStore.getState().duplicate(p.id);
    expect(copy).toBeTruthy();
    expect(copy!.id).not.toBe(p.id);
    expect(copy!.published).toBe(false);
    expect(copy!.name).toContain('copy');
  });
});
