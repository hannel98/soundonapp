import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

export default function SmartcarConnected() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/smartcar");
    }, 1200);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <View style={styles.safe}>
      <Ionicons name="checkmark-circle" size={64} color={colors.token} />
      <Text style={styles.title}>Vehicle Connected</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 14 }} />
      <Text style={styles.sub}>Returning to dashboard…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 8 },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 14 },
  sub: { color: colors.textTertiary, marginTop: 8 },
});
