import React, { useEffect, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

export default function CollabCreate() {
  const router = useRouter();
  const [meta, setMeta] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rolesNeeded, setRolesNeeded] = useState<string[]>([]);
  const [genre, setGenre] = useState<string | null>(null);
  const [locPref, setLocPref] = useState("Remote");
  const [budget, setBudget] = useState("Royalty split");
  const [contactType, setContactType] = useState("email");
  const [contactValue, setContactValue] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api.collabMeta().then(setMeta);
  }, []);

  const toggleRole = (r: string) => {
    setRolesNeeded((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  };

  const submit = async () => {
    if (title.trim().length < 3) return Alert.alert("Title", "Min 3 chars");
    if (description.trim().length < 10) return Alert.alert("Description", "Tell us more (10+ chars)");
    if (rolesNeeded.length === 0) return Alert.alert("Roles", "Pick at least one role");
    if (!genre) return Alert.alert("Genre", "Pick a genre");
    if (!contactValue.trim()) return Alert.alert("Contact", "Provide a contact handle");
    setPosting(true);
    try {
      const res = await api.collabCreate({
        title: title.trim(),
        description: description.trim(),
        roles_needed: rolesNeeded,
        genre,
        location_pref: locPref,
        budget,
        contact_type: contactType,
        contact_value: contactValue.trim(),
      });
      Alert.alert("Posted!", "Your collab project is live.");
      router.replace({ pathname: "/collab/[id]", params: { id: (res as any).id } });
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not post");
    } finally {
      setPosting(false);
    }
  };

  if (!meta) {
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="cc-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.kicker}>POST PROJECT</Text>
              <Text style={styles.h1}>Find your team</Text>
            </View>
          </View>

          <Field label="Project title">
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={colors.textTertiary} placeholder="Looking for a vocalist for trap beat" testID="cc-title" />
          </Field>

          <Field label="Description">
            <TextInput
              value={description}
              onChangeText={setDescription}
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              multiline
              placeholder="Vibe, references, deadlines, what's already done..."
              placeholderTextColor={colors.textTertiary}
              testID="cc-desc"
            />
          </Field>

          <Field label={`Roles needed (${rolesNeeded.length})`}>
            <View style={styles.chipsWrap}>
              {meta.roles.map((r: string) => (
                <TouchableOpacity key={r} onPress={() => toggleRole(r)} style={[styles.chip, rolesNeeded.includes(r) && styles.chipActive]}>
                  <Text style={[styles.chipText, rolesNeeded.includes(r) && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Genre">
            <View style={styles.chipsWrap}>
              {meta.genres.map((g: string) => (
                <TouchableOpacity key={g} onPress={() => setGenre(g)} style={[styles.chip, genre === g && styles.chipActive]}>
                  <Text style={[styles.chipText, genre === g && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Location">
            <View style={styles.chipsWrap}>
              {meta.location_prefs.map((l: string) => (
                <TouchableOpacity key={l} onPress={() => setLocPref(l)} style={[styles.chip, locPref === l && styles.chipActive]}>
                  <Text style={[styles.chipText, locPref === l && styles.chipTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Budget / Comp">
            <View style={styles.chipsWrap}>
              {["Paid", "Royalty split", "Free / portfolio", "Negotiable"].map((b) => (
                <TouchableOpacity key={b} onPress={() => setBudget(b)} style={[styles.chip, budget === b && styles.chipActive]}>
                  <Text style={[styles.chipText, budget === b && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Your contact (revealed only when you accept an applicant)">
            <View style={styles.chipsWrap}>
              {meta.contact_types.map((c: string) => (
                <TouchableOpacity key={c} onPress={() => setContactType(c)} style={[styles.chip, contactType === c && styles.chipActive]}>
                  <Text style={[styles.chipText, contactType === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={contactValue}
              onChangeText={setContactValue}
              style={[styles.input, { marginTop: 8 }]}
              placeholder={contactType === "email" ? "you@example.com" : contactType === "discord" ? "username#0000" : contactType === "instagram" ? "@handle" : "+1 555-0100"}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              testID="cc-contact"
            />
          </Field>

          <TouchableOpacity
            onPress={submit}
            disabled={posting}
            style={[styles.primaryBtn, posting && { opacity: 0.6 }]}
            testID="cc-submit"
          >
            {posting ? <ActivityIndicator color="#0A0A0C" /> : <Text style={styles.primaryBtnText}>Post Project</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.2, fontWeight: "800", textTransform: "uppercase" },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 14, minHeight: 48 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#0A0A0C" },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginTop: 12, minHeight: 52 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16 },
});
