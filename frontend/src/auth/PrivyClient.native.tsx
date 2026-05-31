// Gated native loader.
// `@privy-io/expo` pulls `viem` which calls Node-only `crypto.isKeyObject`
// at import time. In Expo Go (where native modules aren't built-in) this
// crashes the bundle. So:
//   * If we're in Expo Go => behave like the web stub (no Privy)
//   * Otherwise (dev / production native build) => load the real SDK
import React from "react";
import Constants from "expo-constants";

const isExpoGo = Constants.executionEnvironment === "storeClient";

let PrivyMod: any = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    PrivyMod = require("@privy-io/expo");
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[Privy] native SDK not available:", (e as Error)?.message);
    }
    PrivyMod = null;
  }
}

export const PRIVY_AVAILABLE = !!PrivyMod;

const PRIVY_APP_ID =
  (process.env.EXPO_PUBLIC_PRIVY_APP_ID as string | undefined) ||
  ((Constants.expoConfig?.extra as any)?.privyAppId as string | undefined) ||
  "cmph5sy0r00om0bldredscqru";

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  if (!PrivyMod?.PrivyProvider) return <>{children}</>;
  const Provider = PrivyMod.PrivyProvider;
  return <Provider appId={PRIVY_APP_ID}>{children}</Provider>;
}

export function usePrivyEmailLogin() {
  if (!PrivyMod?.useLoginWithEmail) {
    return {
      sendCode: async (_email: string) => {
        throw new Error("Privy login is only available on iOS/Android dev builds");
      },
      loginWithCode: async (_code: string): Promise<string> => {
        throw new Error("Privy login is only available on iOS/Android dev builds");
      },
      state: { status: "initial" },
    };
  }
  // Privy hook
  const { sendCode, loginWithCode, state } = PrivyMod.useLoginWithEmail();
  return {
    sendCode: async (email: string) => {
      await sendCode({ email });
    },
    loginWithCode: async (code: string): Promise<string> => {
      await loginWithCode({ code });
      const getToken = PrivyMod.getAccessToken;
      const token = getToken ? await getToken() : null;
      if (!token) throw new Error("Privy did not return an access token");
      return token;
    },
    state,
  };
}

export function usePrivyState() {
  if (!PrivyMod?.usePrivy) return { ready: true, authenticated: false, user: null as any };
  const p = PrivyMod.usePrivy();
  return {
    ready: (p as any).isReady ?? true,
    authenticated: (p as any).user != null,
    user: (p as any).user,
  };
}

export async function privyLogout() {
  return;
}

export function useEthEmbeddedWallet() {
  if (!PrivyMod?.useEmbeddedEthereumWallet) {
    return { wallets: [] as { address: string; chainType: string }[], ready: true };
  }
  const w = PrivyMod.useEmbeddedEthereumWallet();
  const ws = (w as any).wallets || [];
  return {
    wallets: ws.map((x: any) => ({ address: x.address, chainType: "ethereum" })),
    ready: (w as any).isReady ?? true,
  };
}
