import React, { createContext, useContext, useState } from "react";

export type NowPlaying = {
  id: string;
  title: string;
  artist: string;
  cover_url: string;
  external_url?: string | null;
} | null;

type PlayerCtx = {
  current: NowPlaying;
  isPlaying: boolean;
  play: (t: NonNullable<NowPlaying>) => void;
  toggle: () => void;
  stop: () => void;
};

const Ctx = createContext<PlayerCtx | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<NowPlaying>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = (t: NonNullable<NowPlaying>) => {
    setCurrent(t);
    setIsPlaying(true);
  };
  const toggle = () => setIsPlaying((p) => !p);
  const stop = () => {
    setIsPlaying(false);
    setCurrent(null);
  };

  return (
    <Ctx.Provider value={{ current, isPlaying, play, toggle, stop }}>{children}</Ctx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
