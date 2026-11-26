import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUsername, cleanName, MAX_NAME_LENGTH } from "../hooks/useUsername";
import "./Home.css";

function Home() {
  const { username, setUsername, clearUsername } = useUsername();
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");

  const navigate = useNavigate();

  const makeCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

  const [nameError, setNameError] = useState("");

  const handleSaveName = () => {
    const name = cleanName(nameInput);
    if (!name) {
      setNameError("Username is required.");
      return;
    }
    setNameError("");
    setUsername(name);
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
        Pick short clips of real songs, then race your friends to guess them.
      </p>

      {!username ? (
        <div className="card join-box">
          <input
            className="username-input"
            placeholder="Choose a username"
            value={nameInput}
            onChange={(e) => {
              setNameInput(e.target.value);
              if (nameError) setNameError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
            maxLength={MAX_NAME_LENGTH}
            aria-invalid={nameError !== ""}
          />
          <button onClick={handleSaveName} disabled={!nameInput.trim()}>
            Continue
          </button>
          {nameError && <p className="error">{nameError}</p>}
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
                className="username-input"
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
          <li>
            The host creates a lobby and shares the code or link with friends.
          </li>
          <li>
            Everyone has 5 minutes to pick 3 songs. Search YouTube or paste a
            link, then choose the start and a clip length of 1 to 10 seconds.
          </li>
          <li>
            Once everyone has picked, or the timer ends, the clips play one at a
            time in random order.
          </li>
          <li>
            You have 30 seconds to type the song name or the artist. It doesn't
            have to be exact, and each correct guess earns a point.
          </li>
          <li>
            After each song the full title and who picked it are revealed. The
            player with the most points wins!
          </li>
        </ol>
      </section>
    </main>
  );
}

export default Home;
