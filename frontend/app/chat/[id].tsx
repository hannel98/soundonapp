import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  loadOrCreateIdentity, subscribe, publishText, publishToGeohash, sendDM, decryptDM,
  KIND_TEXT, KIND_DM, type LocalIdentity,
} from "@/src/nostr/client";
import { nip19 } from "nostr-tools";
import { colors, radius, spacing } from "@/src/theme";

type Msg = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  mine: boolean;
  decrypted?: string | null;
};

export default function ChannelView() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; kind: string }>();
  const id = String(params.id || "bitchat");
  const kind = String(params.kind || "hashtag") as "hashtag" | "geohash" | "dm";
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  const dmPubkey = useMemo(() => {
    if (kind !== "dm") return null;
    if (id.startsWith("npub1")) {
      try {
        const d = nip19.decode(id);
        return d.type === "npub" ? (d.data as string) : null;
      } catch { return null; }
    }
    return /^[0-9a-fA-F]{64}$/.test(id) ? id.toLowerCase() : null;
  }, [id, kind]);

  const title = kind === "hashtag"
    ? `#${id}`
    : kind === "geohash"
      ? `geo:${id}`
      : `DM: ${id.slice(0, 12)}…`;

  useEffect(() => {
    (async () => {
      const me = await loadOrCreateIdentity();
      setIdentity(me);
    })();
  }, []);

  useEffect(() => {
    if (!identity) return;
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3;
    let filters: any[] = [];
    if (kind === "hashtag") {
      filters = [{ kinds: [KIND_TEXT], "#t": [id], since, limit: 200 }];
    } else if (kind === "geohash") {
      filters = [{ kinds: [KIND_TEXT], "#g": [id], since, limit: 200 }];
    } else if (kind === "dm" && dmPubkey) {
      filters = [
        { kinds: [KIND_DM], authors: [identity.pk], "#p": [dmPubkey], since, limit: 200 },
        { kinds: [KIND_DM], authors: [dmPubkey], "#p": [identity.pk], since, limit: 200 },
      ];
    }
    if (filters.length === 0) return;
    const seen = new Set<string>();
    const sub = subscribe(filters, async (e) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      const decrypted = kind === "dm" ? await decryptDM(e) : null;
      setMessages((cur) => {
        if (cur.some((m) => m.id === e.id)) return cur;
        const next = [
          ...cur,
          { id: e.id, pubkey: e.pubkey, content: e.content, created_at: e.created_at, mine: e.pubkey === identity.pk, decrypted },
        ].sort((a, b) => a.created_at - b.created_at);
        return next.slice(-300);
      });
      setTimeout(() => {
        try { listRef.current?.scrollToEnd({ animated: true }); } catch {}
      }, 100);
    });
    return () => sub.close();
  }, [identity, id, kind, dmPubkey]);

  const onSend = async () => {
    const t = draft.trim();
    if (!t || !identity) return;
    setSending(true);
    try {
      if (kind === "hashtag") {
        await publishText(t, [id]);
      } else if (kind === "geohash") {
        await publishToGeohash(id, t);
      } else if (kind === "dm" && dmPubkey) {
        await sendDM(dmPubkey, t);
      }
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="cd-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.sub}>{kind === "dm" ? "NIP-04 encrypted" : "public · Nostr"}</Text>
          </View>
        </View>

        {!identity ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.md, paddingBottom: 12, gap: 6 }}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!item.mine && (
                  <Text style={styles.who}>{item.pubkey.slice(0, 8)}…</Text>
                )}
                <Text style={styles.body}>{item.decrypted || item.content}</Text>
                <Text style={styles.time}>{new Date(item.created_at * 1000).toLocaleTimeString()}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={36} color={colors.textTertiary} />
                <Text style={styles.emptyText}>No messages yet — say something.</Text>
              </View>
            }
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            style={styles.inputField}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            multiline
            testID="chan-draft"
          />
          <TouchableOpacity onPress={onSend} disabled={sending || !draft.trim()} style={[styles.sendBtn, (sending || !draft.trim()) && { opacity: 0.5 }]} testID="chan-send">
            {sending ? <ActivityIndicator color="#0A0A0C" /> : <Ionicons name="send" size={18} color="#0A0A0C" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sub: { color: colors.textTertiary, fontSize: 11 },
  bubble: { maxWidth: "82%", padding: 10, borderRadius: 14, gap: 2 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.primary },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  who: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  body: { color: "#0A0A0C", fontSize: 14 },
  time: { color: "rgba(10,10,12,0.5)", fontSize: 10, alignSelf: "flex-end" },
  empty: { alignItems: "center", padding: 60, gap: 12 },
  emptyText: { color: colors.textTertiary, fontSize: 13 },
  inputBar: { flexDirection: "row", padding: 10, gap: 8, borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bg },
  inputField: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, color: "#fff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
