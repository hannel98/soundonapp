import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

export default function CollabDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [apps, setApps] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [contactType, setContactType] = useState("email");
  const [contactValue, setContactValue] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const p = await api.collabGet(id);
    setPost(p);
    if (p?.is_owner) {
      try {
        const a = await api.collabApplications(id);
        setApps(a);
      } catch {}
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const apply = async () => {
    if (!role) return Alert.alert("Role", "Pick which role you're applying for");
    if (message.trim().length < 5) return Alert.alert("Message", "Tell them why you'd be great");
    if (!contactValue.trim()) return Alert.alert("Contact", "Provide a contact handle so they can reach you");
    setApplying(true);
    try {
      await api.collabApply(id!, {
        role, message: message.trim(), sample_url: sampleUrl.trim() || undefined,
        contact_type: contactType, contact_value: contactValue.trim(),
      });
      Alert.alert("Applied!", "Owner will review your application.");
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not apply");
    } finally {
      setApplying(false);
    }
  };

  const respond = async (appId: string, action: "accept" | "decline") => {
    try {
      const res: any = await api.collabRespond(appId, action);
      if (action === "accept" && res.applicant_contact) {
        Alert.alert(
          "Accepted! 🎉",
          `${res.applicant_contact.name}\n${res.applicant_contact.type}: ${res.applicant_contact.value}`,
          [
            { text: "OK" },
            res.applicant_contact.type === "email"
              ? { text: "Email", onPress: () => Linking.openURL(`mailto:${res.applicant_contact.value}`) }
              : ({} as any),
          ].filter((b: any) => b && b.text),
        );
      }
      load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not respond");
    }
  };

  if (loading || !post) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const alreadyApplied = !!post.my_application;
  const isOwner = !!post.is_owner;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200, gap: 16 }}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="cd-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.genreBadge}>{post.genre} • {post.location_pref}</Text>
          </View>

          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.body}>{post.description}</Text>

          <View style={styles.rolesRow}>
            {post.roles_needed.map((r: string) => (
              <View key={r} style={styles.roleChip}><Text style={styles.roleChipText}>{r}</Text></View>
            ))}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaItem}>Budget: {post.budget || "—"}</Text>
            <Text style={styles.metaItem}>{post.applications_count || 0} applied</Text>
            <Text style={styles.metaItem}>by {post.owner_name}</Text>
          </View>

          {/* OWNER VIEW: applications */}
          {isOwner && (
            <View style={{ gap: 12, marginTop: 8 }}>
              <Text style={styles.sectionTitle}>Applications</Text>
              {(apps || []).length === 0 ? (
                <Text style={styles.helper}>No applications yet.</Text>
              ) : (
                (apps || []).map((a) => (
                  <View key={a.id} style={styles.appCard}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={styles.appName}>{a.applicant_name}</Text>
                      <Text style={styles.appStatus}>{a.status}</Text>
                    </View>
                    <Text style={styles.appRole}>Role: {a.role}</Text>
                    <Text style={styles.appMsg}>{a.message}</Text>
                    {a.sample_url ? (
                      <TouchableOpacity onPress={() => Linking.openURL(a.sample_url)}>
                        <Text style={styles.appLink}>→ {a.sample_url}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {a.status === "pending" && (
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <TouchableOpacity onPress={() => respond(a.id, "accept")} style={[styles.smallBtn, { backgroundColor: colors.token }]} testID={`accept-${a.id}`}>
                          <Text style={[styles.smallBtnText, { color: "#0A0A0C" }]}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => respond(a.id, "decline")} style={[styles.smallBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} testID={`decline-${a.id}`}>
                          <Text style={[styles.smallBtnText, { color: "#fff" }]}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {a.status === "accepted" && (
                      <Text style={[styles.helper, { color: colors.token, marginTop: 6 }]}>✓ Contact shared with applicant</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* APPLICANT VIEW */}
          {!isOwner && (
            <View style={{ gap: 12, marginTop: 8 }}>
              <Text style={styles.sectionTitle}>Apply</Text>
              {alreadyApplied ? (
                <View style={[styles.appCard, { borderColor: colors.primary }]}>
                  <Text style={styles.appStatus}>Status: {post.my_application.status}</Text>
                  <Text style={styles.appRole}>Role: {post.my_application.role}</Text>
                  <Text style={styles.appMsg}>{post.my_application.message}</Text>
                  {post.my_application.status === "accepted" && (
                    <Text style={[styles.helper, { color: colors.token }]}>✓ Accepted! Check Profile → Collab → My applications for owner contact.</Text>
                  )}
                </View>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Role applying for</Text>
                  <View style={styles.chipsWrap}>
                    {post.roles_needed.map((r: string) => (
                      <TouchableOpacity key={r} onPress={() => setRole(r)} style={[styles.chip, role === r && styles.chipActive]}>
                        <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLabel}>Message</Text>
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                    placeholder="Why are you a fit? Mention experience, vibe..."
                    placeholderTextColor={colors.textTertiary}
                    testID="cd-msg"
                  />
                  <Text style={styles.fieldLabel}>Portfolio / sample link (optional)</Text>
                  <TextInput
                    value={sampleUrl}
                    onChangeText={setSampleUrl}
                    style={styles.input}
                    placeholder="https://soundcloud.com/..."
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    testID="cd-sample"
                  />
                  <Text style={styles.fieldLabel}>Your contact (shared only on accept)</Text>
                  <View style={styles.chipsWrap}>
                    {["email", "discord", "instagram", "phone"].map((c) => (
                      <TouchableOpacity key={c} onPress={() => setContactType(c)} style={[styles.chip, contactType === c && styles.chipActive]}>
                        <Text style={[styles.chipText, contactType === c && styles.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    value={contactValue}
                    onChangeText={setContactValue}
                    style={styles.input}
                    placeholder={contactType === "email" ? "you@example.com" : "@handle"}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    testID="cd-contact"
                  />
                  <TouchableOpacity onPress={apply} disabled={applying} style={[styles.primaryBtn, applying && { opacity: 0.6 }]} testID="cd-apply">
                    {applying ? <ActivityIndicator color="#0A0A0C" /> : <Text style={styles.primaryBtnText}>Submit Application</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
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
  genreBadge: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,184,0,0.12)", borderColor: "rgba(255,184,0,0.3)", borderWidth: 1 },
  roleChipText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  metaItem: { color: colors.textTertiary, fontSize: 12 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  helper: { color: colors.textTertiary, fontSize: 12 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.2, fontWeight: "800", textTransform: "uppercase" },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 14, minHeight: 48 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#0A0A0C" },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginTop: 12, minHeight: 52 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16 },
  appCard: { backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 6 },
  appName: { color: "#fff", fontWeight: "800" },
  appStatus: { color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  appRole: { color: colors.textSecondary, fontSize: 12 },
  appMsg: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  appLink: { color: colors.primary, fontSize: 12, marginTop: 4 },
  smallBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, minHeight: 40, justifyContent: "center" },
  smallBtnText: { fontWeight: "900", fontSize: 13 },
});
