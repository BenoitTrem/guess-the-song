import { useState } from "react";

export function useLobby(code: string, isHost: boolean) {
  const [players, setPlayers] = useState<string[]>([]);

  const addPlayer = (name: string) => setPlayers((p) => [...p, name]);

  return { players, addPlayer };
}
