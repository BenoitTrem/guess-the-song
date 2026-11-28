import { Volume1, Volume2, VolumeX } from "lucide-react";
import { setVolume, toggleMute, useVolume } from "../hooks/volume";
import "./VolumeSlider.css";

export default function VolumeSlider() {
  const volume = useVolume();
  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className="volume">
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
      />
      <button
        type="button"
        className="icon-btn secondary"
        onClick={toggleMute}
        aria-label={volume === 0 ? "Unmute" : "Mute"}
      >
        <Icon size={18} />
      </button>
      <span className="volume-value">{volume}%</span>
    </div>
  );
}
