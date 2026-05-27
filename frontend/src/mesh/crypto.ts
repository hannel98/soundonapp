/**
 * Production SHA-256 hashing wrapper, backed by expo-crypto.
 *
 * Returns lowercase hex. expo-crypto uses the native CommonCrypto / Android
 * Keystore digests on device, and falls back to WebCrypto on web — neither
 * implementation goes through JS land for the actual digest, so this is safe
 * to call on hot paths.
 *
 * Tests inject a Node `crypto`-backed implementation instead of importing
 * this module, to avoid pulling expo-modules-core into the harness.
 */

import * as Crypto from "expo-crypto";

import type { Sha256HexFn } from "./types";

export const sha256Hex: Sha256HexFn = async (input: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

export { Crypto };
