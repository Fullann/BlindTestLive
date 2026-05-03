/**
 * Même logique que `src/lib/redactSecrets.ts` : journaux / audit sans fuiter de secrets.
 */
const SECRET_KEYS = new Set([
  "hostToken",
  "cohostToken",
  "playerSecret",
  "host_token",
  "player_secret",
  "token",
  "password",
  "sdp",
]);

const REDACTED = "[redacted]";

export function redactSecretsForLog(value: unknown, depth = 0): unknown {
  if (depth > 10) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecretsForLog(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k) ? REDACTED : redactSecretsForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Objet plat pour auditLog après redaction des clés sensibles. */
export function redactAuditPayload(data: Record<string, unknown>): Record<string, unknown> {
  return redactSecretsForLog(data) as Record<string, unknown>;
}
