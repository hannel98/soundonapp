import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { usePlayer } from "@/src/context/PlayerContext";
import { colors, radius, spacing } from "@/src/theme";

type Track = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  cover_url: string;
  platform: string;
  external_url?: string | null;
  plays: number;
};

type Beat = {
  id: string;
  title: string;
  producer: string;
  bpm: number;
  key: string;
  price: number;
  cover_url: string;
  license: string;
};

type Video = {
  id: string;
  title: string;
  artist: string;
  description: string;
  youtube_id: string;
  thumbnail: string;
  duration: string;
  genre: string;
  views: number;
};

const TABS = ["Music", "Beats", "Videos"] as const;

export default function Explore() {
  const { play } = usePlayer();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Music");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, b, v] = await Promise.all([api.tracks(), api.beats(), api.videos()]);
        setTracks(t);
        setBeats(b);
        setVideos(v);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>EXPLORE</Text>
        <Text style={styles.h1}>Discover Sound</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            testID={`explore-tab-${t}`}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tab === "Music" ? (
        <FlatList
          data={tracks}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`music-card-${item.id}`}
              style={styles.musicCard}
              onPress={() =>
                play({
                  id: item.id,
                  title: item.title,
                  artist: item.artist,
                  cover_url: item.cover_url,
                  external_url: item.external_url,
                })
              }
            >
              <Image source={{ uri: item.cover_url }} style={styles.musicCover} />
              <View style={{ flex: 1 }}>
                <Text style={styles.platformChip}>{item.platform.toUpperCase()}</Text>
                <Text style={styles.musicTitle}>{item.title}</Text>
                <Text style={styles.musicArtist}>
                  {item.artist} • {item.genre}
                </Text>
                <Text style={styles.musicPlays}>
                  <Ionicons name="headset" size={11} color={colors.textTertiary} />{" "}
                  {item.plays.toLocaleString()} plays
                </Text>
              </View>
              <View style={styles.playPill}>
                <Ionicons name="play" size={16} color={colors.primary} />
              </View>
            </TouchableOpacity>
          )}
        />
      ) : tab === "Beats" ? (
        <FlatList
          data={beats}
          keyExtractor={(i) => i.id}
          numColumns={2}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 12 }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.beatCard} testID={`beat-card-${item.id}`}>
              <Image source={{ uri: item.cover_url }} style={styles.beatCover} />
              <View style={{ padding: 12 }}>
                <Text style={styles.beatTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.beatProducer} numberOfLines={1}>{item.producer}</Text>
                <View style={styles.beatMetaRow}>
                  <Text style={styles.beatMeta}>{item.bpm} BPM</Text>
                  <Text style={styles.beatMeta}>{item.key}</Text>
                </View>
                <View style={styles.beatPriceRow}>
                  <Text style={styles.beatPrice}>${item.price}</Text>
                  <Text style={styles.beatLicense}>{item.license}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 14 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`video-card-${item.id}`}
              style={styles.videoCard}
              onPress={() =>
                Linking.openURL(`https://youtube.com/watch?v=${item.youtube_id}`)
              }
            >
              <View style={styles.videoThumbWrap}>
                <Image source={{ uri: item.thumbnail }} style={styles.videoThumb} />
                <View style={styles.playOverlay}>
                  <Ionicons name="play" size={28} color="#fff" />
                </View>
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{item.duration}</Text>
                </View>
              </View>
              <View style={{ padding: 12 }}>
                <Text style={styles.platformChip}>{item.genre.toUpperCase()}</Text>
                <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.videoArtist}>{item.artist}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6, marginTop: 4 },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: "center",
  },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#0A0A0C", fontWeight: "800" },
  musicCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 10,
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 84,
  },
  musicCover: { width: 64, height: 64, borderRadius: 8, backgroundColor: "#222" },
  platformChip: {
    color: colors.primary,
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "800",
    marginBottom: 2,
  },
  musicTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  musicArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  musicPlays: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  playPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  beatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  beatCover: { width: "100%", aspectRatio: 1, backgroundColor: "#222" },
  beatTitle: { color: "#fff", fontWeight: "800" },
  beatProducer: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  beatMetaRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  beatMeta: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: colors.elevated,
    borderRadius: 4,
  },
  beatPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  beatPrice: { color: colors.token, fontWeight: "900", fontSize: 16 },
  beatLicense: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  videoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  videoThumbWrap: { width: "100%", aspectRatio: 16 / 9, position: "relative" },
  videoThumb: { width: "100%", height: "100%", backgroundColor: "#111" },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  durationBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 4,
  },
  durationText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  videoTitle: { color: "#fff", fontWeight: "800", fontSize: 15, marginTop: 4 },
  videoArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
