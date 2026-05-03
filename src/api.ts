const BASE_URL = '';

/** Chemins où un 401 est attendu pendant le flux d’auth (pas une « session expirée »). */
const AUTH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/login/2fa'];

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    const apiError = String((data as { error?: string })?.error || '');
    /** `/me` au chargement : visiteur ou cookie absent / invalide — pas de toast « session expirée ». */
    if (path.split('?')[0] === '/api/auth/me') {
      throw new Error(apiError || 'Non authentifié');
    }
    window.dispatchEvent(new CustomEvent('blindtest:session-expired'));
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  if (!res.ok) {
    throw new Error((data as any)?.error || `Erreur HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<{ user: { id: string; email: string; twoFactorEnabled: boolean } }>('POST', '/api/auth/register', { email, password }),

    login: (email: string, password: string) =>
      request<{ user?: { id: string; email: string; twoFactorEnabled: boolean }; requiresTwoFactor?: boolean }>('POST', '/api/auth/login', { email, password }),

    verifyLogin2fa: (code: string) =>
      request<{ user: { id: string; email: string; twoFactorEnabled: boolean } }>('POST', '/api/auth/login/2fa', { code }),

    me: () =>
      request<{ user: { id: string; email: string; twoFactorEnabled: boolean } }>('GET', '/api/auth/me'),

    logout: () =>
      request<{ success: boolean }>('POST', '/api/auth/logout'),

    setupTwoFactor: () =>
      request<{ secret: string; qrCodeDataUrl: string }>('POST', '/api/auth/2fa/setup'),

    enableTwoFactor: (code: string) =>
      request<{ success: boolean }>('POST', '/api/auth/2fa/enable', { code }),

    disableTwoFactor: (code: string) =>
      request<{ success: boolean }>('POST', '/api/auth/2fa/disable', { code }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ success: boolean }>('POST', '/api/auth/password/change', { currentPassword, newPassword }),
  },

  playlists: {
    storeList: (params?: { sort?: 'recent' | 'popular'; category?: string }) => {
      const query = new URLSearchParams();
      if (params?.sort) query.set('sort', params.sort);
      if (params?.category) query.set('category', params.category);
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return request<{ playlists: any[] }>('GET', `/api/playlists/store${suffix}`);
    },

    storeLikes: () =>
      request<{ likedPlaylistIds: string[] }>('GET', '/api/playlists/store/likes'),

    toggleStoreLike: (playlistId: string) =>
      request<{ success: boolean; liked: boolean }>('POST', `/api/playlists/${playlistId}/store/like`),

    trackStoreDownload: (playlistId: string) =>
      request<{ success: boolean }>('POST', `/api/playlists/${playlistId}/store/download`),

    list: () =>
      request<{ playlists: any[] }>('GET', '/api/playlists'),

    listPublic: () =>
      request<{ playlists: any[] }>('GET', '/api/playlists/public'),

    get: (id: string) =>
      request<{ playlist: any; permission?: 'view' | 'edit' }>('GET', `/api/playlists/${id}`),

    getWithCollab: (id: string, collabToken: string) =>
      request<{ playlist: any; permission?: 'view' | 'edit' }>('GET', `/api/playlists/${id}?collabToken=${encodeURIComponent(collabToken)}`),

    create: (name: string, tracks: unknown[] = [], visibility: string = 'private', category: string = 'general') =>
      request<{ playlist: any }>('POST', '/api/playlists', { name, tracks, visibility, category }),

    update: (id: string, data: { name?: string; tracks?: unknown[]; visibility?: string; category?: string }) =>
      request<{ success: boolean }>('PUT', `/api/playlists/${id}`, data),

    updateWithCollab: (
      id: string,
      collabToken: string,
      data: { name?: string; tracks?: unknown[]; visibility?: string; category?: string },
    ) => request<{ success: boolean }>('PUT', `/api/playlists/${id}`, { ...data, collabToken }),

    createCollabToken: (id: string) =>
      request<{ token: string; expiresAt: number; permission: 'view' | 'edit' }>('POST', `/api/playlists/${id}/collab-token`),

    createCollabTokenWithOptions: (
      id: string,
      data: { permission?: 'view' | 'edit'; expiresHours?: number },
    ) => request<{ token: string; expiresAt: number; permission: 'view' | 'edit' }>('POST', `/api/playlists/${id}/collab-token`, data),

    listCollabTokens: (id: string) =>
      request<{ tokens: Array<{ token: string; created_by: string; created_at: number; expires_at: number; permission: 'view' | 'edit'; revoked_at?: number | null }> }>(
        'GET',
        `/api/playlists/${id}/collab-tokens`,
      ),

    revokeCollabToken: (id: string, token: string) =>
      request<{ success: boolean }>('DELETE', `/api/playlists/${id}/collab-token/${encodeURIComponent(token)}`),

    delete: (id: string) =>
      request<{ success: boolean }>('DELETE', `/api/playlists/${id}`),

    upload: (playlistId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<{ url: string; filename: string; mimetype: string }>(
        'POST',
        `/api/playlists/${playlistId}/upload`,
        form,
        true,
      );
    },
  },

  hardware: {
    provisionConfig: () =>
      request<{ serverHost: string; serverPort: number }>(
        'GET',
        '/api/hardware/provision-config',
      ),

    claimDevice: (deviceId: string, name: string) =>
      request<{ success: boolean; deviceId: string; secret: string; isNew: boolean }>(
        'POST',
        '/api/hardware/devices',
        { deviceId, name },
      ),

    listDevices: () =>
      request<{ devices: { deviceId: string; name: string; firmware: string; createdAt: number }[] }>(
        'GET',
        '/api/hardware/devices',
      ),

    deleteDevice: (deviceId: string) =>
      request<{ success: boolean }>('DELETE', `/api/hardware/devices/${deviceId}`),
  },

  blindtests: {
    list: () =>
      request<{ blindtests: any[] }>('GET', '/api/blindtests'),

    create: (data: {
      title: string;
      mode: string;
      status?: string;
      gameId: string;
      hostToken?: string;
      playlistId?: string;
      sourceUrl?: string;
    }) => request<{ blindtest: any }>('POST', '/api/blindtests', data),

    update: (id: string, data: { status?: string; endedAt?: number }) =>
      request<{ success: boolean }>('PATCH', `/api/blindtests/${id}`, data),

    forceEnd: (id: string) =>
      request<{ success: boolean; endedAt: number }>('POST', `/api/blindtests/${id}/force-end`),

    stats: () =>
      request<{
        overview: {
          totalSessions: number;
          finishedSessions: number;
          activeSessions: number;
          avgSessionDurationMs: number;
          avgResponseMs: number;
          totalBuzzes: number;
          totalCorrect: number;
          totalWrong: number;
        };
        topFastPlayers: Array<{ id: string; name: string; buzzes: number; avgResponseMs: number }>;
        topFastTracks: Array<{
          trackIndex: number;
          title: string;
          artist: string;
          fastestBuzzMs?: number;
          revealedWithoutAnswer: number;
          wrongAnswers: number;
          totalBuzzes: number;
          correctAnswers: number;
        }>;
        topHardTracks: Array<{
          trackIndex: number;
          title: string;
          artist: string;
          fastestBuzzMs?: number;
          revealedWithoutAnswer: number;
          wrongAnswers: number;
          totalBuzzes: number;
          correctAnswers: number;
        }>;
        coverage: {
          sessionsWithRealtimeStats: number;
          totalSessions: number;
        };
      }>('GET', '/api/blindtests/stats'),
  },

  events: {
    listTournaments: () =>
      request<{ tournaments: any[] }>('GET', '/api/events/tournaments'),

    createTournament: (data: { name: string; startsAt?: number; endsAt?: number }) =>
      request<{ tournament: any }>('POST', '/api/events/tournaments', data),

    attachSessionToTournament: (tournamentId: string, blindtestId: string) =>
      request<{ success: boolean }>('POST', `/api/events/tournaments/${tournamentId}/sessions`, { blindtestId }),

    getTournamentLeaderboard: (tournamentId: string) =>
      request<{ tournament: any; sessions: any[]; leaderboard: any[] }>('GET', `/api/events/tournaments/${tournamentId}/leaderboard`),

    getBranding: (blindtestId: string) =>
      request<{ branding: any }>('GET', `/api/events/branding/${blindtestId}`),

    saveBranding: (
      blindtestId: string,
      data: { clientName?: string; logoUrl?: string; primaryColor?: string; accentColor?: string },
    ) => request<{ success: boolean }>('PUT', `/api/events/branding/${blindtestId}`, data),

    getBrandingByGame: (gameId: string) =>
      request<{ branding: any }>('GET', `/api/events/branding/by-game/${gameId}`),

    getReport: (blindtestId: string) =>
      request<{ blindtest: any; branding: any; kpi: any; topPlayers: any[] }>('GET', `/api/events/report/${blindtestId}`),
  },

  playerProfiles: {
    claim: (data: {
      publicId: string;
      nickname: string;
      gameId: string;
      playerName: string;
      score: number;
      buzzes: number;
      correctAnswers: number;
      wrongAnswers: number;
    }) => request<{ success: boolean }>('POST', '/api/player-profiles/claim', data),

    get: (publicId: string) =>
      request<{ profile: any }>('GET', `/api/player-profiles/${encodeURIComponent(publicId)}`),

    history: (publicId: string) =>
      request<{ sessions: any[] }>('GET', `/api/player-profiles/${encodeURIComponent(publicId)}/history`),
  },
};
