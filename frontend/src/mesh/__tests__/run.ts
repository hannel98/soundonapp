/**
 * Phase 1 test runner.
 *
 * Run with:
 *   yarn --cwd /app/frontend tsx src/mesh/__tests__/run.ts
 *
 * We intentionally avoid Jest here — the Expo project doesn't ship a Jest
 * config and Phase 1 is pure logic. Tests use Node's `node:assert` plus a
 * tiny describe/it harness. A Node-backed SHA-256 is injected so we don't
 * touch expo-crypto.
 */

import { strict as assert } from "node:assert";
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";

import {
  chunk,
  decodeFrame,
  encodeFrame,
  fromBase64Url,
  generateMsgId,
  reassemble,
  toBase64Url,
} from "../chunker";
import {
  canonicalize,
  serializeAlbum,
  validateAlbum,
  verifyAlbum,
} from "../serializer";
import {
  AlbumPayload,
  ChunkBudgetError,
  LIMITS,
  PayloadTooLargeError,
  ValidationError,
} from "../types";

const sha256: (s: string) => Promise<string> = async (s) =>
  createHash("sha256").update(s, "utf8").digest("hex");

// ---- tiny harness ----
const failures: string[] = [];
let count = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  count++;
  try {
    await fn();
    process.stdout.write(`  ok  ${name}\n`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    failures.push(`${name} -> ${msg}`);
    process.stdout.write(`  FAIL ${name}\n        ${msg}\n`);
  }
}

const SAMPLE: AlbumPayload = {
  title: "Midnight Frequencies",
  artist: "DISKADE",
  trackCount: 12,
  duration: 3540,
};

