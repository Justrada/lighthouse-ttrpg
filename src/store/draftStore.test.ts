import { describe, it, expect, beforeEach } from 'vitest';
import { useDraftStore } from './draftStore';
import { useRosterStore } from './rosterStore';
import { autoBuildCharacter } from '@/engine';

beforeEach(() => {
  useRosterStore.setState({ characters: [] } as never);
  useDraftStore.getState().discard();
});

describe('draftStore — overspend guard', () => {
  it('refuses to commit a hero whose stats + skills exceed the level budget', () => {
    // Build a fully-spent level-20 hero, then drop the level: the budget collapses
    // and the existing spend is now far over. (Repro of the level-down save bug.)
    const high = autoBuildCharacter({ name: 'Maxed', level: 20, archetype: 'magic' });
    useDraftStore.getState().editExisting(high);
    useDraftStore.getState().setLevel(1);
    expect(useDraftStore.getState().budget.available).toBeLessThan(0);

    const saved = useDraftStore.getState().commit();
    expect(saved).toBeNull();
    expect(useRosterStore.getState().characters).toHaveLength(0);
  });

  it('commits a balanced, within-budget hero normally', () => {
    const ok = autoBuildCharacter({ name: 'Fine', level: 5, archetype: 'balanced' });
    useDraftStore.getState().editExisting(ok);
    const saved = useDraftStore.getState().commit();
    expect(saved).not.toBeNull();
    expect(useRosterStore.getState().characters).toHaveLength(1);
  });
});
