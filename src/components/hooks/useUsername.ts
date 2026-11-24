import { useState } from "react";

const KEY = "username";

export function useUsername() {
  const [username, setUsernameState] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setUsername = (name: string) => {
    const clean = name.trim();
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