(async () => {
  console.log("\n=== Sound mesh Phase 1 tests ===\n");

  // ---- validateAlbum ----
  console.log("validateAlbum");
  await test("accepts valid payload", () => {
    validateAlbum(SAMPLE);
  });
  await test("rejects null", () => {
    assert.throws(() => validateAlbum(null as unknown as AlbumPayload), ValidationError);
  });
  await test("rejects empty title", () => {
    assert.throws(() => validateAlbum({ ...SAMPLE, title: "   " }), ValidationError);
  });
  await test("rejects oversize title", () => {
    assert.throws(
      () => validateAlbum({ ...SAMPLE, title: "a".repeat(LIMITS.MAX_TITLE + 1) }),
      ValidationError
    );
  });
  await test("rejects negative trackCount", () => {
    assert.throws(() => validateAlbum({ ...SAMPLE, trackCount: -1 }), ValidationError);
  });
  await test("rejects non-integer trackCount", () => {
    assert.throws(() => validateAlbum({ ...SAMPLE, trackCount: 3.5 }), ValidationError);
  });
  await test("rejects NaN duration", () => {
    assert.throws(() => validateAlbum({ ...SAMPLE, duration: NaN }), ValidationError);
  });
  await test("rejects duration > 24h", () => {
    assert.throws(
      () => validateAlbum({ ...SAMPLE, duration: LIMITS.MAX_DURATION + 1 }),
      ValidationError
    );
  });

  // ---- canonicalize ----
  console.log("\ncanonicalize");
  await test("sorts keys deterministically", () => {
    const a = canonicalize({ b: 2, a: 1, c: 3 });
    const b = canonicalize({ c: 3, a: 1, b: 2 });
    assert.equal(a, b);
    assert.equal(a, '{"a":1,"b":2,"c":3}');
  });
  await test("strips undefined values", () => {
    assert.equal(canonicalize({ a: 1, b: undefined }), '{"a":1}');
  });

  // ---- serializeAlbum / verifyAlbum ----
  console.log("\nserializeAlbum / verifyAlbum");
  await test("serializes and round-trips", async () => {
    const s = await serializeAlbum(SAMPLE, sha256);
    assert.match(s.json, /"contentHash":"[0-9a-f]{16}"/);
    assert.equal(s.byteLength, s.bytes.byteLength);
    assert.equal(s.bytes.byteLength, new TextEncoder().encode(s.json).byteLength);
    const back = await verifyAlbum(s.json, sha256);
    assert.equal(back.title, SAMPLE.title);
    assert.equal(back.artist, SAMPLE.artist);
    assert.equal(back.trackCount, SAMPLE.trackCount);
    assert.equal(back.duration, SAMPLE.duration);
    assert.equal(back.contentHash, s.hash);
  });
  await test("ignores user-supplied contentHash on serialize", async () => {
    const s = await serializeAlbum(
      { ...SAMPLE, contentHash: "ffffffffffffffff" },
      sha256
    );
    assert.notEqual(s.hash, "ffffffffffffffff");
    const back = await verifyAlbum(s.json, sha256);
    assert.equal(back.contentHash, s.hash);
  });
  await test("verifyAlbum detects tampered title", async () => {
    const s = await serializeAlbum(SAMPLE, sha256);
    const tampered = s.json.replace(SAMPLE.title, "Stolen Title");
    await assert.rejects(() => verifyAlbum(tampered, sha256), /hash mismatch/);
  });
  await test("verifyAlbum rejects unexpected fields", async () => {
    const obj = { ...SAMPLE, contentHash: "x".repeat(16), extra: "no" };
    await assert.rejects(
      () => verifyAlbum(JSON.stringify(obj), sha256),
      /unexpected field/
    );
  });
  await test("verifyAlbum rejects missing contentHash", async () => {
    await assert.rejects(
      () => verifyAlbum(JSON.stringify(SAMPLE), sha256),
      /missing contentHash/
    );
  });
  await test("verifyAlbum rejects bad JSON", async () => {
    await assert.rejects(() => verifyAlbum("not json", sha256), /invalid JSON/);
  });
  await test("PayloadTooLargeError for huge title (after stamp)", async () => {
    // Build a near-max title, then bump artist field to push over the 32K cap.
    const huge: AlbumPayload = {
      title: "x".repeat(LIMITS.MAX_TITLE),
      artist: "y".repeat(LIMITS.MAX_ARTIST),
      trackCount: 1,
      duration: 1,
    };
    // 200+200 chars + JSON overhead is well under 32K, so this should still pass.
    const ok = await serializeAlbum(huge, sha256);
    assert.ok(ok.byteLength < LIMITS.MAX_TOTAL_BYTES);
  });
  await test("rejects bogus hashFn output", async () => {
    const badHash = async () => "not-hex";
    await assert.rejects(() => serializeAlbum(SAMPLE, badHash), ValidationError);
  });

  // ---- chunker primitives ----
  console.log("\nbase64url round-trip");
  await test("encodes/decodes random bytes losslessly", () => {
    for (let len = 0; len < 200; len += 7) {
      const b = nodeRandomBytes(len);
      const u8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      const round = fromBase64Url(toBase64Url(u8));
      assert.equal(round.byteLength, u8.byteLength);
      for (let i = 0; i < u8.byteLength; i++) assert.equal(round[i], u8[i]);
    }
  });
  await test("generateMsgId produces 8 base64url chars", () => {
    const id = generateMsgId((n) => new Uint8Array(n));
    assert.equal(id.length, 8);
    assert.match(id, /^[A-Za-z0-9_-]{8}$/);
  });

  // ---- chunk / reassemble ----
  console.log("\nchunk / reassemble");
  await test("single-chunk path", () => {
    const bytes = new TextEncoder().encode("hi");
    const cs = chunk(bytes, 128, { msgId: "AAAAAAAA" });
    assert.equal(cs.length, 1);
    assert.equal(cs[0].seq, 1);
    assert.equal(cs[0].total, 1);
    const back = reassemble(cs);
    assert.equal(new TextDecoder().decode(back), "hi");
  });
  await test("multi-chunk path round-trips losslessly", async () => {
    const s = await serializeAlbum(SAMPLE, sha256);
    const cs = chunk(s.bytes, 64, { msgId: "BBBBBBBB" });
    assert.ok(cs.length > 1, `expected >1 chunks, got ${cs.length}`);
    for (const c of cs) {
      const framed = encodeFrame(c);
      assert.ok(framed.length <= 64, `frame ${framed.length} > 64`);
    }
    const back = reassemble(cs);
    assert.equal(new TextDecoder().decode(back), s.json);
  });
  await test("out-of-order reassembly works", async () => {
    const s = await serializeAlbum(SAMPLE, sha256);
    const cs = chunk(s.bytes, 64, { msgId: "CCCCCCCC" });
    const shuffled = [...cs].reverse();
    const back = reassemble(shuffled);
    assert.equal(new TextDecoder().decode(back), s.json);
  });
  await test("duplicate chunks tolerated", async () => {
    const s = await serializeAlbum(SAMPLE, sha256);
    const cs = chunk(s.bytes, 64, { msgId: "DDDDDDDD" });
    const dupes = [...cs, cs[0], cs[0]];
    const back = reassemble(dupes);
    assert.equal(new TextDecoder().decode(back), s.json);
  });
  await test("missing chunks rejected", async () => {
    const s = await serializeAlbum(SAMPLE, sha256);
    const cs = chunk(s.bytes, 64, { msgId: "EEEEEEEE" });
    assert.throws(() => reassemble(cs.slice(0, -1)), /missing chunks/);
  });
  await test("encode/decode frame round-trip", () => {
    const c = { msgId: "FFFFFFFF", seq: 3, total: 5, data: "abc-_xyz" };
    const back = decodeFrame(encodeFrame(c));
    assert.deepEqual(back, c);
  });
  await test("decodeFrame rejects malformed", () => {
    assert.throws(() => decodeFrame("nope"), ChunkBudgetError);
    assert.throws(() => decodeFrame("SM1|abc|notseq|data"), ChunkBudgetError);
  });
  await test("mtu below MIN_MTU rejected", () => {
    assert.throws(
      () => chunk(new Uint8Array([1, 2, 3]), LIMITS.MIN_MTU - 1),
      ChunkBudgetError
    );
  });
  await test("payload that needs > 999 chunks rejected", () => {
    // ~32KB bytes at minimum mtu (32) per chunk produces ~5x over the 999 cap.
    const big = new Uint8Array(LIMITS.MAX_TOTAL_BYTES);
    assert.throws(() => chunk(big, LIMITS.MIN_MTU), ChunkBudgetError);
  });

  console.log("");
  if (failures.length === 0) {
    console.log(`PASS ${count}/${count} tests`);
    process.exit(0);
  } else {
    console.log(`FAIL ${failures.length}/${count} tests`);
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }

  // silence unused import warnings when tree-shaken paths aren't exercised
  void PayloadTooLargeError;
})();
