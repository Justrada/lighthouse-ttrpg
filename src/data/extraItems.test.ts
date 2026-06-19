import { describe, it, expect } from 'vitest';
import { findItem } from './skillTree';

describe('extraItems — Antitoxin advantage', () => {
  it('uses the engine-recognized advDis/targetSkill fields (not advantageType/appliesTo)', () => {
    const item = findItem('inv_x_antitoxin');
    expect(item).toBeTruthy();
    const eff = (item!.effects ?? []).find((e) => e.type === 'Give Advantage/Disadvantage') as
      | Record<string, unknown>
      | undefined;
    expect(eff).toBeTruthy();
    expect(eff!.advDis).toBe('Advantage');
    expect(eff!.targetSkill).toBe('Saving Throw');
  });
});
