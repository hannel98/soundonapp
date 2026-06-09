import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Image, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

export default function AlbumGenerator() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [tracksText, setTracksText] = useState("");
  const [style, setStyle] = useState("modern, vibrant, abstract album cover");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const onGenerate = async () => {
    const trackTitles = tracksText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || !theme.trim() || trackTitles.length === 0) {
      Alert.alert("Missing fields", "Provide album name, theme, and at least one track title.");
      return;
    }
    setLoading(true);
    try {
      const album = await api.createAlbum(name.trim(), theme.trim(), trackTitles, style);
      setResult(album);
    } catch (e: any) {
      Alert.alert("Album error", e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="album-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.kicker}>AI ALBUM</Text>
              <Text style={styles.h1}>Album Generator</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Bundle your tracks with an AI-generated cover. Costs 2 $SOUND.
          </Text>

          {result && (
            <View style={styles.resultCard} testID="album-result">
              {result.cover_base64 ? (
                <Image
                  source={{ uri: `data:${result.cover_mime};base64,${result.cover_base64}` }}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, { alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: colors.textTertiary }}>No cover generated</Text>
                </View>
              )}
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultTheme}>{result.theme}</Text>
              <Text style={styles.resultTracks}>{result.track_titles.length} tracks</Text>
            </View>
          )}

          <Text style={styles.label}>Album Name</Text>
          <TextInput testID="album-name-input" value={name} onChangeText={setName}
            placeholder="Nights in Neon" placeholderTextColor={colors.textTertiary} style={styles.input} />

          <Text style={styles.label}>Theme / Vibe</Text>
          <TextInput testID="album-theme-input" value={theme} onChangeText={setTheme} multiline
            placeholder="Late-night drive, neon-lit city, retro synth-wave" placeholderTextColor={colors.textTertiary}
            style={[styles.input, { minHeight: 70 }]} />

          <Text style={styles.label}>Cover Style</Text>
          <TextInput testID="album-style-input" value={style} onChangeText={setStyle}
            placeholder="modern, vibrant, abstract" placeholderTextColor={colors.textTertiary} style={styles.input} />

          <Text style={styles.label}>Track Titles (one per line)</Text>
          <TextInput testID="album-tracks-input" value={tracksText} onChangeText={setTracksText} multiline
            placeholder={"Track 1\nTrack 2\nTrack 3"} placeholderTextColor={colors.textTertiary}
            style={[styles.input, { minHeight: 130 }]} />

          <TouchableOpacity testID="album-generate-btn" onPress={onGenerate} disabled={loading}
            style={[styles.primaryBtn, loading && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator color="#0A0A0C" /> : (
              <>
                <Ionicons name="sparkles" size={18} color="#0A0A0C" />
                <Text style={styles.primaryBtnText}>Generate Album · 2 $SOUND</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  label: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase" },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 14, fontSize: 15, textAlignVertical: "top" },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: radius.full, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, marginTop: 6 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16 },
  resultCard: { backgroundColor: colors.surface, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.token, alignItems: "center", gap: 6 },
  cover: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: "#111" },
  resultName: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 8 },
  resultTheme: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  resultTracks: { color: colors.token, fontSize: 12, fontWeight: "800", marginTop: 4 },
});
