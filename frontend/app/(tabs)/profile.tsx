import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

type Progress = {
  user_id: string;
  sound_balance: number;
  xp: number;
  streak: number;
  best_streak: number;
  multiplier: number;
  total_tracks: number;
  week_creations: number;
  last_claim_at?: string | null;
  next_milestone: number;
  next_milestone_reward: number;
};

type Status = {
  id: string;
  text: string;
  created_at: string;
};

type LeaderEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  sound_balance: number;
  streak: number;
  xp: number;
};

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [leaderSort, setLeaderSort] = useState<"balance" | "streak" | "xp">("balance");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = async () => {
    try {
      const [p, s, lb] = await Promise.all([
        api.progress(),
        api.myStatuses(),
        api.leaderboard(leaderSort, 10).catch(() => []),
      ]);
      setProgress(p);
      setStatuses(s);
      setLeaders(lb);
    } catch {}
    finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.leaderboard(leaderSort, 10).then(setLeaders).catch(() => {});
  }, [leaderSort]);

  const onClaim = async () => {
    setClaiming(true);
    try {
      const updated = await api.claimDaily();
      setProgress(updated);
    } catch (e: any) {
      Alert.alert("Bonus", e.message || "Could not claim");
    } finally {
      setClaiming(false);
    }
  };

  const onPostStatus = async () => {
    if (!statusText.trim()) return;
    setPosting(true);
    try {
      const s = await api.createStatus(statusText.trim());
      setStatuses((prev) => [s, ...prev]);
      setStatusText("");
    } catch (e: any) {
      Alert.alert("Status", e.message || "Could not post");
    } finally {
      setPosting(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
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

  const streakProgress = progress
    ? Math.min(progress.streak / progress.next_milestone, 1)
    : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>PROFILE</Text>
              <Text style={styles.name}>{user?.display_name || user?.email}</Text>
              <Text style={styles.handle}>@{(user?.email || "").split("@")[0]}</Text>
            </View>
            <View style={styles.avatar}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={{ width: 64, height: 64 }} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(user?.display_name?.[0] || user?.email?.[0] || "S").toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          {/* Token + Streak Card */}
          {progress && (
            <View style={styles.tokenCard} testID="profile-token-card">
              <View style={styles.tokenRow}>
                <View>
                  <Text style={styles.tokenLabel}>$SOUND BALANCE</Text>
                  <Text style={styles.tokenValue}>{progress.sound_balance.toLocaleString()}</Text>
                </View>
                <View style={styles.multBadge}>
                  <Text style={styles.multText}>{progress.multiplier.toFixed(2)}×</Text>
                  <Text style={styles.multLabel}>BONUS</Text>
                </View>
              </View>

              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{progress.streak}</Text>
                  <Text style={styles.statLabel}>Streak</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{progress.total_tracks}</Text>
                  <Text style={styles.statLabel}>Tracks</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{progress.week_creations}</Text>
                  <Text style={styles.statLabel}>This week</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{progress.xp}</Text>
                  <Text style={styles.statLabel}>XP</Text>
                </View>
              </View>

              {/* Milestone progress */}
              <View style={styles.milestoneWrap}>
                <View style={styles.milestoneHead}>
                  <Text style={styles.milestoneText}>
                    Next milestone: Day {progress.streak}/{progress.next_milestone}
                  </Text>
                  <Text style={styles.milestoneReward}>
                    +{progress.next_milestone_reward} $SOUND
                  </Text>
                </View>
                <View style={styles.progressBg}>
                  <View
                    style={[styles.progressFg, { width: `${streakProgress * 100}%` }]}
                  />
                </View>
              </View>

              <TouchableOpacity
                testID="claim-daily-btn"
                onPress={onClaim}
                disabled={claiming}
                style={[styles.claimBtn, claiming && { opacity: 0.6 }]}
              >
                {claiming ? (
                  <ActivityIndicator color="#0A0A0C" />
                ) : (
                  <>
                    <Ionicons name="gift" size={16} color="#0A0A0C" />
                    <Text style={styles.claimText}>Claim Daily Bonus</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Leaderboard */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>🏆 Leaderboard</Text>
          </View>
          <View style={styles.sortRow}>
            {(["balance", "streak", "xp"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                testID={`leader-sort-${s}`}
                onPress={() => setLeaderSort(s)}
                style={[styles.sortBtn, leaderSort === s && styles.sortBtnActive]}
              >
                <Text style={[styles.sortText, leaderSort === s && styles.sortTextActive]}>
                  {s === "balance" ? "$SOUND" : s.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ paddingHorizontal: spacing.lg, gap: 8 }}>
            {leaders.length === 0 ? (
              <Text style={styles.emptyText}>No rankings yet.</Text>
            ) : (
              leaders.map((l) => {
                const isMe = l.user_id === user?.user_id;
                const metric =
                  leaderSort === "balance"
                    ? `${l.sound_balance} $SOUND`
                    : leaderSort === "streak"
                    ? `🔥 ${l.streak}`
                    : `${l.xp} XP`;
                return (
                  <View
                    key={l.user_id}
                    testID={`leader-row-${l.rank}`}
                    style={[styles.leaderRow, isMe && styles.leaderRowMe]}
                  >
                    <Text style={[styles.leaderRank, l.rank === 1 && { color: colors.primary }]}>
                      {l.rank === 1 ? "🥇" : l.rank === 2 ? "🥈" : l.rank === 3 ? "🥉" : `#${l.rank}`}
                    </Text>
                    <Text style={styles.leaderName} numberOfLines={1}>
                      {l.display_name}
                      {isMe ? "  (you)" : ""}
                    </Text>
                    <Text style={styles.leaderMetric}>{metric}</Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Status compose */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Status Updates</Text>
          </View>
          <View style={styles.composeWrap}>
            <TextInput
              testID="status-input"
              value={statusText}
              onChangeText={setStatusText}
              placeholder="What are you cooking up?"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={styles.composeInput}
            />
            <TouchableOpacity
              onPress={onPostStatus}
              disabled={posting || !statusText.trim()}
              style={[styles.postBtn, (!statusText.trim() || posting) && { opacity: 0.5 }]}
              testID="status-post-btn"
            >
              {posting ? (
                <ActivityIndicator color="#0A0A0C" />
              ) : (
                <Ionicons name="send" size={16} color="#0A0A0C" />
              )}
            </TouchableOpacity>
          </View>

          {statuses.length === 0 ? (
            <Text style={styles.emptyText}>No statuses yet. Drop your first one!</Text>
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: 10, marginTop: 10 }}>
              {statuses.map((s) => (
                <View key={s.id} style={styles.statusCard}>
                  <Text style={styles.statusText}>{s.text}</Text>
                  <Text style={styles.statusTime}>{formatTime(s.created_at)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Account actions */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Account</Text>
          </View>
          <View style={styles.accountList}>
            <View style={styles.accountRow}>
              <Ionicons name="mail" size={18} color={colors.textSecondary} />
              <Text style={styles.accountText}>{user?.email}</Text>
            </View>
            <View style={styles.accountRow}>
              <Ionicons name="shield-checkmark" size={18} color={colors.textSecondary} />
              <Text style={styles.accountText}>
                {user?.providers?.join(", ") || "local"}
              </Text>
            </View>
            <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn} testID="signout-btn">
              <Ionicons name="log-out" size={18} color={colors.accent} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    alignItems: "center",
    gap: 12,
  },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 4 },
  handle: { color: colors.textSecondary, marginTop: 2 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInitial: { color: colors.primary, fontSize: 24, fontWeight: "900" },
  tokenCard: {
    marginHorizontal: spacing.lg,
    marginTop: 22,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(0,255,102,0.2)",
    padding: 18,
  },
  tokenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tokenLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1.4, fontWeight: "700" },
  tokenValue: { color: colors.token, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 4 },
  multBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,184,0,0.15)",
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  multText: { color: colors.primary, fontWeight: "900", fontSize: 16 },
  multLabel: { color: colors.primary, fontSize: 8, letterSpacing: 1.2, fontWeight: "800" },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    gap: 8,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: "#fff", fontWeight: "900", fontSize: 18 },
  statLabel: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  milestoneWrap: { marginTop: 22 },
  milestoneHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  milestoneText: { color: colors.textSecondary, fontSize: 12 },
  milestoneReward: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  progressBg: {
    height: 8,
    backgroundColor: colors.elevated,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFg: { height: "100%", backgroundColor: colors.primary, borderRadius: 4 },
  claimBtn: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minHeight: 48,
  },
  claimText: { color: "#0A0A0C", fontWeight: "900", fontSize: 15 },
  sectionHead: { paddingHorizontal: spacing.lg, marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sortRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: 10 },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 30,
    justifyContent: "center",
  },
  sortBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortText: { color: colors.textSecondary, fontWeight: "700", fontSize: 11 },
  sortTextActive: { color: "#0A0A0C", fontWeight: "800" },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  leaderRowMe: { borderColor: colors.primary, backgroundColor: "rgba(255,184,0,0.06)" },
  leaderRank: { width: 36, color: colors.textTertiary, fontWeight: "900", fontSize: 14 },
  leaderName: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 14 },
  leaderMetric: { color: colors.token, fontWeight: "900", fontSize: 13 },
  composeWrap: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    gap: 10,
    alignItems: "flex-end",
  },
  composeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: "#fff",
    minHeight: 48,
    maxHeight: 120,
    textAlignVertical: "top",
  },
  postBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: 12,
    fontSize: 13,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  statusTime: { color: colors.textTertiary, fontSize: 11, marginTop: 6 },
  accountList: { paddingHorizontal: spacing.lg, gap: 10 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountText: { color: "#fff", fontSize: 14 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.4)",
    marginTop: 6,
    minHeight: 48,
  },
  signOutText: { color: colors.accent, fontWeight: "800" },
});
