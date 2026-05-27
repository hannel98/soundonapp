import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

type Pack = { product_id: string; tokens: number; price: string; label: string };
type Sub = { product_id: string; price: string; duration_days: number; label: string };

// react-native-iap is a native module — only available in EAS dev/production builds.
// We dynamically require it and fall back to a friendly notice in Expo Go / web.
let RNIap: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
  RNIap = require("react-native-iap");
} catch {
  RNIap = null;
}

export default function Storefront() {
  const router = useRouter();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [proActive, setProActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const iapReady = !!RNIap && (Platform.OS === "ios" || Platform.OS === "android");

  useEffect(() => {
    (async () => {
      try {
        const cat = await api.iapCatalog();
        setPacks(cat.token_packs);
        setSubs(cat.subscriptions);
        const sub = await api.iapSubscription().catch(() => ({ active: false }));
        setProActive(!!sub.active);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Initialize IAP connection on mount (native only)
  useEffect(() => {
    if (!iapReady) return;
    let mounted = true;
    (async () => {
      try {
        await RNIap.initConnection();
        if (!mounted) return;
        const skus = [...packs.map((p) => p.product_id), ...subs.map((s) => s.product_id)];
        if (skus.length) {
          try {
            await RNIap.getProducts({ skus });
          } catch {}
          try {
            await RNIap.getSubscriptions({ skus: subs.map((s) => s.product_id) });
          } catch {}
        }
      } catch {}
    })();
    return () => {
      mounted = false;
      try { RNIap.endConnection(); } catch {}
    };
  }, [iapReady, packs, subs]);

  const buy = async (productId: string, isSubscription: boolean) => {
    if (!iapReady) {
      Alert.alert(
        "Build required",
        "In-App Purchases only work on a real iOS / Android build.\n\nTap 'Publish' in SoundMesh (top-right) to generate a dev build, then come back here.\n\nProduct ID: " + productId,
      );
      return;
    }
    setBuying(productId);
    try {
      // requestPurchase signatures vary; use the universal `request*` API.
      let purchase: any = null;
      if (isSubscription) {
        purchase = await RNIap.requestSubscription({ sku: productId });
      } else {
        purchase = await RNIap.requestPurchase({ sku: productId });
      }
      // Some libraries return an array; normalise to one purchase
      const p = Array.isArray(purchase) ? purchase[0] : purchase;
      if (!p) throw new Error("No purchase result");
      // Validate with backend
      const platform = Platform.OS === "ios" ? "ios" : "android";
      const res = await api.iapValidate({
        platform,
        product_id: productId,
        transaction_id: p.transactionId || p.transactionReceipt || undefined,
        purchase_token: p.purchaseToken || undefined,
        is_subscription: isSubscription,
      });
      // Acknowledge / finish locally
      try {
        await RNIap.finishTransaction({ purchase: p, isConsumable: !isSubscription });
      } catch {}
      if (res.granted?.tokens) {
        Alert.alert("Purchase successful", `+${res.granted.tokens} $SOUND\nBalance: ${res.balance ?? "-"}`);
      } else if (res.granted?.subscription) {
        Alert.alert("Subscription active", `Pro until ${res.granted.expires_at?.slice(0, 10)}`);
        setProActive(true);
      } else {
        Alert.alert("Purchase processed", "Your purchase has been recorded.");
      }
    } catch (e: any) {
      if (e?.code !== "E_USER_CANCELLED") {
        Alert.alert("Purchase failed", e?.message || String(e));
      }
    } finally {
      setBuying(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220, gap: 18 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="store-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>STORE</Text>
            <Text style={styles.h1}>Buy $SOUND</Text>
          </View>
        </View>

        {!iapReady && (
          <View style={styles.warn}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.warnText}>
              IAP needs a native build. Tap “Publish” in SoundMesh (top right) to generate an iOS/Android build, then purchases will work in that build.
            </Text>
          </View>
        )}

        {/* Pro Subscription */}
        <Text style={styles.section}>Subscription</Text>
        {subs.map((s) => (
          <View key={s.product_id} style={styles.subCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>{s.label}</Text>
              <Text style={styles.subBody}>
                Unlimited AI Album & Beat generation, Pro voices, Pro stems.
              </Text>
              <Text style={styles.subPrice}>{s.price}</Text>
            </View>
            <TouchableOpacity
              testID={`store-sub-${s.product_id}`}
              onPress={() => buy(s.product_id, true)}
              disabled={buying === s.product_id || proActive}
              style={[styles.buyBtn, { opacity: proActive ? 0.5 : 1 }]}
            >
              {buying === s.product_id ? (
                <ActivityIndicator color="#0A0A0C" />
              ) : (
                <Text style={styles.buyText}>{proActive ? "Active" : "Subscribe"}</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {/* Token Packs */}
        <Text style={styles.section}>Token Packs</Text>
        {packs.map((p) => (
          <View key={p.product_id} style={styles.packCard}>
            <View style={styles.packIcon}>
              <Ionicons name="flash" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.packLabel}>{p.label}</Text>
              <Text style={styles.packTokens}>{p.tokens.toLocaleString()} $SOUND</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={styles.packPrice}>{p.price}</Text>
              <TouchableOpacity
                testID={`store-pack-${p.product_id}`}
                onPress={() => buy(p.product_id, false)}
                disabled={buying === p.product_id}
                style={styles.buyBtnSm}
              >
                {buying === p.product_id ? (
                  <ActivityIndicator color="#0A0A0C" />
                ) : (
                  <Text style={styles.buyTextSm}>Buy</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.legal}>
          Payment will be charged to your Apple ID / Google Play account at confirmation. Subscriptions auto-renew unless cancelled. Manage in your platform store settings.
        </Text>
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
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  section: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.6, fontWeight: "800", textTransform: "uppercase", marginTop: 8 },
  warn: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: "rgba(255,184,0,0.08)", borderRadius: radius.md, borderColor: "rgba(255,184,0,0.3)", borderWidth: 1, alignItems: "center" },
  warnText: { flex: 1, color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
  subCard: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderColor: colors.primary, borderWidth: 1, gap: 12, alignItems: "center" },
  subLabel: { color: "#fff", fontWeight: "900", fontSize: 18 },
  subBody: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  subPrice: { color: colors.primary, fontWeight: "900", fontSize: 20, marginTop: 8 },
  buyBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.full, minHeight: 44, justifyContent: "center" },
  buyText: { color: "#0A0A0C", fontWeight: "900" },
  buyBtnSm: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, minHeight: 36, justifyContent: "center" },
  buyTextSm: { color: "#0A0A0C", fontWeight: "900", fontSize: 13 },
  packCard: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderColor: colors.border, borderWidth: 1, gap: 12, alignItems: "center" },
  packIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,184,0,0.12)", alignItems: "center", justifyContent: "center" },
  packLabel: { color: "#fff", fontWeight: "800", fontSize: 15 },
  packTokens: { color: colors.token, fontWeight: "700", fontSize: 12, marginTop: 2 },
  packPrice: { color: "#fff", fontWeight: "900", fontSize: 16 },
  legal: { color: colors.textTertiary, fontSize: 11, lineHeight: 17, marginTop: 12 },
});
