/**
 * Tiny console-backed logger for the app shell (NOT the pure engine, which emits
 * domain log entries as data and must stay console-free).
 *
 * `debug`/`info` are silenced outside dev to keep production quiet; `warn`/`error`
 * always emit — a swallowed persistence failure or a crashing inbound message is
 * exactly the kind of silent failure you need visible even in the deployed build.
 * There is no telemetry backend, so this is deliberately console-based; tests
 * assert against it with `vi.spyOn(console, 'warn' | 'error')`.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const isDev = (() => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
})();

function emit(level: Level, scope: string, message: string, ...rest: unknown[]): void {
  // debug/info are noise in prod; warn/error are silent-failure diagnostics — keep them.
  if (!isDev && (level === 'debug' || level === 'info')) return;
  // eslint-disable-next-line no-console
  console[level](`[${scope}] ${message}`, ...rest);
}

export const logger = {
  debug: (scope: string, message: string, ...rest: unknown[]) => emit('debug', scope, message, ...rest),
  info: (scope: string, message: string, ...rest: unknown[]) => emit('info', scope, message, ...rest),
  warn: (scope: string, message: string, ...rest: unknown[]) => emit('warn', scope, message, ...rest),
  error: (scope: string, message: string, ...rest: unknown[]) => emit('error', scope, message, ...rest),
};
