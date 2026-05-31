import React, { useState } from "react";
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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

export default function UploadBeatScreen() {
  const router = useRouter();
  const [picked, setPicked] = useState<{ uri: string; name: string; mime: string; size: number } | null>(null);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("Original");
  const [bpm, setBpm] = useState("");
  const [isBeat, setIsBeat] = useState(true);
  const [uploading, setUploading] = useState(false);

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const mime = a.mimeType || (a.name?.endsWith(".wav") ? "audio/wav" : a.name?.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4");
      const size = (a as any).size || 0;
      if (size && size > 8 * 1024 * 1024) {
        Alert.alert("Too large", "Max 8MB");
        return;
      }
      setPicked({ uri: a.uri, name: a.name || "track", mime, size });
      if (!title) setTitle(a.name?.replace(/\.[^.]+$/, "") || "");
    } catch (e: any) {
      Alert.alert("Pick file", e?.message || "Failed");
    }
  };

  const upload = async () => {
    if (!picked) return;
    if (title.trim().length < 1) return Alert.alert("Title", "Enter a title");
    setUploading(true);
    try {
      let b64: string;
      if (Platform.OS === "web") {
        const res = await fetch(picked.uri);
        const blob = await res.blob();
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
        b64 = await FileSystem.readAsStringAsync(picked.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const res = await api.uploadTrack({
        title: title.trim(),
        genre,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        mime: picked.mime,
        audio_b64: b64,
        source: "upload",
        is_beat: isBeat,
      });
      Alert.alert("Uploaded", `+${res.sound_awarded} $SOUND\nBalance: ${res.balance}`);
      router.replace("/me/tracks");
    } catch (e: any) {
      Alert.alert("Upload", e?.message || "Failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200, gap: 16 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="up-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.kicker}>STUDIO</Text>
            <Text style={styles.h1}>Upload Beat</Text>
          </View>
        </View>

        <View style={styles.dropCard}>
          <Ionicons name="musical-note" size={48} color={colors.primary} />
          {picked ? (
            <>
              <Text style={styles.fname} numberOfLines={1}>{picked.name}</Text>
              <Text style={styles.fmeta}>{picked.mime} · {(picked.size / 1024 / 1024).toFixed(2)} MB</Text>
              <TouchableOpacity onPress={pick} style={styles.ghostBtn}>
                <Text style={styles.ghostText}>Choose different file</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={pick} style={styles.pickBtn} testID="up-pick">
              <Ionicons name="folder-open" size={20} color="#0A0A0C" />
              <Text style={styles.pickText}>Choose audio file</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>MP3, WAV, M4A, AAC, OGG, FLAC · max 8MB</Text>
        </View>

        {picked && (
          <View style={styles.card}>
            <Text style={styles.section}>Beat info</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textTertiary} style={styles.input} testID="up-title" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput value={genre} onChangeText={setGenre} placeholder="Genre" placeholderTextColor={colors.textTertiary} style={[styles.input, { flex: 1 }]} />
              <TextInput value={bpm} onChangeText={setBpm} placeholder="BPM" placeholderTextColor={colors.textTertiary} style={[styles.input, { width: 80 }]} keyboardType="number-pad" />
            </View>
            <TouchableOpacity onPress={() => setIsBeat((v) => !v)} style={styles.checkRow}>
              <Ionicons name={isBeat ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
              <Text style={styles.checkText}>Publish as Beat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={upload}
              disabled={uploading}
              style={[styles.primaryBtn, uploading && { opacity: 0.6 }]}
              testID="up-submit"
            >
              {uploading ? <ActivityIndicator color="#0A0A0C" /> : (
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
  dropCard: { backgroundColor: colors.surface, padding: 24, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, borderStyle: "dashed", alignItems: "center", gap: 12 },
  pickBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, alignItems: "center", minHeight: 48 },
  pickText: { color: "#0A0A0C", fontWeight: "900" },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderColor: colors.border, borderWidth: 1 },
  ghostText: { color: "#fff", fontWeight: "700" },
  fname: { color: "#fff", fontWeight: "800", fontSize: 14 },
  fmeta: { color: colors.textTertiary, fontSize: 11 },
  hint: { color: colors.textTertiary, fontSize: 11 },
  card: { backgroundColor: colors.surface, padding: 16, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, gap: 10 },
  section: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 14, minHeight: 48 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkText: { color: colors.textPrimary, fontSize: 13 },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.full, alignItems: "center", justifyContent: "center", minHeight: 52 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 15 },
});
