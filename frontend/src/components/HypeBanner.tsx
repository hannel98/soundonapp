import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Platform, Dimensions } from "react-native";
import { WebView } from "react-native-webview";
import { api } from "@/src/api/client";

const HYPE_PROPERTY_SLUG = "7fba3c3554";

// Track web-side global SDK init so we don't add the script twice.
let webSdkInjected = false;

function injectWebSdk() {
  if (typeof document === "undefined" || webSdkInjected) return;
  webSdkInjected = true;
  // Avoid duplicate script if already on page
  if (document.querySelector('script[data-hypelab]')) return;
  const s = document.createElement("script");
  s.src = "https://api.hypelab.com/v1/scripts/hp-sdk.js?v=0";
  s.defer = true;
  s.setAttribute("data-hypelab", "1");
  s.onload = () => {
    try {
      // @ts-ignore
      window.HypeLab &&
        // @ts-ignore
        window.HypeLab.initialize({ environment: "production", propertySlug: HYPE_PROPERTY_SLUG });
    } catch {}
  };
  document.head.appendChild(s);
}

type Props = {
  placement: string;
  // Optional: hide the ad if the user is Pro. Defaults to true.
  respectPro?: boolean;
  // Optional explicit height; we provide a sensible default.
  height?: number;
  // When `false`, render nothing (useful from layouts that want feature-flag).
  enabled?: boolean;
};

export default function HypeBanner({
  placement,
  respectPro = true,
  height,
  enabled = true,
}: Props) {
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const proCheckedRef = useRef(false);

  useEffect(() => {
    if (!respectPro) {
      setIsPro(false);
      return;
    }
    if (proCheckedRef.current) return;
    proCheckedRef.current = true;
    (async () => {
      try {
        const s = await api.iapSubscription();
        setIsPro(!!s?.active);
      } catch {
        setIsPro(false);
      }
    })();
  }, [respectPro]);

  // Always inject the web SDK on web side (runs once)
  useEffect(() => {
    if (Platform.OS === "web") injectWebSdk();
  }, []);

  if (!enabled) return null;
  // Still loading Pro state -> render an empty 1px box so layout doesn't shift later much
  if (isPro === null) return <View style={{ height: 1 }} />;
  if (isPro) return null;

  const screenW = Dimensions.get("window").width;
  const bannerH = height ?? 90;

  if (Platform.OS === "web") {
    // Cast through React.createElement so TS doesn't complain about the unknown
    // custom element name.
    return (
      <View
        style={[styles.wrap, { minHeight: bannerH }]}
        testID="hype-banner"
        // @ts-ignore allow nativeID for web
        nativeID={`hype-${placement}`}
      >
        {React.createElement("hype-banner", { placement })}
      </View>
    );
  }

  // Native (iOS / Android) - WebView with minimal HTML host
  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
<style>
  html,body{margin:0;padding:0;background:#0A0A0C;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto;}
  body{display:flex;align-items:center;justify-content:center;min-height:${bannerH}px;overflow:hidden;}
  hype-banner{display:block;width:100%;}
</style>
<script defer src="https://api.hypelab.com/v1/scripts/hp-sdk.js?v=0"></script>
<script>
  document.addEventListener("DOMContentLoaded", function () {
    try {
      window.HypeLab && window.HypeLab.initialize({
        environment: "production",
        propertySlug: "${HYPE_PROPERTY_SLUG}",
      });
    } catch (e) {}
  });
</script>
</head><body>
<hype-banner placement="${placement}"></hype-banner>
</body></html>`;

  return (
    <View
      style={[styles.wrap, { height: bannerH, width: screenW - 16 }]}
      testID="hype-banner"
    >
      <WebView
        source={{ html, baseUrl: "https://api.hypelab.com" }}
        style={{ backgroundColor: "transparent", flex: 1 }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        startInLoadingState={false}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: 10,
    marginVertical: 6,
    backgroundColor: "rgba(20,20,24,0.5)",
  },
});
