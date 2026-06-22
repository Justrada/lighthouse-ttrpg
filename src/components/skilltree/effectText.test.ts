import { describe, it, expect } from 'vitest';
import type { SkillEffect } from '@/types';
import { describeEffect } from './effectText';

// The description must read the SAME fields the engine (combat.ts) acts on, so
// what a player reads matches what actually happens. These guard against the
// display/engine field-name drift that previously made base content show generic
// or "?" text for saves, advantage, forced movement, drain, and substitution.
const eff = (e: Partial<SkillEffect>): SkillEffect => ({ id: 'e1', type: 'Apply Damage', ...e } as SkillEffect);

describe('describeEffect reads the engine field names', () => {
  it('renders a saving throw from saveSkill/saveDC/saveOutcome', () => {
    const s = describeEffect(
      eff({ additionalDamage: '2d6', savingThrowEnabled: true, saveSkill: 'Survival', saveDC: 14, saveOutcome: 'Halve' }),
    );
    expect(s).toContain('Survival save');
    expect(s).toContain('DC 14');
    expect(s).toContain('half on success');
  });

  it('renders drain from resourceDrainedFromTarget', () => {
    const s = describeEffect(eff({ additionalDamage: '1d6', drainResourceEnabled: true, resourceDrainedFromTarget: 'MP' }));
    expect(s).toContain('drains MP');
  });

  it('renders advantage from advDis + targetSkill', () => {
    const s = describeEffect(eff({ type: 'Give Advantage/Disadvantage', advDis: 'Disadvantage', targetSkill: 'Attack Roll' }));
    expect(s).toContain('Disadvantage');
    expect(s).toContain('Attack Roll');
  });

  it('renders forced movement from direction + rows', () => {
    const s = describeEffect(eff({ type: 'Move Target', direction: 'Away From', rows: 3 }));
    expect(s).toContain('Away From');
    expect(s).toContain('3');
  });

  it('renders substitution from resourceGained/resourceDrained', () => {
    const s = describeEffect(eff({ type: 'Substitute Cost', resourceGained: 'MP', resourceDrained: 'HP' }));
    expect(s).toBe('Pay HP in place of MP');
  });
});
