// Web fallback — Privy native SDK is iOS/Android only.
// This stub keeps the web bundle compiling and exposes the same shape
// the auth screen expects.
import React from "react";

export const PRIVY_AVAILABLE = false;

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function usePrivyEmailLogin() {
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

export function usePrivyState() {
  return { ready: true, authenticated: false, user: null as any };
}

export async function privyLogout() {
  return;
}

export function useEthEmbeddedWallet() {
  return { wallets: [] as { address: string; chainType: string }[], ready: true };
}
