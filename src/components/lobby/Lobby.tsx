import { useState } from "react";
import {
  useParams,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { useLobby } from "../hooks/useLobby";
import { useUsername } from "../hooks/useUsername";
import CopyField from "./CopyField";
import ConfirmModal from "./ConfirmModal";
import Countdown from "./Countdown";
import PickPage from "./PickPage";
import GuessPage from "./GuessPage";
import "./Lobby.css";
import VolumeSlider from "./VolumeSlider";
import Chat from "./Chat";
import { Crown } from "lucide-react";

export default function Lobby() {
  const { code } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const isHost = state?.isHost === true;
  const { username } = useUsername();
  const [showQuitModal, setShowQuitModal] = useState(false);

  const {
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
  } = useLobby(code!, isHost, username);

  if (!username) return <Navigate to="/" replace />;

  const sorted = [...players].sort(
    (a, b) => Number(b.isHost) - Number(a.isHost),
  );
  const canStart = players.length > 1;

  const handleQuit = () => {
    if (isHost) setShowQuitModal(true);
    else navigate("/");
  };

  return (
    <section className="card lobby">
      {game.phase === "lobby" && <h2>Lobby</h2>}

      {status === "connecting" && <p>Connecting...</p>}
      {status === "error" && (
        <>
          <p className="error">{error}</p>
          <div className="center">
            <button
              className="button btn-error"
              onClick={() => (window.location.href = "/")}
            >
              Back to home
            </button>
          </div>
        </>
      )}

      {status === "connected" && (
        <>
          {(game.phase === "pick" ||
            game.phase === "guess" ||
            game.phase === "reveal") && <VolumeSlider />}
          {(game.phase === "lobby" || game.phase === "countdown") && (
            <>
              {isHost && (
                <>
                  <CopyField label="Lobby code" value={code!} />
                  <CopyField
                    label="Invite link"
                    value={`${window.location.origin}/#/lobby/${code}`}
                  />
                </>
              )}

              <h3 className="player-h">Players ({players.length})</h3>
              <ul className="players">
                {sorted.map((p) => (
                  <li key={p.id}>
                    {p.isHost && (
                      <span className="crown">
                        <Crown size={18} />
                      </span>
                    )}
                    <span className="name">{p.name}</span>
                    {p.isHost && <span className="badge">Leader</span>}
                    {isHost && !p.isHost && (
                      <button className="kick-btn" onClick={() => kick(p.id)}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {isHost ? (
                <>
                  <button
                    className="start-btn"
                    onClick={startGame}
                    disabled={!canStart || game.phase !== "lobby"}
                  >
                    Start game
                  </button>
                  {!canStart && (
                    <p className="hint">
                      You need at least 2 players to start.
                    </p>
                  )}
                </>
              ) : (
                <p className="hint">
                  Waiting for the leader to start the game...
                </p>
              )}
            </>
          )}

          {game.phase === "pick" && (
            <PickPage timeLeft={game.timeLeft} onSongsChange={submitSongs} />
          )}
          {(game.phase === "guess" ||
            game.phase === "reveal" ||
            game.phase === "results") && (
            <GuessPage
              game={game}
              players={players}
              myId={myId}
              feedback={feedback}
              onGuess={submitGuess}
              isHost={isHost}
              onReplay={replay}
              live={live}
              onTyping={sendTyping}
            />
          )}
          <Chat
            messages={messages}
            myId={myId}
            onSend={sendChat}
            paused={game.phase === "guess"}
          />
          <button className="quit-btn" onClick={handleQuit}>
            Quit lobby
          </button>

          {game.phase === "countdown" && <Countdown value={game.countdown} />}
        </>
      )}

      {showQuitModal && (
        <ConfirmModal
          title="Close the lobby?"
          message="This will remove everyone from the lobby."
          confirmLabel="Close lobby"
          onConfirm={() => navigate("/")}
          onCancel={() => setShowQuitModal(false)}
        />
      )}
    </section>
  );
}
