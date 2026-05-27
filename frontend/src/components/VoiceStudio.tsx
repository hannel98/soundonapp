/**
 * AI Voice Studio section embedded in the Studio tab.
 * - Text-to-Voice: type text -> /api/ai/tts -> play returned base64 mp3 via expo-audio.
 * - Voice-to-Text: record via expo-audio -> upload to /api/ai/stt -> show transcript.
 *
 * Handles mic permission contract per the platform guidelines: ask only after intent,
 * surface "Open Settings" when permanently denied, never dead-end.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import {
  useAudioPlayer,
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

const VOICES = ["alloy", "nova", "echo", "fable", "onyx", "shimmer", "coral", "sage", "ash"] as const;

export default function VoiceStudio() {
  // ---------- TTS ----------
  const [ttsText, setTtsText] = useState("Welcome to Sound. Let's cook something fire.");
  const [voice, setVoice] = useState<(typeof VOICES)[number]>("nova");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsUri, setTtsUri] = useState<string | null>(null);
  const ttsPlayer = useAudioPlayer(ttsUri);

  const onGenerateSpeech = async () => {
    if (!ttsText.trim()) return;
    setTtsLoading(true);
    try {
      const res = await api.ttsGenerate(ttsText.trim(), voice);
      const uri = `data:${res.mime_type};base64,${res.audio_base64}`;
      setTtsUri(uri);
    } catch (e: any) {
      Alert.alert("TTS error", e?.message || "Could not generate speech");
    } finally {
      setTtsLoading(false);
    }
  };

  useEffect(() => {
    if (ttsUri && ttsPlayer) {
      try {
        ttsPlayer.seekTo(0);
        ttsPlayer.play();
      } catch {}
    }
  }, [ttsUri, ttsPlayer]);

  // ---------- STT ----------
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recState, setRecState] = useState<"idle" | "asking" | "recording" | "uploading" | "blocked">("idle");
  const [transcript, setTranscript] = useState<string>("");
  const startTime = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const askMicPermission = useCallback(async () => {
    const cur = await AudioModule.getRecordingPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) {
      setRecState("blocked");
      return false;
    }
    const next = await AudioModule.requestRecordingPermissionsAsync();
    if (!next.granted) {
      if (!next.canAskAgain) setRecState("blocked");
      return false;
    }
    return true;
  }, []);

  const startRecording = async () => {
    setTranscript("");
    setRecState("asking");
    const ok = await askMicPermission();
    if (!ok) return;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startTime.current = Date.now();
      setElapsed(0);
      tick.current = setInterval(() => {
        if (startTime.current) setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
      }, 250);
      setRecState("recording");
    } catch (e: any) {
      Alert.alert("Recorder error", e?.message || "Could not start recorder");
      setRecState("idle");
    }
  };

  const stopAndTranscribe = async () => {
    if (recState !== "recording") return;
    setRecState("uploading");
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording uri");
      // expo-audio HIGH_QUALITY preset produces m4a on iOS/Android, webm on web
      const mime = Platform.OS === "web" ? "audio/webm" : "audio/m4a";
      const res = await api.sttUpload(uri, mime);
      setTranscript(res.text || "(no speech detected)");
      setRecState("idle");
    } catch (e: any) {
      Alert.alert("Transcribe error", e?.message || "Could not transcribe");
      setRecState("idle");
    }
  };

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
    },
    []
  );

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.kicker}>AI VOICE</Text>
        <Text style={styles.h2}>Text → Voice</Text>
      </View>

      <TextInput
        testID="voice-studio-tts-input"
        value={ttsText}
        onChangeText={setTtsText}
        multiline
        placeholder="Type your lyrics or hook..."
        placeholderTextColor={colors.textTertiary}
        style={styles.textArea}
      />

      <View style={styles.chipRow}>
        {VOICES.map((v) => (
          <TouchableOpacity
            key={v}
            testID={`voice-chip-${v}`}
            onPress={() => setVoice(v)}
            style={[styles.chip, voice === v && styles.chipActive]}
          >
            <Text style={[styles.chipText, voice === v && styles.chipTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        testID="voice-studio-generate"
        onPress={onGenerateSpeech}
        disabled={ttsLoading}
        style={[styles.primaryBtn, ttsLoading && { opacity: 0.6 }]}
      >
        {ttsLoading ? (
          <ActivityIndicator color="#0A0A0C" />
        ) : (
          <>
            <Ionicons name="play-circle" size={18} color="#0A0A0C" />
            <Text style={styles.primaryBtnText}>Generate & Play</Text>
          </>
        )}
      </TouchableOpacity>

      {ttsUri && !ttsLoading && (
        <View style={styles.playbackRow}>
          <Ionicons name="musical-note" size={14} color={colors.token} />
          <Text style={styles.playbackText}>AI vocal ready • tap above to regenerate</Text>
          <TouchableOpacity
            onPress={() => {
              try { ttsPlayer.seekTo(0); ttsPlayer.play(); } catch {}
            }}
            testID="voice-studio-replay"
            style={styles.replayBtn}
          >
            <Ionicons name="reload" size={14} color={colors.primary} />
            <Text style={styles.replayText}>Replay</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.sectionHead, { marginTop: 28 }]}>
        <Text style={styles.kicker}>WHISPER STT</Text>
        <Text style={styles.h2}>Record bars → Lyrics</Text>
      </View>

      <View style={styles.recordCard}>
        {recState === "blocked" ? (
          <View style={{ alignItems: "center" }}>
            <Ionicons name="mic-off" size={28} color={colors.accent} />
            <Text style={styles.blockedText}>Mic permission denied.</Text>
            <TouchableOpacity
              testID="open-settings-btn"
              onPress={() => Linking.openSettings()}
              style={styles.secondaryBtn}
            >
              <Ionicons name="settings" size={16} color="#fff" />
              <Text style={styles.secondaryBtnText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRecState("idle")}
              style={[styles.secondaryBtn, { marginTop: 8, borderColor: colors.border }]}
            >
              <Text style={styles.secondaryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : recState === "recording" ? (
          <>
            <View style={styles.recordPulse}>
              <View style={styles.recordDot} />
              <Text style={styles.recordTime}>
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                {String(elapsed % 60).padStart(2, "0")}
              </Text>
            </View>
            <TouchableOpacity
              testID="voice-studio-stop"
              onPress={stopAndTranscribe}
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={[styles.primaryBtnText, { color: "#fff" }]}>Stop & Transcribe</Text>
            </TouchableOpacity>
          </>
        ) : recState === "uploading" ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.uploadingText}>Transcribing via Whisper...</Text>
          </>
        ) : (
          <TouchableOpacity
            testID="voice-studio-record"
            onPress={startRecording}
            style={styles.recordBtn}
            disabled={recState === "asking"}
          >
            <Ionicons name="mic" size={28} color="#0A0A0C" />
          </TouchableOpacity>
        )}
      </View>

      {transcript.length > 0 && (
        <View style={styles.transcriptCard} testID="voice-studio-transcript">
          <Text style={styles.transcriptKicker}>TRANSCRIPT</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { paddingHorizontal: spacing.lg, marginTop: 24, marginBottom: 10 },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h2: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.3, marginTop: 4 },
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 32,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.token, borderColor: colors.token },
  chipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#0A0A0C", fontWeight: "800" },
  primaryBtn: {
    marginHorizontal: spacing.lg,
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
  },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 15, letterSpacing: 0.4 },
  playbackRow: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.elevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(0,255,102,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playbackText: { color: colors.textSecondary, flex: 1, fontSize: 12 },
  replayBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  replayText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  recordCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    minHeight: 140,
    justifyContent: "center",
  },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  recordPulse: { alignItems: "center", marginBottom: 16 },
  recordDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, marginBottom: 8 },
  recordTime: { color: "#fff", fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  uploadingText: { color: colors.textSecondary, marginTop: 10, fontSize: 13 },
  blockedText: { color: colors.textSecondary, marginTop: 10, marginBottom: 12, textAlign: "center" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 40,
  },
  secondaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  transcriptCard: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    padding: 14,
    backgroundColor: colors.elevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transcriptKicker: { color: colors.token, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 6 },
  transcriptText: { color: "#fff", fontSize: 14, lineHeight: 22 },
});
