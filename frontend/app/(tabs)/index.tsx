import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { usePlayer } from "@/src/context/PlayerContext";
import { colors, radius, spacing } from "@/src/theme";

type Artist = {
  id: string;
  name: string;
  tagline: string;
  category: string;
  platform: string;
  image_url: string;
  featured: boolean;
  followers: number;
};

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

type Progress = {
  sound_balance: number;
  streak: number;
  multiplier: number;
};

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { play } = usePlayer();
  const [featured, setFeatured] = useState<Artist[]>([]);
  const [ytChannels, setYtChannels] = useState<any[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [a, t, p, yt] = await Promise.all([
        api.artists(true),
        api.trending("24h"),
        user ? api.progress().catch(() => null) : Promise.resolve(null),
        api.ytFeatured(6).catch(() => []),
      ]);
      setFeatured(a);
      setTracks(t);
      setProgress(p);
      setYtChannels(yt as any[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.user_id]);

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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 160 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hey, {user?.display_name || user?.email?.split("@")[0] || "Creator"}
            </Text>
            <Text style={styles.brand}>SOUND</Text>
          </View>
          {progress && (
            <View style={styles.tokenBadge} testID="home-token-badge">
              <View style={styles.tokenDot} />
              <Text style={styles.tokenText}>
                {progress.sound_balance} <Text style={styles.tokenSuffix}>$SOUND</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Image
            source={{
              uri: "https://static.prod-images.emergentagent.com/jobs/25f7cda1-22ab-49ec-90b1-23330ae8853e/images/cd7f5ff4e0c30622e2f297bbcb2ead4eef851b484330214cc95c2cb7d46fb4be.png",
            }}
            style={styles.heroBg}
          />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroLabel}>WELCOME TO SOUND</Text>
            <Text style={styles.heroTitle}>Create the future of music</Text>
            <Text style={styles.heroSub}>
              AI-powered tools, community, and $SOUND token rewards for your creativity.
            </Text>
            <TouchableOpacity
              testID="hero-open-studio"
              style={styles.heroBtn}
              onPress={() => router.push("/(tabs)/studio")}
            >
              <Ionicons name="sparkles" size={16} color="#0A0A0C" />
              <Text style={styles.heroBtnText}>Open AI Studio</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Featured Artists */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>🎵 Featured Artists</Text>
          <Text style={styles.sectionMeta}>{featured.length} creators</Text>
        </View>
        <FlatList
          data={featured}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 14 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`artist-card-${item.id}`}
              style={styles.artistCard}
              onPress={() => router.push(`/artist/${item.id}` as any)}
            >
              <Image source={{ uri: item.image_url }} style={styles.artistImg} />
              <View style={styles.artistMeta}>
                <Text style={styles.platformChip}>{item.platform.toUpperCase()}</Text>
                <Text style={styles.artistName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.artistTagline} numberOfLines={2}>
                  {item.tagline}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />

        {/* Featured YouTube Channels (RSS-driven, no API key) */}
        {ytChannels.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>📺 Featured on YouTube</Text>
              <Text style={styles.sectionMeta}>{ytChannels[0]?.display_name}</Text>
            </View>
            <FlatList
              data={ytChannels.flatMap((c) => c.videos.map((v: any) => ({ ...v, channel: c })))}
              keyExtractor={(v) => v.video_id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`yt-${item.video_id}`}
                  style={styles.ytCard}
                  onPress={() => Linking.openURL(item.url)}
                >
                  <Image source={{ uri: item.thumb_url }} style={styles.ytThumb} />
                  <View style={styles.ytPlayOverlay}>
                    <Ionicons name="play" size={22} color="#fff" />
                  </View>
                  <View style={styles.ytMeta}>
                    <Text style={styles.ytChannel} numberOfLines={1}>{item.channel.display_name}</Text>
                    <Text style={styles.ytTitle} numberOfLines={2}>{item.title}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}

        {/* Trending tracks */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>🔥 Trending Sounds</Text>
          <Text style={styles.sectionMeta}>24h</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, gap: 10 }}>
          {tracks.slice(0, 5).map((t, idx) => (
            <TouchableOpacity
              key={t.id}
              testID={`trending-track-${t.id}`}
              style={styles.trackRow}
              onPress={() =>
                play({
                  id: t.id,
                  title: t.title,
                  artist: t.artist,
                  cover_url: t.cover_url,
                  external_url: t.external_url,
                })
              }
            >
              <Text style={styles.trackRank}>{idx + 1}</Text>
              <Image source={{ uri: t.cover_url }} style={styles.trackCover} />
              <View style={{ flex: 1 }}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {t.artist} • {t.genre}
                </Text>
              </View>
              <View style={styles.playPill}>
                <Ionicons name="play" size={14} color={colors.primary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tips */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>🎧 Production Tips</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, gap: 12 }}>
          {TIPS.map((tip) => (
            <View key={tip.title} style={styles.tipCard}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipBody}>{tip.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const TIPS = [
  { title: "Start with a Strong Foundation", body: "Every great track begins with a solid beat. Use the AI drum machine to create unique rhythms." },
  { title: "Layer Your Sounds", body: "Experiment with multiple instruments and samples. Layering creates depth and richness." },
  { title: "Master Your Mix", body: "Balance vocals, instruments, and effects. Use EQ and compression wisely." },
  { title: "Collaborate & Learn", body: "Connect with other producers in the community to discover new techniques." },
];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  greeting: { color: colors.textSecondary, fontSize: 13, marginBottom: 2 },
  brand: { color: colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(0,255,102,0.32)",
    gap: 6,
  },
  tokenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.token },
  tokenText: { color: colors.textPrimary, fontWeight: "800", fontSize: 13 },
  tokenSuffix: { color: colors.token, fontWeight: "800", fontSize: 10 },
  heroCard: {
    marginHorizontal: spacing.lg,
    height: 220,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  heroBg: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
  heroOverlay: {
    flex: 1,
    padding: 22,
    justifyContent: "flex-end",
    backgroundColor: "rgba(10,10,12,0.45)",
  },
  heroLabel: {
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  heroSub: { color: "#D7D7DA", marginTop: 6, fontSize: 13, lineHeight: 18 },
  heroBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    minHeight: 44,
  },
  heroBtnText: { color: "#0A0A0C", fontWeight: "800" },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "800" },
  sectionMeta: { color: colors.textTertiary, fontSize: 12 },
  ytCard: { width: 240, backgroundColor: colors.surface, borderRadius: 12, borderColor: colors.border, borderWidth: 1, overflow: "hidden" },
  ytThumb: { width: "100%", height: 135, backgroundColor: "#000" },
  ytPlayOverlay: { position: "absolute", top: 50, left: 100, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,0,0,0.85)", alignItems: "center", justifyContent: "center" },
  ytMeta: { padding: 10, gap: 4 },
  ytChannel: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  ytTitle: { color: "#fff", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  artistCard: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  artistImg: { width: "100%", height: 130, backgroundColor: "#222" },
  artistMeta: { padding: 12 },
  platformChip: {
    color: colors.primary,
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "800",
    marginBottom: 4,
  },
  artistName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  artistTagline: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 64,
  },
  trackRank: { width: 22, color: colors.textTertiary, fontWeight: "800", fontSize: 14, textAlign: "center" },
  trackCover: { width: 48, height: 48, borderRadius: 6, backgroundColor: "#222" },
  trackTitle: { color: "#fff", fontWeight: "700" },
  trackArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  playPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tipCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipTitle: { color: colors.textPrimary, fontWeight: "800", marginBottom: 6 },
  tipBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
