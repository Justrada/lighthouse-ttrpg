/**
 * Cross-cutting action helpers that combine engine rolls with network broadcast
 * and UI feedback. Screens call these instead of re-implementing dice/check
 * plumbing, so the network protocol is used consistently everywhere.
 */
import { nanoid } from 'nanoid';
import { roll as engineRoll, rollD20 } from '@/engine';
import type { AdvantageMode, DiceRollResult } from '@/types';
import { useSessionStore, type PendingCheck } from './sessionStore';
import { useUIStore } from './uiStore';

function rollerName(): string {
  const s = useSessionStore.getState();
  return s.selfName || (s.role === 'gm' ? 'GM' : 'Adventurer');
}

export interface RollOptions {
  notation?: string;
  d20?: { mode: AdvantageMode; modifier: number };
  secret?: boolean;
}

/** Roll dice, surface it in the local feed, and broadcast it to the table. */
export function performRoll(opts: RollOptions): DiceRollResult & { roller: string } {
  const base = opts.d20
    ? rollD20(opts.d20.mode, opts.d20.modifier)
    : engineRoll((opts.notation ?? '').trim() || '1d20');
  const roller = rollerName();
  const result = { ...base, roller };
  useUIStore.getState().recordRoll(result);
  useSessionStore.getState().send({ type: 'dice_roll', payload: { ...base, roller, secret: opts.secret } });
  return result;
}

/** GM asks a specific player to make a skill check. Returns the request id. */
export function requestCheck(targetPeerId: string, skill: string, dc?: number): string {
  const id = nanoid(8);
  useSessionStore.getState().send({ type: 'check_request', payload: { id, skill, dc, targetPeerId } });
  return id;
}

/** Player answers a pending check; rolls d20 + modifier and reports the result. */
export function respondToCheck(
  check: PendingCheck,
  modifier: number,
  mode: AdvantageMode = 'normal',
): DiceRollResult & { success?: boolean } {
  const res = rollD20(mode, modifier);
  const success = check.dc != null ? res.total >= check.dc : undefined;
  const roller = rollerName();
  useUIStore.getState().recordRoll({ ...res, roller });
  useSessionStore.getState().send({
    type: 'check_result',
    payload: { id: check.id, skill: check.skill, total: res.total, dc: check.dc, success, roller },
  });
  useSessionStore.getState().setPendingCheck(null);
  return { ...res, success };
}
