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

export type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  time: number;
};

export type Live = {
  round: number;
  texts: Record<string, string>;
  wrong: Record<string, number>;
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
  | { type: "say"; text: string } // player -> host
  | { type: "chat"; message: ChatMessage } // host -> everybody
  | { type: "chatHistory"; messages: ChatMessage[] } // host -> a new player
  | { type: "typing"; text: string } // player -> host
  | { type: "live"; live: Live } // host -> owner and players who found it
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
export const GUESS_SECONDS = 45;
export const REVEAL_SECONDS = 7;
export const MAX_CHAT_LENGTH = 200;
const CHAT_HISTORY = 100; // messages kept
const CHAT_BURST = 5; // max messages...
const CHAT_WINDOW_MS = 5000; // ...per 5 seconds, per player
const WRONG_FLASH_MS = 1200;

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting",
  );
  const [live, setLive] = useState<Live | null>(null);
  const typingRef = useRef<((text: string) => void) | null>(null);
  const [error, setError] = useState("");

  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const startRef = useRef<(() => void) | null>(null);
  const submitRef = useRef<((songs: Song[]) => void) | null>(null);
  const guessRef = useRef<((text: string) => void) | null>(null);
  const replayRef = useRef<(() => void) | null>(null);
  const chatRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    if (!username) return;

    setStatus("connecting");
    setError("");
    setGameState(INITIAL_GAME);
    setFeedback(null);
    setMessages([]);
    setLive(null);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
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
      let liveData: Live = { round: -1, texts: {}, wrong: {} };

      let chatLog: ChatMessage[] = [];
      let chatCounter = 0;
      const chatTimes = new Map<string, number[]>();

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

      /* ---------- chat ---------- */

      // The host decides the sender's name from the player list, so nobody can
      // write as somebody else. No chat while a song plays, so nobody can
      // type the answer.
      const addChat = (playerId: string, raw: string) => {
        if (current.phase === "guess") return;

        const player = list.find((p) => p.id === playerId);
        if (!player) return;

        const text = String(raw)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_CHAT_LENGTH);
        if (!text) return;

        // slow down spam
        const now = Date.now();
        const recent = (chatTimes.get(playerId) ?? []).filter(
          (t) => now - t < CHAT_WINDOW_MS,
        );
        if (recent.length >= CHAT_BURST) return;
        chatTimes.set(playerId, [...recent, now]);

        const message: ChatMessage = {
          id: `${now}-${chatCounter++}`,
          playerId,
          name: player.name,
          text,
          time: now,
        };
        chatLog = [...chatLog, message].slice(-CHAT_HISTORY);
        setMessages(chatLog);
        connections.forEach((c) => {
          if (c.open) c.send({ type: "chat", message } as Message);
        });
      };

      /* ---------- live typing ---------- */

      // Only the song owner and players who already found it get this.
      // Players still guessing never receive it, so nobody can copy an answer.
      const isSpectator = (playerId: string) => {
        const item = queue[roundIndex];
        return (
          !!item &&
          (item.ownerId === playerId || current.solved.includes(playerId))
        );
      };

      const sendLive = () => {
        setLive(liveData);
        connections.forEach((c, id) => {
          if (c.open && isSpectator(id)) {
            c.send({ type: "live", live: liveData } as Message);
          }
        });
      };

      const resetLive = () => {
        liveData = { round: roundIndex, texts: {}, wrong: {} };
        sendLive();
      };

      const handleTyping = (playerId: string, raw: string) => {
        const item = queue[roundIndex];
        if (current.phase !== "guess" || !item || playerId === item.ownerId)
          return;
        if (current.solved.includes(playerId)) return;

        liveData = {
          ...liveData,
          texts: { ...liveData.texts, [playerId]: raw.slice(0, 100) },
        };
        sendLive();
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
        resetLive();
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

          // the people watching see this guess flash red, then it clears
          liveData = {
            ...liveData,
            texts: { ...liveData.texts, [playerId]: text },
            wrong: {
              ...liveData.wrong,
              [playerId]: (liveData.wrong[playerId] ?? 0) + 1,
            },
          };
          sendLive();

          const wrongRound = roundIndex;
          timeouts.push(
            setTimeout(() => {
              if (wrongRound !== roundIndex) return;
              if (liveData.texts[playerId] !== text) return; // typed again
              liveData = {
                ...liveData,
                texts: { ...liveData.texts, [playerId]: "" },
              };
              sendLive();
            }, WRONG_FLASH_MS),
          );
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

        liveData = {
          ...liveData,
          texts: { ...liveData.texts, [playerId]: "" },
        };
        sendLive();

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

        // random player order (decided once), and each player's songs in random order
        const lanes = shuffle(
          [...songsByPlayer.entries()].map(([ownerId, songs]) => ({
            ownerId,
            ownerName: list.find((p) => p.id === ownerId)?.name ?? "Player",
            songs: shuffle([...songs]),
          })),
        );

        // one song from each player in turn, then start again, until all are used
        queue = [];
        const most = Math.max(0, ...lanes.map((lane) => lane.songs.length));
        for (let i = 0; i < most; i++) {
          for (const lane of lanes) {
            const song = lane.songs[i];
            if (song) {
              queue.push({
                ownerId: lane.ownerId,
                ownerName: lane.ownerName,
                song,
              });
            }
          }
        }

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

      // the host picks songs, guesses and chats too
      submitRef.current = (songs) => {
        songsByPlayer.set(hostId, songs);
        checkAllDone();
      };
      guessRef.current = (text) => handleGuess(hostId, text);
      chatRef.current = (text) => addChat(hostId, text);
      typingRef.current = (text) => handleTyping(hostId, text);
      replayRef.current = () => {
        if (current.phase !== "results") return;
        clearInterval(timer);
        songsByPlayer.clear();
        queue = [];
        roundIndex = -1;
        setFeedback(null);
        publish({ ...INITIAL_GAME });
        liveData = { round: -1, texts: {}, wrong: {} };
        setLive(null);
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
            // a player who joins late gets the chat so far
            conn.send({ type: "chatHistory", messages: chatLog } as Message);
          }
          if (msg.type === "songs") {
            songsByPlayer.set(conn.peer, msg.songs.slice(0, SONGS_REQUIRED));
            checkAllDone();
          }
          if (msg.type === "guess") {
            handleGuess(conn.peer, String(msg.text).slice(0, 100));
          }
          if (msg.type === "say") {
            addChat(conn.peer, msg.text);
          }
          if (msg.type === "typing") {
            handleTyping(conn.peer, String(msg.text));
          }
        });

        conn.on("close", () => {
          connections.delete(conn.peer);
          songsByPlayer.delete(conn.peer);
          chatTimes.delete(conn.peer);
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
          typingRef.current = (text) => {
            if (conn.open) conn.send({ type: "typing", text } as Message);
          };
          guessRef.current = (text) => {
            if (conn.open) conn.send({ type: "guess", text } as Message);
          };
          chatRef.current = (text) => {
            if (conn.open) conn.send({ type: "say", text } as Message);
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
              setLive(null);
            }
          }
          if (msg.type === "live") setLive(msg.live);
          if (msg.type === "guessResult") setFeedback(toFeedback(msg));
          if (msg.type === "chat") {
            setMessages((prev) => [...prev, msg.message].slice(-CHAT_HISTORY));
          }
          if (msg.type === "chatHistory") setMessages(msg.messages);
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
      chatRef.current = null;
      timeouts.forEach(clearTimeout);
      typingRef.current = null;
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

  const sendChat = (text: string) => chatRef.current?.(text);

  const sendTyping = (text: string) => typingRef.current?.(text);

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
    messages,
    sendChat,
    live,
    sendTyping,
  };
}
