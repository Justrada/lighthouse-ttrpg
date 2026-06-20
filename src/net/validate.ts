import type { GameMessage, GameMessageType } from '@/types';

/**
 * Structural validation for inbound wire messages.
 *
 * The network layer never trusts data coming off the wire. A remote peer (or a
 * man-in-the-middle, or a buggy/old client) can send anything, so before a
 * payload is surfaced to the rest of the app it must be proven to be a
 * well-formed {@link GameMessage}. Anything that fails these checks is dropped
 * silently by the transports.
 *
 * Scope: this guard validates *structure* — that the value is an object with a
 * known `type` discriminant and a `payload` property of the right broad shape.
 * It deliberately does NOT deep-validate every field of every payload (that
 * would couple the net layer to the full domain model). Rendering-layer
 * escaping / sanitization of string content is handled elsewhere. The contract
 * here is: "if `isGameMessage` returns true, it is safe to `switch` on
 * `message.type` and the variant's `payload` exists."
 */

/**
 * The complete set of valid {@link GameMessageType} discriminants.
 *
 * Kept as a runtime `Set` (the compile-time `GameMessageType` union cannot be
 * enumerated at runtime). The `satisfies` clause below ties this list back to
 * the type so that adding a new message variant to the protocol without adding
 * it here is a compile error.
 */
const MESSAGE_TYPES = [
  'hello',
  'player_join',
  'player_leave',
  'character_update',
  'party_sync',
  'system_sync',
  'combat_start',
  'combat_update',
  'combat_patch',
  'combat_end',
  'declare_actions',
  'lock_actions',
  'resource_change',
  'condition_update',
  'rest',
  'check_request',
  'check_result',
  'dice_roll',
  'log',
  'heartbeat',
  'heartbeat_ack',
] as const;

// Compile-time guarantee that the runtime list exactly covers the union.
// If a GameMessageType is added/removed, one of these two checks fails to build.
type _ListCoversUnion = GameMessageType extends (typeof MESSAGE_TYPES)[number]
  ? true
  : ['missing message type in MESSAGE_TYPES', Exclude<GameMessageType, (typeof MESSAGE_TYPES)[number]>];
type _UnionCoversList = (typeof MESSAGE_TYPES)[number] extends GameMessageType
  ? true
  : ['unknown message type in MESSAGE_TYPES', Exclude<(typeof MESSAGE_TYPES)[number], GameMessageType>];
// These are evaluated only at type-check time; assigning `true` proves both directions.
const _listCoversUnion: _ListCoversUnion = true;
const _unionCoversList: _UnionCoversList = true;
void _listCoversUnion;
void _unionCoversList;

const MESSAGE_TYPE_SET: ReadonlySet<string> = new Set(MESSAGE_TYPES);

/** True for a known {@link GameMessageType} discriminant string. */
export function isGameMessageType(x: unknown): x is GameMessageType {
  return typeof x === 'string' && MESSAGE_TYPE_SET.has(x);
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Structural type guard for {@link GameMessage}.
 *
 * Returns true only when `x` is a plain object with:
 *  - a `type` that is one of the known message discriminants, and
 *  - a `payload` property that is an object (every variant in the protocol
 *    carries an object payload — including `combat_end`'s empty record).
 *
 * Use this on every inbound payload before emitting a `'message'`
 * transport event.
 */
export function isGameMessage(x: unknown): x is GameMessage {
  if (!isPlainObject(x)) return false;
  if (!isGameMessageType(x.type)) return false;
  // Every variant of GameMessage carries an object `payload`. We require its
  // presence and object-ness but intentionally do not deep-validate fields.
  if (!isPlainObject(x.payload)) return false;
  return true;
}
