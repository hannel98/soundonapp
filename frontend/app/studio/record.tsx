import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import {
  useAudioRecorder,
  useAudioPlayer,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import { api } from "@/src/api/client";
import { spendOr } from "@/src/utils/spend";
import { colors, radius, spacing } from "@/src/theme";

const MAX_SECONDS = 180;

export default function RecordScreen() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("Original");
  const [bpm, setBpm] = useState("");
  const [isBeat, setIsBeat] = useState(false);
  const [uploading, setUploading] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewPlayer = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);

  useEffect(() => {
    (async () => {
      try {
        const s = await AudioModule.requestRecordingPermissionsAsync();
        if (!s.granted) {
          Alert.alert(
            "Microphone",
            "Mic permission denied. Enable in Settings to record audio.",
          );
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {}
    })();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const startRec = async () => {
    setRecordedUri(null);
    setElapsed(0);
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      tickRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= MAX_SECONDS) {
            stopRec();
          }
          return e + 1;
        });
      }, 1000);
    } catch (e: any) {
      Alert.alert("Record", e?.message || "Could not start");
    }
  };

  const stopRec = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setRecordedUri(uri || null);
      setRecording(false);
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    } catch (e: any) {
      Alert.alert("Record", e?.message || "Could not stop");
    }
  };

  const discard = () => {
    setRecordedUri(null);
    setElapsed(0);
  };

  const upload = async () => {
    if (!recordedUri) return;
    if (title.trim().length < 1) return Alert.alert("Title", "Give it a title");
    setUploading(true);
    try {
      // Pre-charge 1 $SOUND (free for Pro subscribers)
      const spent = await spendOr("upload_music", router, { title: title.trim() });
      if (!spent) { setUploading(false); return; }
      let b64: string;
      let mime = "audio/m4a";
      if (Platform.OS === "web") {
        // Web: fetch blob & convert
        const res = await fetch(recordedUri);
        const blob = await res.blob();
        mime = blob.type || "audio/webm";
        b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onerror = reject;
          r.onloadend = () => {
            const s = r.result as string;
            resolve(s.includes(",") ? s.split(",")[1] : s);
          };
          r.readAsDataURL(blob);
        });
      } else {
        b64 = await FileSystem.readAsStringAsync(recordedUri, { encoding: FileSystem.EncodingType.Base64 });
        // Try to infer from extension
        if (recordedUri.endsWith(".caf")) mime = "audio/x-caf";
        else if (recordedUri.endsWith(".wav")) mime = "audio/wav";
        else if (recordedUri.endsWith(".mp3")) mime = "audio/mpeg";
      }
      const res = await api.uploadTrack({
        title: title.trim(),
        genre,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        mime,
        duration_s: elapsed || undefined,
        audio_b64: b64,
        source: "record",
        is_beat: isBeat,
      });
      Alert.alert(
        "Published",
        `Spent ${spent.cost} $SOUND\nBalance: ${res.balance ?? "—"}`,
      );
      router.replace("/me/tracks");
    } catch (e: any) {
      Alert.alert("Upload", e?.message || "Failed");
    } finally {
      setUploading(false);
    }
  };

  const minutes = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200, gap: 16 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="rec-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>STUDIO</Text>
            <Text style={styles.h1}>Record</Text>
          </View>
        </View>

        <View style={styles.recCard}>
          <Text style={styles.timer}>
            {minutes}:{secs.toString().padStart(2, "0")}
          </Text>
          <Text style={styles.timerHint}>Max {Math.floor(MAX_SECONDS / 60)} min</Text>
          {!recording && !recordedUri && (
            <TouchableOpacity onPress={startRec} style={styles.recBtn} testID="rec-start">
              <Ionicons name="mic" size={32} color="#fff" />
              <Text style={styles.recText}>Start Recording</Text>
            </TouchableOpacity>
          )}
          {recording && (
            <TouchableOpacity onPress={stopRec} style={[styles.recBtn, { backgroundColor: colors.accent }]} testID="rec-stop">
              <Ionicons name="square" size={28} color="#fff" />
              <Text style={styles.recText}>Stop</Text>
            </TouchableOpacity>
          )}
          {recordedUri && !recording && (
            <View style={{ gap: 10, marginTop: 10, alignSelf: "stretch" }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => { try { (previewPlayer as any)?.play?.(); } catch {} }}
                  style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                  testID="rec-play"
                >
                  <Ionicons name="play" size={18} color="#0A0A0C" />
                  <Text style={[styles.smallBtnText, { color: "#0A0A0C" }]}>Preview</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={discard} style={[styles.smallBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.smallBtnText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {recordedUri && (
          <View style={styles.card}>
            <Text style={styles.section}>Track info</Text>
            <TextInput
              placeholder="Title"
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              style={styles.input}
              testID="rec-title"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                placeholder="Genre"
                placeholderTextColor={colors.textTertiary}
                value={genre}
                onChangeText={setGenre}
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                placeholder="BPM"
                placeholderTextColor={colors.textTertiary}
                value={bpm}
                onChangeText={setBpm}
                style={[styles.input, { width: 80 }]}
                keyboardType="number-pad"
              />
            </View>
            <TouchableOpacity onPress={() => setIsBeat((v) => !v)} style={styles.checkRow} testID="rec-isbeat">
              <Ionicons name={isBeat ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
              <Text style={styles.checkText}>Publish as Beat (others can license)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={upload}
              disabled={uploading}
              style={[styles.primaryBtn, uploading && { opacity: 0.6 }]}
              testID="rec-upload"
            >
              {uploading ? (
                <ActivityIndicator color="#0A0A0C" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={18} color="#0A0A0C" />
                  <Text style={styles.primaryBtnText}>Publish & earn $SOUND</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  recCard: { backgroundColor: colors.surface, padding: 20, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, alignItems: "center", gap: 12 },
  timer: { color: "#fff", fontSize: 56, fontWeight: "900", fontVariant: ["tabular-nums"] },
  timerHint: { color: colors.textTertiary, fontSize: 11 },
  recBtn: { flexDirection: "row", gap: 10, backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999, alignItems: "center", minHeight: 52 },
  recText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  smallBtn: { flex: 1, flexDirection: "row", gap: 8, paddingVertical: 10, borderRadius: 999, alignItems: "center", justifyContent: "center", minHeight: 44 },
  smallBtnText: { color: "#fff", fontWeight: "800" },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, gap: 10 },
  section: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 14, minHeight: 48 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkText: { color: colors.textPrimary, fontSize: 13 },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.full, alignItems: "center", justifyContent: "center", minHeight: 52 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 15 },
});
