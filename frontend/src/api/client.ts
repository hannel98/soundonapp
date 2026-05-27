import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "sound_auth_token";

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
