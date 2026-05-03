/** Aide rapide — permissions micro (navigateurs courants) */
export const MIC_PERMISSION_SAFARI_HINT =
  "Safari : Réglages pour ce site web → Micro → Autoriser (ou Préférences Safari → Sites web → Micro).";

export const MIC_PERMISSION_CHROME_HINT =
  "Chrome / Edge : icône à gauche de l’URL → Paramètres du site → Micro → Autoriser.";

export function describeUserMediaError(err: unknown): { short: string; hint?: string } {
  const name = err && typeof err === "object" && "name" in err ? String((err as Error).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      short: "Accès au micro refusé.",
      hint: `${MIC_PERMISSION_CHROME_HINT} ${MIC_PERMISSION_SAFARI_HINT}`,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      short: "Aucun micro détecté.",
      hint: "Branche un micro ou choisis l’entrée audio par défaut dans les réglages du système.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      short: "Micro déjà utilisé ou inaccessible.",
      hint: "Ferme les autres onglets ou applis qui utilisent le micro (Zoom, Meet, Discord…).",
    };
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return {
      short: "Micro incompatible avec cette demande.",
      hint: "Essaie un autre navigateur ou un autre périphérique audio.",
    };
  }
  if (name === "SecurityError") {
    return {
      short: "Micro indisponible (contexte non sécurisé).",
      hint: "Utilise HTTPS ou localhost.",
    };
  }
  return {
    short: "Impossible d’activer le micro.",
    hint: MIC_PERMISSION_SAFARI_HINT,
  };
}

export function formatMicErrorToast(err: unknown): string {
  const { short, hint } = describeUserMediaError(err);
  return hint ? `${short} ${hint}` : short;
}

export function describeWebRtcConnectionClosed(state: string): string {
  if (state === "failed") {
    return "Connexion vocale impossible (réseau, VPN ou pare-feu). Réessaie sur un autre réseau.";
  }
  if (state === "disconnected") {
    return "Connexion vocale interrompue.";
  }
  return "Connexion vocale fermée.";
}

export function describeAudioAutoplayBlocked(): { short: string; hint: string } {
  return {
    short: "Lecture audio bloquée par le navigateur.",
    hint: "Clique une fois sur la page puis réessaie. Safari : vérifie que le son du site n’est pas coupé pour cet onglet.",
  };
}

export function formatAudioAutoplayToast(): string {
  const { short, hint } = describeAudioAutoplayBlocked();
  return `${short} ${hint}`;
}
