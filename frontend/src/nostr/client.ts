/**
 * Lightweight Nostr client for BitChat-style messaging.
 * Uses public Nostr relays. No accounts - generates a per-device ephemeral key
 * stored in expo-secure-store (with AsyncStorage fallback on web).
 */
import { Platform } from "react-native";
import {
  SimplePool,
  finalizeEvent,
  getPublicKey,
  generateSecretKey,
  nip04,
  nip19,
  type Event,
  type EventTemplate,
  type Filter,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
  "wss://nostr.wine",
];

export const SOUNDMESH_TAG = "soundmesh";
export const BITCHAT_TAG = "bitchat";
export const KIND_TEXT = 1;
export const KIND_DM = 4;

const SECURE_KEY = "soundmesh_nostr_sk";
const PROFILE_KEY = "soundmesh_nostr_profile";

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

export type LocalIdentity = {
  sk: Uint8Array;
  pk: string;
  npub: string;
  nsec: string;
  display_name?: string;
};

let _identityCache: LocalIdentity | null = null;
let _pool: SimplePool | null = null;

export function getPool(): SimplePool {
  if (!_pool) _pool = new SimplePool();
  return _pool;
}

export async function loadOrCreateIdentity(displayName?: string): Promise<LocalIdentity> {
  if (_identityCache) return _identityCache;
  let skHex = await secureGet(SECURE_KEY);
  let sk: Uint8Array;
  if (skHex) {
    sk = hexToBytes(skHex);
  } else {
    sk = generateSecretKey();
    skHex = bytesToHex(sk);
    await secureSet(SECURE_KEY, skHex);
  }
  const pk = getPublicKey(sk);
  const profileRaw = await secureGet(PROFILE_KEY);
  const profile = profileRaw ? JSON.parse(profileRaw) : {};
  if (displayName && !profile.display_name) {
    profile.display_name = displayName;
    await secureSet(PROFILE_KEY, JSON.stringify(profile));
  }
  _identityCache = {
    sk,
    pk,
    npub: nip19.npubEncode(pk),
    nsec: nip19.nsecEncode(sk),
    display_name: profile.display_name,
  };
  return _identityCache;
}

export async function setDisplayName(name: string) {
  const cur = (await secureGet(PROFILE_KEY)) || "{}";
  const parsed = JSON.parse(cur);
  parsed.display_name = name;
  await secureSet(PROFILE_KEY, JSON.stringify(parsed));
  if (_identityCache) _identityCache.display_name = name;
}

export async function publishText(content: string, hashtags: string[] = [BITCHAT_TAG]): Promise<Event> {
  const id = await loadOrCreateIdentity();
  const tags: string[][] = hashtags.map((t) => ["t", t]);
  const tmpl: EventTemplate = {
    kind: KIND_TEXT,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags,
  };
  const signed = finalizeEvent(tmpl, id.sk);
  try { await Promise.any(getPool().publish(DEFAULT_RELAYS, signed)); } catch {}
  return signed;
}

export async function publishToGeohash(geohash: string, content: string): Promise<Event> {
  const id = await loadOrCreateIdentity();
  const tmpl: EventTemplate = {
    kind: KIND_TEXT,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [["g", geohash], ["t", geohash], ["t", BITCHAT_TAG]],
  };
  const signed = finalizeEvent(tmpl, id.sk);
  try { await Promise.any(getPool().publish(DEFAULT_RELAYS, signed)); } catch {}
  return signed;
}

export async function sendDM(recipientPk: string, content: string): Promise<Event> {
  const id = await loadOrCreateIdentity();
  const encrypted = await nip04.encrypt(id.sk, recipientPk, content);
  const tmpl: EventTemplate = {
    kind: KIND_DM,
    created_at: Math.floor(Date.now() / 1000),
    content: encrypted,
    tags: [["p", recipientPk]],
  };
  const signed = finalizeEvent(tmpl, id.sk);
  try { await Promise.any(getPool().publish(DEFAULT_RELAYS, signed)); } catch {}
  return signed;
}

export async function decryptDM(evt: Event): Promise<string> {
  const id = await loadOrCreateIdentity();
  const counter = evt.pubkey === id.pk ? (evt.tags.find((t) => t[0] === "p")?.[1] || "") : evt.pubkey;
  if (!counter) return "<unable to decrypt>";
  try {
    return await nip04.decrypt(id.sk, counter, evt.content);
  } catch {
    return "<unable to decrypt>";
  }
}

export type Sub = { close: () => void };
export function subscribe(filters: Filter[], onEvent: (e: Event) => void): Sub {
  const sub = getPool().subscribeMany(DEFAULT_RELAYS, filters, {
    onevent: (e) => onEvent(e),
  });
  return { close: () => sub.close() };
}

export function encodeGeohash(lat: number, lng: number, precision = 5): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let geohash = "";
  const latRange: [number, number] = [-90, 90];
  const lonRange: [number, number] = [-180, 180];
  let bits = 0;
  let bit = 0;
  let even = true;
  while (geohash.length < precision) {
    if (even) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lng > mid) { bits = (bits << 1) | 1; lonRange[0] = mid; }
      else { bits = bits << 1; lonRange[1] = mid; }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat > mid) { bits = (bits << 1) | 1; latRange[0] = mid; }
      else { bits = bits << 1; latRange[1] = mid; }
    }
    even = !even;
    if (++bit === 5) {
      geohash += base32[bits];
      bits = 0; bit = 0;
    }
  }
  return geohash;
}
