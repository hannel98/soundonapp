/**
 * Album metadata serializer for the Sound mesh pipeline.
 *
 * Responsibilities:
 *   1. Validate the input AlbumPayload against the documented bounds.
 *   2. Canonicalize (sort keys, drop undefined) and minify to JSON.
 *   3. Compute SHA-256 (via injected hashFn) over the canonical core, truncate
 *      to 16 lowercase hex chars, and stamp it back into the payload.
 *   4. Refuse to emit anything over LIMITS.MAX_TOTAL_BYTES.
 *
 * The verify(...) side recomputes the hash and refuses on mismatch.
 *
 * Hashing is injected so tests can swap a Node `crypto` implementation in
 * place of expo-crypto without pulling the RN runtime into the test harness.
 */

import {
  AlbumPayload,
  LIMITS,
  PayloadTooLargeError,
  SerializedAlbum,
  Sha256HexFn,
  ValidationError,
} from "./types";

/** Throws ValidationError if any field is out of range. */
export function validateAlbum(p: AlbumPayload | null | undefined): void {
  if (!p || typeof p !== "object") {
    throw new ValidationError("payload is required");
  }
  if (typeof p.title !== "string" || p.title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  if (p.title.length > LIMITS.MAX_TITLE) {
    throw new ValidationError(`title exceeds ${LIMITS.MAX_TITLE} chars`);
  }
  if (typeof p.artist !== "string" || p.artist.trim().length === 0) {
    throw new ValidationError("artist is required");
  }
  if (p.artist.length > LIMITS.MAX_ARTIST) {
    throw new ValidationError(`artist exceeds ${LIMITS.MAX_ARTIST} chars`);
  }
  if (
    !Number.isInteger(p.trackCount) ||
    p.trackCount < 0 ||
    p.trackCount > LIMITS.MAX_TRACK_COUNT
  ) {
    throw new ValidationError(
      `trackCount must be an integer in [0, ${LIMITS.MAX_TRACK_COUNT}]`
    );
  }
  if (
    !Number.isFinite(p.duration) ||
    p.duration < 0 ||
    p.duration > LIMITS.MAX_DURATION
  ) {
    throw new ValidationError(
      `duration must be a finite number in [0, ${LIMITS.MAX_DURATION}]`
    );
  }
}

/**
 * Produce a deterministic JSON string for an object: keys sorted lexically,
 * `undefined` values stripped. Does not recurse into nested objects/arrays
 * because the album core shape is flat — we keep the canonical form simple
 * and reject anything not in the documented schema upstream.
 */
export function canonicalize(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) sorted[k] = obj[k];
  }
  return JSON.stringify(sorted);
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8Decode(b: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(b);
}

/**
 * Serialize an album for mesh transport. Returns the canonical, hash-stamped
 * JSON string, its UTF-8 byte view, and the 16-hex-char content hash.
 */
export async function serializeAlbum(
  payload: AlbumPayload,
  hashFn: Sha256HexFn
): Promise<SerializedAlbum> {
  validateAlbum(payload);
  // Build the core without any user-supplied contentHash so the recipient
  // can recompute deterministically.
  const core: Record<string, unknown> = {
    artist: payload.artist,
    duration: payload.duration,
    title: payload.title,
    trackCount: payload.trackCount,
  };
  const canonicalCore = canonicalize(core);
  const fullHash = await hashFn(canonicalCore);
  if (typeof fullHash !== "string" || !/^[0-9a-f]{16,}$/.test(fullHash)) {
    throw new ValidationError("hashFn must return lowercase hex (>= 16 chars)");
  }
  const hash = fullHash.slice(0, 16);
  const stamped: Record<string, unknown> = { ...core, contentHash: hash };
  const json = canonicalize(stamped);
  const bytes = utf8Encode(json);
  if (bytes.byteLength > LIMITS.MAX_TOTAL_BYTES) {
    throw new PayloadTooLargeError(
      `serialized payload ${bytes.byteLength} > ${LIMITS.MAX_TOTAL_BYTES} bytes`
    );
  }
  return { json, bytes, hash, byteLength: bytes.byteLength };
}

/**
 * Parse + validate + verify a received serialized album. Throws on bad JSON,
 * missing/extra fields, schema-bound violations, or hash mismatch.
 */
export async function verifyAlbum(
  jsonOrBytes: string | Uint8Array,
  hashFn: Sha256HexFn
): Promise<AlbumPayload> {
  const json =
    typeof jsonOrBytes === "string" ? jsonOrBytes : utf8Decode(jsonOrBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new ValidationError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("payload must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  const hash = obj.contentHash;
  if (typeof hash !== "string") {
    throw new ValidationError("missing contentHash");
  }
  // Reject unexpected fields (defensive — keeps the canonical form stable).
  const allowed = new Set([
    "artist",
    "duration",
    "title",
    "trackCount",
    "contentHash",
  ]);
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      throw new ValidationError(`unexpected field: ${k}`);
    }
  }
  const candidate: AlbumPayload = {
    title: obj.title as string,
    artist: obj.artist as string,
    trackCount: obj.trackCount as number,
    duration: obj.duration as number,
    contentHash: hash,
  };
  validateAlbum(candidate);
  const core: Record<string, unknown> = {
    artist: candidate.artist,
    duration: candidate.duration,
    title: candidate.title,
    trackCount: candidate.trackCount,
  };
  const recomputed = (await hashFn(canonicalize(core))).slice(0, 16);
  if (recomputed !== hash) {
    throw new ValidationError("content hash mismatch (tampered or stale)");
  }
  return candidate;
}
