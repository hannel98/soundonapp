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
  Alert,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { PRIVY_AVAILABLE, usePrivyEmailLogin } from "@/src/auth/PrivyClient";
import { colors, radius, spacing } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithPrivyToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Privy state
  const privyEmail = usePrivyEmailLogin();
  const [privyMode, setPrivyMode] = useState<"idle" | "code">("idle");
  const [privyEmailAddr, setPrivyEmailAddr] = useState("");
  const [privyCode, setPrivyCode] = useState("");
  const [privyLoading, setPrivyLoading] = useState(false);

  const onPrivySend = async () => {
    if (!privyEmailAddr.trim()) return Alert.alert("Email", "Enter an email");
    if (!PRIVY_AVAILABLE) {
      Alert.alert(
        "Build required",
        "Privy login only works in an iOS/Android dev build. Tap 'Publish' (top right) to build, then come back."
      );
      return;
    }
    setPrivyLoading(true);
    try {
      await privyEmail.sendCode(privyEmailAddr.trim());
      setPrivyMode("code");
    } catch (e: any) {
      Alert.alert("Privy", e?.message || "Could not send code");
    } finally {
      setPrivyLoading(false);
    }
  };

  const onPrivyVerify = async () => {
    if (!privyCode.trim()) return Alert.alert("Code", "Enter the 6-digit code");
    setPrivyLoading(true);
    try {
      const idToken = await privyEmail.loginWithCode(privyCode.trim());
      await signInWithPrivyToken(idToken);
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Privy", e?.message || "Could not verify");
    } finally {
      setPrivyLoading(false);
    }
  };

  const onSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }
    try {
      setLoading(true);
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Login failed");
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
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandWrap}>
            <Text style={styles.brand}>SOUND</Text>
            <Text style={styles.tag}>AI Music Creation</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.h1}>Welcome back</Text>
            <Text style={styles.sub}>Sign in to keep your streak alive</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@sound.app"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />

            {error && (
              <Text style={styles.error} testID="login-error">
                {error}
              </Text>
            )}

            <TouchableOpacity
              testID="login-submit-btn"
              onPress={onSubmit}
              disabled={loading}
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
            >
              {loading ? (
                <ActivityIndicator color="#0A0A0C" />
              ) : (
                <Text style={styles.primaryBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              testID="google-signin-btn"
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

            {/* Privy email OTP login */}
            <View style={styles.privyWrap}>
              <Text style={styles.privyLabel}>Or with Privy (wallet + Web3)</Text>
              {privyMode === "idle" ? (
                <>
                  <TextInput
                    testID="privy-email-input"
                    value={privyEmailAddr}
                    onChangeText={setPrivyEmailAddr}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textTertiary}
                    style={styles.input}
                  />
                  <TouchableOpacity
                    testID="privy-send-btn"
                    onPress={onPrivySend}
                    disabled={privyLoading}
                    style={[styles.privyBtn, privyLoading && { opacity: 0.6 }]}
                  >
                    {privyLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="wallet" size={18} color="#fff" />
                        <Text style={styles.privyText}>Send code to email</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TextInput
                    testID="privy-code-input"
                    value={privyCode}
                    onChangeText={setPrivyCode}
                    keyboardType="number-pad"
                    placeholder="6-digit code"
                    placeholderTextColor={colors.textTertiary}
                    style={styles.input}
                    maxLength={6}
                  />
                  <TouchableOpacity
                    testID="privy-verify-btn"
                    onPress={onPrivyVerify}
                    disabled={privyLoading}
                    style={[styles.privyBtn, privyLoading && { opacity: 0.6 }]}
                  >
                    {privyLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.privyText}>Verify & Sign In</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setPrivyMode("idle"); setPrivyCode(""); }}>
                    <Text style={styles.privyResend}>← Use a different email</Text>
                  </TouchableOpacity>
                </>
              )}
              {!PRIVY_AVAILABLE && (
                <Text style={styles.privyHint}>
                  Privy login requires an iOS/Android dev build. Tap "Publish" (top right) to build.
                </Text>
              )}
            </View>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>New to Sound? </Text>
              <Link href="/signup" asChild>
                <TouchableOpacity testID="go-to-signup-btn">
                  <Text style={styles.linkText}>Create account</Text>
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
  brandWrap: { alignItems: "center", marginTop: 16, marginBottom: 32 },
  brand: {
    color: colors.textPrimary,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -2,
  },
  tag: { color: colors.primary, fontSize: 12, letterSpacing: 4, marginTop: 6, fontWeight: "700" },
  form: { gap: 10 },
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
  privyWrap: { marginTop: 18, gap: 8, padding: 12, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: "rgba(80,40,200,0.06)" },
  privyLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  privyBtn: { flexDirection: "row", gap: 8, backgroundColor: "#5028D0", borderRadius: radius.full, paddingVertical: 12, alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 6 },
  privyText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  privyResend: { color: colors.textTertiary, fontSize: 12, marginTop: 6, textAlign: "center" },
  privyHint: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginTop: 6 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 28 },
  footerText: { color: colors.textSecondary },
  linkText: { color: colors.primary, fontWeight: "700" },
});
