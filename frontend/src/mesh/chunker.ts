/**
 * Chunking + framing for the Sound mesh pipeline.
 *
 * Wire format per chunk (single text frame, ASCII-safe):
 *   SM1|<msgId>|<seq>/<total>|<base64url(data)>
 *
 *   - SM1     = protocol tag (Sound Mesh v1).
 *   - msgId   = 8-char base64url, shared by every chunk of a single payload.
 *   - seq     = 1-indexed integer up to 999.
 *   - total   = total chunk count, up to 999.
 *   - data    = base64url of the raw byte slice (NOT the JSON substring, so
 *               we never split a UTF-8 codepoint).
 *
 * Header overhead reservation: 22 bytes worst case
 *   "SM1|" + 8 + "|" + 3 + "/" + 3 + "|" = 22
 *
 * Reassembly is order-independent and tolerates duplicate chunks.
 */

import { ChunkBudgetError, LIMITS, MeshChunk } from "./types";

const PROTO = "SM1";
const HEADER_RESERVE = PROTO.length + 1 + 8 + 1 + 3 + 1 + 3 + 1; // 22
const MSGID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Random source. Default uses Math.random which is sufficient for collision
 * avoidance at the scales we target (per-app msgIds, never replayed).
 * Tests inject a deterministic source.
 */
export type RandomBytesFn = (n: number) => Uint8Array;

const defaultRandomBytes: RandomBytesFn = (n) => {
  const out = new Uint8Array(n);
  // Prefer crypto.getRandomValues when present (RN modern + web + node 19+).
  const g = (globalThis as unknown as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
  }).crypto;
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

export function generateMsgId(randomBytes: RandomBytesFn = defaultRandomBytes): string {
  const buf = randomBytes(8);
  let id = "";
  for (let i = 0; i < 8; i++) id += MSGID_ALPHABET[buf[i] % MSGID_ALPHABET.length];
  return id;
}

function bytesToBinaryString(b: Uint8Array): string {
  // Avoid String.fromCharCode(...b) which can stack-overflow on large inputs.
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < b.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + CHUNK)));
  }
  return s;
}

export function toBase64Url(bytes: Uint8Array): string {
  const bin = bytesToBinaryString(bytes);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : // Node fallback (tests).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("buffer").Buffer as typeof globalThis.Buffer).from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin =
    typeof atob !== "undefined"
      ? atob(b64)
      : // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("buffer").Buffer as typeof globalThis.Buffer).from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ChunkOptions {
  /** Forced msgId (deterministic tests). Defaults to a freshly generated one. */
  msgId?: string;
  /** Inject a random source (deterministic tests). */
  randomBytes?: RandomBytesFn;
}

/**
 * Split a serialized byte payload into N MeshChunks, each fitting within `mtu`
 * once framed. Throws ChunkBudgetError if mtu is too small or chunks > 999.
 */
export function chunk(bytes: Uint8Array, mtu: number, opts: ChunkOptions = {}): MeshChunk[] {
  if (!(bytes instanceof Uint8Array)) {
    throw new ChunkBudgetError("bytes must be Uint8Array");
  }
  if (!Number.isInteger(mtu) || mtu < LIMITS.MIN_MTU) {
    throw new ChunkBudgetError(`mtu must be an integer >= ${LIMITS.MIN_MTU}`);
  }
  // base64url expands by ~4/3. Solve for raw bytes per chunk: floor((mtu - hdr) * 3/4).
  const dataBudget = mtu - HEADER_RESERVE;
  if (dataBudget < 4) {
    throw new ChunkBudgetError("mtu too small once header is reserved");
  }
  const bytesPerChunk = Math.max(1, Math.floor((dataBudget * 3) / 4));
  const total = Math.max(1, Math.ceil(bytes.byteLength / bytesPerChunk));
  if (total > LIMITS.MAX_CHUNKS) {
    throw new ChunkBudgetError(
      `payload would need ${total} chunks (max ${LIMITS.MAX_CHUNKS} for this mtu)`
    );
  }
  const msgId = opts.msgId ?? generateMsgId(opts.randomBytes);
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(msgId)) {
    throw new ChunkBudgetError("msgId must be 1..16 chars from base64url alphabet");
  }
  const chunks: MeshChunk[] = [];
  for (let i = 0; i < total; i++) {
    const slice = bytes.subarray(i * bytesPerChunk, Math.min(bytes.byteLength, (i + 1) * bytesPerChunk));
    chunks.push({
      msgId,
      seq: i + 1,
      total,
      data: toBase64Url(slice),
    });
  }
  return chunks;
}

/** Serialize a chunk to its on-wire string form. */
export function encodeFrame(c: MeshChunk): string {
  return `${PROTO}|${c.msgId}|${c.seq}/${c.total}|${c.data}`;
}

/** Inverse of encodeFrame. Throws ChunkBudgetError on malformed input. */
export function decodeFrame(frame: string): MeshChunk {
  // Header is fixed-shape; data is the remainder so we don't regex over base64 payload.
  const headerEnd = nthIndexOf(frame, "|", 3);
  if (!frame.startsWith(`${PROTO}|`) || headerEnd === -1) {
    throw new ChunkBudgetError("bad frame: header malformed");
  }
  const header = frame.slice(0, headerEnd);
  const data = frame.slice(headerEnd + 1);
  const parts = header.split("|");
  if (parts.length !== 3) {
    throw new ChunkBudgetError("bad frame: header parts");
  }
  const [, msgId, seqTotal] = parts;
  const m = /^(\d{1,3})\/(\d{1,3})$/.exec(seqTotal);
  if (!m) throw new ChunkBudgetError("bad frame: seq/total");
  const seq = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (seq < 1 || total < 1 || seq > total) {
    throw new ChunkBudgetError("bad frame: seq out of range");
  }
  return { msgId, seq, total, data };
}

function nthIndexOf(s: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = s.indexOf(needle, idx + 1);
    if (idx === -1) return -1;
  }
  return idx;
}

/**
 * Reassemble a set of chunks (any order, possibly with duplicates) into the
 * original byte payload. Throws if anything is missing or inconsistent.
 */
export function reassemble(chunks: MeshChunk[]): Uint8Array {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new ChunkBudgetError("no chunks to reassemble");
  }
  const { msgId, total } = chunks[0];
  for (const c of chunks) {
    if (c.msgId !== msgId) throw new ChunkBudgetError("mixed msgIds in chunks");
    if (c.total !== total) throw new ChunkBudgetError("inconsistent total across chunks");
    if (c.seq < 1 || c.seq > total) throw new ChunkBudgetError(`seq ${c.seq} out of range`);
  }
  const bySeq = new Map<number, MeshChunk>();
  for (const c of chunks) bySeq.set(c.seq, c); // last-write wins for dups (data must match)
  if (bySeq.size !== total) {
    const missing: number[] = [];
    for (let i = 1; i <= total; i++) if (!bySeq.has(i)) missing.push(i);
    throw new ChunkBudgetError(`missing chunks: ${missing.join(",")}`);
  }
  const ordered: Uint8Array[] = [];
  for (let i = 1; i <= total; i++) ordered.push(fromBase64Url(bySeq.get(i)!.data));
  const totalLen = ordered.reduce((acc, b) => acc + b.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const b of ordered) {
    out.set(b, off);
    off += b.byteLength;
  }
  return out;
}
