import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { spendOr } from "@/src/utils/spend";
import { colors, radius, spacing } from "@/src/theme";

export default function LiveScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [live, setLive] = useState(false);
  const [paidCost, setPaidCost] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const prog: any = await api.progress().catch(() => null);
        if (prog) setBalance(prog.sound_balance);
        const sub = await api.iapSubscription().catch(() => ({ active: false }));
        setIsPro(!!sub.active);
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  const startLive = async () => {
    setPaying(true);
    try {
      const res = await spendOr("go_live", router);
      if (!res) return; // cancelled or top-up modal
      setPaidCost(res.cost);
      if (res.balance !== null) setBalance(res.balance);
      setLive(true);
    } finally {
      setPaying(false);
    }
  };

  const endLive = () => {
    Alert.alert(
      "End stream?",
      "Your $SOUND is non-refundable. Are you sure you want to end?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "End", style: "destructive", onPress: () => { setLive(false); setElapsed(0); } },
      ],
    );
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
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
      <ScrollView contentContainerStyle={{ paddingBottom: 220 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="live-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>BROADCAST</Text>
            <Text style={styles.h1}>Go Live</Text>
          </View>
          <View style={styles.balPill}>
            <Ionicons name="flash" size={12} color={colors.primary} />
            <Text style={styles.balText}>{(balance ?? 0).toLocaleString()}</Text>
          </View>
        </View>

        {!live ? (
          <View style={styles.previewCard} testID="live-prelobby">
            <View style={styles.previewBox}>
              <Ionicons name="radio" size={56} color={colors.primary} />
              <Text style={styles.previewTitle}>Live Studio Session</Text>
              <Text style={styles.previewSub}>
                Start a live broadcast from your phone. Fans can join, chat,
                and tip $SOUND in real time.
              </Text>
            </View>

            <View style={styles.costBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.costLabel}>One-time cost to go live</Text>
                <Text style={styles.costValue}>
                  {isPro ? "FREE for Pro" : "3 $SOUND"}
                </Text>
              </View>
              <Ionicons name={isPro ? "star" : "flash"} size={28} color={colors.primary} />
            </View>

            <TouchableOpacity
              testID="live-start-btn"
              onPress={startLive}
              disabled={paying}
              style={[styles.primaryBtn, paying && { opacity: 0.6 }]}
            >
              {paying ? <ActivityIndicator color="#0A0A0C" /> : (
                <>
                  <Ionicons name="radio" size={20} color="#0A0A0C" />
                  <Text style={styles.primaryText}>Start Live · {isPro ? "Free" : "3 $SOUND"}</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.note}>
              Full HD streaming requires an Agora API key (build-only feature). This MVP
              streams a stub session for testing the token & UX flow.
            </Text>
          </View>
        ) : (
          <View style={styles.liveCard} testID="live-room">
            <View style={styles.liveBadgeRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadge}>LIVE</Text>
              <Text style={styles.liveTimer}>{fmt(elapsed)}</Text>
            </View>
            <View style={styles.cameraStub}>
              <Ionicons name="videocam" size={64} color={colors.primary} />
              <Text style={styles.cameraText}>Camera preview placeholder</Text>
              <Text style={styles.cameraSub}>Wire Agora SDK in dev-build to enable video</Text>
            </View>
            <View style={styles.statRow}>
              <Stat icon="people" label="Viewers" value="0" />
              <Stat icon="chatbubbles" label="Chat" value="0" />
              <Stat icon="flash" label="Tipped" value="0" />
            </View>
            <Text style={styles.paidText}>You paid {paidCost} $SOUND for this stream.</Text>
            <TouchableOpacity
              testID="live-end-btn"
              onPress={endLive}
              style={styles.endBtn}
            >
              <Ionicons name="stop-circle" size={20} color="#fff" />
              <Text style={styles.endBtnText}>End Stream</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  balPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderColor: colors.primary, borderWidth: 1, backgroundColor: "rgba(255,184,0,0.08)" },
  balText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  previewCard: { marginHorizontal: spacing.lg, gap: 16 },
  previewBox: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 28, alignItems: "center", gap: 12 },
  previewTitle: { color: "#fff", fontWeight: "900", fontSize: 22, marginTop: 4 },
  previewSub: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19 },
  costBox: { flexDirection: "row", alignItems: "center", padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  costLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.4, fontWeight: "700", textTransform: "uppercase" },
  costValue: { color: colors.primary, fontSize: 22, fontWeight: "900", marginTop: 4 },
  primaryBtn: { flexDirection: "row", gap: 10, backgroundColor: colors.primary, paddingVertical: 18, borderRadius: radius.full, alignItems: "center", justifyContent: "center", minHeight: 56 },
  primaryText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16 },
  note: { color: colors.textTertiary, fontSize: 11, lineHeight: 17, paddingHorizontal: 4 },
  liveCard: { marginHorizontal: spacing.lg, gap: 16 },
  liveBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff3b30" },
  liveBadge: { color: "#ff3b30", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
  liveTimer: { color: "#fff", marginLeft: "auto", fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] as any },
  cameraStub: { backgroundColor: "#0a0a0c", borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, paddingVertical: 60, alignItems: "center", gap: 8 },
  cameraText: { color: "#fff", fontWeight: "700" },
  cameraSub: { color: colors.textTertiary, fontSize: 11 },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, alignItems: "center", gap: 4 },
  statValue: { color: "#fff", fontWeight: "900", fontSize: 18 },
  statLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.2, fontWeight: "700", textTransform: "uppercase" },
  paidText: { color: colors.textTertiary, fontSize: 12, textAlign: "center" },
  endBtn: { flexDirection: "row", gap: 10, backgroundColor: "#ff3b30", paddingVertical: 16, borderRadius: radius.full, alignItems: "center", justifyContent: "center", minHeight: 52 },
  endBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
