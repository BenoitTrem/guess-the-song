import { useEffect, useRef, useState } from "react";
import type {
  Feedback,
  GameState,
  Live,
  Player,
  Round,
} from "../hooks/useLobby";
import { loadYouTubeApi } from "../hooks/youtube";
import "./GuessPage.css";
import { getVolume, useVolume } from "../hooks/volume";
import { Crown } from "lucide-react";

type Props = {
  game: GameState;
  players: Player[];
  myId: string;
  feedback: Feedback | null;
  onGuess: (text: string) => void;
  isHost: boolean;
  onReplay: () => void;
  live: Live | null;
  onTyping: (text: string) => void;
};

function ClipPlayer({ round, revealed }: { round: Round; revealed: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const volume = useVolume();

  const play = () => {
    player.current?.loadVideoById?.({
      videoId: round.videoId,
      startSeconds: round.start,
      endSeconds: round.start + round.length,
    });
  };

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !box.current) return;
      const target = document.createElement("div");
      box.current.innerHTML = "";
      box.current.appendChild(target);

      player.current = new window.YT.Player(target, {
        width: "100%",
        height: "100%",
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            player.current?.setVolume?.(getVolume());
            play();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      player.current?.destroy?.();
      player.current = null;
    };
  }, [round.index]);

  useEffect(() => {
    player.current?.setVolume?.(volume);
  }, [volume]);

  return (
    <div className="clip">
      <div className="clip-frame">
        <div ref={box} className="clip-video" />
        {!revealed && <div className="clip-cover">♪</div>}
      </div>
      <button className="secondary" onClick={play}>
        Replay clip
      </button>
    </div>
  );
}

function LiveGuesses({
  live,
  round,
  players,
  solved,
}: {
  live: Live | null;
  round: Round;
  players: Player[];
  solved: string[];
}) {
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const seen = useRef<Record<string, number> | null>(null);

  // ignore data left over from another round
  const data = live && live.round === round.index ? live : null;

  useEffect(() => {
    const now = data?.wrong ?? {};
    const before = seen.current;
    seen.current = { ...now };
    if (!before) return; // first look: just remember the counts, no flash

    for (const id of Object.keys(now)) {
      if (now[id] > (before[id] ?? 0)) {
        setFlash((f) => ({ ...f, [id]: true }));
        window.setTimeout(() => setFlash((f) => ({ ...f, [id]: false })), 1000);
      }
    }
  }, [data?.wrong]);

  const guessers = players.filter(
    (p) => p.id !== round.ownerId && !solved.includes(p.id),
  );
  if (guessers.length === 0) return null;

  return (
    <div className="live-guesses">
      <p className="hint">Live guesses</p>
      {guessers.map((p) => (
        <div className="live-row" key={p.id}>
          <span className="live-name">{p.name}</span>
          <input
            readOnly
            tabIndex={-1}
            aria-label={`${p.name}'s guess`}
            className={flash[p.id] ? "wrong" : ""}
            value={data?.texts[p.id] ?? ""}
            placeholder="..."
          />
        </div>
      ))}
    </div>
  );
}

