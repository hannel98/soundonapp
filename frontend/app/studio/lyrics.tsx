import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

type Artist = { name: string; genre: string; keywords: string[] };

export default function LyricsStudio() {
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artist, setArtist] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [title, setTitle] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    api.lyricsArtists().then((d) => {
      setArtists(d);
      setArtist(d[0]?.name || null);
    });
  }, []);

  const onAnalyze = async () => {
    if (!artist) return Alert.alert("Artist", "Pick an artist to compare to");
    if (lyrics.trim().length < 20) return Alert.alert("Lyrics", "Write at least 20 characters");
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await api.lyricsAnalyze({
        lyrics: lyrics.trim(),
        artist,
        save: true,
        title: title.trim() || undefined,
      });
      setResult(res.result);
    } catch (e: any) {
      Alert.alert("Analysis failed", e?.message || "Try again");
    } finally {
      setAnalyzing(false);
    }
  };

  const score = result?.similarity ?? null;
  const scoreColor = score == null ? colors.textTertiary : score >= 75 ? colors.token : score >= 50 ? colors.primary : colors.accent;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220, gap: 16 }}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="lyr-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.kicker}>STUDIO</Text>
              <Text style={styles.h1}>Lyrics Comparator</Text>
            </View>
          </View>
          <Text style={styles.intro}>
            Write lyrics, pick an artist, and get a side-by-side style breakdown powered by AI.
          </Text>

          <Text style={styles.fieldLabel}>Compare to</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {artists.map((a) => (
              <TouchableOpacity
                key={a.name}
                onPress={() => setArtist(a.name)}
                style={[styles.artistChip, artist === a.name && styles.artistChipActive]}
                testID={`lyr-artist-${a.name}`}
              >
                <Text style={[styles.artistChipText, artist === a.name && styles.artistChipTextActive]}>{a.name}</Text>
                <Text style={[styles.artistChipGenre, artist === a.name && { color: "#0A0A0C" }]}>{a.genre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Title (optional)</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            placeholder="Song name"
            placeholderTextColor={colors.textTertiary}
            testID="lyr-title"
          />

          <Text style={styles.fieldLabel}>Your lyrics</Text>
          <TextInput
            value={lyrics}
            onChangeText={setLyrics}
            multiline
            style={[styles.input, { height: 200, textAlignVertical: "top" }]}
            placeholder={"Drop your verse, chorus, bridge..."}
            placeholderTextColor={colors.textTertiary}
            testID="lyr-input"
          />

          <TouchableOpacity
            onPress={onAnalyze}
            disabled={analyzing}
            style={[styles.primaryBtn, analyzing && { opacity: 0.6 }]}
            testID="lyr-analyze"
          >
            {analyzing ? (
              <ActivityIndicator color="#0A0A0C" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#0A0A0C" />
                <Text style={styles.primaryBtnText}>Analyze Style</Text>
              </>
            )}
          </TouchableOpacity>

          {result && (
            <View style={styles.resultWrap} testID="lyr-result">
              <View style={styles.scoreCard}>
                <Text style={styles.scoreLabel}>SIMILARITY TO {artist?.toUpperCase()}</Text>
                <Text style={[styles.scoreValue, { color: scoreColor }]}>
                  {score != null ? `${score}%` : "—"}
                </Text>
                {result.verdict && <Text style={styles.verdict}>{result.verdict}</Text>}
              </View>

              {result.sub_scores && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Breakdown</Text>
                  {Object.entries(result.sub_scores).map(([k, v]: [string, any]) => (
                    <View key={k} style={styles.subRow}>
                      <Text style={styles.subLabel}>{k.replace("_", " ")}</Text>
                      <View style={styles.barBg}>
                        <View style={[styles.barFg, { width: `${Math.max(0, Math.min(100, Number(v)))}%` }]} />
                      </View>
                      <Text style={styles.subVal}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(result.strengths || []).length > 0 && (
                <Section title="Strengths" icon="checkmark-circle" color={colors.token} items={result.strengths} />
              )}
              {(result.differences || []).length > 0 && (
                <Section title="Differences from style" icon="alert-circle" color={colors.accent} items={result.differences} />
              )}
              {(result.suggestions || []).length > 0 && (
                <Section title="Suggestions" icon="bulb" color={colors.primary} items={result.suggestions} />
              )}
              {(result.signature_phrases_to_borrow || []).length > 0 && (
                <Section title="Style phrases to borrow" icon="copy" color={colors.primary} items={result.signature_phrases_to_borrow} />
              )}
              {result.feedback && !result.sub_scores && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Feedback</Text>
                  <Text style={styles.bodyText}>{String(result.feedback)}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, icon, color, items }: { title: string; icon: any; color: string; items: string[] }) {
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {items.map((it, i) => (
        <Text key={i} style={styles.bullet}>• {it}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.2, fontWeight: "800", textTransform: "uppercase" },
  chipRow: { gap: 10, paddingVertical: 4 },
  artistChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minWidth: 120 },
  artistChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  artistChipText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  artistChipTextActive: { color: "#0A0A0C" },
  artistChipGenre: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 14, minHeight: 48 },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginTop: 4, minHeight: 52 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16 },
  resultWrap: { gap: 14, marginTop: 8 },
  scoreCard: { backgroundColor: colors.surface, padding: 18, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, alignItems: "center" },
  scoreLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1.4, fontWeight: "800" },
  scoreValue: { fontSize: 56, fontWeight: "900", marginTop: 6 },
  verdict: { color: "#fff", fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: "center" },
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, gap: 8 },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 15 },
  bullet: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  bodyText: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  subLabel: { width: 96, color: colors.textSecondary, fontSize: 12, textTransform: "capitalize" },
  barBg: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  barFg: { height: "100%", backgroundColor: colors.primary },
  subVal: { width: 36, textAlign: "right", color: "#fff", fontWeight: "800", fontSize: 12 },
});
