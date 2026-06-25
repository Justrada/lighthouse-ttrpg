import { logger } from '@/lib/logger';

/** Tiny, crash-safe localStorage helpers. All app keys share one prefix. */
const PREFIX = 'lighthouse:';

export const KEYS = {
  characters: 'characters',
  draft: 'draft',
  prefs: 'prefs',
  lastSession: 'lastSession',
  worldpacks: 'worldpacks',
  activeWorldpack: 'activeWorldpack',
} as const;

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // A stored literal "null" parses to null — treat it as missing so callers
    // that read properties off the result can't crash on it.
    return parsed == null ? fallback : (parsed as T);
  } catch (err) {
    // Corrupt persisted JSON: fall back, but surface it — otherwise a user with
    // damaged storage silently "loses" their data with no trace.
    logger.warn('persistence', `loadJSON failed for "${key}" — using fallback`, err);
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    // Quota / private-mode / serialization failure: non-fatal, but a silently
    // dropped save means lost work on reload — make it visible.
    logger.warn('persistence', `saveJSON failed for "${key}"`, err);
  }
}
