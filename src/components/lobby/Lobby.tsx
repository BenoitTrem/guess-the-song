import { useParams, useLocation } from "react-router-dom";
import { useLobby } from "../hooks/useLobby";
import { Navigate } from "react-router-dom";
import { useUsername } from "../hooks/useUsername";
import "./Lobby.css";

export default function Lobby() {
  const { code } = useParams();
  const { state } = useLocation();
  const isHost = state?.isHost === true;

  const { username } = useUsername();
  if (!username) return <Navigate to="/" replace />;

  const { players, addPlayer } = useLobby(code!, isHost);

  return (
    <section className="card lobby">
      <h2>Lobby {code}</h2>
      <p>{isHost ? "You are the host." : "You joined this lobby."}</p>
      <ul>
        {players.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button onClick={() => addPlayer("Test")}>Add player</button>
    </section>
  );
}
