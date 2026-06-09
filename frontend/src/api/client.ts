import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "sound_auth_token";

function filenameForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "audio.webm";
  if (m.includes("wav")) return "audio.wav";
  if (m.includes("mp3") || m.includes("mpeg")) return "audio.mp3";
  return "audio.m4a";
}

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, "")) || null;
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = false } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const api = {
  signup: (email: string, password: string, display_name?: string) =>
    request("/auth/signup", { method: "POST", body: { email, password, display_name } }),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: { email, password } }),
  googleSession: (session_id: string) =>
    request("/auth/google/session", { method: "POST", body: { session_id } }),
  me: () => request("/auth/me", { auth: true }),
  logout: () => request("/auth/logout", { method: "POST", auth: true }),

  artists: (featured?: boolean) =>
    request(featured ? "/artists?featured=true" : "/artists"),
  artist: (id: string) => request(`/artists/${id}`),
  tracks: () => request("/tracks"),
  beats: () => request("/beats"),
  videos: () => request("/videos"),
  news: () => request("/news"),
  trending: (period: "24h" | "7d" = "24h") =>
    request(`/trending?period=${period}`),

  audiusTrending: (limit = 20) => request(`/audius/trending?limit=${limit}`),
  audiusSearch: (q: string, limit = 20) =>
    request(`/audius/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  audiusStream: (track_id: string) =>
    request(`/audius/track/${track_id}/stream`),

  ttsGenerate: (text: string, voice: string = "alloy", speed: number = 1.0) =>
    request("/ai/tts", { method: "POST", body: { text, voice, speed }, auth: true }) as Promise<{
      audio_base64: string;
      mime_type: string;
      voice: string;
      model: string;
      tokens_spent?: number;
      balance?: number;
    }>,
  leaderboard: (sort: "balance" | "streak" | "xp" = "balance", limit = 20) =>
    request(`/leaderboard?sort=${sort}&limit=${limit}`),
  costs: () => request("/me/costs", { auth: true }) as Promise<Record<string, number>>,
  transactions: () => request("/me/transactions", { auth: true }),
  saveRecording: async (uri: string, mimeType: string, title: string, durationMs: number) => {
    const token = await getToken();
    const form = new FormData();
    if (uri.startsWith("blob:") || uri.startsWith("data:")) {
      const blob = await (await fetch(uri)).blob();
      form.append("audio", blob, filenameForMime(mimeType));
    } else {
      // @ts-ignore - RN-only form field shape
      form.append("audio", { uri, name: filenameForMime(mimeType), type: mimeType });
    }
    form.append("title", title);
    form.append("duration_ms", String(durationMs));
    const res = await fetch(`${BASE}/api/me/recordings`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form as any,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && (data.detail || data.message)) || `HTTP ${res.status}`);
    return data;
  },
  myRecordings: () => request("/me/recordings", { auth: true }),

  rhythmStart: (difficulty: "easy" | "normal" | "hard" = "normal") =>
    request("/games/rhythm/start", { method: "POST", body: { difficulty }, auth: true }) as Promise<{
      seed: string;
      difficulty: string;
      bpm: number;
      lanes: number;
      duration_ms: number;
      notes: { t_ms: number; lane: number }[];
    }>,
  rhythmSubmit: (
    seed: string,
    difficulty: string,
    score: number,
    max_combo: number,
    accuracy: number,
    duration_ms: number
  ) =>
    request("/games/rhythm/submit", {
      method: "POST",
      body: { seed, difficulty, score, max_combo, accuracy, duration_ms },
      auth: true,
    }) as Promise<{ tokens_awarded: number; xp_awarded: number; new_best: boolean; balance: number }>,
  rhythmLeaderboard: (difficulty: "easy" | "normal" | "hard" = "normal", limit = 10) =>
    request(`/games/rhythm/leaderboard?difficulty=${difficulty}&limit=${limit}`),

  // Albums + Social
  createAlbum: (name: string, theme: string, track_titles: string[], style?: string) =>
    request("/albums", { method: "POST", body: { name, theme, track_titles, style }, auth: true }),
  myAlbums: () => request("/me/albums", { auth: true }),
  feed: () => request("/feed", { auth: true }),
  createPost: (text: string, attach?: { track_id?: string; album_id?: string; recording_id?: string }) =>
    request("/posts", { method: "POST", body: { text, ...(attach || {}) }, auth: true }),
  likePost: (postId: string) =>
    request(`/posts/${postId}/like`, { method: "POST", auth: true }),
  sttUpload: async (uri: string, mimeType: string, language?: string) => {
    const token = await getToken();
    const form = new FormData();
    // React Native FormData accepts { uri, name, type } for native file uploads.
    // On web we receive a real Blob (uri starts with blob:); fetch it first.
    if (uri.startsWith("blob:") || uri.startsWith("data:")) {
      const blob = await (await fetch(uri)).blob();
      form.append("audio", blob, mimeType.includes("webm") ? "audio.webm" : "audio.m4a");
    } else {
      // @ts-ignore - RN-only form field shape
      form.append("audio", { uri, name: filenameForMime(mimeType), type: mimeType });
    }
    if (language) form.append("language", language);
    const res = await fetch(`${BASE}/api/ai/stt`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form as any,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && (data.detail || data.message)) || `HTTP ${res.status}`);
    return data as { text: string; language: string | null };
  },

  progress: () => request("/me/progress", { auth: true }),
  claimDaily: () => request("/me/claim-daily", { method: "POST", auth: true }),
  myStatuses: () => request("/me/statuses", { auth: true }),
  createStatus: (text: string) =>
    request("/me/statuses", { method: "POST", body: { text }, auth: true }),

  // Smartcar
  smartcarConnectUrl: (app_redirect?: string, mode?: string) =>
    request("/smartcar/connect-url", {
      method: "POST",
      body: { app_redirect, mode },
      auth: true,
    }) as Promise<{ url: string; mode: string; redirect_uri: string }>,
  smartcarStatus: () =>
    request("/smartcar/status", { auth: true }) as Promise<{
      connected: boolean;
      mode?: string;
      updated_at?: string;
      expires_at?: string;
      latest?: any;
    }>,
  smartcarVehicle: () => request("/smartcar/vehicle", { auth: true }),
  smartcarDisconnect: () => request("/smartcar/disconnect", { method: "POST", auth: true }),
  smartcarLogTrip: (trip: {
    miles: number;
    duration_s: number;
    avg_speed_mph?: number;
    max_speed_mph?: number;
    hard_brake_events?: number;
    hard_accel_events?: number;
    speeding_seconds?: number;
    night_driving_seconds?: number;
    location_start?: { lat: number; lng: number };
    location_end?: { lat: number; lng: number };
  }) =>
    request("/smartcar/log-trip", { method: "POST", body: trip, auth: true }) as Promise<{
      trip: any;
      safety_score: number;
      sound_awarded: number;
      balance: number | null;
    }>,
  smartcarTrips: (limit = 30) =>
    request(`/smartcar/trips?limit=${limit}`, { auth: true }) as Promise<{ trips: any[]; stats: any }>,
  smartcarMeshShare: (kind: "track" | "album" | "trip" | "chat", payload: any) =>
    request("/smartcar/mesh/share", {
      method: "POST",
      body: { kind, payload },
      auth: true,
    }),
  smartcarMeshIncoming: () =>
    request("/smartcar/mesh/incoming", { auth: true }) as Promise<any[]>,

  // IAP
  iapCatalog: () =>
    request("/iap/catalog") as Promise<{
      token_packs: { product_id: string; tokens: number; price: string; label: string }[];
      subscriptions: { product_id: string; price: string; duration_days: number; label: string }[];
      token_costs?: Record<string, number>;
      pro_perks?: string[];
    }>,
  iapSpend: (action: "upload_music" | "ai_album_cover" | "go_live", ref?: any) =>
    request("/iap/spend", { method: "POST", body: { action, ref }, auth: true }) as Promise<{
      ok: boolean;
      cost: number;
      balance: number | null;
      pro: boolean;
    }>,
  iapValidate: (body: {
    platform: "ios" | "android";
    product_id: string;
    transaction_id?: string;
    purchase_token?: string;
    receipt?: string;
    is_subscription?: boolean;
  }) =>
    request("/iap/validate", { method: "POST", body, auth: true }) as Promise<{
      ok: boolean;
      already_processed: boolean;
      granted: any;
      balance: number | null;
      verify_method?: string;
    }>,
  iapSubscription: () =>
    request("/iap/subscription", { auth: true }) as Promise<{
      active: boolean;
      tier?: string;
      expires_at?: string;
    }>,

  // Collab finder
  collabMeta: () =>
    request("/collab/meta") as Promise<{
      roles: string[];
      genres: string[];
      location_prefs: string[];
      contact_types: string[];
    }>,
  collabList: (params?: { role?: string; genre?: string; location_pref?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.role) q.set("role", params.role);
    if (params?.genre) q.set("genre", params.genre);
    if (params?.location_pref) q.set("location_pref", params.location_pref);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request(`/collab/posts${qs ? `?${qs}` : ""}`) as Promise<any[]>;
  },
  collabCreate: (body: any) =>
    request("/collab/posts", { method: "POST", body, auth: true }),
  collabGet: (id: string) =>
    request(`/collab/posts/${id}`, { auth: true }) as Promise<any>,
  collabApply: (id: string, body: any) =>
    request(`/collab/posts/${id}/apply`, { method: "POST", body, auth: true }),
  collabApplications: (id: string) =>
    request(`/collab/posts/${id}/applications`, { auth: true }) as Promise<any[]>,
  collabRespond: (appId: string, action: "accept" | "decline") =>
    request(`/collab/applications/${appId}/respond`, {
      method: "POST",
      body: { action },
      auth: true,
    }),
  collabMine: () =>
    request("/collab/me", { auth: true }) as Promise<{ posts: any[]; applications: any[] }>,

  // Lyrics comparator
  lyricsArtists: () =>
    request("/lyrics/artists") as Promise<{ name: string; genre: string; keywords: string[] }[]>,
  lyricsAnalyze: (body: { lyrics: string; artist: string; save?: boolean; title?: string }) =>
    request("/lyrics/analyze", { method: "POST", body, auth: true }) as Promise<any>,
  lyricsHistory: () => request("/lyrics/history", { auth: true }) as Promise<any[]>,

  // Privy
  privyStatus: () =>
    request("/privy/status") as Promise<{ configured: boolean; app_id_present: boolean }>,
  privyLogin: (id_token: string) =>
    request("/privy/login", { method: "POST", body: { id_token } }) as Promise<{
      access_token: string;
      user_id: string;
      email: string;
      display_name?: string;
    }>,
  privyWallets: () =>
    request("/privy/wallets", { auth: true }) as Promise<{ wallets: any[]; privy_did: string }>,

  // My tracks (record + upload)
  myTracks: () => request("/me/tracks", { auth: true }) as Promise<any[]>,
  uploadTrack: (body: {
    title: string;
    genre?: string;
    bpm?: number;
    mime: string;
    duration_s?: number;
    audio_b64: string;
    cover_url?: string;
    cover_b64?: string;
    source?: "record" | "upload";
    is_beat?: boolean;
  }) =>
    request("/me/tracks", { method: "POST", body, auth: true }) as Promise<{
      track: any;
      sound_awarded: number;
      balance: number;
    }>,
  deleteMyTrack: (id: string) =>
    request(`/me/tracks/${id}`, { method: "DELETE", auth: true }),
  myTrackAudioUrl: (id: string) => `${BASE}/api/me/tracks/${id}/audio`,

  // Promo (Base mainnet native ETH claim, first N wallets)
  promoStatus: (wallet_address?: string) => {
    const qs = wallet_address ? `?wallet_address=${wallet_address}` : "";
    return request(`/promo/status${qs}`) as Promise<{
      slots_taken: number;
      slots_left: number;
      total_slots: number;
      reward_eth: number;
      chain_id: number;
      rpc: string;
      my_claim: { slot: number; tx_hash: string; timestamp: number } | null;
      funded: boolean;
    }>;
  },
  promoClaim: (wallet_address: string) =>
    request("/promo/claim", {
      method: "POST",
      body: { wallet_address },
      auth: true,
    }) as Promise<{
      ok: boolean;
      wallet: string;
      tx_hash: string;
      slot: number;
      slots_left: number;
      reward_eth: number;
      explorer_url: string;
    }>,
  promoRecent: () => request("/promo/recent") as Promise<any[]>,

  ytFeatured: (limit = 6) =>
    request(`/youtube/featured?limit=${limit}`) as Promise<
      {
        handle: string;
        channel_id: string;
        display_name: string;
        url: string;
        category: string;
        videos: { video_id: string; title: string; url: string; thumb_url: string; published: string }[];
      }[]
    >,

  adReward: (placement: string) =>
    request("/ads/reward", { method: "POST", body: { placement }, auth: true }) as Promise<{
      ok: boolean;
      sound_awarded: number;
      balance: number;
    }>,
};

export type User = {
  user_id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  providers: string[];
};
