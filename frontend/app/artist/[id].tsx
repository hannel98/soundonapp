import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

type Artist = {
  id: string;
  name: string;
  handle: string;
  tagline: string;
  category: string;
  platform: string;
  image_url: string;
  external_url?: string | null;
  followers: number;
};

export default function ArtistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const a = await api.artist(String(id));
        setArtist(a);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!artist) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <Text style={{ color: "#fff" }}>Artist not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const openExternal = () => {
    if (artist.external_url) Linking.openURL(artist.external_url).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: artist.image_url }} style={styles.hero} />
          <View style={styles.heroOverlay} />
          <SafeAreaView edges={["top"]} style={styles.topNav}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              testID="artist-back-btn"
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            <Text style={styles.heroChip}>
              {artist.category.toUpperCase()} • {artist.platform.toUpperCase()}
            </Text>
            <Text style={styles.heroName}>{artist.name}</Text>
            <Text style={styles.heroHandle}>@{artist.handle}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{artist.followers.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{artist.platform}</Text>
              <Text style={styles.statLabel}>Platform</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{artist.category}</Text>
              <Text style={styles.statLabel}>Genre</Text>
            </View>
          </View>

          <Text style={styles.about}>{artist.tagline}</Text>

          {artist.external_url && (
            <TouchableOpacity
              testID="artist-external-btn"
              onPress={openExternal}
              style={styles.cta}
            >
              <Ionicons name="open-outline" size={16} color="#0A0A0C" />
              <Text style={styles.ctaText}>
                {artist.platform === "YouTube"
                  ? "Watch on YouTube"
                  : artist.platform === "Apple Music"
                  ? "Listen on Apple Music"
                  : artist.platform === "Spotify"
                  ? "Play on Spotify"
                  : artist.platform === "BeatStars"
                  ? "Browse Beats"
                  : artist.platform === "UnitedMasters"
                  ? "Stream on UnitedMasters"
                  : "Visit"}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.linkList}>
            <TouchableOpacity style={styles.linkRow} testID="artist-share-btn">
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={styles.linkText}>Share artist</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} testID="artist-follow-btn">
              <Ionicons name="heart-outline" size={18} color="#fff" />
              <Text style={styles.linkText}>Follow {artist.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroWrap: { width: "100%", height: 380, position: "relative" },
  hero: { ...StyleSheet.absoluteFillObject, backgroundColor: "#111" },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,12,0.45)",
  },
  topNav: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  heroBottom: { position: "absolute", left: 24, right: 24, bottom: 24 },
  heroChip: { color: colors.primary, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  heroName: { color: "#fff", fontSize: 36, fontWeight: "900", letterSpacing: -1.2, marginTop: 6 },
  heroHandle: { color: colors.textSecondary, marginTop: 4 },
  body: { padding: spacing.lg },
  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  statValue: { color: "#fff", fontWeight: "900", fontSize: 14 },
  statLabel: { color: colors.textTertiary, fontSize: 10, marginTop: 4 },
  about: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 22,
  },
  cta: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minHeight: 48,
  },
  ctaText: { color: "#0A0A0C", fontWeight: "900", fontSize: 15 },
  linkList: { marginTop: 18, gap: 10 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { color: "#fff", flex: 1, fontWeight: "600" },
});
