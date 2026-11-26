import { Routes, Route } from "react-router-dom";
import Home from "./components/home/Home";
import Lobby from "./components/lobby/Lobby";
import Background from "./components/background/Background";
import Footer from "./components/footer/Footer";

export default function App() {
  return (
    <>
      <Background />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:code" element={<Lobby />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}
