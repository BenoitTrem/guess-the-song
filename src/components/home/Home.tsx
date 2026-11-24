import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUsername } from "../hooks/useUsername";
import "./Home.css";

function Home() {
  const { username, setUsername, clearUsername } = useUsername();
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");

  const navigate = useNavigate();

  const makeCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

  const handleSaveName = () => {
    if (nameInput.trim().length === 0) return;
    setUsername(nameInput);
  };

  const handleCreate = () => {
    navigate(`/lobby/${makeCode()}`, { state: { isHost: true } });
  };

  const handleJoin = () => {
    navigate(`/lobby/${code}`);
  };

  return (
    <main className="home">
      <h1>Guess The Song</h1>
      <p className="tagline">
        Pick short clips of real songs, then guess who chose what.
      </p>

      {!username ? (
        <div className="card join-box">
          <input
            placeholder="Choose a username"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
            maxLength={16}
          />
          <button onClick={handleSaveName} disabled={!nameInput.trim()}>
            Continue
          </button>
        </div>
      ) : (
        <>
          <div className="action-username">
            <p>
              Playing as <strong>{username}</strong>{" "}
              <button className="secondary link-btn" onClick={clearUsername}>
                Change
              </button>
            </p>
          </div>

          <div className="actions">
            <button onClick={handleCreate}>Create lobby</button>
            <button className="secondary" onClick={() => setJoining(!joining)}>
              Join lobby
            </button>
          </div>

          {joining && (
            <div className="card join-box">
              <input
                placeholder="Lobby code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button onClick={handleJoin} disabled={code.length === 0}>
                Join
              </button>
            </div>
          )}
        </>
      )}

      <section className="card tutorial">
        <h2>How it works</h2>
        <ol>
          <li>The host creates a lobby and shares the link with friends.</li>
          <li>
            Everyone has a few minutes to pick songs from YouTube and choose a
            short part of each, from 1 to 10 seconds.
          </li>
          <li>When the timer ends, the clips play one by one for everybody.</li>
          <li>Guess who picked each song. The best guesser wins!</li>
        </ol>
      </section>
    </main>
  );
}

export default Home;
