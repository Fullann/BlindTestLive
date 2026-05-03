/**
 * Clés sensibles à ne jamais afficher dans la console (dev), même en debug.
 * Étendre si de nouveaux secrets transitent dans des payloads loggés.
 */
const SECRET_KEYS = new Set([
  'hostToken',
  'cohostToken',
  'playerSecret',
  'host_token',
  'player_secret',
  'token',
  'password',
  'sdp',
]);

const REDACTED = '[redacted]';

export function redactSecretsForLog(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecretsForLog(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k) ? REDACTED : redactSecretsForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

const isProd =
  typeof import.meta !== 'undefined' &&
  (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD === true;

/** Log de debug : uniquement hors production, secrets masqués. */
export function devLog(...args: unknown[]) {
  if (isProd) return;
  console.log(
    ...args.map((a) => (typeof a === 'object' && a !== null ? redactSecretsForLog(a) : a)),
  );
}

export function devWarn(label: string, payload?: unknown) {
  if (isProd) return;
  if (payload !== undefined) console.warn(label, redactSecretsForLog(payload));
  else console.warn(label);
}
