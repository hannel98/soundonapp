import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";
import { PRIVY_AVAILABLE, usePrivyState, useEthEmbeddedWallet } from "@/src/auth/PrivyClient";

export default function WalletScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [serverWallets, setServerWallets] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const privyState = usePrivyState();
  const privyEth = useEthEmbeddedWallet();

  const load = useCallback(async () => {
    try {
      const s = await api.privyStatus();
      setStatus(s);
      try {
        const w = await api.privyWallets();
        setServerWallets(w.wallets);
      } catch {
        setServerWallets(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  // Prefer wallets returned by Privy SDK directly (on-device).
  // Fallback to server-side enumeration via Privy server API.
  const wallets = privyEth.wallets.length > 0 ? privyEth.wallets : (serverWallets || []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200, gap: 16 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="wal-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>PRIVY</Text>
            <Text style={styles.h1}>Wallets</Text>
          </View>
        </View>

        {!status?.configured && (
          <View style={styles.warn}>
            <Ionicons name="warning" size={20} color={colors.accent} />
            <Text style={styles.warnText}>
              Backend not configured. Set PRIVY_APP_ID + PRIVY_APP_SECRET in env (rotate the secret first).
            </Text>
          </View>
        )}

        {!PRIVY_AVAILABLE && (
          <View style={styles.warn}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.warnText}>
              Privy native SDK needs an iOS/Android dev build. Tap "Publish" (top right) to build. The web preview can't render real Privy wallets.
            </Text>
          </View>
        )}

        {privyState.authenticated && (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={28} color={colors.token} />
            <Text style={styles.cardTitle}>Privy account linked</Text>
            <Text style={styles.cardBody}>You're signed in via Privy. Embedded wallets below are held in Privy custody on your device.</Text>
          </View>
        )}

        {wallets.length > 0 ? (
          wallets.map((w: any, i: number) => (
            <View key={`${w.address}-${i}`} style={styles.walletCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.walletChain}>{(w.chain_type || w.chainType || "ethereum").toUpperCase()}</Text>
                <Ionicons name="copy-outline" size={16} color={colors.textTertiary} />
              </View>
              <Text style={styles.walletAddr} numberOfLines={1}>{w.address}</Text>
              <Text style={styles.walletClient}>{w.wallet_client || w.connector_type || "embedded"}</Text>
            </View>
          ))
        ) : (
          <View style={styles.card}>
            <Ionicons name="wallet" size={48} color={colors.primary} />
            <Text style={styles.cardTitle}>No wallet yet</Text>
            <Text style={styles.cardBody}>
              Sign in with Privy from the login screen to get an embedded Ethereum wallet. Pay for $SOUND boosts and sign on-chain actions.
            </Text>
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.primaryBtn} testID="wal-login-cta">
              <Ionicons name="link" size={18} color="#0A0A0C" />
              <Text style={styles.primaryBtnText}>Sign in with Privy</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  warn: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: "rgba(255,184,0,0.08)", borderRadius: radius.md, borderColor: "rgba(255,184,0,0.3)", borderWidth: 1, alignItems: "center" },
  warnText: { flex: 1, color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
  card: { backgroundColor: colors.surface, padding: 20, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, gap: 12, alignItems: "flex-start" },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 18 },
  cardBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.full, alignItems: "center", minHeight: 48 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 14 },
  walletCard: { backgroundColor: colors.surface, padding: 16, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, gap: 6 },
  walletChain: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  walletAddr: { color: "#fff", fontSize: 13, fontWeight: "700" },
  walletClient: { color: colors.textTertiary, fontSize: 11 },
});
