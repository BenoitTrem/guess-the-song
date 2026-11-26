import "./Background.css";

// colors are "r,g,b"; a = how far the beam swings (deg); t = sweep time; d = start offset
const BEAMS = [
  { x: "12%", c: "59,130,246", a: "26deg", t: "9s", d: "-1s" },
  { x: "32%", c: "125,180,255", a: "20deg", t: "12s", d: "-6s" },
  { x: "52%", c: "139,92,246", a: "30deg", t: "10s", d: "-3s" },
  { x: "72%", c: "59,130,246", a: "22deg", t: "13s", d: "-9s" },
  { x: "90%", c: "236,72,153", a: "24deg", t: "11s", d: "-5s" },
];

// glitter: random positions, picked once when the page loads
const SPARKLES = Array.from({ length: 36 }, () => ({
  x: `${Math.random() * 100}%`,
  y: `${Math.random() * 100}%`,
  size: `${2 + Math.random() * 3}px`,
  t: `${2 + Math.random() * 4}s`,
  d: `${-Math.random() * 6}s`,
}));

type Vars = React.CSSProperties;

export default function Background() {
  return (
    <div className="bg" aria-hidden="true">
      {BEAMS.map((b, i) => (
        <div
          key={i}
          className="beam"
          style={
            {
              "--x": b.x,
              "--c": b.c,
              "--a": b.a,
              "--t": b.t,
              "--d": b.d,
            } as Vars
          }
        />
      ))}

      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="sparkle"
          style={
            {
              "--x": s.x,
              "--y": s.y,
              "--size": s.size,
              "--t": s.t,
              "--d": s.d,
            } as Vars
          }
        />
      ))}
    </div>
  );
}
