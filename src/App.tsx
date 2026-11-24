import { Routes, Route } from "react-router-dom";
import Home from "./components/home/Home";
import Lobby from "./components/lobby/Lobby";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:code" element={<Lobby />} />
    </Routes>
  );
}
