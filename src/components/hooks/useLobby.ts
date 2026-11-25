import { useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";

export type Player = { id: string; name: string; isHost: boolean };
export type Phase = "lobby" | "countdown" | "pick";
export type GameState = { phase: Phase; countdown: number };

type Message =
  | { type: "join"; name: string }
  | { type: "players"; players: Player[] }
  | { type: "game"; game: GameState }
  | { type: "kicked" };

const PREFIX = "guessthesong-";
const INITIAL_GAME: GameState = { phase: "lobby", countdown: 0 };

export function useLobby(code: string, isHost: boolean, username: string) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGameState] = useState<GameState>(INITIAL_GAME);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting",
  );
  const [error, setError] = useState("");

  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const startRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!username) return;

    setStatus("connecting");
    setError("");
    setGameState(INITIAL_GAME);

    const fail = (message: string) => {
      setError(message);
      setStatus("error");
    };

    let peer: Peer;
    let timer: ReturnType<typeof setInterval> | undefined;

    if (isHost) {
      peer = new Peer(PREFIX + code);
      const connections = connectionsRef.current;
      let list: Player[] = [];
      let current: GameState = INITIAL_GAME;

      const broadcast = () => {
        setPlayers(list);
        connections.forEach((c) => {
          if (c.open) c.send({ type: "players", players: list } as Message);
        });
      };

      const setGame = (next: GameState) => {
        current = next;
        setGameState(next);
        connections.forEach((c) => {
          if (c.open) c.send({ type: "game", game: next } as Message);
        });
      };

      startRef.current = () => {
        if (list.length < 2 || current.phase !== "lobby") return;

        let n = 3;
        setGame({ phase: "countdown", countdown: n });

        timer = setInterval(() => {
          n -= 1;
          if (n > 0) {
            setGame({ phase: "countdown", countdown: n });
          } else {
            clearInterval(timer);
            setGame({ phase: "pick", countdown: 0 });
          }
        }, 1000);
      };

      peer.on("open", (id) => {
        list = [{ id, name: username, isHost: true }];
        setPlayers(list);
        setStatus("connected");
      });

      peer.on("connection", (conn) => {
        connections.set(conn.peer, conn);

        conn.on("data", (data) => {
          const msg = data as Message;
          if (msg.type === "join") {
            list = [
              ...list.filter((p) => p.id !== conn.peer),
              { id: conn.peer, name: msg.name, isHost: false },
            ];
            broadcast();
            // a player who joins late gets the current game phase too
            conn.send({ type: "game", game: current } as Message);
          }
        });

        conn.on("close", () => {
          connections.delete(conn.peer);
          list = list.filter((p) => p.id !== conn.peer);
          broadcast();
        });
      });

      peer.on("error", (err) => {
        if (err.type === "unavailable-id") {
          fail("This lobby code is already in use. Go back and try again.");
        } else {
          fail("Connection problem: " + err.type);
        }
      });
    } else {
      peer = new Peer();
      let kicked = false;

      peer.on("open", () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });

        conn.on("open", () => {
          conn.send({ type: "join", name: username } as Message);
          setStatus("connected");
        });

        conn.on("data", (data) => {
          const msg = data as Message;
          if (msg.type === "players") setPlayers(msg.players);
          if (msg.type === "game") setGameState(msg.game);
          if (msg.type === "kicked") {
            kicked = true;
            fail("You were removed from the lobby by the leader.");
          }
        });

        conn.on("close", () => {
          if (!kicked) fail("The host left the lobby.");
        });
      });

      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
          fail("Lobby not found. Check the code and try again.");
        } else {
          fail("Connection problem: " + err.type);
        }
      });
    }

    return () => {
      clearInterval(timer);
      startRef.current = null;
      connectionsRef.current.clear();
      peer.destroy();
    };
  }, [code, isHost, username]);

  const kick = (playerId: string) => {
    const conn = connectionsRef.current.get(playerId);
    if (!conn) return;
    if (conn.open) conn.send({ type: "kicked" } as Message);
    setTimeout(() => conn.close(), 200);
  };

  // Needs at least 2 players
  const startGame = () => startRef.current?.();

  return { players, status, error, kick, game, startGame };
}
