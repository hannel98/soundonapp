import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  AudioPlayer,
} from "expo-audio";

export type NowPlaying = {
  id: string;
  title: string;
  artist: string;
  cover_url: string;
  external_url?: string | null;
  stream_url?: string | null;
} | null;

type PlayerCtx = {
  current: NowPlaying;
  isPlaying: boolean;
  position: number; // seconds
  duration: number; // seconds (0 if unknown)
  isLoading: boolean;
  play: (t: NonNullable<NowPlaying>) => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
};

const Ctx = createContext<PlayerCtx | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<NowPlaying>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enable background audio session once
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers" as any,
    }).catch(() => {});
  }, []);

  const tearDown = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {}
      try {
        // .remove() releases the native resource
        (playerRef.current as any).remove?.();
      } catch {}
      playerRef.current = null;
    }
  };

  useEffect(() => {
    return () => tearDown();
  }, []);

  const startTicker = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = (p as any).currentTime ?? 0;
        const dur = (p as any).duration ?? 0;
        if (typeof cur === "number") setPosition(cur);
        if (typeof dur === "number" && !Number.isNaN(dur)) setDuration(dur);
        const playing = (p as any).playing ?? false;
        setIsPlaying(Boolean(playing));
      } catch {}
    }, 500);
  };

  const play: PlayerCtx["play"] = async (t) => {
    // Web fallback: no real native audio module, just track state.
    if (Platform.OS === "web") {
      tearDown();
      setCurrent(t);
      setIsPlaying(true);
      setPosition(0);
      setDuration(0);
      return;
    }
    const src = t.stream_url || t.external_url || null;
    setIsLoading(true);
    try {
      // Same track tapped again: just toggle/restart
      tearDown();
      setCurrent(t);
      setPosition(0);
      setDuration(0);
      if (!src) {
        setIsPlaying(false);
        return;
      }
      const p = createAudioPlayer({ uri: src });
      playerRef.current = p;
      try {
        p.play();
      } catch {}
      setIsPlaying(true);
      startTicker();
    } finally {
      setIsLoading(false);
    }
  };

  const toggle: PlayerCtx["toggle"] = async () => {
    const p = playerRef.current;
    if (Platform.OS === "web" || !p) {
      setIsPlaying((v) => !v);
      return;
    }
    try {
      if ((p as any).playing) {
        p.pause();
        setIsPlaying(false);
      } else {
        p.play();
        setIsPlaying(true);
      }
    } catch {}
  };

  const stop: PlayerCtx["stop"] = async () => {
    tearDown();
    setCurrent(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
  };

  const seek: PlayerCtx["seek"] = async (seconds) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      // expo-audio AudioPlayer exposes seekTo() that returns a Promise
      await (p as any).seekTo?.(seconds);
      setPosition(seconds);
    } catch {}
  };

  const value = useMemo<PlayerCtx>(
    () => ({ current, isPlaying, position, duration, isLoading, play, toggle, stop, seek }),
    [current, isPlaying, position, duration, isLoading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
