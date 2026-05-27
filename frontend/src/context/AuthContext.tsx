import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, clearToken, setToken, User } from "@/src/api/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPrivyToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.access_token);
    setUser(res.user);
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const res = await api.signup(email, password, displayName);
    await setToken(res.access_token);
    setUser(res.user);
  };

  const signInWithGoogle = async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? `${window.location.origin}/`
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) return;

    const parsed = Linking.parse(result.url);
    let sessionId: string | undefined =
      (parsed.queryParams?.session_id as string | undefined) ||
      undefined;

    if (!sessionId) {
      // Check fragment
      const hashMatch = result.url.match(/[#&]session_id=([^&]+)/);
      if (hashMatch) sessionId = decodeURIComponent(hashMatch[1]);
    }
    if (!sessionId) throw new Error("No session_id returned");

    const res = await api.googleSession(sessionId);
    await setToken(res.access_token);
    setUser(res.user);
  };

  const signInWithPrivyToken = async (idToken: string) => {
    // Exchange Privy id_token for our internal JWT via /api/privy/login
    const res = await api.privyLogin(idToken);
    await setToken(res.access_token);
    await refresh();
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signInWithPrivyToken, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
