import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, Image, ActivityIndicator, StyleSheet,
  TouchableOpacity, Modal, ScrollView, TextInput, KeyboardAvoidingView,
  Platform, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

type News = {
  id: string; title: string; summary: string; body: string;
  category: string; image_url: string; published_at: string;
};
type Post = {
  id: string; user_id: string; display_name: string; avatar_url?: string | null;
  text: string; likes: number; comments_count: number; liked_by_me: boolean;
  created_at: string;
};

export default function FeedTab() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"social" | "news">("social");
  const [news, setNews] = useState<News[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<News | null>(null);
  const [compose, setCompose] = useState(false);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, p] = await Promise.all([
        api.news().catch(() => []),
        api.feed().catch(() => []),
      ]);
      setNews(n);
      setPosts(p);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async () => {
    if (!postText.trim()) return;
    setPosting(true);
    try {
      const post = await api.createPost(postText.trim());
      setPosts((prev) => [post, ...prev]);
      setPostText("");
      setCompose(false);
    } catch (e: any) { Alert.alert("Post error", e?.message || "Failed"); }
    finally { setPosting(false); }
  };

  const onLike = async (postId: string) => {
    // optimistic
    setPosts((prev) => prev.map((p) => p.id === postId
      ? { ...p, liked_by_me: !p.liked_by_me, likes: p.likes + (p.liked_by_me ? -1 : 1) }
      : p));
    try { await api.likePost(postId); }
    catch { /* revert on error if we cared */ }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>FEED</Text>
          <Text style={styles.h1}>{tab === "social" ? "Community" : "Music News"}</Text>
        </View>
        {tab === "social" && (
          <TouchableOpacity testID="feed-compose-btn" onPress={() => setCompose(true)} style={styles.composeBtn}>
            <Ionicons name="add" size={20} color="#0A0A0C" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabBar}>
        {(["social", "news"] as const).map((t) => (
          <TouchableOpacity key={t} testID={`feed-tab-${t}`} onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "social" ? "Following" : "Industry News"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : tab === "social" ? (
        <FlatList
          key="social"
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <Text style={{ color: colors.textTertiary, textAlign: "center", marginTop: 40 }}>
              No posts yet. Tap + to share something.
            </Text>
          }
          renderItem={({ item }) => (
            <View testID={`post-${item.id}`} style={styles.postCard}>
              <View style={styles.postHead}>
                <View style={styles.avatar}>
                  {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={{ width: 36, height: 36 }} />
                    : <Text style={styles.avatarInit}>{item.display_name[0]?.toUpperCase() || "S"}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.postAuthor}>
                    {item.display_name}{item.user_id === user?.user_id ? " (you)" : ""}
                  </Text>
                  <Text style={styles.postTime}>{formatTime(item.created_at)}</Text>
                </View>
              </View>
              <Text style={styles.postText}>{item.text}</Text>
              <View style={styles.postActions}>
                <TouchableOpacity
                  testID={`post-like-${item.id}`}
                  onPress={() => onLike(item.id)}
                  style={styles.actionBtn}
                >
                  <Ionicons
                    name={item.liked_by_me ? "heart" : "heart-outline"}
                    size={18}
                    color={item.liked_by_me ? colors.accent : colors.textSecondary}
                  />
                  <Text style={[styles.actionText, item.liked_by_me && { color: colors.accent }]}>
                    {item.likes}
                  </Text>
                </TouchableOpacity>
                <View style={styles.actionBtn}>
                  <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.actionText}>{item.comments_count}</Text>
                </View>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          key="news"
          data={news}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity testID={`news-card-${item.id}`} style={styles.newsCard} onPress={() => setActive(item)}>
              <Image source={{ uri: item.image_url }} style={styles.newsImg} />
              <View style={{ padding: 14 }}>
                <Text style={styles.cardCat}>{item.category.toUpperCase()}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>
                <Text style={styles.cardDate}>{item.published_at}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Compose modal */}
      <Modal visible={compose} animationType="slide" transparent onRequestClose={() => setCompose(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBack}>
          <View style={styles.composeSheet}>
            <View style={styles.composeHead}>
              <Text style={styles.composeTitle}>New Post</Text>
              <TouchableOpacity onPress={() => setCompose(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <TextInput
              testID="compose-input"
              value={postText}
              onChangeText={setPostText}
              placeholder="What's the vibe?"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={styles.composeInput}
              maxLength={600}
              autoFocus
            />
            <TouchableOpacity
              testID="compose-submit"
              onPress={onSubmit}
              disabled={posting || !postText.trim()}
              style={[styles.postBtn, (!postText.trim() || posting) && { opacity: 0.5 }]}
            >
              {posting ? <ActivityIndicator color="#0A0A0C" /> : (
                <>
                  <Ionicons name="send" size={16} color="#0A0A0C" />
                  <Text style={styles.postBtnText}>Post</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* News detail */}
      <Modal visible={!!active} animationType="slide" transparent={false} onRequestClose={() => setActive(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
          <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
            <TouchableOpacity onPress={() => setActive(null)} testID="news-modal-close">
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          {active && (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
              <Image source={{ uri: active.image_url }} style={styles.modalImg} />
              <Text style={styles.modalCat}>{active.category.toUpperCase()}</Text>
              <Text style={styles.modalTitle}>{active.title}</Text>
              <Text style={styles.modalDate}>{active.published_at}</Text>
              <Text style={styles.modalBody}>{active.body}</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    if (min < 1440) return `${Math.floor(min / 60)}h ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 8, alignItems: "flex-end" },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6, marginTop: 4 },
  composeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginTop: 8, marginBottom: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 36, justifyContent: "center" },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: "#0A0A0C", fontWeight: "800" },
  postCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.elevated, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarInit: { color: colors.primary, fontWeight: "900" },
  postAuthor: { color: "#fff", fontWeight: "800", fontSize: 14 },
  postTime: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  postText: { color: "#fff", fontSize: 14, lineHeight: 20, marginBottom: 10 },
  postActions: { flexDirection: "row", gap: 20, marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  actionText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  newsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  newsImg: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111" },
  cardCat: { color: colors.primary, fontSize: 10, letterSpacing: 1.6, fontWeight: "800" },
  cardTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 6 },
  cardSummary: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  cardDate: { color: colors.textTertiary, fontSize: 11, marginTop: 10 },
  modalBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  composeSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: 16 },
  composeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  composeTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  composeInput: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 120, color: "#fff", fontSize: 15, textAlignVertical: "top" },
  postBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.full, backgroundColor: colors.primary, minHeight: 48 },
  postBtnText: { color: "#0A0A0C", fontWeight: "900" },
  modalImg: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111", borderRadius: radius.lg },
  modalCat: { color: colors.primary, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: 18 },
  modalTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.6, marginTop: 8 },
  modalDate: { color: colors.textTertiary, fontSize: 12, marginTop: 6 },
  modalBody: { color: colors.textSecondary, fontSize: 15, lineHeight: 24, marginTop: 18 },
});
