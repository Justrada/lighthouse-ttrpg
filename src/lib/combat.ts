import type { CombatPhase, CombatState } from '@/types';

const PHASES: CombatPhase[] = ['setup', 'declare', 'resolving', 'between', 'ended'];

/**
 * Coerce an untrusted combat snapshot (received from the GM over the wire) into a
 * structurally-valid {@link CombatState}. Players apply host snapshots wholesale,
 * so a malformed payload — missing `combatants`, a bad `phase`, etc. — would
 * otherwise crash every selector that does `combat.combatants.filter(...)`. This
 * guards the top-level shape; combatant interiors are trusted as the GM is
 * authoritative.
 */
export function normalizeCombatState(raw: unknown): CombatState {
  const r = (raw ?? {}) as Partial<CombatState>;
  const obj = <T>(v: unknown, fallback: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback;

  return {
    isActive: Boolean(r.isActive),
    phase: PHASES.includes(r.phase as CombatPhase) ? (r.phase as CombatPhase) : 'declare',
    round: Number.isFinite(r.round as number) ? (r.round as number) : 1,
    combatants: Array.isArray(r.combatants) ? r.combatants : [],
    declaredActions: obj(r.declaredActions, {}),
    lockedActions: obj(r.lockedActions, {}),
    resolutionQueue: Array.isArray(r.resolutionQueue) ? r.resolutionQueue : [],
    activeResolutionIndex: Number.isFinite(r.activeResolutionIndex as number)
      ? (r.activeResolutionIndex as number)
      : -1,
    log: Array.isArray(r.log) ? r.log : [],
  };
}
