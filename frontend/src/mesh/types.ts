/**
 * Shared types and typed error classes for the Sound mesh sharing pipeline.
 *
 * No external deps. Pure types so this file can be imported by every layer
 * (serializer, chunker, adapters, UI) without pulling React Native runtime in.
 */

/** User-facing payload shape: a music/photo album metadata bundle. */
export interface AlbumPayload {
  /** Display title, 1..200 chars after trim. */
  title: string;
  /** Display artist, 1..200 chars after trim. */
  artist: string;
  /** Non-negative integer track count, max 500. */
  trackCount: number;
  /** Duration in seconds, finite, 0..86_400 (24h). */
  duration: number;
  /**
   * 16-char hex content hash. The serializer always (re)computes this and
   * stamps it into the on-wire payload. Any value passed in is ignored —
   * pass it on verify(...) only.
   */
  contentHash?: string;
}

/** Output of serializeAlbum: canonical, hash-stamped, ready to chunk. */
export interface SerializedAlbum {
  /** Canonical (sorted-keys) minified JSON including contentHash. */
  json: string;
  /** UTF-8 byte view of `json`. */
  bytes: Uint8Array;
  /** 16-char lowercase hex SHA-256 over the *unstamped* core. */
  hash: string;
  /** bytes.byteLength, surfaced for budgeting decisions in callers. */
  byteLength: number;
}

/** One framed slice of a serialized payload, ready for a mesh adapter. */
export interface MeshChunk {
  /** 8-char base64url message ID shared by every chunk of the same payload. */
  msgId: string;
  /** 1-indexed sequence number. */
  seq: number;
  /** Total chunks for this msgId. */
  total: number;
  /** base64url-encoded byte slice. Always string-safe for BLE GATT writes. */
  data: string;
}

/** Thrown when a serializer step (canonicalize/encode) fails. */
export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerializationError";
  }
}

/** Thrown when payload fields violate the documented bounds. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Thrown when chunking cannot satisfy the requested MTU budget. */
export class ChunkBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChunkBudgetError";
  }
}

/** Thrown when serialized payload exceeds the hard 32 KB ceiling. */
export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

/** Thrown by a BitChatAdapter when broadcast fails. (Used in Phase 2.) */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

/** Documented limits (also enforced at runtime by validateAlbum). */
export const LIMITS = Object.freeze({
  MAX_TITLE: 200,
  MAX_ARTIST: 200,
  MAX_TRACK_COUNT: 500,
  MAX_DURATION: 86_400,
  /** Hard ceiling on serialized payload bytes (post-stamping). */
  MAX_TOTAL_BYTES: 32 * 1024,
  /** Minimum MTU we will accept. Smaller can't even fit the framing header. */
  MIN_MTU: 32,
  /** sequence header reserves space for up to 3-digit totals. */
  MAX_CHUNKS: 999,
});

/** Signature for an injected SHA-256 implementation. Returns lowercase hex. */
export type Sha256HexFn = (input: string) => Promise<string>;
