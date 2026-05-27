# Sound (SoundMesh) — Mobile App PRD

## Overview
Sound is an AI music creation & discovery platform, originally a web app at https://soundmesh-platform.emergent.host/, now ported to a native React Native / Expo mobile app with a fresh backend. Users sign up with email/password OR Google, discover featured artists, browse trending music/beats/videos, generate AI beats in the studio, read music industry news, and earn $SOUND tokens with daily streaks.

## Stack
- Backend: FastAPI + MongoDB (Motor), bcrypt password hashing, JWT (PyJWT), Emergent-managed Google OAuth via session_token.
- Frontend: Expo SDK 54, expo-router file-based routing, expo-secure-store, expo-web-browser, expo-linking, @expo/vector-icons.
- Bundle/package ID: `com.soundmesh.app` (Android + iOS), scheme `soundmesh`.
- EAS configuration: `eas.json` with development / preview / production profiles.

## Auth
- Local: `/api/auth/signup` + `/api/auth/login` (bcrypt + JWT, 7 days).
- Google: Emergent OAuth → session_id → `/api/auth/google/session` → session_token (7 days, TTL index).
- Unified `/api/auth/me` accepts either token type. `providers` array tracks which methods are linked per user.

## Tabs (bottom navigation)
1. Home — Greeting + token badge, hero card, Featured Artists carousel, Trending Sounds, Production Tips.
2. Studio — AI beat generator UI (genre/mood/BPM chips + prompt), simulated waveform output, save/publish actions.
3. Explore — Music / Beats / Videos tabs (FlatList grids, external links to Apple Music, Spotify, YouTube, BeatStars, UnitedMasters).
4. News — Music industry news cards + full-screen article modal.
5. Profile — $SOUND balance, multiplier, streak / best streak / XP / tracks / weekly stats, milestone progress bar, daily bonus claim, status compose + feed, account info, sign out.

## Global UI
- Floating MiniPlayer above tab bar (cross-screen now-playing state via PlayerContext).
- Artist detail page (`/artist/[id]`) with hero, stats, external-platform CTA, share/follow rows.

## Backend collections
- users, user_sessions (TTL), artists, tracks, beats, videos, news, statuses, progress.
- Seed data on startup (10 artists, 6 tracks, 4 beats, 4 videos, 4 news).

## Data Test IDs
All interactive elements include `testID` for automated testing.

## Token Economy + Leaderboard + In-app Recording (iter 4 — DONE)
- Backend ledger: `token_transactions` collection, `debit_tokens(...)` / `credit_tokens(...)` helpers with atomic `find_one_and_update` + `$gte` guard (insufficient balance → 402). Per-action cost map: `tts=1, stt=1, save_recording=1, publish_album=3, go_live=3`. Refund on provider failure.
- `/api/leaderboard?sort=balance|streak|xp&limit=N` — aggregate over `progress` + `users` lookup, returns `LeaderEntry[]` with rank, name, avatar, metric.
- `/api/me/recordings` POST (multipart upload, base64-stored) + GET (list w/o audio body) + `/{id}/audio` (fetch one). 1 token to save a take.
- `/api/me/transactions` + `/api/me/costs` for the wallet UI.
- New users start with **50 $SOUND** so they can try things immediately.
- VoiceStudio now has a Transcribe / Save toggle. Save mode writes the take to backend and shows "Saved 'Take HH:MM:SS' • N KB".
- Profile tab shows a 🏆 Leaderboard with sort chips (🥇🥈🥉 medals), highlighting "(you)" if you're in the top 10.

## AI Voice (iter 3 — DONE)
- Backend endpoints: `POST /api/ai/tts` (OpenAI tts-1, 9 voices, mp3 base64) and `POST /api/ai/stt` (OpenAI Whisper-1, multipart upload) via Emergent LLM key + `emergentintegrations` library.
- Frontend `VoiceStudio` component on the Studio tab: type → generate → autoplay vocal via `expo-audio`; mic record → upload → transcript with full permission contract (`canAskAgain`, Open Settings fallback).
- Verified round-trip: TTS audio → Whisper → exact text returned ("Hello from Sound. This is your AI vocalist.").

## Mesh Phase 1 (iter 2.5 — DONE, Phase 2 PAUSED at user request)
- `src/mesh/{types,serializer,chunker,crypto}.ts` shipped, 29/29 tests pass.
- Phase 2 (BitChatAdapter + outbox + meshService) intentionally paused until items 1–6 of the AI roadmap complete.

## Out of scope (deferred)
- Mobile AdMob integration (user opted to skip ads for now).
- Real AI beat generation (UI scaffolded; backend integration deferred).
- Audio file playback for non-Audius tracks (Apple Music/Spotify/YouTube/BeatStars are licensed, links open externally).
- Push notifications.
- Full Briar Headless mesh integration: not possible in Expo (Briar daemon is JVM desktop-only, `~/.briar/auth_token` is unreadable from a mobile sandbox). Shipped a best-effort `briar://share?text=...` deep-link + native Share-sheet fallback so users can hand a formatted "TRACK | ARTIST | URL" payload to the installed Briar Android app.

## Audius integration (new in iter 2)
- Backend proxy: `/api/audius/trending`, `/api/audius/search?q=`, `/api/audius/track/{id}/stream` — auto-discovers a healthy Audius discovery node from `https://api.audius.co`, falls back to `https://discoveryprovider.audius.co`.
- Explore tab now has a dedicated "Audius" sub-tab (default) with live trending tracks, search bar, and per-track actions: play (sets MiniPlayer), Open on Audius (browser deep link), Share via Briar (mesh handoff).

## Explore FlatList fix (bug from iter 1)
- Each `<FlatList>` in Explore now has a unique `key` (audius/music/beats/videos) so React reconciler creates a fresh instance when switching sub-tabs, fixing the `numColumns` crash when going Beats ↔ Videos.
