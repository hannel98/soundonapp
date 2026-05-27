import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

export default function CollabTab() {
  const router = useRouter();
  const [meta, setMeta] = useState<{ roles: string[]; genres: string[]; location_prefs: string[] } | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, list] = await Promise.all([
        meta ? Promise.resolve(meta) : api.collabMeta(),
        api.collabList({ role: role || undefined, genre: genre || undefined, limit: 50 }),
      ]);
      if (!meta) setMeta(m as any);
      setPosts(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [meta, role, genre]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>COLLAB</Text>
          <Text style={styles.h1}>Find Collaborators</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/collab/create")} style={styles.fab} testID="collab-create-btn">
          <Ionicons name="add" size={22} color="#0A0A0C" />
          <Text style={styles.fabText}>Post</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => router.push("/collab/me")}
        style={styles.mineLink}
        testID="collab-mine-btn"
      >
        <Ionicons name="folder-open" size={16} color={colors.primary} />
        <Text style={styles.mineLinkText}>My posts & applications</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Filters */}
      {meta && (
        <>
          <Text style={styles.filterLabel}>ROLE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="All" active={!role} onPress={() => setRole(null)} />
            {meta.roles.map((r) => (
              <Chip key={r} label={r} active={role === r} onPress={() => setRole(r)} />
            ))}
          </ScrollView>
          <Text style={styles.filterLabel}>GENRE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="All" active={!genre} onPress={() => setGenre(null)} />
            {meta.genres.map((g) => (
              <Chip key={g} label={g} active={genre === g} onPress={() => setGenre(g)} />
            ))}
          </ScrollView>
        </>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No collab posts yet. Be the first to post a project!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/collab/[id]", params: { id: item.id } })}
              style={styles.card}
              testID={`collab-card-${item.id}`}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.genreBadge}>{item.genre}</Text>
                <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={2}>{item.description}</Text>
              <View style={styles.rolesRow}>
                {item.roles_needed.slice(0, 4).map((r: string) => (
                  <View key={r} style={styles.roleChip}><Text style={styles.roleChipText}>{r}</Text></View>
                ))}
              </View>
              <View style={styles.footer}>
                <Text style={styles.owner}>by {item.owner_name}</Text>
                <Text style={styles.appsCount}>{item.applications_count || 0} applied</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 8 },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  fab: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, minHeight: 44 },
  fabText: { color: "#0A0A0C", fontWeight: "900" },
  mineLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  mineLinkText: { color: "#fff", fontWeight: "700", flex: 1 },
  filterLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", paddingHorizontal: spacing.lg, paddingTop: 12 },
  chipRow: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#0A0A0C" },
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: 8 },
  genreBadge: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  meta: { color: colors.textTertiary, fontSize: 11 },
  title: { color: "#fff", fontSize: 17, fontWeight: "900" },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,184,0,0.12)", borderColor: "rgba(255,184,0,0.3)", borderWidth: 1 },
  roleChipText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  owner: { color: colors.textTertiary, fontSize: 12 },
  appsCount: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { color: colors.textTertiary, textAlign: "center" },
});
