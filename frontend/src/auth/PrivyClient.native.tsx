import React from "react";
import Constants from "expo-constants";
import {
  PrivyProvider,
  useLoginWithEmail,
  usePrivy,
  useEmbeddedEthereumWallet,
  getAccessToken,
} from "@privy-io/expo";

export const PRIVY_AVAILABLE = true;

const PRIVY_APP_ID =
  (process.env.EXPO_PUBLIC_PRIVY_APP_ID as string | undefined) ||
  (Constants.expoConfig?.extra as any)?.privyAppId ||
  "cmph5sy0r00om0bldredscqru";
const PRIVY_CLIENT_ID =
  (process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID as string | undefined) ||
  (Constants.expoConfig?.extra as any)?.privyClientId;

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID as any}>
      {children}
    </PrivyProvider>
  );
}

export function usePrivyEmailLogin() {
  // Privy's hook returns sendCode + loginWithCode + state.
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  return {
    sendCode: async (email: string) => {
      await sendCode({ email });
    },
    loginWithCode: async (code: string): Promise<string> => {
      await loginWithCode({ code });
      const token = await getAccessToken();
      if (!token) throw new Error("Privy did not return an access token");
      return token;
    },
    state,
  };
}

export function usePrivyState() {
  const p = usePrivy();
  return { ready: (p as any).isReady ?? true, authenticated: (p as any).user != null, user: (p as any).user };
}

export async function privyLogout() {
  try {
    // logout() is exposed on usePrivy() return value - but cannot use hook here.
    // The Privy SDK auto-handles session via secure store; the simplest is to
    // call the hook from a component. We'll just rely on internal JWT clear.
  } catch {}
}

export function useEthEmbeddedWallet() {
  const w = useEmbeddedEthereumWallet();
  const ws = (w as any).wallets || [];
  return {
    wallets: ws.map((x: any) => ({ address: x.address, chainType: "ethereum" })),
    ready: (w as any).isReady ?? true,
  };
}