function Scoreboard({
  players,
  game,
  revealing,
}: {
  players: Player[];
  game: GameState;
  revealing: boolean;
}) {
  const sorted = [...players].sort(
    (a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
  );

  return (
    <ul className="scoreboard">
      {sorted.map((p) => {
        const got = game.solved.includes(p.id);
        return (
          <li key={p.id} className={got ? "solved" : ""}>
            <span>{p.name}</span>

            <span className="score-info">
              {got && (
                <span className="points-gained">
                  {revealing ? `+${game.gained[p.id] ?? 0}` : "Found it!"}
                </span>
              )}

              <span className="total-score">
                {(game.scores[p.id] ?? 0).toLocaleString()} pts
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Results({
  game,
  players,
  isHost,
  onReplay,
}: {
  game: GameState;
  players: Player[];
  isHost: boolean;
  onReplay: () => void;
}) {
  const ranked = [...players].sort(
    (a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0),
  );
  const score = (p: Player) => game.scores[p.id] ?? 0;
  const top = ranked.length ? score(ranked[0]) : 0;
  const winners = ranked.filter((p) => score(p) === top);

  let title = "Nobody scored this time";
  if (top > 0) {
    title =
      winners.length === 1
        ? `${winners[0].name} wins!`
        : `It's a tie: ${winners.map((w) => w.name).join(", ")}`;
  }

  // players with the same score share the same rank
  const ranks: number[] = [];
  ranked.forEach((p, i) => {
    ranks.push(
      i > 0 && score(p) === score(ranked[i - 1]) ? ranks[i - 1] : i + 1,
    );
  });

  return (
    <div className="guess">
      <h2>{title}</h2>
      <ol className="leaderboard">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className={top > 0 && score(p) === top ? "winner" : ""}
          >
            <span className="rank">{ranks[i]}</span>
            <span className="name">
              {top > 0 && score(p) === top && (
                <Crown size={18} className="crown" />
              )}
              {p.name}
            </span>
            <span className="pts">{score(p).toLocaleString()} pts</span>
          </li>
        ))}
      </ol>
      {isHost ? (
        <button className="start-btn" onClick={onReplay}>
          Play again
        </button>
      ) : (
        <p className="hint">Waiting for the leader to start another game...</p>
      )}
    </div>
  );
}

export default function GuessPage({
  game,
  players,
  myId,
  feedback,
  onGuess,
  isHost,
  onReplay,
  live,
  onTyping,
}: Props) {
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(0);
  const roundIndex = game.round?.index ?? -1;

  useEffect(() => {
    setText("");
  }, [roundIndex]);

  if (game.phase === "results")
    return (
      <Results
        game={game}
        players={players}
        isHost={isHost}
        onReplay={onReplay}
      />
    );

  const round = game.round;
  if (!round) return null;

  const revealing = game.phase === "reveal";
  const isOwner = round.ownerId === myId;
  const solved = game.solved.includes(myId);
  const locked = isOwner || solved;

  const submit = () => {
    if (!text.trim() || locked) return;
    onGuess(text.trim());
    setText("");
  };

  const wrong =
    feedback !== null &&
    feedback.round === round.index &&
    !feedback.correct &&
    feedback.n > seen;

  return (
    <div className="guess">
      <div className="guess-header">
        <h2>Guess the song</h2>
        <span
          className={`timer ${!revealing && game.timeLeft <= 5 ? "urgent" : ""}`}
        >
          {game.timeLeft}s
        </span>
      </div>
      <p className="hint">
        Song {round.index + 1} of {round.total}
      </p>

      <ClipPlayer round={round} revealed={revealing} />

      {revealing && game.reveal ? (
        <div className="reveal">
          <h3>{game.reveal.title}</h3>
          <p>Picked by {game.reveal.ownerName}</p>
          <p className="hint">
            {round.index + 1 < round.total
              ? `Next song in ${game.timeLeft}s...`
              : `Final results in ${game.timeLeft}s...`}
          </p>
        </div>
      ) : (
        <>
          <div className="guess-box">
            {isOwner ? (
              <p className="hint">
                This is your song. Sit tight while the others guess!
              </p>
            ) : solved ? (
              <p className="correct">
                {feedback?.correct && feedback.round === round.index
                  ? feedback.perfect
                    ? "Perfect! "
                    : "Close enough! "
                  : "Correct! "}
                +{game.gained[myId] ?? 0} points. Waiting for the others...
              </p>
            ) : (
              <>
                <input
                  placeholder="Song name or artist"
                  value={text}
                  autoFocus
                  maxLength={100}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSeen(feedback?.n ?? 0);
                    onTyping(e.target.value);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <button onClick={submit} disabled={!text.trim()}>
                  Guess
                </button>
                {wrong && <p className="error">Not quite, try again!</p>}
              </>
            )}
          </div>

          {locked && (
            <LiveGuesses
              key={round.index}
              live={live}
              round={round}
              players={players}
              solved={game.solved}
            />
          )}
        </>
      )}

      <Scoreboard players={players} game={game} revealing={revealing} />
    </div>
  );
}
