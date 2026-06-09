import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";

const GOLD = "#FFC23A";
const GOLD_DEEP = "#D89B0B";

type Pack = { product_id: string; tokens: number; price: string; label: string };
type Sub = { product_id: string; price: string; duration_days: number; label: string };

let RNIap: any = null;
try { RNIap = require("react-native-iap"); } catch { RNIap = null; }

export default function Storefront() {
  const router = useRouter();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [perks, setPerks] = useState<string[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [proActive, setProActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const iapReady = !!RNIap && (Platform.OS === "ios" || Platform.OS === "android");

  useEffect(() => {
    (async () => {
      try {
        const cat: any = await api.iapCatalog();
        setPacks(cat.token_packs);
        setSubs(cat.subscriptions);
        setCosts(cat.token_costs || {});
        setPerks(cat.pro_perks || []);
        const sub = await api.iapSubscription().catch(() => ({ active: false }));
        setProActive(!!sub.active);
        const prog: any = await api.progress().catch(() => null);
        if (prog) setBalance(prog.sound_balance);
      } finally { setLoading(false); }
    })();
  }, []);

  const buy = async (productId: string, isSubscription: boolean) => {
    if (!iapReady) {
      Alert.alert("Build required", "In-App Purchases only work on a real iOS / Android build.\n\nTap 'Publish' (top-right) to generate one.");
      return;
    }
    setBuying(productId);
    try {
      let purchase: any = isSubscription
        ? await RNIap.requestSubscription({ sku: productId })
        : await RNIap.requestPurchase({ sku: productId });
      const p = Array.isArray(purchase) ? purchase[0] : purchase;
      if (!p) throw new Error("No purchase result");
      const platform = Platform.OS === "ios" ? "ios" : "android";
      const res = await api.iapValidate({
        platform, product_id: productId,
        transaction_id: p.transactionId || undefined,
        purchase_token: p.purchaseToken || undefined,
        is_subscription: isSubscription,
      });
      try { await RNIap.finishTransaction({ purchase: p, isConsumable: !isSubscription }); } catch {}
      if (res.granted?.tokens) {
        setBalance(res.balance);
        Alert.alert("Purchase successful", `+${res.granted.tokens} $SOUND`);
      } else if (res.granted?.subscription) {
        setProActive(true);
        Alert.alert("SoundMesh Pro active", "Enjoy unlimited features!");
      }
    } catch (e: any) {
      if (e?.code !== "E_USER_CANCELLED") Alert.alert("Purchase failed", e?.message || String(e));
    } finally { setBuying(null); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={GOLD} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 220 }}>
        {/* Header w/ back + balance */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="store-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.balPill}>
            <Ionicons name="flash" size={14} color={GOLD} />
            <Text style={styles.balText}>{(balance ?? 0).toLocaleString()} $SOUND</Text>
          </View>
        </View>

        <Text style={styles.h1}>Power up SoundMesh</Text>
        <Text style={styles.hsub}>Tokens unlock creator tools · Pro removes the limits.</Text>

        {/* Pro Subscription */}
        <View style={styles.proCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="star" size={20} color={GOLD} />
            <Text style={styles.proLabel}>SoundMesh Pro</Text>
            {proActive && <View style={styles.activePill}><Text style={styles.activePillText}>ACTIVE</Text></View>}
          </View>
          <Text style={styles.proPrice}>{subs[0]?.price || "$4.99/mo"}</Text>
          <View style={{ gap: 6 }}>
            {perks.map((p) => (
              <View key={p} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                <Ionicons name="checkmark" size={16} color={GOLD} style={{ marginTop: 2 }} />
                <Text style={styles.perk}>{p}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            testID={`store-sub-pro`}
            onPress={() => subs[0] && buy(subs[0].product_id, true)}
            disabled={!subs[0] || proActive || buying === subs[0]?.product_id}
            style={[styles.buyXl, (proActive || !subs[0]) && { opacity: 0.5 }]}
          >
            {buying === subs[0]?.product_id ? <ActivityIndicator color="#0A0A0C" /> : (
              <Text style={styles.buyXlText}>{proActive ? "Active" : "Subscribe"}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* What can I do with tokens */}
        <Text style={styles.section}>What can I do with tokens?</Text>
        <View style={styles.usesCard}>
          <Use icon="cloud-upload" label="Upload 1 Song" cost={costs.upload_music ?? 1} />
          <Use icon="image" label="Generate 1 AI Album Cover" cost={costs.ai_album_cover ?? 2} />
          <Use icon="radio" label="Start 1 Live Stream" cost={costs.go_live ?? 3} />
        </View>

        {/* Token Packs */}
        <Text style={styles.section}>Token Packs</Text>
        {packs.map((p) => (
          <View key={p.product_id} style={styles.packCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.packLabel}>{p.label}</Text>
              <Text style={styles.packTokens}>{p.tokens.toLocaleString()} $SOUND</Text>
              <Text style={styles.packPerk}>= {p.tokens} songs · {Math.floor(p.tokens / 2)} album covers · {Math.floor(p.tokens / 3)} live streams</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={styles.packPrice}>{p.price}</Text>
              <TouchableOpacity
                testID={`store-pack-${p.product_id}`}
                onPress={() => buy(p.product_id, false)}
                disabled={buying === p.product_id}
                style={styles.buyBtn}
              >
                {buying === p.product_id ? <ActivityIndicator color="#0A0A0C" /> : <Text style={styles.buyBtnText}>Buy</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {!iapReady && (
          <Text style={styles.warn}>
            IAP needs a native build. Use the Publish button to generate iOS/Android, then purchases work in that build.
          </Text>
        )}
        <Text style={styles.legal}>
          Payment will be charged to your Apple ID / Google Play account at confirmation. Subscriptions auto-renew unless cancelled in your platform store settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Use({ icon, label, cost }: { icon: any; label: string; cost: number }) {
  return (
    <View style={styles.useRow}>
      <View style={styles.useIcon}><Ionicons name={icon} size={18} color={GOLD} /></View>
      <Text style={styles.useText}>{label}</Text>
      <View style={styles.useBadge}>
        <Text style={styles.useBadgeText}>{cost} {cost === 1 ? "Token" : "Tokens"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#111", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#222" },
  balPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: GOLD, backgroundColor: "rgba(255,194,58,0.08)" },
  balText: { color: GOLD, fontWeight: "900", fontSize: 13 },
  h1: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.6, paddingHorizontal: 16 },
  hsub: { color: "#aaa", fontSize: 13, paddingHorizontal: 16, marginBottom: 16 },
  proCard: { marginHorizontal: 16, padding: 18, borderRadius: 18, backgroundColor: "#0d0d0d", borderColor: GOLD, borderWidth: 1, gap: 10 },
  proLabel: { color: "#fff", fontWeight: "900", fontSize: 20 },
  proPrice: { color: GOLD, fontWeight: "900", fontSize: 32 },
  perk: { color: "#fff", fontSize: 13, lineHeight: 19, flex: 1 },
  activePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: GOLD },
  activePillText: { color: "#000", fontSize: 10, fontWeight: "900" },
  buyXl: { backgroundColor: GOLD, paddingVertical: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 6, shadowColor: GOLD, shadowOpacity: 0.4, shadowRadius: 12 },
  buyXlText: { color: "#000", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  section: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 28, marginBottom: 12, paddingHorizontal: 16 },
  usesCard: { marginHorizontal: 16, padding: 4, borderRadius: 16, backgroundColor: "#0d0d0d", borderColor: "#222", borderWidth: 1 },
  useRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  useIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,194,58,0.12)", alignItems: "center", justifyContent: "center" },
  useText: { color: "#fff", flex: 1, fontSize: 14, fontWeight: "700" },
  useBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: GOLD },
  useBadgeText: { color: "#000", fontWeight: "900", fontSize: 12 },
  packCard: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 16, backgroundColor: "#0d0d0d", borderColor: "#222", borderWidth: 1, gap: 12, alignItems: "center" },
  packLabel: { color: "#fff", fontWeight: "900", fontSize: 17 },
  packTokens: { color: GOLD, fontWeight: "800", fontSize: 13, marginTop: 2 },
  packPerk: { color: "#888", fontSize: 11, marginTop: 4, lineHeight: 16 },
  packPrice: { color: "#fff", fontWeight: "900", fontSize: 22 },
  buyBtn: { backgroundColor: GOLD, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999, minHeight: 40, justifyContent: "center", shadowColor: GOLD_DEEP, shadowOpacity: 0.5, shadowRadius: 8 },
  buyBtnText: { color: "#000", fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
  warn: { color: "#999", fontSize: 12, lineHeight: 18, marginHorizontal: 16, marginTop: 8 },
  legal: { color: "#666", fontSize: 11, lineHeight: 17, marginTop: 18, paddingHorizontal: 16 },
});
