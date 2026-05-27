import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "@/src/context/PlayerContext";
import { colors, radius } from "@/src/theme";

export default function MiniPlayer() {
  const { current, isPlaying, isLoading, position, duration, toggle, stop } = usePlayer();
  if (!current) return null;

  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  return (
    <View style={styles.wrap} testID="mini-player" pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.coverWrap}>
          <Image source={{ uri: current.cover_url }} style={styles.cover} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.title}>{current.title}</Text>
          <Text numberOfLines={1} style={styles.artist}>{current.artist}</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFg, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <TouchableOpacity onPress={toggle} style={styles.iconBtn} testID="mini-player-toggle">
          <Ionicons
            name={isLoading ? "ellipsis-horizontal" : isPlaying ? "pause" : "play"}
            size={22}
            color="#0A0A0C"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={stop} style={styles.closeBtn} testID="mini-player-close">
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 80,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(28,28,32,0.96)",
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 8,
    gap: 10,
  },
  coverWrap: { width: 44, height: 44, borderRadius: radius.sm, overflow: "hidden" },
  cover: { width: "100%", height: "100%" },
  title: { color: colors.textPrimary, fontWeight: "700", fontSize: 14 },
  artist: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  progressBg: {
    marginTop: 6,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFg: { height: "100%", backgroundColor: colors.primary, borderRadius: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
