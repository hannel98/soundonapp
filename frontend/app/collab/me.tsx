import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

export default function MyCollab() {
  const router = useRouter();
  const [data, setData] = useState<{ posts: any[]; applications: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.collabMine();
      setData(d);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200, gap: 14 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="mc-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.h1}>My Collab</Text>
        </View>

        <Text style={styles.section}>Projects I posted</Text>
        {(data?.posts || []).length === 0 ? (
          <Text style={styles.helper}>No posts yet.</Text>
        ) : (
          (data!.posts).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.row}
              onPress={() => router.push({ pathname: "/collab/[id]", params: { id: p.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{p.title}</Text>
                <Text style={styles.rowSub}>{p.roles_needed.join(", ")} • {p.applications_count || 0} applied</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.section}>My applications</Text>
        {(data?.applications || []).length === 0 ? (
          <Text style={styles.helper}>You haven't applied to any project yet.</Text>
        ) : (
          (data!.applications).map((a) => (
            <TouchableOpacity
              key={a.id}
              style={styles.row}
              onPress={() => router.push({ pathname: "/collab/[id]", params: { id: a.post_id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{a.post_title}</Text>
                <Text style={styles.rowSub}>Role: {a.role} • Status: {a.status}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  section: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, textTransform: "uppercase", marginTop: 12 },
  helper: { color: colors.textTertiary, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, gap: 8 },
  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
