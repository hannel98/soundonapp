import { Alert } from "react-native";
import type { Router } from "expo-router";
import { api } from "@/src/api/client";

export type SpendAction = "upload_music" | "ai_album_cover" | "go_live";

const LABELS: Record<SpendAction, string> = {
  upload_music: "Upload Song",
  ai_album_cover: "AI Album Cover",
  go_live: "Go Live",
};

/**
 * Spend $SOUND tokens for a feature. Handles 402 with a friendly
 * "Top up" alert that deep-links to the Storefront.
 *
 * Returns spend result on success, or null when user can't pay / cancels.
 */
export async function spendOr(
  action: SpendAction,
  router: Pick<Router, "push">,
  ref?: any,
): Promise<{ ok: boolean; cost: number; balance: number | null; pro: boolean } | null> {
  try {
    const res = await api.iapSpend(action, ref);
    return res;
  } catch (e: any) {
    const msg: string = e?.message || String(e || "");
    if (msg.toLowerCase().includes("not enough") || msg.toLowerCase().includes("$sound")) {
      return await new Promise((resolve) => {
        Alert.alert(
          "Not enough $SOUND",
          `${LABELS[action]} needs more tokens than you have. Top up to continue.`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
            {
              text: "Top up",
              style: "default",
              onPress: () => {
                router.push("/store" as any);
                resolve(null);
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve(null) },
        );
      });
    }
    Alert.alert(LABELS[action], msg);
    return null;
  }
}
