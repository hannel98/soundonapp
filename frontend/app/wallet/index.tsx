import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

// react-native-privy is a native module - graceful fallback if missing
let Privy: any = null;
try { Privy = require("@privy-io/expo"); } catch {}

export default function WalletScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [wallets, setWallets] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const privyReady = !!Privy && (Platform.OS === "ios" || Platform.OS === "android");

  const load = useCallback(async () => {
    try {
      const s = await api.privyStatus();
      setStatus(s);
      try {
        const w = await api.privyWallets();
        setWallets(w.wallets);
      } catch (e: any) {
        // 400 = not linked, OK
        setWallets(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const link = async () => {
    if (!privyReady) {
      Alert.alert(
        "Build required",
        "Privy login + embedded wallets need a native build.\n\nTap 'Publish' (top right) to generate an iOS/Android build, then return here to link your Privy account.",
      );
      return;
    }
    setLinking(true);
    try {
      // This would call Privy.login() then post the id_token to /api/privy/login
      Alert.alert("Coming soon", "Privy login UI activates once SMTP/social config is enabled in your Privy dashboard.");
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

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
              Privy is not configured. Add PRIVY_APP_ID + PRIVY_APP_SECRET to backend env (rotate the secret first — the one previously pasted in chat is compromised).
            </Text>
          </View>
        )}

        {!privyReady && (
          <View style={styles.warn}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.warnText}>
              Privy native SDK needs a dev build. Tap "Publish" (top right) to build iOS/Android. The current Expo Go preview can't open wallets.
            </Text>
          </View>
        )}

        {wallets && wallets.length > 0 ? (
          wallets.map((w, i) => (
            <View key={i} style={styles.walletCard}>
              <Text style={styles.walletChain}>{(w.chain_type || "ethereum").toUpperCase()}</Text>
              <Text style={styles.walletAddr}>{w.address}</Text>
              <Text style={styles.walletClient}>{w.wallet_client || w.connector_type || "—"}</Text>
            </View>
          ))
        ) : (
          <View style={styles.card}>
            <Ionicons name="wallet" size={48} color={colors.primary} />
            <Text style={styles.cardTitle}>No wallet linked yet</Text>
            <Text style={styles.cardBody}>
              Link a Privy account to get an embedded Ethereum + Solana wallet, sign messages, and pay for $SOUND boosts.
            </Text>
            <TouchableOpacity onPress={link} disabled={linking} style={[styles.primaryBtn, linking && { opacity: 0.6 }]} testID="wal-link">
              {linking ? <ActivityIndicator color="#0A0A0C" /> : (
                <>
                  <Ionicons name="link" size={18} color="#0A0A0C" />
                  <Text style={styles.primaryBtnText}>Link Privy Wallet</Text>
                </>
              )}
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
