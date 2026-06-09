import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import VoiceStudio from "@/src/components/VoiceStudio";

const GENRES = ["Hip Hop", "Trap", "R&B", "Lo-Fi", "Drill", "House", "Afrobeats", "Pop"];
const MOODS = ["Dark", "Uplifting", "Aggressive", "Chill", "Romantic", "Cinematic"];
const BPMS = [80, 90, 110, 128, 140, 160];

export default function Studio() {
  const router = useRouter();
  const [genre, setGenre] = useState("Hip Hop");
  const [mood, setMood] = useState("Dark");
  const [bpm, setBpm] = useState(128);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ title: string; key: string } | null>(null);

  const generate = async () => {
    setGenerating(true);
    setGenerated(null);
    // Simulated AI generation (local) — backend AI integration is a future expansion
    await new Promise((r) => setTimeout(r, 1500));
    const keys = ["A min", "C# min", "F# min", "D min", "G min", "E min"];
    setGenerated({
      title: `${mood} ${genre} Beat`,
      key: keys[Math.floor(Math.random() * keys.length)],
    });
    setGenerating(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.kicker}>AI STUDIO</Text>
              <Text style={styles.h1}>Create your beat</Text>
            </View>
            <View style={styles.sparkleBadge}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
            </View>
          </View>

          {/* Hero image */}
          <View style={styles.hero}>
            <Image
              source={{
                uri: "https://static.prod-images.emergentagent.com/jobs/25f7cda1-22ab-49ec-90b1-23330ae8853e/images/a63315ab7b5845f8c21cf08d0a3183c87b3bf9d4bcb8258c6c42d2f53081c2a2.png",
              }}
              style={styles.heroImg}
            />
          </View>

          {/* Prompt */}
          <Text style={styles.label}>Vibe prompt</Text>
          <TextInput
            testID="studio-prompt-input"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g., late night drive, neon city, 808 hits..."
            placeholderTextColor={colors.textTertiary}
            multiline
            style={styles.textArea}
          />

          {/* Genre chips */}
          <Text style={styles.label}>Genre</Text>
          <View style={styles.chipWrap}>
            {GENRES.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => setGenre(g)}
                style={[styles.chip, genre === g && styles.chipActive]}
                testID={`studio-genre-${g}`}
              >
                <Text style={[styles.chipText, genre === g && styles.chipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Mood</Text>
          <View style={styles.chipWrap}>
            {MOODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMood(m)}
                style={[styles.chip, mood === m && styles.chipActive]}
                testID={`studio-mood-${m}`}
              >
                <Text style={[styles.chipText, mood === m && styles.chipTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>BPM</Text>
          <View style={styles.chipWrap}>
            {BPMS.map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setBpm(b)}
                style={[styles.chip, bpm === b && styles.chipActive]}
                testID={`studio-bpm-${b}`}
              >
                <Text style={[styles.chipText, bpm === b && styles.chipTextActive]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            testID="studio-generate-btn"
            onPress={generate}
            disabled={generating}
            style={[styles.cta, generating && { opacity: 0.6 }]}
          >
            {generating ? (
              <ActivityIndicator color="#0A0A0C" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#0A0A0C" />
                <Text style={styles.ctaText}>Generate Beat</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-record-btn"
            onPress={() => router.push("/studio/record" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="mic" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>Record Beat / Vocal</Text>
              <Text style={styles.gameCtaSub}>Up to 3 min · costs 1 $SOUND</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-upload-btn"
            onPress={() => router.push("/studio/upload" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="cloud-upload" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>Upload Beat</Text>
              <Text style={styles.gameCtaSub}>MP3 / WAV / M4A · costs 1 $SOUND</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-live-btn"
            onPress={() => router.push("/live" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="radio" size={20} color="#ff3b30" />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>Go Live</Text>
              <Text style={styles.gameCtaSub}>Start a broadcast · costs 3 $SOUND</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-mytracks-btn"
            onPress={() => router.push("/me/tracks" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="library" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>My Tracks</Text>
              <Text style={styles.gameCtaSub}>Library + play + delete</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-lyrics-btn"
            onPress={() => router.push("/studio/lyrics" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="document-text" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>Lyrics AI Comparator</Text>
              <Text style={styles.gameCtaSub}>Drake, Taylor Swift, Kendrick…</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-chat-btn"
            onPress={() => router.push("/chat" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="chatbubbles" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>Mesh Chat (BitChat)</Text>
              <Text style={styles.gameCtaSub}>#bitchat · geohash · encrypted DMs</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-rhythm-game-btn"
            onPress={() => router.push("/games/rhythm" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="game-controller" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>Beat Game: Rhythm Tap</Text>
              <Text style={styles.gameCtaSub}>Hit the lanes • earn $SOUND</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="studio-album-gen-btn"
            onPress={() => router.push("/albums/create" as any)}
            style={styles.gameCta}
          >
            <Ionicons name="albums" size={20} color={colors.token} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gameCtaTitle}>AI Album Generator</Text>
              <Text style={styles.gameCtaSub}>Bundle tracks + AI cover art · 2 $SOUND</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {generated && (
            <View style={styles.resultCard} testID="studio-generated">
              <Text style={styles.resultKicker}>GENERATED BEAT</Text>
              <Text style={styles.resultTitle}>{generated.title}</Text>
              <View style={styles.resultMetaRow}>
                <View style={styles.resultMeta}>
                  <Text style={styles.metaLabel}>BPM</Text>
                  <Text style={styles.metaValue}>{bpm}</Text>
                </View>
                <View style={styles.resultMeta}>
                  <Text style={styles.metaLabel}>KEY</Text>
                  <Text style={styles.metaValue}>{generated.key}</Text>
                </View>
                <View style={styles.resultMeta}>
                  <Text style={styles.metaLabel}>GENRE</Text>
                  <Text style={styles.metaValue}>{genre}</Text>
                </View>
              </View>
              <View style={styles.waveform}>
                {Array.from({ length: 40 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.waveBar,
                      { height: 8 + Math.abs(Math.sin(i * 0.7)) * 36 },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.resultActions}>
                <TouchableOpacity style={styles.actionGhost} testID="studio-save-btn">
                  <Ionicons name="bookmark-outline" size={16} color="#fff" />
                  <Text style={styles.actionGhostText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionPrimary} testID="studio-publish-btn">
                  <Ionicons name="cloud-upload" size={16} color="#0A0A0C" />
                  <Text style={styles.actionPrimaryText}>Publish</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <VoiceStudio />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6, marginTop: 4 },
  sparkleBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,184,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    marginHorizontal: spacing.lg,
    height: 160,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#111",
    marginTop: 4,
  },
  heroImg: { width: "100%", height: "100%" },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginHorizontal: spacing.lg,
    marginTop: 20,
    marginBottom: 8,
  },
  textArea: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: "#fff",
    borderRadius: radius.md,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: "top",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: spacing.lg },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#0A0A0C", fontWeight: "800" },
  cta: {
    marginHorizontal: spacing.lg,
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
  },
  ctaText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  gameCta: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
  },
  gameCtaTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  gameCtaSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  resultCard: {
    marginHorizontal: spacing.lg,
    marginTop: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 18,
  },
  resultKicker: { color: colors.token, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  resultTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 6 },
  resultMetaRow: { flexDirection: "row", gap: 24, marginTop: 14 },
  resultMeta: {},
  metaLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1.4, fontWeight: "700" },
  metaValue: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 2 },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 18,
    height: 44,
  },
  waveBar: { flex: 1, backgroundColor: colors.primary, borderRadius: 2 },
  resultActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 44,
  },
  actionGhostText: { color: "#fff", fontWeight: "700" },
  actionPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minHeight: 44,
  },
  actionPrimaryText: { color: "#0A0A0C", fontWeight: "800" },
});
