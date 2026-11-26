import { useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import { calcPoints, guessQuality } from "./matchGuess";
import { cleanName, defaultName } from "./useUsername";

export type Player = { id: string; name: string; isHost: boolean };
export type Song = {
  videoId: string;
  title: string;
  start: number; // seconds
  length: number; // seconds, 1 to 10
};
export type Phase =
  | "lobby"
  | "countdown"
  | "pick"
  | "guess"
  | "reveal"
  | "results";

// The title is NOT in here, it is only sent at the reveal
export type Round = {
  index: number;
  total: number;
  videoId: string;
  start: number;
  length: number;
  ownerId: string;
};
export type Reveal = { title: string; ownerName: string };

export type GameState = {
  phase: Phase;
  countdown: number;
  timeLeft: number;
  round: Round | null;
  reveal: Reveal | null;
  solved: string[]; // player ids who found the current song
  gained: Record<string, number>; // points each player won this round
  scores: Record<string, number>; // total points
};
export type Feedback = {
  round: number;
  correct: boolean;
  points: number;
  perfect: boolean;
  n: number;
};

type GuessResult = {
  type: "guessResult";
  round: number;
  correct: boolean;
  points: number;
  perfect: boolean;
};

type Message =
  | { type: "join"; name: string }
  | { type: "players"; players: Player[] }
  | { type: "game"; game: GameState }
  | { type: "songs"; songs: Song[] }
  | { type: "guess"; text: string }
  | GuessResult
  | { type: "kicked" };

const toFeedback = (m: GuessResult): Feedback => ({
  round: m.round,
  correct: m.correct,
  points: m.points,
  perfect: m.perfect,
  n: Date.now(),
});

const PREFIX = "guessthesong-";
export const SONGS_REQUIRED = 3;
export const PICK_SECONDS = 5 * 60;
export const GUESS_SECONDS = 30;
export const REVEAL_SECONDS = 7;

const INITIAL_GAME: GameState = {
  phase: "lobby",
  countdown: 0,
  timeLeft: 0,
  round: null,
  reveal: null,
  solved: [],
  gained: {},
  scores: {},
};

type QueueItem = { ownerId: string; ownerName: string; song: Song };

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function useLobby(code: string, isHost: boolean, username: string) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGameState] = useState<GameState>(INITIAL_GAME);
  const [myId, setMyId] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting",
  );
  const [error, setError] = useState("");

  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const startRef = useRef<(() => void) | null>(null);
  const submitRef = useRef<((songs: Song[]) => void) | null>(null);
  const guessRef = useRef<((text: string) => void) | null>(null);
  const replayRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!username) return;

    setStatus("connecting");
    setError("");
    setGameState(INITIAL_GAME);
    setFeedback(null);

    const fail = (message: string) => {
      setError(message);
      setStatus("error");
    };

    let peer: Peer;
    let timer: ReturnType<typeof setInterval> | undefined;

    if (isHost) {
      peer = new Peer(PREFIX + code);
      const connections = connectionsRef.current;
      const songsByPlayer = new Map<string, Song[]>();
      let list: Player[] = [];
      let current: GameState = INITIAL_GAME;
      let hostId = "";
      let queue: QueueItem[] = [];
      let roundIndex = -1;

      const broadcast = () => {
        setPlayers(list);
        connections.forEach((c) => {
          if (c.open) c.send({ type: "players", players: list } as Message);
        });
      };

      // change part of the game state and send it to everybody
      const publish = (patch: Partial<GameState>) => {
        current = { ...current, ...patch };
        setGameState(current);
        connections.forEach((c) => {
          if (c.open) c.send({ type: "game", game: current } as Message);
        });
      };

      const reply = (playerId: string, msg: GuessResult) => {
        if (playerId === hostId) {
          setFeedback(toFeedback(msg));
          return;
        }
        const c = connections.get(playerId);
        if (c?.open) c.send(msg);
      };

      /* ---------- guessing rounds ---------- */

      const nextRound = () => {
        clearInterval(timer);
        roundIndex += 1;

        if (roundIndex >= queue.length) {
          publish({
            phase: "results",
            round: null,
            reveal: null,
            solved: [],
            gained: {},
            timeLeft: 0,
          });
          return;
        }

        const item = queue[roundIndex];
        let left = GUESS_SECONDS;
        publish({
          phase: "guess",
          timeLeft: left,
          solved: [],
          gained: {},
          reveal: null,
          round: {
            index: roundIndex,
            total: queue.length,
            videoId: item.song.videoId,
            start: item.song.start,
            length: item.song.length,
            ownerId: item.ownerId,
          },
        });

        timer = setInterval(() => {
          left -= 1;
          if (left > 0) publish({ timeLeft: left });
          else endRound();
        }, 1000);
      };

      const endRound = () => {
        clearInterval(timer);
        const item = queue[roundIndex];
        if (!item) return;

        let left = REVEAL_SECONDS;
        publish({
          phase: "reveal",
          timeLeft: left,
          reveal: { title: item.song.title, ownerName: item.ownerName },
        });

        timer = setInterval(() => {
          left -= 1;
          if (left > 0) publish({ timeLeft: left });
          else nextRound();
        }, 1000);
      };

      // everybody (except the owner) found it -> no need to wait
      const checkRoundDone = () => {
        const item = queue[roundIndex];
        if (current.phase !== "guess" || !item) return;
        const guessers = list.filter((p) => p.id !== item.ownerId);
        if (
          guessers.length > 0 &&
          guessers.every((p) => current.solved.includes(p.id))
        ) {
          endRound();
        }
      };

      const handleGuess = (playerId: string, text: string) => {
        const item = queue[roundIndex];
        if (current.phase !== "guess" || !item || playerId === item.ownerId)
          return;
        if (current.solved.includes(playerId)) return;

        // 0 = wrong, 0.6 to 1 = how close the guess was
        const quality = guessQuality(text, item.song.title);

        if (quality === 0) {
          reply(playerId, {
            type: "guessResult",
            round: roundIndex,
            correct: false,
            points: 0,
            perfect: false,
          });
          return;
        }

        const points = calcPoints(
          quality,
          current.timeLeft,
          GUESS_SECONDS,
          current.solved.length === 0,
        );

        publish({
          solved: [...current.solved, playerId],
          gained: { ...current.gained, [playerId]: points },
          scores: {
            ...current.scores,
            [playerId]: (current.scores[playerId] ?? 0) + points,
          },
        });

        reply(playerId, {
          type: "guessResult",
          round: roundIndex,
          correct: true,
          points,
          perfect: quality >= 0.95,
        });
        checkRoundDone();
      };

      const startGuessing = () => {
        clearInterval(timer);

        queue = [];
        songsByPlayer.forEach((songs, ownerId) => {
          const ownerName =
            list.find((p) => p.id === ownerId)?.name ?? "Player";
          songs.forEach((song) => queue.push({ ownerId, ownerName, song }));
        });
        shuffle(queue);

        const scores: Record<string, number> = {};
        list.forEach((p) => (scores[p.id] = 0));

        roundIndex = -1;
        publish({ scores, solved: [], gained: {}, round: null, reveal: null });
        nextRound();
      };

      /* ---------- pick phase ---------- */

      // Everyone picked their songs -> no need to wait for the timer
      const checkAllDone = () => {
        if (current.phase !== "pick" || list.length === 0) return;
        const allDone = list.every(
          (p) => (songsByPlayer.get(p.id)?.length ?? 0) >= SONGS_REQUIRED,
        );
        if (allDone) startGuessing();
      };

      const startPick = () => {
        let left = PICK_SECONDS;
        publish({ phase: "pick", countdown: 0, timeLeft: left });

        timer = setInterval(() => {
          left -= 1;
          if (left > 0) publish({ timeLeft: left });
          else startGuessing();
        }, 1000);
      };

      startRef.current = () => {
        if (list.length < 2 || current.phase !== "lobby") return;

        let n = 3;
        publish({ phase: "countdown", countdown: n });

        timer = setInterval(() => {
          n -= 1;
          if (n > 0) {
            publish({ countdown: n });
          } else {
            clearInterval(timer);
            startPick();
          }
        }, 1000);
      };

      // the host picks songs and guesses too
      submitRef.current = (songs) => {
        songsByPlayer.set(hostId, songs);
        checkAllDone();
      };
      guessRef.current = (text) => handleGuess(hostId, text);

      replayRef.current = () => {
        if (current.phase !== "results") return;
        clearInterval(timer);
        songsByPlayer.clear();
        queue = [];
        roundIndex = -1;
        setFeedback(null);
        publish({ ...INITIAL_GAME });
      };

      peer.on("open", (id) => {
        hostId = id;
        setMyId(id);
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
              {
                id: conn.peer,
                name: cleanName(msg.name) || defaultName(),
                isHost: false,
              },
            ];
            broadcast();
            conn.send({ type: "game", game: current } as Message);
          }
          if (msg.type === "songs") {
            songsByPlayer.set(conn.peer, msg.songs.slice(0, SONGS_REQUIRED));
            checkAllDone();
          }
          if (msg.type === "guess") {
            handleGuess(conn.peer, String(msg.text).slice(0, 100));
          }
        });

        conn.on("close", () => {
          connections.delete(conn.peer);
          songsByPlayer.delete(conn.peer);
          list = list.filter((p) => p.id !== conn.peer);
          broadcast();
          checkAllDone();
          checkRoundDone();
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

      peer.on("open", (id) => {
        setMyId(id);
        const conn = peer.connect(PREFIX + code, { reliable: true });

        conn.on("open", () => {
          conn.send({ type: "join", name: username } as Message);
          submitRef.current = (songs) => {
            if (conn.open) conn.send({ type: "songs", songs } as Message);
          };
          guessRef.current = (text) => {
            if (conn.open) conn.send({ type: "guess", text } as Message);
          };
          setStatus("connected");
        });

        conn.on("data", (data) => {
          const msg = data as Message;
          if (msg.type === "players") setPlayers(msg.players);
          if (msg.type === "game") {
            setGameState(msg.game);
            if (msg.game.phase === "lobby" || msg.game.phase === "pick") {
              setFeedback(null);
            }
          }
          if (msg.type === "guessResult") setFeedback(toFeedback(msg));
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
      submitRef.current = null;
      guessRef.current = null;
      replayRef.current = null;
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

  // Call this every time the player confirms a song (sends the full list)
  const submitSongs = (songs: Song[]) => submitRef.current?.(songs);

  const submitGuess = (text: string) => guessRef.current?.(text);

  const replay = () => replayRef.current?.();

  return {
    players,
    status,
    error,
    kick,
    game,
    startGame,
    submitSongs,
    submitGuess,
    feedback,
    myId,
    replay,
  };
}
