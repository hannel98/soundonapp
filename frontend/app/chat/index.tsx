import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { loadOrCreateIdentity, setDisplayName, encodeGeohash, type LocalIdentity } from "@/src/nostr/client";
import { colors, radius, spacing } from "@/src/theme";

export default function ChatHome() {
  const router = useRouter();
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [geohash, setGeohash] = useState("");
  const [dmPub, setDmPub] = useState("");

  const load = useCallback(async () => {
    const id = await loadOrCreateIdentity();
    setIdentity(id);
    setNameInput(id.display_name || "");
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveName = async () => {
    if (!nameInput.trim()) return;
    await setDisplayName(nameInput.trim());
    setEditingName(false);
    load();
  };

  const openMesh = () => router.push({ pathname: "/chat/[id]", params: { id: "bitchat", kind: "hashtag" } });
  const openSoundmesh = () => router.push({ pathname: "/chat/[id]", params: { id: "soundmesh", kind: "hashtag" } });

  const openGeohash = () => {
    if (!geohash.trim()) return Alert.alert("Geohash", "Enter a geohash (e.g. dr5rs or 9q8yy)");
    router.push({ pathname: "/chat/[id]", params: { id: geohash.trim().toLowerCase(), kind: "geohash" } });
  };

  const openDM = () => {
    const v = dmPub.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(v) && !v.startsWith("npub1")) {
      return Alert.alert("Pubkey", "Enter a 64-char hex pubkey or npub1...");
    }
    router.push({ pathname: "/chat/[id]", params: { id: v, kind: "dm" } });
  };

  const useNYC = () => setGeohash(encodeGeohash(40.7128, -74.0060));

  if (!identity) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220, gap: 16 }}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="chat-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.kicker}>BITCHAT · NOSTR</Text>
              <Text style={styles.h1}>Mesh Chat</Text>
            </View>
          </View>

          <View style={styles.idCard}>
            <Text style={styles.idLabel}>YOUR IDENTITY</Text>
            {editingName ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput value={nameInput} onChangeText={setNameInput} placeholder="Display name" placeholderTextColor={colors.textTertiary} style={[styles.input, { flex: 1 }]} testID="chat-name-input" />
                <TouchableOpacity onPress={saveName} style={styles.miniBtn} testID="chat-name-save"><Text style={styles.miniBtnText}>Save</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditingName(true)} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={styles.idName}>{identity.display_name || "Anonymous"}</Text>
                <Ionicons name="create-outline" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
            <Text style={styles.npub} numberOfLines={1}>{identity.npub}</Text>
            <Text style={styles.helper}>Ephemeral keypair · stored on this device only.</Text>
          </View>

          <Text style={styles.section}>PUBLIC CHANNELS</Text>
          <TouchableOpacity style={styles.chanRow} onPress={openMesh} testID="chan-bitchat">
            <Ionicons name="bluetooth" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.chanTitle}>#bitchat</Text>
              <Text style={styles.chanSub}>Global mesh channel · IRC vibes</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chanRow} onPress={openSoundmesh} testID="chan-soundmesh">
            <Ionicons name="musical-notes" size={20} color={colors.token} />
            <View style={{ flex: 1 }}>
              <Text style={styles.chanTitle}>#soundmesh</Text>
              <Text style={styles.chanSub}>Our app channel · producers + artists</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <Text style={styles.section}>LOCATION CHANNEL</Text>
          <View style={styles.card}>
            <Text style={styles.cardBody}>Enter a geohash to join a local-area chat (~5km grid).</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={geohash} onChangeText={setGeohash} autoCapitalize="none" placeholder="dr5rs (NYC), 9q8yy (LA)..." placeholderTextColor={colors.textTertiary} style={[styles.input, { flex: 1 }]} testID="chan-gh-input" />
              <TouchableOpacity onPress={useNYC} style={styles.miniBtn}><Text style={styles.miniBtnText}>NYC</Text></TouchableOpacity>
            </View>
            <TouchableOpacity onPress={openGeohash} style={styles.primaryBtn} testID="chan-gh-go">
              <Ionicons name="location" size={18} color="#0A0A0C" />
              <Text style={styles.primaryBtnText}>Join geohash channel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>DIRECT MESSAGE</Text>
          <View style={styles.card}>
            <Text style={styles.cardBody}>Paste a pubkey or npub1… to start an encrypted DM.</Text>
            <TextInput value={dmPub} onChangeText={setDmPub} autoCapitalize="none" placeholder="npub1... or 64-hex pubkey" placeholderTextColor={colors.textTertiary} style={styles.input} testID="dm-input" />
            <TouchableOpacity onPress={openDM} style={styles.primaryBtn} testID="dm-go">
              <Ionicons name="lock-closed" size={18} color="#0A0A0C" />
              <Text style={styles.primaryBtnText}>Open DM</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900" },
  idCard: { backgroundColor: colors.surface, padding: 16, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, gap: 8 },
  idLabel: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  idName: { color: "#fff", fontSize: 18, fontWeight: "900" },
  npub: { color: colors.textTertiary, fontSize: 11, fontWeight: "700" },
  helper: { color: colors.textTertiary, fontSize: 11 },
  section: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 8 },
  card: { backgroundColor: colors.surface, padding: 14, borderRadius: radius.lg, borderColor: colors.border, borderWidth: 1, gap: 10 },
  cardBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 13, minHeight: 44 },
  miniBtn: { paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", minHeight: 44 },
  miniBtnText: { color: "#0A0A0C", fontWeight: "900" },
  chanRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1 },
  chanTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  chanSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.full, alignItems: "center", justifyContent: "center", minHeight: 46 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 14 },
});
