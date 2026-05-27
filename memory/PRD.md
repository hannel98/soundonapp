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

## Out of scope (deferred)
- Mobile AdMob integration (user opted to skip ads for now).
- Real AI beat generation (UI scaffolded; backend integration deferred).
- Audio file playback (mini-player shows now-playing + opens external link instead of playing audio in-app — Apple Music/Spotify/YouTube licensing).
- Push notifications.
