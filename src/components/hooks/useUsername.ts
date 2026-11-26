import { useState } from "react";

const KEY = "username";
export const MAX_NAME_LENGTH = 25;

export function defaultName(): string {
  return `Player ${Math.floor(1000 + Math.random() * 9000)}`;
}

export function cleanName(name: unknown): string {
  const text = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, MAX_NAME_LENGTH).join("");
}

export function useUsername() {
  const [username, setUsernameState] = useState<string>(() => {
    try {
      return cleanName(localStorage.getItem(KEY));
    } catch {
      return "";
    }
  });

  const setUsername = (name: string) => {
    const clean = cleanName(name) || defaultName();
    setUsernameState(clean);
    try {
      localStorage.setItem(KEY, clean);
    } catch {}
  };

  const clearUsername = () => {
    setUsernameState("");
    try {
      localStorage.removeItem(KEY);
    } catch {}
  };

  return { username, setUsername, clearUsername };
}
