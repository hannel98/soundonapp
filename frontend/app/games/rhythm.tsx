/**
 * Rhythm Tap — a 4-lane note-falling rhythm game inside the Sound app.
 *
 * Flow:
 *  1. Pick difficulty -> calls /api/games/rhythm/start which returns a
 *     deterministic note pattern { t_ms, lane }[] + duration + bpm.
 *  2. Game loop ticks at ~30 Hz updating each note's y position based on
 *     elapsed time since play start.
 *  3. Tap a lane while a note is in the hit window -> score (perfect/great/ok).
 *     Notes that pass the hit zone become misses.
 *  4. On end, submit { score, combo, accuracy, duration_ms } to /submit which
 *     awards $SOUND + XP and updates the per-difficulty leaderboard.
 *
 * Visual: full-screen 4-lane grid, falling colored bricks, glowing hit zone,
 * combo + score HUD, end-of-run modal with reward.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const LANE_COUNT = 4;
const LANE_W = (SCREEN_W - 32) / LANE_COUNT;
const PLAYFIELD_HEIGHT = 480;
const HIT_ZONE_Y = PLAYFIELD_HEIGHT - 90;
const HIT_ZONE_H = 80;
const NOTE_FALL_MS = 1600;             // time from spawn to hit zone
const PERFECT_WINDOW = 70;             // +/- ms from hit zone center
const GREAT_WINDOW = 140;
const OK_WINDOW = 220;
const MISS_WINDOW = 280;

const LANE_COLORS = ["#FF3B30", "#FFB800", "#00FF66", "#00B7FF"];

type Note = { t_ms: number; lane: number; id: number };
type LiveNote = Note & { y: number; status: "alive" | "perfect" | "great" | "ok" | "miss" };

type Difficulty = "easy" | "normal" | "hard";

export default function RhythmGame() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [phase, setPhase] = useState<"select" | "loading" | "playing" | "result">("select");
  const [duration, setDuration] = useState(30_000);
  const [bpm, setBpm] = useState(120);
  const [seed, setSeed] = useState("");
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [liveNotes, setLiveNotes] = useState<LiveNote[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [hits, setHits] = useState({ perfect: 0, great: 0, ok: 0, miss: 0 });
  const [feedback, setFeedback] = useState<{ text: string; color: string; key: number } | null>(null);
  const [reward, setReward] = useState<{ tokens: number; xp: number; new_best: boolean; balance: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Refs for game loop (avoid stale closures)
  const startMs = useRef<number | null>(null);
  const rafId = useRef<ReturnType<typeof setInterval> | null>(null);
  const notesRef = useRef<LiveNote[]>([]);
  const scoreRef = useRef({ score: 0, combo: 0, maxCombo: 0, perfect: 0, great: 0, ok: 0, miss: 0 });

  const begin = async () => {
    setPhase("loading");
    try {
      const data = await api.rhythmStart(difficulty);
      setSeed(data.seed);
      setBpm(data.bpm);
      setDuration(data.duration_ms);
      const enriched = data.notes.map((n, idx) => ({ ...n, id: idx }));
      setAllNotes(enriched);
      notesRef.current = enriched.map((n) => ({ ...n, y: -100, status: "alive" as const }));
      setLiveNotes(notesRef.current);
      scoreRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, great: 0, ok: 0, miss: 0 };
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setHits({ perfect: 0, great: 0, ok: 0, miss: 0 });
      setReward(null);
      startMs.current = Date.now();
      setPhase("playing");
      rafId.current = setInterval(tick, 33);
    } catch (e) {
      setPhase("select");
    }
  };

  const tick = () => {
    if (startMs.current == null) return;
    const elapsed = Date.now() - startMs.current;
    // Update Y positions
    const playfieldNotes = notesRef.current.map((n) => {
      if (n.status !== "alive") return n;
      const noteHitTime = n.t_ms;
      // y = HIT_ZONE_Y at noteHitTime; spawned NOTE_FALL_MS earlier
      const progress = (elapsed - (noteHitTime - NOTE_FALL_MS)) / NOTE_FALL_MS;
      const y = -50 + progress * (HIT_ZONE_Y + 50);
      // mark miss if it's past the hit zone + miss window
      if (elapsed - noteHitTime > MISS_WINDOW && n.status === "alive") {
        return { ...n, y, status: "miss" as const };
      }
      return { ...n, y };
    });
    // Count any newly-missed alive notes
    let missDelta = 0;
    for (let i = 0; i < playfieldNotes.length; i++) {
      if (playfieldNotes[i].status === "miss" && notesRef.current[i].status === "alive") {
        missDelta++;
      }
    }
    if (missDelta > 0) {
      scoreRef.current.miss += missDelta;
      scoreRef.current.combo = 0;
      setCombo(0);
      setHits((h) => ({ ...h, miss: h.miss + missDelta }));
    }
    notesRef.current = playfieldNotes;
    setLiveNotes([...playfieldNotes]);

    if (elapsed >= duration + NOTE_FALL_MS + 300) {
      end();
    }
  };

  const end = async () => {
    if (rafId.current) {
      clearInterval(rafId.current);
      rafId.current = null;
    }
    setPhase("result");
    const s = scoreRef.current;
    const totalNotes = allNotes.length || 1;
    const accuracy = (s.perfect + s.great * 0.7 + s.ok * 0.4) / totalNotes;
    setSubmitting(true);
    try {
      const res = await api.rhythmSubmit(
        seed,
        difficulty,
        s.score,
        s.maxCombo,
        Math.max(0, Math.min(1, accuracy)),
        duration,
      );
      setReward({ tokens: res.tokens_awarded, xp: res.xp_awarded, new_best: res.new_best, balance: res.balance });
    } catch {
      setReward({ tokens: 0, xp: 0, new_best: false, balance: 0 });
    } finally {
      setSubmitting(false);
    }
  };

  const onLaneTap = (lane: number) => {
    if (phase !== "playing" || startMs.current == null) return;
    const elapsed = Date.now() - startMs.current;
    // Find the closest alive note in that lane near the hit zone
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < notesRef.current.length; i++) {
      const n = notesRef.current[i];
      if (n.status !== "alive" || n.lane !== lane) continue;
      const delta = Math.abs(elapsed - n.t_ms);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestDelta > OK_WINDOW) return;

    let status: LiveNote["status"];
    let pts = 0;
    if (bestDelta <= PERFECT_WINDOW) {
      status = "perfect";
      pts = 300;
      scoreRef.current.perfect++;
      setHits((h) => ({ ...h, perfect: h.perfect + 1 }));
      setFeedback({ text: "PERFECT", color: colors.token, key: Date.now() });
    } else if (bestDelta <= GREAT_WINDOW) {
      status = "great";
      pts = 200;
      scoreRef.current.great++;
      setHits((h) => ({ ...h, great: h.great + 1 }));
      setFeedback({ text: "GREAT", color: colors.primary, key: Date.now() });
    } else {
      status = "ok";
      pts = 100;
      scoreRef.current.ok++;
      setHits((h) => ({ ...h, ok: h.ok + 1 }));
      setFeedback({ text: "OK", color: "#fff", key: Date.now() });
    }
    scoreRef.current.combo++;
    if (scoreRef.current.combo > scoreRef.current.maxCombo) {
      scoreRef.current.maxCombo = scoreRef.current.combo;
    }
    // Combo multiplier
    const mult = 1 + Math.min(scoreRef.current.combo, 50) * 0.02;
    scoreRef.current.score += Math.floor(pts * mult);
    setScore(scoreRef.current.score);
    setCombo(scoreRef.current.combo);
    setMaxCombo(scoreRef.current.maxCombo);

    notesRef.current[bestIdx] = { ...notesRef.current[bestIdx], status };
    setLiveNotes([...notesRef.current]);
  };

  useEffect(
    () => () => {
      if (rafId.current) clearInterval(rafId.current);
    },
    []
  );

  // ---------- Render ----------
  if (phase === "select") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 16 }}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} testID="rhythm-back" style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
              <Text style={styles.kicker}>BEAT GAME</Text>
              <Text style={styles.h1}>Rhythm Tap</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Tap each lane as the note hits the line. Build combos for multipliers, earn $SOUND.
          </Text>

          <Text style={styles.label}>Difficulty</Text>
          <View style={styles.diffRow}>
            {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
              <TouchableOpacity
                key={d}
                testID={`rhythm-diff-${d}`}
                onPress={() => setDifficulty(d)}
                style={[styles.diffBtn, difficulty === d && styles.diffBtnActive]}
              >
                <Text style={[styles.diffText, difficulty === d && styles.diffTextActive]}>
                  {d.toUpperCase()}
                </Text>
                <Text style={[styles.diffMeta, difficulty === d && { color: "#0A0A0C" }]}>
                  {d === "easy" ? "90 BPM" : d === "normal" ? "120 BPM" : "150 BPM + chords"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity testID="rhythm-start-btn" onPress={begin} style={styles.startBtn}>
            <Ionicons name="play" size={20} color="#0A0A0C" />
            <Text style={styles.startBtnText}>Start • 30s</Text>
          </TouchableOpacity>

          <View style={styles.rewardsCard}>
            <Text style={styles.rewardKicker}>REWARDS</Text>
            <Text style={styles.rewardItem}>• 1 $SOUND per 200 points (max 25)</Text>
            <Text style={styles.rewardItem}>• +5 $SOUND bonus at 95%+ accuracy</Text>
            <Text style={styles.rewardItem}>• XP scales with score</Text>
            <Text style={styles.rewardItem}>• New personal best unlocks leaderboard rank</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === "loading") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.centerFlex}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Spawning notes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "playing") {
    const elapsed = startMs.current ? Date.now() - startMs.current : 0;
    const pctRemain = Math.max(0, 1 - elapsed / duration);
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.hudRow}>
          <View>
            <Text style={styles.hudLabel}>SCORE</Text>
            <Text style={styles.hudScore} testID="rhythm-score">{score.toLocaleString()}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.hudLabel}>COMBO</Text>
            <Text style={styles.hudCombo}>{combo}×</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.hudLabel}>{difficulty.toUpperCase()}</Text>
            <Text style={styles.hudMeta}>{bpm} BPM</Text>
          </View>
        </View>
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${pctRemain * 100}%` }]} />
        </View>

        <View style={styles.playfield}>
          {/* Lane dividers */}
          {Array.from({ length: LANE_COUNT - 1 }).map((_, i) => (
            <View key={i} style={[styles.divider, { left: LANE_W * (i + 1) }]} />
          ))}
          {/* Hit zone */}
          <View style={[styles.hitZone, { top: HIT_ZONE_Y - HIT_ZONE_H / 2 }]} />
          {/* Notes */}
          {liveNotes.map((n) =>
            n.status === "alive" && n.y > -60 && n.y < PLAYFIELD_HEIGHT ? (
              <View
                key={n.id}
                style={[
                  styles.note,
                  {
                    left: n.lane * LANE_W + 8,
                    width: LANE_W - 16,
                    top: n.y,
                    backgroundColor: LANE_COLORS[n.lane],
                  },
                ]}
              />
            ) : null
          )}
          {feedback && (
            <Text key={feedback.key} style={[styles.feedback, { color: feedback.color }]}>
              {feedback.text}
            </Text>
          )}
        </View>

        <View style={styles.tapRow}>
          {Array.from({ length: LANE_COUNT }).map((_, i) => (
            <Pressable
              key={i}
              testID={`rhythm-lane-${i}`}
              onPressIn={() => onLaneTap(i)}
              style={({ pressed }) => [
                styles.tapBtn,
                { borderColor: LANE_COLORS[i] },
                pressed && { backgroundColor: LANE_COLORS[i] + "40" },
              ]}
            />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // result
  const total = hits.perfect + hits.great + hits.ok + hits.miss;
  const acc = total > 0 ? Math.round(((hits.perfect + hits.great * 0.7 + hits.ok * 0.4) / total) * 100) : 0;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 16 }}>
        <Text style={[styles.kicker, { marginTop: 24 }]}>RESULT</Text>
        <Text style={styles.h1}>{reward?.new_best ? "New Personal Best 🔥" : "Run Complete"}</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>SCORE</Text>
          <Text style={styles.resultScore} testID="rhythm-final-score">{score.toLocaleString()}</Text>
          <View style={styles.resultGrid}>
            <ResultStat label="Max combo" value={`${maxCombo}×`} />
            <ResultStat label="Accuracy" value={`${acc}%`} />
            <ResultStat label="Perfect" value={`${hits.perfect}`} color={colors.token} />
            <ResultStat label="Great" value={`${hits.great}`} color={colors.primary} />
            <ResultStat label="OK" value={`${hits.ok}`} />
            <ResultStat label="Miss" value={`${hits.miss}`} color={colors.accent} />
          </View>
        </View>

        {submitting ? (
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Submitting score...</Text>
          </View>
        ) : reward ? (
          <View style={styles.rewardBox} testID="rhythm-reward">
            <Text style={styles.rewardBoxKicker}>EARNED</Text>
            <Text style={styles.rewardEarn}>+{reward.tokens} $SOUND • +{reward.xp} XP</Text>
            <Text style={styles.balanceText}>Balance: {reward.balance} $SOUND</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity onPress={begin} style={[styles.startBtn, { flex: 1 }]} testID="rhythm-replay">
            <Ionicons name="refresh" size={18} color="#0A0A0C" />
            <Text style={styles.startBtnText}>Play again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.startBtn, { flex: 1, backgroundColor: colors.elevated }]}
            testID="rhythm-exit"
          >
            <Text style={[styles.startBtnText, { color: "#fff" }]}>Exit</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ width: "33%", paddingVertical: 8 }}>
      <Text style={{ color: colors.textTertiary, fontSize: 10, letterSpacing: 1.2, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: color || "#fff", fontSize: 18, fontWeight: "900", marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centerFlex: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  kicker: { color: colors.primary, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  h1: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  label: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginTop: 12 },
  diffRow: { gap: 10 },
  diffBtn: {
    padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  diffBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  diffText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  diffTextActive: { color: "#0A0A0C" },
  diffMeta: { color: colors.textTertiary, fontSize: 12, marginTop: 4 },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 16, borderRadius: radius.full, backgroundColor: colors.primary, minHeight: 52,
  },
  startBtnText: { color: "#0A0A0C", fontWeight: "900", fontSize: 16 },
  rewardsCard: {
    backgroundColor: colors.surface, padding: 16, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginTop: 12,
  },
  rewardKicker: { color: colors.token, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginBottom: 8 },
  rewardItem: { color: colors.textSecondary, fontSize: 13, lineHeight: 22 },
  hudRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: 12,
  },
  hudLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1.4, fontWeight: "700" },
  hudScore: { color: "#fff", fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] },
  hudCombo: { color: colors.primary, fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] },
  hudMeta: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  timerTrack: { height: 4, backgroundColor: colors.surface, marginHorizontal: spacing.lg, borderRadius: 2, overflow: "hidden" },
  timerFill: { height: "100%", backgroundColor: colors.token },
  playfield: {
    marginTop: 12, marginHorizontal: 16, height: PLAYFIELD_HEIGHT,
    backgroundColor: "#0F0F12", borderRadius: radius.md, overflow: "hidden", position: "relative",
  },
  divider: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.border },
  hitZone: {
    position: "absolute", left: 0, right: 0, height: HIT_ZONE_H,
    backgroundColor: "rgba(255,184,0,0.08)",
    borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.primary,
  },
  note: { position: "absolute", height: 18, borderRadius: 9 },
  feedback: {
    position: "absolute", top: HIT_ZONE_Y - 50, left: 0, right: 0,
    textAlign: "center", fontSize: 22, fontWeight: "900", letterSpacing: 2,
  },
  tapRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingBottom: 16, gap: 0,
  },
  tapBtn: {
    flex: 1, marginHorizontal: 0, height: 90, marginVertical: 8,
    borderWidth: 2, borderRadius: radius.md, backgroundColor: colors.surface,
  },
  resultCard: {
    backgroundColor: colors.surface, padding: 18, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  resultLabel: { color: colors.textTertiary, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  resultScore: { color: colors.primary, fontSize: 44, fontWeight: "900", letterSpacing: -1.2, marginVertical: 4 },
  resultGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  rewardBox: {
    backgroundColor: "rgba(0,255,102,0.08)", borderColor: colors.token, borderWidth: 1,
    padding: 16, borderRadius: radius.lg,
  },
  rewardBoxKicker: { color: colors.token, fontSize: 10, letterSpacing: 1.6, fontWeight: "800" },
  rewardEarn: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 6 },
  balanceText: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
