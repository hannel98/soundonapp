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
    }>,
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
};

export type User = {
  user_id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  providers: string[];
};
