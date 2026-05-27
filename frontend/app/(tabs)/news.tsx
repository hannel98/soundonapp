import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

type News = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  image_url: string;
  published_at: string;
};

export default function NewsTab() {
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<News | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.news();
        setNews(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>📰 INDUSTRY</Text>
        <Text style={styles.h1}>Music News</Text>
        <Text style={styles.sub}>Stay ahead of the wave.</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, gap: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`news-card-${item.id}`}
              style={styles.card}
              onPress={() => setActive(item)}
            >
              <Image source={{ uri: item.image_url }} style={styles.cardImg} />
              <View style={styles.cardBody}>
                <Text style={styles.cardCat}>{item.category.toUpperCase()}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSummary} numberOfLines={2}>
                  {item.summary}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>{item.published_at}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal
        visible={!!active}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setActive(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
          <View style={styles.modalHeader}>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 8 },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6, marginTop: 4 },
  sub: { color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImg: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111" },
  cardBody: { padding: 14 },
  cardCat: { color: colors.primary, fontSize: 10, letterSpacing: 1.6, fontWeight: "800" },
  cardTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 6 },
  cardSummary: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  cardDate: { color: colors.textTertiary, fontSize: 11 },
  modalHeader: { padding: spacing.lg, paddingBottom: 0 },
  modalImg: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#111",
    borderRadius: radius.lg,
  },
  modalCat: {
    color: colors.primary,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
    marginTop: 18,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginTop: 8,
  },
  modalDate: { color: colors.textTertiary, fontSize: 12, marginTop: 6 },
  modalBody: { color: colors.textSecondary, fontSize: 15, lineHeight: 24, marginTop: 18 },
});
