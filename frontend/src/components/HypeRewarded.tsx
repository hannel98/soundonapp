import React, { useEffect, useRef, useState } from "react";
import { Platform, TouchableOpacity, View, Text, StyleSheet, Modal, ActivityIndicator, Alert } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius } from "@/src/theme";

const PROPERTY_SLUG = "7fba3c3554";

let webSdkInjected = false;
function injectWebSdk() {
  if (typeof document === "undefined" || webSdkInjected) return;
  webSdkInjected = true;
  if (document.querySelector('script[data-hypelab]')) return;
  const s = document.createElement("script");
  s.src = "https://api.hypelab.com/v1/scripts/hp-sdk.js?v=0";
  s.defer = true;
  s.setAttribute("data-hypelab", "1");
  s.onload = () => {
    try {
      // @ts-ignore
      window.HypeLab && window.HypeLab.initialize({ environment: "production", propertySlug: PROPERTY_SLUG });
    } catch {}
  };
  document.head.appendChild(s);
}

type Props = { placement: string };

export default function HypeRewarded({ placement }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const webRef = useRef<WebView>(null);

  useEffect(() => { if (Platform.OS === "web") injectWebSdk(); }, []);

  const onReward = async () => {
    setBusy(true);
    try {
      const res = await api.adReward(placement);
      Alert.alert("Reward earned 🎉", `+${res.sound_awarded} $SOUND\nBalance: ${res.balance}`);
    } catch (e: any) {
      Alert.alert("Reward", e?.message || "Could not credit reward");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
<style>
  html,body{margin:0;padding:0;background:#0A0A0C;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;height:100%;}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:20px;text-align:center;}
  h2{margin:0;font-size:18px}
  button{background:#FFB800;color:#0A0A0C;border:0;padding:14px 28px;border-radius:999px;font-weight:900;font-size:16px;cursor:pointer}
</style>
<script defer src="https://api.hypelab.com/v1/scripts/hp-sdk.js?v=0"></script>
<script>
  document.addEventListener("DOMContentLoaded", function () {
    try {
      window.HypeLab && window.HypeLab.initialize({ environment: "production", propertySlug: "${PROPERTY_SLUG}" });
      setTimeout(function(){
        var el = document.getElementById("rewarded-${placement}");
        try { el && el.show && el.show(); } catch(e) {}
      }, 800);
    } catch (e) {}
    window.addEventListener("hypelab:reward", function(){
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage("rewarded"); } catch(e) {}
    });
    window.addEventListener("hypelab:close", function(){
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage("close"); } catch(e) {}
    });
  });
</script>
</head><body>
<h2>Watch the ad to earn $SOUND</h2>
<hype-rewarded id="rewarded-${placement}" placement="${placement}"></hype-rewarded>
<button onclick="document.getElementById('rewarded-${placement}').show()">Tap to start</button>
<button onclick="window.ReactNativeWebView && window.ReactNativeWebView.postMessage('close')" style="background:#222;color:#fff">Cancel</button>
</body></html>`;

  return (
    <>
      <TouchableOpacity
        testID="rewarded-cta"
        onPress={() => setOpen(true)}
        style={styles.btn}
        disabled={busy}
      >
        <Ionicons name="play-circle" size={16} color="#0A0A0C" />
        <Text style={styles.btnText}>Watch & Earn $SOUND</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} transparent>
        <View style={styles.modal}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {Platform.OS === "web" ? (
              <View style={{ flex: 1, padding: 16, gap: 12 }}>
                <Text style={styles.title}>Watch ad to earn</Text>
                {React.createElement("hype-rewarded", { id: `rewarded-${placement}-web`, placement })}
                <TouchableOpacity onPress={onReward} style={styles.confirm} disabled={busy}>
                  {busy ? <ActivityIndicator color="#0A0A0C" /> : <Text style={styles.confirmText}>I watched it — claim reward</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setOpen(false)}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
              </View>
            ) : (
              <WebView
                ref={webRef}
                source={{ html, baseUrl: "https://api.hypelab.com" }}
                style={{ flex: 1, backgroundColor: "transparent" }}
                originWhitelist={["*"]}
                javaScriptEnabled
                domStorageEnabled
                onMessage={(e) => {
                  const msg = e.nativeEvent.data;
                  if (msg === "rewarded") onReward();
                  else if (msg === "close") setOpen(false);
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    alignItems: "center",
    alignSelf: "center",
    minHeight: 32,
  },
  btnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 11 },
  modal: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { height: "60%", backgroundColor: "#0A0A0C", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  confirm: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.full, alignItems: "center", marginTop: 12, minHeight: 48, justifyContent: "center" },
  confirmText: { color: "#0A0A0C", fontWeight: "900" },
  cancel: { color: colors.textTertiary, textAlign: "center", marginTop: 12 },
});
