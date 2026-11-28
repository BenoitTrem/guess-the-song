// src/components/hooks/volume.ts
// One shared volume (0 to 100) for every video player, saved in the browser.
import { useSyncExternalStore } from "react";

const KEY = "volume";
const DEFAULT_VOLUME = 70;

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function read(): number {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === null) return DEFAULT_VOLUME;
    const n = Number(saved);
    return Number.isFinite(n) ? clamp(n) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

let volume = read();
let lastLoud = volume > 0 ? volume : DEFAULT_VOLUME; // what "unmute" goes back to
const listeners = new Set<() => void>();

export function getVolume(): number {
  return volume;
}

export function setVolume(next: number) {
  volume = clamp(next);
  if (volume > 0) lastLoud = volume;
  try {
    localStorage.setItem(KEY, String(volume));
  } catch {}
  listeners.forEach((listener) => listener());
}

export function toggleMute() {
  setVolume(volume === 0 ? lastLoud : 0);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useVolume(): number {
  return useSyncExternalStore(subscribe, getVolume);
}
