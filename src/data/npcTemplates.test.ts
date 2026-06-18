import { describe, it, expect } from 'vitest';
import { NPC_TEMPLATES, findNpcTemplate } from './npcTemplates';
import { calculateDerivedStats } from '@/engine';

describe('NPC bestiary templates', () => {
  it('every foe enters at full, positive resources (never staged as "downed")', () => {
    for (const { character } of NPC_TEMPLATES) {
      const d = calculateDerivedStats(character);
      expect(character.currentHP, `${character.name} HP`).toBe(d.hp);
      expect(character.currentHP, `${character.name} HP > 0`).toBeGreaterThan(0);
      expect(character.currentMP, `${character.name} MP`).toBe(d.mp);
      expect(character.currentSP, `${character.name} SP`).toBe(d.sp);
    }
  });

  it('every template is a valid Character with the center node', () => {
    for (const { character } of NPC_TEMPLATES) {
      expect(character.learnedSkills).toContain('center-0');
      expect(character.inventory).toBeTruthy();
      expect(character.id.startsWith('npc-')).toBe(true);
    }
  });

  it('findNpcTemplate resolves by id (and misses cleanly)', () => {
    const first = NPC_TEMPLATES[0].character;
    expect(findNpcTemplate(first.id)?.id).toBe(first.id);
    expect(findNpcTemplate('does-not-exist')).toBeUndefined();
  });
});
