import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

type Status = {
  connected: boolean;
  mode?: string;
  updated_at?: string;
  latest?: any;
};

export default function SmartcarDashboard() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [miles, setMiles] = useState("");
  const [durMin, setDurMin] = useState("");
  const [maxSpeed, setMaxSpeed] = useState("");
  const [hardBrakes, setHardBrakes] = useState("0");
  const [hardAccels, setHardAccels] = useState("0");
  const [speedingSec, setSpeedingSec] = useState("0");

  const load = useCallback(async () => {
    try {
      const s = await api.smartcarStatus();
      setStatus(s);
      if (s.connected) {
        const t = await api.smartcarTrips(20).catch(() => ({ trips: [], stats: null }));
        setTrips(t.trips || []);
        setStats(t.stats);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Listen for deep-link return from Smartcar
  useEffect(() => {
    const sub = Linking.addEventListener("url", (e) => {
      if (e.url.includes("smartcar/connected")) {
        load();
      }
    });
    return () => sub.remove();
  }, [load]);

  const onConnect = async () => {
    setConnecting(true);
    try {
      const appRedirect = Linking.createURL("/smartcar/connected");
      const res = await api.smartcarConnectUrl(appRedirect, "simulated");
      const out = await WebBrowser.openAuthSessionAsync(res.url, appRedirect);
      if (out.type === "success" || out.type === "dismiss") {
        // Backend has stored tokens; refresh
        setTimeout(load, 600);
      }
    } catch (e: any) {
      Alert.alert("Connect failed", e?.message || "Could not start Smartcar connect.");
    } finally {
      setConnecting(false);
    }
  };

  const onFetchVehicle = async () => {
    try {
      const v = await api.smartcarVehicle();
      setVehicle(v);
    } catch (e: any) {
      Alert.alert("Vehicle", e?.message || "Failed to fetch vehicle data");
    }
  };

  const onDisconnect = async () => {
    Alert.alert("Disconnect vehicle?", "You'll need to authorize again to log trips.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await api.smartcarDisconnect();
          setStatus({ connected: false });
          setVehicle(null);
        },
      },
    ]);
  };

  const onLogTrip = async () => {
    const m = parseFloat(miles);
    const dm = parseInt(durMin, 10);
    if (!m || m <= 0 || !dm || dm <= 0) {
      Alert.alert("Trip", "Enter miles and duration (minutes)");
      return;
    }
    setLogging(true);
    try {
      const res = await api.smartcarLogTrip({
        miles: m,
        duration_s: dm * 60,
        max_speed_mph: parseFloat(maxSpeed) || undefined,
        hard_brake_events: parseInt(hardBrakes, 10) || 0,
        hard_accel_events: parseInt(hardAccels, 10) || 0,
        speeding_seconds: parseInt(speedingSec, 10) || 0,
      });
      Alert.alert(
        "Trip logged",
        `Safety score: ${res.safety_score}\n+${res.sound_awarded} $SOUND awarded`,
      );
      setMiles("");
      setDurMin("");
      setMaxSpeed("");
      setHardBrakes("0");
      setHardAccels("0");
      setSpeedingSec("0");
      load();
    } catch (e: any) {
      Alert.alert("Trip", e?.message || "Failed");
    } finally {
      setLogging(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220, gap: 18 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="sc-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.kicker}>SMARTCAR</Text>
              <Text style={styles.h1}>Drive to Earn</Text>
            </View>
          </View>

          {!status?.connected ? (
            <View style={styles.card}>
              <Ionicons name="car-sport" size={48} color={colors.primary} />
              <Text style={styles.cardTitle}>Connect your vehicle</Text>
              <Text style={styles.cardBody}>
                Authorize Smartcar to read your odometer, location, fuel/battery. Earn $SOUND for safe driving, share music + metadata with other connected drivers over the SoundMesh.
              </Text>
              <TouchableOpacity
                testID="sc-connect-btn"
                onPress={onConnect}
                disabled={connecting}
                style={[styles.primaryBtn, connecting && { opacity: 0.6 }]}
              >
                {connecting ? (
                  <ActivityIndicator color="#0A0A0C" />
                ) : (
                  <>
                    <Ionicons name="link" size={18} color="#0A0A0C" />
                    <Text style={styles.primaryBtnText}>Connect Vehicle (Sandbox)</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.helper}>
                Currently running in simulated mode. Log in with any email/password on Smartcar Connect.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="checkmark-circle" size={28} color={colors.token} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Vehicle Connected</Text>
                    <Text style={styles.cardSubtle}>Mode: {status.mode || "simulated"}</Text>
                  </View>
                  <TouchableOpacity onPress={onDisconnect} testID="sc-disconnect">
                    <Ionicons name="close-circle" size={26} color={colors.accent} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={onFetchVehicle} style={styles.ghostBtn} testID="sc-refresh-vehicle">
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.ghostBtnText}>Fetch Vehicle Snapshot</Text>
                </TouchableOpacity>
                {vehicle?.attributes && (
                  <View style={styles.miniMeta}>
                    <MetaRow label="Make/Model" value={`${vehicle.attributes.make || "—"} ${vehicle.attributes.model || ""}`} />
                    <MetaRow label="Year" value={String(vehicle.attributes.year || "—")} />
                    {vehicle.odometer?.distance != null && (
                      <MetaRow label="Odometer" value={`${vehicle.odometer.distance.toFixed(0)} mi`} />
                    )}
                    {vehicle.fuel?.percentRemaining != null && (
                      <MetaRow label="Fuel" value={`${Math.round(vehicle.fuel.percentRemaining * 100)}%`} />
                    )}
                    {vehicle.battery?.percentRemaining != null && (
                      <MetaRow label="Battery" value={`${Math.round(vehicle.battery.percentRemaining * 100)}%`} />
                    )}
                  </View>
                )}
              </View>

              {/* Stats */}
              {stats && (
                <View style={styles.statsCard}>
                  <Text style={styles.cardTitle}>Your Driving</Text>
                  <View style={styles.statRow}>
                    <Stat label="Total miles" value={`${(stats.total_miles || 0).toFixed(1)}`} />
                    <Stat label="Trips" value={`${stats.total_trips || 0}`} />
                    <Stat label="$SOUND earned" value={`${stats.total_tokens || 0}`} />
                  </View>
                </View>
              )}

              {/* Log Trip */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Log Trip → Earn $SOUND</Text>
                <Text style={styles.cardBody}>
                  Submit a recent drive with safety signals. Token reward scales with safety score (95+ = 1.5× mile, &lt;50 = 0).
                </Text>
                <Row>
                  <FormField label="Miles" value={miles} onChange={setMiles} keyboard="decimal-pad" placeholder="12.4" testID="sc-miles" />
                  <FormField label="Minutes" value={durMin} onChange={setDurMin} keyboard="number-pad" placeholder="18" testID="sc-mins" />
                </Row>
                <Row>
                  <FormField label="Max MPH" value={maxSpeed} onChange={setMaxSpeed} keyboard="number-pad" placeholder="72" testID="sc-maxmph" />
                  <FormField label="Speeding (s)" value={speedingSec} onChange={setSpeedingSec} keyboard="number-pad" testID="sc-spdsec" />
                </Row>
                <Row>
                  <FormField label="Hard brakes" value={hardBrakes} onChange={setHardBrakes} keyboard="number-pad" testID="sc-brakes" />
                  <FormField label="Hard accels" value={hardAccels} onChange={setHardAccels} keyboard="number-pad" testID="sc-accels" />
                </Row>
                <TouchableOpacity
                  onPress={onLogTrip}
                  disabled={logging}
                  style={[styles.primaryBtn, logging && { opacity: 0.6 }]}
                  testID="sc-log-trip"
                >
                  {logging ? (
                    <ActivityIndicator color="#0A0A0C" />
                  ) : (
                    <>
                      <Ionicons name="flash" size={18} color="#0A0A0C" />
                      <Text style={styles.primaryBtnText}>Log Trip & Earn $SOUND</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Recent trips */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Recent Trips</Text>
                {trips.length === 0 ? (
                  <Text style={styles.helper}>No trips logged yet.</Text>
                ) : (
                  trips.slice(0, 8).map((t) => (
                    <View key={t.id} style={styles.tripRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tripMain}>{t.miles.toFixed(1)} mi · score {t.safety_score}</Text>
                        <Text style={styles.tripSub}>
                          {new Date(t.created_at).toLocaleString()}
                        </Text>
                      </View>
                      <Text style={styles.tripAward}>+{t.sound_awarded}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 10 }}>{children}</View>;
}

function FormField({
  label,
  value,
  onChange,
  keyboard,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: any;
  placeholder?: string;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  statsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(0,255,102,0.2)", padding: 16, gap: 12 },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 18 },
  cardSubtle: { color: colors.textSecondary, fontSize: 12 },
  cardBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  helper: { color: colors.textTertiary, fontSize: 12, lineHeight: 18 },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.full, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 50 },
  primaryBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 15 },
  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong, minHeight: 44 },
  ghostBtnText: { color: "#fff", fontWeight: "700" },
  miniMeta: { gap: 6, marginTop: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { color: colors.textTertiary, fontSize: 12 },
  metaValue: { color: "#fff", fontWeight: "700", fontSize: 13 },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statValue: { color: colors.token, fontSize: 20, fontWeight: "900" },
  statLabel: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" },
  input: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, color: "#fff", borderRadius: radius.md, padding: 12, fontSize: 14 },
  tripRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1 },
  tripMain: { color: "#fff", fontWeight: "700", fontSize: 14 },
  tripSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  tripAward: { color: colors.token, fontWeight: "900", fontSize: 16 },
});
