const BASE_URL = '';

/** Chemins qui peuvent légitimement retourner 401 sans déclencher de redirection */
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

  // Interceptor 401 : session expirée → redirection vers la home
  if (res.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    // Émet un événement global pour que les composants puissent réagir
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
      request<{ playlist: any }>('GET', `/api/playlists/${id}`),

    getWithCollab: (id: string, collabToken: string) =>
      request<{ playlist: any }>('GET', `/api/playlists/${id}?collabToken=${encodeURIComponent(collabToken)}`),

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
      request<{ token: string; expiresAt: number }>('POST', `/api/playlists/${id}/collab-token`),

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
  },
};
