import { useMemo } from 'react';
import type { Character, Combatant } from '@/types';
import { useSessionStore } from '@/store';
import { useRosterStore } from '@/store';
import { findNpcTemplate } from '@/data/npcTemplates';

/**
 * Resolve the source {@link Character} for a combatant so its abilities, weapon,
 * and derived action count can be read. Players are matched by peerId/characterId
 * against the live party; GM-controlled NPCs by characterId against the roster.
 * Returns `undefined` for ad-hoc combatants with no backing character.
 */
export function useCombatantCharacter(combatant: Combatant | null | undefined): Character | undefined {
  const party = useSessionStore((s) => s.party);
  const activeCharacter = useSessionStore((s) => s.activeCharacter);
  const roster = useRosterStore((s) => s.characters);

  return useMemo(() => {
    if (!combatant) return undefined;
    // The local player's own character is the freshest source.
    if (activeCharacter && combatant.characterId === activeCharacter.id) return activeCharacter;

    if (combatant.peerId) {
      const fromParty = party.find((m) => m.peerId === combatant.peerId)?.character;
      if (fromParty) return fromParty;
    }
    if (combatant.characterId) {
      const fromPartyById = party.find((m) => m.character.id === combatant.characterId)?.character;
      if (fromPartyById) return fromPartyById;
      const fromRoster = roster.find((c) => c.id === combatant.characterId);
      if (fromRoster) return fromRoster;
      // NPC instances carry synthetic ids like "templateId#2"; fall back to the
      // base roster template so their abilities/weapon still resolve.
      const baseId = combatant.characterId.split('#')[0];
      if (baseId !== combatant.characterId) {
        const fromBase = roster.find((c) => c.id === baseId);
        if (fromBase) return fromBase;
      }
      // Finally, fall back to a drop-in bestiary template (which lives in
      // neither party nor roster) so staged foes' abilities/weapon resolve.
      const fromTemplate = findNpcTemplate(baseId);
      if (fromTemplate) return fromTemplate;
    }
    return undefined;
  }, [combatant, party, activeCharacter, roster]);
}
