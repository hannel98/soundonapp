import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { usePlayer } from "@/src/context/PlayerContext";
import { colors, radius, spacing } from "@/src/theme";

export default function MyTracksScreen() {
  const router = useRouter();
  const { play } = usePlayer();
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await api.myTracks();
      setTracks(list);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onPlay = (t: any) => {
    const stream = `${(process as any).env.EXPO_PUBLIC_BACKEND_URL || ""}/api/me/tracks/${t.id}/audio`;
    play({
      id: `me_${t.id}`,
      title: t.title,
      artist: t.artist || "You",
      cover_url: t.cover_url || "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=600",
      stream_url: stream,
      external_url: null,
    });
  };

  const onDelete = (t: any) => {
    Alert.alert("Delete track?", t.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await api.deleteMyTrack(t.id);
          load();
        } catch (e: any) { Alert.alert("Failed", e?.message || "Could not delete"); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="mt-back">
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>YOUR LIBRARY</Text>
          <Text style={styles.h1}>My Tracks</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/studio/record")} testID="mt-rec">
          <Ionicons name="mic" size={20} color="#0A0A0C" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/studio/upload")} testID="mt-up">
          <Ionicons name="cloud-upload" size={20} color="#0A0A0C" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No tracks yet. Record or upload to start.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.sub}>{item.genre} · {item.source} · {item.duration_s ? `${item.duration_s}s` : "—"}</Text>
              </View>
              <TouchableOpacity onPress={() => onPlay(item)} style={styles.playBtn}>
                <Ionicons name="play" size={18} color="#0A0A0C" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(item)} style={styles.delBtn}>
                <Ionicons name="trash" size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 22, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 },
  title: { color: "#fff", fontWeight: "800", fontSize: 15 },
  sub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  delBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 60, gap: 12 },
  emptyText: { color: colors.textTertiary, textAlign: "center" },
});
