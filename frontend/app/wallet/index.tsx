import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Linking } from "react-native";
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
  const [promo, setPromo] = useState<any>(null);
  const [manualAddr, setManualAddr] = useState("");
  const [claiming, setClaiming] = useState(false);

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
      const primary = (privyEth.wallets[0]?.address) || (serverWallets && serverWallets[0]?.address) || manualAddr || undefined;
      try {
        const p = await api.promoStatus(primary);
        setPromo(p);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [privyEth.wallets, serverWallets, manualAddr]);

  useEffect(() => { load(); }, [load]);

  const claim = async (wallet: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return Alert.alert("Wallet", "Enter a valid 0x address");
    }
    setClaiming(true);
    try {
      const res = await api.promoClaim(wallet);
      Alert.alert(
        "Reward sent 🎉",
        `Slot #${res.slot}\nTx: ${res.tx_hash.slice(0, 10)}…`,
        [
          { text: "OK" },
          { text: "View on BaseScan", onPress: () => Linking.openURL(res.explorer_url) },
        ],
      );
      load();
    } catch (e: any) {
      Alert.alert("Claim failed", e?.message || "Try again");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const wallets = privyEth.wallets.length > 0 ? privyEth.wallets : (serverWallets || []);
  const primaryWallet = wallets[0]?.address || manualAddr;
  const slotsTaken = promo?.slots_taken ?? 0;
  const slotsTotal = promo?.total_slots ?? 100;
  const pct = slotsTotal > 0 ? Math.min(100, Math.floor((slotsTaken / slotsTotal) * 100)) : 0;
  const alreadyClaimed = !!promo?.my_claim;

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
              Privy native SDK needs an iOS/Android dev build. Web preview can't render real Privy wallets.
            </Text>
          </View>
        )}

        {/* Promo claim card */}
        {promo && (
          <View style={styles.promoCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.promoTitle}>🎁 Launch Promo: {promo.reward_eth} ETH</Text>
              <Text style={styles.promoChain}>Base mainnet</Text>
            </View>
            <Text style={styles.promoBody}>
              First {slotsTotal} wallets to claim earn native ETH on Base.
            </Text>
            <View style={styles.progressBg}><View style={[styles.progressFg, { width: `${pct}%` }]} /></View>
            <Text style={styles.slots}>{slotsTaken} / {slotsTotal} claimed · {promo.slots_left} left</Text>

            {alreadyClaimed ? (
              <View style={[styles.claimDone]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.token} />
                <Text style={styles.claimDoneText}>Claimed slot #{promo.my_claim.slot}</Text>
                {promo.my_claim.tx_hash && (
                  <TouchableOpacity onPress={() => Linking.openURL(`https://basescan.org/tx/${promo.my_claim.tx_hash}`)}>
                    <Text style={styles.txLink}>View tx →</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : !promo.funded ? (
              <Text style={styles.helper}>Promo wallet not funded yet. Admin must set PROMO_WALLET_PRIVATE_KEY.</Text>
            ) : promo.slots_left <= 0 ? (
              <Text style={styles.helper}>All {slotsTotal} slots claimed — thanks for the early support!</Text>
            ) : primaryWallet ? (
              <TouchableOpacity onPress={() => claim(primaryWallet)} disabled={claiming} style={[styles.claimBtn, claiming && { opacity: 0.6 }]} testID="promo-claim-btn">
                {claiming ? <ActivityIndicator color="#0A0A0C" /> : (
                  <>
                    <Ionicons name="gift" size={18} color="#0A0A0C" />
                    <Text style={styles.claimBtnText}>Claim {promo.reward_eth} ETH to {primaryWallet.slice(0, 6)}…{primaryWallet.slice(-4)}</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  value={manualAddr}
                  onChangeText={setManualAddr}
                  placeholder="0x... your Base address"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  style={styles.input}
                  testID="promo-addr-input"
                />
                <TouchableOpacity onPress={() => claim(manualAddr)} disabled={claiming || !manualAddr} style={[styles.claimBtn, (claiming || !manualAddr) && { opacity: 0.6 }]} testID="promo-claim-manual">
                  <Text style={styles.claimBtnText}>Claim now</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {privyState.authenticated && (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={28} color={colors.token} />
            <Text style={styles.cardTitle}>Privy account linked</Text>
            <Text style={styles.cardBody}>You're signed in via Privy. Wallets below are held in Privy custody on your device.</Text>
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
              Sign in with Privy from the login screen to get an embedded Ethereum wallet, or paste an address above to claim the promo.
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
  promoCard: { backgroundColor: "rgba(0,82,255,0.08)", padding: 16, borderRadius: radius.lg, borderColor: "#0052FF", borderWidth: 1, gap: 10 },
  promoTitle: { color: "#fff", fontWeight: "900", fontSize: 17 },
  promoChain: { color: "#0052FF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  promoBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  progressBg: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  progressFg: { height: "100%", backgroundColor: "#0052FF" },
  slots: { color: colors.textTertiary, fontSize: 12 },
  helper: { color: colors.textTertiary, fontSize: 12 },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 13, minHeight: 44 },
  claimBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.full, alignItems: "center", justifyContent: "center", minHeight: 46 },
  claimBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 13 },
  claimDone: { flexDirection: "row", alignItems: "center", gap: 8 },
  claimDoneText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  txLink: { color: "#0052FF", fontSize: 12, fontWeight: "700", marginLeft: 4 },
});
