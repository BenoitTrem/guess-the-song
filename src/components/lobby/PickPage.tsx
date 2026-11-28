import { useEffect, useRef, useState } from "react";
import { SONGS_REQUIRED, type Song } from "../hooks/useLobby";
import {
  fetchTitle,
  loadYouTubeApi,
  parseVideoId,
  searchVideos,
  type VideoResult,
} from "../hooks/youtube";
import { getVolume, useVolume } from "../hooks/volume";
import "./Lobby.css";
import "./PickPage.css";

type Props = {
  timeLeft: number;
  onSongsChange: (songs: Song[]) => void;
};

type Selected = { id: string; title: string };

const formatTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function PickPage({ timeLeft, onSongsChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VideoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState<Selected | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(5);

  const [songs, setSongs] = useState<Song[]>([]);

  const playerBox = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const stopTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [playerError, setPlayerError] = useState("");
  const durationTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  const done = songs.length >= SONGS_REQUIRED;

  const volume = useVolume();

  const handleSearch = async () => {
    const text = query.trim();
    if (!text) return;
    setSearchError("");
    setResults([]);

    // A pasted link goes straight to the preview
    const id = parseVideoId(text);
    if (id) {
      setSearching(true);
      const title = await fetchTitle(id);
      setSearching(false);
      choose({ id, title });
      return;
    }

    try {
      setSearching(true);
      const found = await searchVideos(text);
      setResults(found);
      if (found.length === 0)
        setSearchError("No videos found. Try other words.");
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const choose = (video: Selected) => {
    setSelected(video);
    setStart(0);
    setDuration(0);
    setPlayerError("");
    setResults([]);
  };

  // Create the YouTube player each time a video is selected
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !playerBox.current) return;
      const target = document.createElement("div");
      playerBox.current.innerHTML = "";
      playerBox.current.appendChild(target);

      playerRef.current = new window.YT.Player(target, {
        videoId: selected.id,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(getVolume());

            const readDuration = () => {
              const d = Math.floor(e.target.getDuration?.() ?? 0);
              if (d > 0) setDuration(d);
              return d > 0;
            };
            if (readDuration()) return;

            // YouTube often reports 0 at first, so keep asking
            let tries = 0;
            let nudged = false;
            durationTimer.current = setInterval(() => {
              tries += 1;

              if (readDuration()) {
                clearInterval(durationTimer.current);
                if (nudged) {
                  e.target.pauseVideo();
                  e.target.seekTo(0, true);
                  e.target.unMute();
                }
                return;
              }

              // after 2 seconds with no answer: a silent play makes it load the info
              if (tries === 8 && !nudged) {
                nudged = true;
                e.target.mute();
                e.target.playVideo();
              }

              if (tries > 40) {
                clearInterval(durationTimer.current);
                setPlayerError("Couldn't load this video. Try another one.");
              }
            }, 250);
          },
          onError: () =>
            setPlayerError("This video can't be played here. Try another one."),
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(durationTimer.current);
      clearTimeout(stopTimeout.current);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [selected]);

  useEffect(() => {
    playerRef.current?.setVolume?.(volume);
  }, [volume]);

  const preview = () => {
    const player = playerRef.current;
    if (!player?.seekTo) return;
    clearTimeout(stopTimeout.current);
    player.seekTo(start, true);
    player.playVideo();
    stopTimeout.current = setTimeout(() => player.pauseVideo(), length * 1000);
  };

  const confirm = () => {
    if (!selected || done) return;
    const next = [
      ...songs,
      { videoId: selected.id, title: selected.title, start, length },
    ];
    setSongs(next);
    onSongsChange(next);
    setSelected(null);
    setQuery("");
  };

  const maxStart = Math.max(0, duration - length);

  return (
    <div className="pick">
      <div className="pick-header">
        <h2>Choose your songs</h2>
        <span className={`timer ${timeLeft <= 30 ? "urgent" : ""}`}>
          {formatTime(timeLeft)}
        </span>
      </div>

      <p>
        Song {Math.min(songs.length + 1, SONGS_REQUIRED)} of {SONGS_REQUIRED}
        {done && " (all picked)"}
      </p>

      {done ? (
        <p className="hint">
          Your {SONGS_REQUIRED} songs are locked in. Waiting for the other
          players or for the timer to end...
        </p>
      ) : (
        <>
          <div className="search-row">
            <input
              className="pick-input"
              placeholder="Search a song or paste a YouTube link"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <div className="center">
              <button
                onClick={handleSearch}
                disabled={!query.trim() || searching}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {searchError && <p className="error">{searchError}</p>}

          {results.length > 0 && (
            <ul className="results">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    className="secondary result-btn"
                    onClick={() => choose({ id: r.id, title: r.title })}
                  >
                    <img src={r.thumb} alt="" width={96} height={54} />
                    <span>
                      <strong>{r.title}</strong>
                      <br />
                      <small>{r.channel}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="clip-editor">
              <p className="clip-title">{selected.title}</p>
              <div className="player" ref={playerBox} />

              <label>
                Start at {formatTime(start)}
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={maxStart}
                  value={Math.min(start, maxStart)}
                  disabled={duration === 0}
                  onChange={(e) => setStart(Number(e.target.value))}
                />
              </label>

              <label>
                Clip length: {length}s
                <input
                  className="slider"
                  type="range"
                  min={1}
                  max={10}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                />
              </label>

              <div className="actions">
                <button
                  className="secondary"
                  onClick={preview}
                  disabled={duration === 0}
                >
                  Preview clip
                </button>
                <button onClick={confirm} disabled={duration === 0}>
                  Confirm song
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {songs.length > 0 && (
        <ol className="picked">
          {songs.map((s, i) => (
            <li key={i}>
              {s.title}{" "}
              <small>
                ({formatTime(s.start)}, {s.length}s)
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
