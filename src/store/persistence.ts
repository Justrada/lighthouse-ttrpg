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
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or serialization failure — non-fatal */
  }
}
