import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  FlatList,
  TextInput,
  Share,
  Alert,
  Platform,
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

type AudiusTrack = {
  id: string;
  title: string;
  artist: string;
  artist_handle?: string;
  genre: string;
  duration: number;
  play_count: number;
  cover_url: string;
  permalink?: string | null;
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

const TABS = ["Audius", "Music", "Beats", "Videos"] as const;
type TabKey = (typeof TABS)[number];

export default function Explore() {
  const { play } = usePlayer();
  const [tab, setTab] = useState<TabKey>("Audius");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [audius, setAudius] = useState<AudiusTrack[]>([]);
  const [audiusLoading, setAudiusLoading] = useState(false);
  const [audiusQuery, setAudiusQuery] = useState("");
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

  // Load Audius on first visit to that tab and on query commit
  useEffect(() => {
    if (tab === "Audius" && audius.length === 0 && !audiusLoading) {
      loadAudiusTrending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadAudiusTrending = async () => {
    setAudiusLoading(true);
    try {
      const data = await api.audiusTrending(20);
      setAudius(data);
    } catch {
      setAudius([]);
    } finally {
      setAudiusLoading(false);
    }
  };

  const submitSearch = async () => {
    if (!audiusQuery.trim()) {
      loadAudiusTrending();
      return;
    }
    setAudiusLoading(true);
    try {
      const data = await api.audiusSearch(audiusQuery.trim(), 20);
      setAudius(data);
    } catch {
      setAudius([]);
    } finally {
      setAudiusLoading(false);
    }
  };

  const playAudius = async (t: AudiusTrack) => {
    let stream: string | null = null;
    try {
      const res = await api.audiusStream(t.id);
      stream = res?.stream_url || null;
    } catch {}
    play({
      id: `audius_${t.id}`,
      title: t.title,
      artist: t.artist,
      cover_url: t.cover_url,
      external_url: t.permalink || stream || null,
    });
  };

  const shareViaBriar = async (t: AudiusTrack) => {
    const payload = `TRACK: ${t.title} | ARTIST: ${t.artist} | URL: ${t.permalink || ""}`;
    // Best-effort Briar handoff: try briar:// URI, then fall back to native share sheet.
    try {
      const briarUrl = `briar://share?text=${encodeURIComponent(payload)}`;
      const supported = await Linking.canOpenURL(briarUrl);
      if (supported) {
        await Linking.openURL(briarUrl);
        return;
      }
    } catch {}
    try {
      if (Platform.OS !== "web") {
        await Share.share({ message: payload });
      } else {
        Alert.alert("Briar", "Install Briar on Android to share over mesh.\n\nPayload:\n" + payload);
      }
    } catch {}
  };

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

      {tab === "Audius" && (
        <View key="audius-list" style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              testID="audius-search-input"
              value={audiusQuery}
              onChangeText={setAudiusQuery}
              onSubmitEditing={submitSearch}
              placeholder="Search Audius tracks, artists..."
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {audiusQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setAudiusQuery("");
                  loadAudiusTrending();
                }}
                testID="audius-search-clear"
              >
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {audiusLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : audius.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: colors.textTertiary }}>No tracks found.</Text>
            </View>
          ) : (
            <FlatList
              key="audius"
              data={audius}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 12 }}
              renderItem={({ item }) => (
                <View style={styles.audiusCard} testID={`audius-card-${item.id}`}>
                  <TouchableOpacity
                    style={styles.audiusRow}
                    onPress={() => playAudius(item)}
                    testID={`audius-play-${item.id}`}
                  >
                    <Image source={{ uri: item.cover_url }} style={styles.musicCover} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.platformChip}>AUDIUS • {item.genre.toUpperCase()}</Text>
                      <Text style={styles.musicTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.musicArtist} numberOfLines={1}>{item.artist}</Text>
                      <Text style={styles.musicPlays}>
                        <Ionicons name="headset" size={11} color={colors.textTertiary} />{" "}
                        {item.play_count.toLocaleString()} plays • {formatDuration(item.duration)}
                      </Text>
                    </View>
                    <View style={styles.playPill}>
                      <Ionicons name="play" size={16} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                  <View style={styles.audiusActions}>
                    <TouchableOpacity
                      style={styles.actionGhost}
                      onPress={() => item.permalink && Linking.openURL(item.permalink)}
                      testID={`audius-open-${item.id}`}
                    >
                      <Ionicons name="open-outline" size={14} color="#fff" />
                      <Text style={styles.actionGhostText}>Open on Audius</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionMesh}
                      onPress={() => shareViaBriar(item)}
                      testID={`audius-briar-${item.id}`}
                    >
                      <Ionicons name="git-network-outline" size={14} color={colors.token} />
                      <Text style={styles.actionMeshText}>Share via Briar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      )}

      {tab === "Music" && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            key="music"
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
                  <Text style={styles.musicArtist}>{item.artist} • {item.genre}</Text>
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
        )
      )}

      {tab === "Beats" && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            key="beats"
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
        )
      )}

      {tab === "Videos" && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            key="videos"
            data={videos}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 14 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID={`video-card-${item.id}`}
                style={styles.videoCard}
                onPress={() => Linking.openURL(`https://youtube.com/watch?v=${item.youtube_id}`)}
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
        )
      )}
    </SafeAreaView>
  );
}

function formatDuration(sec: number) {
  if (!sec || sec < 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginVertical: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 0 },
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
  audiusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  audiusRow: {
    flexDirection: "row",
    padding: 10,
    gap: 12,
    alignItems: "center",
  },
  audiusActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  actionGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 36,
  },
  actionGhostText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  actionMesh: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(0,255,102,0.35)",
    backgroundColor: "rgba(0,255,102,0.06)",
    minHeight: 36,
  },
  actionMeshText: { color: colors.token, fontWeight: "800", fontSize: 12 },
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
