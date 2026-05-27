import React from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import MiniPlayer from "@/src/components/MiniPlayer";

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: { paddingVertical: 6 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
            tabBarTestID: "tab-home",
          }}
        />
        <Tabs.Screen
          name="studio"
          options={{
            title: "Studio",
            tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes" color={color} size={size} />,
            tabBarTestID: "tab-studio",
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: "Explore",
            tabBarIcon: ({ color, size }) => <Ionicons name="compass" color={color} size={size} />,
            tabBarTestID: "tab-explore",
          }}
        />
        <Tabs.Screen
          name="news"
          options={{
            title: "News",
            tabBarIcon: ({ color, size }) => <Ionicons name="newspaper" color={color} size={size} />,
            tabBarTestID: "tab-news",
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
            tabBarTestID: "tab-profile",
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 72,
    paddingBottom: 12,
    paddingTop: 8,
  },
});
