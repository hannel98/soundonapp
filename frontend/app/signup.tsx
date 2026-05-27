import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing } from "@/src/theme";

export default function Signup() {
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      setLoading(true);
      await signUp(email.trim(), password, displayName.trim() || undefined);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandWrap}>
            <Text style={styles.brand}>SOUND</Text>
            <Text style={styles.tag}>Join the wave</Text>
          </View>

          <View>
            <Text style={styles.h1}>Create your account</Text>
            <Text style={styles.sub}>Earn $SOUND tokens for every creation</Text>

            <Text style={styles.label}>Display Name</Text>
            <TextInput
              testID="signup-name-input"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Producer name"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signup-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@sound.app"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
            <Text style={styles.label}>Password (min 8)</Text>
            <TextInput
              testID="signup-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />

            {error && (
              <Text style={styles.error} testID="signup-error">
                {error}
              </Text>
            )}

            <TouchableOpacity
              testID="signup-submit-btn"
              onPress={onSubmit}
              disabled={loading}
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            >
              {loading ? (
                <ActivityIndicator color="#0A0A0C" />
              ) : (
                <Text style={styles.primaryBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              testID="google-signup-btn"
              onPress={onGoogle}
              disabled={googleLoading}
              style={styles.googleBtn}
            >
              {googleLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#fff" />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/login" asChild>
                <TouchableOpacity testID="go-to-login-btn">
                  <Text style={styles.linkText}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.xl },
  brandWrap: { alignItems: "center", marginBottom: 24 },
  brand: { color: colors.textPrimary, fontSize: 42, fontWeight: "900", letterSpacing: -2 },
  tag: { color: colors.primary, fontSize: 12, letterSpacing: 4, marginTop: 6, fontWeight: "700" },
  h1: { color: colors.textPrimary, fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  sub: { color: colors.textSecondary, marginBottom: 16 },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
  },
  error: { color: colors.accent, marginTop: 10 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    minHeight: 52,
  },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textTertiary, marginHorizontal: 12, fontSize: 12 },
  googleBtn: {
    backgroundColor: colors.elevated,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 52,
  },
  googleText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 28 },
  footerText: { color: colors.textSecondary },
  linkText: { color: colors.primary, fontWeight: "700" },
});
