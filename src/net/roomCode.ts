/**
 * Room codes — the human-shareable identifier for a session.
 *
 * A room code is what the GM reads out loud and players type in. It must be:
 *  - short and easy to say/type (4–6 chars),
 *  - free of visually ambiguous characters (no `0/O`, `1/I/L`), and
 *  - deterministically mappable to the host's PeerJS id so a player who knows
 *    the code can connect without any other discovery mechanism.
 *
 * The mapping `code -> peerId` lives here ({@link peerIdForRoom}) so both the
 * GM (which constructs `new Peer(peerIdForRoom(code))`) and the player (which
 * calls `peer.connect(peerIdForRoom(code))`) agree on it.
 */

/**
 * Unambiguous alphabet for generated codes.
 *
 * Excludes `0 O 1 I L` to avoid read-aloud/typo confusion. Uppercase only so
 * codes are case-insensitive in practice (see {@link normalizeRoomCode}).
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const DEFAULT_LENGTH = 6;

/** Prefix applied when deriving a PeerJS id from a room code. */
const PEER_ID_PREFIX = 'lighthouse-';

/**
 * Characters that are legal *inside* a PeerJS id. PeerJS requires ids to match
 * `^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$` (alphanumerics, with single spaces /
 * dashes / underscores between them). Our normalized codes are alphanumeric, so
 * the derived id (`lighthouse-<code>`) is always valid.
 */

/**
 * Generate a fresh random room code.
 *
 * @param length number of characters, clamped to 4–6 (default 6).
 * @returns an uppercase code drawn from the unambiguous alphabet.
 *
 * Uses `crypto.getRandomValues` when available (browsers, modern Node) for
 * good entropy, falling back to `Math.random` only if the Web Crypto API is
 * absent. With a 31-char alphabet and length 6 there are ~31^6 ≈ 887M codes,
 * ample for collision-avoidance at TTRPG scale.
 */
export function generateRoomCode(length: number = DEFAULT_LENGTH): string {
  const len = Math.max(4, Math.min(6, Math.floor(length) || DEFAULT_LENGTH));
  const out: string[] = [];

  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(len);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < len; i++) {
      // Modulo bias across a 256-value byte over a 31-char alphabet is
      // negligible for non-cryptographic room-code purposes.
      out.push(ALPHABET[bytes[i] % ALPHABET.length]);
    }
  } else {
    for (let i = 0; i < len; i++) {
      out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
    }
  }

  return out.join('');
}

/**
 * Normalize user-entered codes into the canonical form.
 *
 * - Uppercases the input.
 * - Strips every character that is not in the unambiguous {@link ALPHABET}
 *   (spaces, dashes, punctuation, and the excluded look-alikes `0 O 1 I L`).
 *
 * The result therefore only ever contains canonical glyphs, which keeps the
 * `code -> peerId` mapping stable. Generated codes never contain ambiguous
 * characters, so a code that was read/typed correctly survives normalization
 * unchanged; only stray formatting is removed.
 *
 * @example
 * normalizeRoomCode('ab cd') === normalizeRoomCode('ABCD') // 'ABCD'
 * normalizeRoomCode('abc-234') // 'ABC234'
 */
export function normalizeRoomCode(s: string): string {
  if (typeof s !== 'string') return '';
  const upper = s.toUpperCase();
  let out = '';
  for (const ch of upper) {
    if (ALPHABET.includes(ch)) out += ch;
  }
  return out;
}

/**
 * Derive the host's PeerJS id from a room code.
 *
 * Both ends call this so they meet at the same broker id. The code is
 * normalized first, so `peerIdForRoom('ab cd')` === `peerIdForRoom('ABCD')`.
 *
 * @returns e.g. `"lighthouse-ABC234"`.
 */
export function peerIdForRoom(code: string): string {
  return PEER_ID_PREFIX + normalizeRoomCode(code);
}

/** The prefix used by {@link peerIdForRoom}; exported for tests/diagnostics. */
export const ROOM_PEER_ID_PREFIX = PEER_ID_PREFIX;
