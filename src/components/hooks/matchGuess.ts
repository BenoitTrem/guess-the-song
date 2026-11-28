// src/components/hooks/matchGuess.ts
// Scores a typed guess against a YouTube title.
// guessQuality() returns 0 (wrong) or a number from 0.6 (barely accepted)
// to 1 (perfect). calcPoints() turns that and the time left into points.

/* ---------- words that never count ---------- */

// filler words: they are ignored in the title, and a guess made only of them is wrong
const STOP_WORDS = new Set([
  // english
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "at",
  "for",
  "by",
  "with",
  "from",
  "as",
  "be",
  "is",
  "are",
  "was",
  "am",
  "do",
  "it",
  "its",
  "i",
  "me",
  "my",
  "you",
  "your",
  "we",
  "us",
  "our",
  "he",
  "him",
  "his",
  "she",
  "her",
  "they",
  "them",
  "this",
  "that",
  // french / spanish / italian / german / portuguese
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "du",
  "de",
  "del",
  "el",
  "los",
  "las",
  "lo",
  "y",
  "et",
  "en",
  "il",
  "i",
  "gli",
  "di",
  "der",
  "die",
  "das",
  "und",
  "ein",
  "eine",
  "o",
  "os",
]);

// multi-word junk, checked first
const NOISE_PHRASES = [
  "radio edit",
  "radio version",
  "single version",
  "album version",
  "original version",
  "original mix",
  "extended mix",
  "extended version",
  "club mix",
  "studio version",
  "live version",
  "full album",
  "full song",
  "full version",
  "full lyrics",
  "full video",
  "re ?recorded",
  "slowed down",
  "sped up",
  "bass boosted",
];

// single junk words found in video titles (official, remake, remix, live, lyrics...)
const NOISE_WORDS = [
  "official",
  "officiel",
  "oficial",
  "ufficiale",
  "offiziell",
  "video",
  "videoclip",
  "videoclipe",
  "clip",
  "clipe",
  "music",
  "musik",
  "musique",
  "musica",
  "audio",
  "lyrics",
  "lyric",
  "lyrical",
  "letra",
  "letras",
  "paroles",
  "testo",
  "visualizer",
  "visualiser",
  "hd",
  "hq",
  "uhd",
  "4k",
  "8k",
  "8d",
  "remaster",
  "remastered",
  "remastering",
  "remake",
  "remade",
  "remix",
  "remixed",
  "rmx",
  "cover",
  "covered",
  "live",
  "acoustic",
  "unplugged",
  "instrumental",
  "karaoke",
  "version",
  "ver",
  "edit",
  "edited",
  "mix",
  "extended",
  "demo",
  "session",
  "sessions",
  "performance",
  "performed",
  "reaction",
  "explicit",
  "uncensored",
  "censored",
  "album",
  "single",
  "ost",
  "stereo",
  "mono",
  "bonus",
  "premiere",
  "exclusive",
  "teaser",
  "trailer",
  "topic",
  "vevo",
  "nightcore",
  "slowed",
  "reverb",
  "sped",
];

const NOISE_RE = new RegExp(
  `\\b(?:${[...NOISE_PHRASES, ...NOISE_WORDS].join("|")})\\b|\\b\\d{3,4}p\\b|\\b\\d{2,3}fps\\b`,
  "g",
);

/* ---------- special characters ---------- */

// letters that do not break into "letter + accent", plus stylized look-alikes
// (reversed E, Greek lambda as A, small caps, Cyrillic copies of Latin letters...)
const LOOKALIKES: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
  ħ: "h",
  ŧ: "t",
  ĸ: "k",
  ŋ: "n",
  ĳ: "ij",
  // reversed / odd E, A, R, N
  ǝ: "e",
  ə: "e",
  ɘ: "e",
  ɛ: "e",
  ɜ: "e",
  "∃": "e",
  σ: "e",
  ς: "e",
  "€": "e",
  λ: "a",
  δ: "a",
  ʌ: "a",
  "∀": "a",
  я: "r",
  и: "n",
  $: "s",
  "¢": "c",
  // small caps
  ᴀ: "a",
  ʙ: "b",
  ᴄ: "c",
  ᴅ: "d",
  ᴇ: "e",
  ꜰ: "f",
  ɢ: "g",
  ʜ: "h",
  ɪ: "i",
  ᴊ: "j",
  ᴋ: "k",
  ʟ: "l",
  ᴍ: "m",
  ɴ: "n",
  ᴏ: "o",
  ᴘ: "p",
  ʀ: "r",
  ꜱ: "s",
  ᴛ: "t",
  ᴜ: "u",
  ᴠ: "v",
  ᴡ: "w",
  ʏ: "y",
  ᴢ: "z",
  // cyrillic letters that look like latin ones
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  і: "i",
  ѕ: "s",
  ј: "j",
  ԁ: "d",
  ɡ: "g",
  ԛ: "q",
  ԝ: "w",
};

const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

// Always lowercase, no accents, no punctuation, no "official video" junk.
// Both the guess and the title go through this, so they end up comparable.
function clean(text: string, stripNoise = true): string {
  let t = text
    .replace(/[™®©℗]/g, " ")
    .normalize("NFKC") // fullwidth and bold/italic unicode letters become normal ones
    .replace(INVISIBLE, "")
    .toLowerCase();

  t = Array.from(t, (ch) => LOOKALIKES[ch] ?? ch).join("");

  t = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // é -> e, ü -> u, ö -> o...
    .replace(/['’‘`´ʼ]/g, "") // don't -> dont
    .replace(/#\S+/g, " ") // hashtags
    .replace(/[&+]/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripNoise) t = t.replace(NOISE_RE, " ").replace(/\s+/g, " ").trim();
  return t;
}

/* ---------- matching ---------- */

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// "Artist - Song", "Artist – Song", "Artist | Song", "Artist: Song", Artist "Song"
// A hyphen needs a space on at least one side, so "Jay-Z" stays in one piece.
const SEPARATORS = /\s*[–—―|•·~～〜∼]\s*|\s+[-‐‑‒−]+\s*|\s*[-‐‑‒−]+\s+|:\s+/;

// "(Official Video)" is dropped, but "(Don't Fear) The Reaper" is part of the name
function unwrapBrackets(title: string): string {
  return title.replace(/[([{【〔](.*?)[)\]}】〕]/g, (_m, inner: string) => {
    const junkOnly = clean(inner, true) === "";
    const credit = /^\s*(feat|ft|featuring|prod|with)\b/i.test(inner);
    return junkOnly || credit ? " " : ` ${inner} `;
  });
}

// Everything we accept as a right answer for this title
function targetsFrom(title: string, stripNoise: boolean): string[] {
  const targets: string[] = [];

  const collect = (text: string) => {
    const stripped = text
      .replace(/\b(?:feat|ft|featuring|prod)\b\.?.*$/i, " ") // featured artists, producers
      .replace(/["“”„«»「」『』《》]/g, " | "); // Artist "Song" or Artist「Song」

    const parts = stripped.split(SEPARATORS).filter((p) => p.trim());
    targets.push(...parts);

    // "Artist A & Artist B" or "A, B" or "A x B": each artist counts on its own
    if (parts.length > 1) {
      const artists = parts[0].split(/\s*(?:,|&|\sx\s)\s*/i);
      if (artists.length > 1) targets.push(...artists);
    }

    targets.push(stripped); // the whole title too
  };

  // once with every bracket removed, once with the useful brackets kept
  collect(title.replace(/[([{【〔].*?[)\]}】〕]/g, " "));
  collect(unwrapBrackets(title));

  return [
    ...new Set(
      targets.map((t) => clean(t, stripNoise)).filter((t) => t.length > 0),
    ),
  ];
}

// 0 = this word was not found, otherwise 0.8 to 1 (1 = typed exactly)
function tokenScore(guessTokens: string[], target: string): number {
  let best = 0;
  for (const g of guessTokens) {
    if (g === target) return 1;
    if (g.length >= 4 && target.length >= 4) {
      const s = similarity(g, target);
      if (s >= 0.8) best = Math.max(best, s);
    }
  }
  return best;
}

// 0 = no match, otherwise 0.6 to 1
function targetQuality(guess: string, target: string): number {
  const guessTokens = guess.split(" ");
  const all = target.split(" ");
  const significant = all.filter((w) => !STOP_WORDS.has(w));
  const needed = significant.length > 0 ? significant : all;

  // a guess made only of filler words ("the", "of you") never counts
  if (significant.length > 0 && guessTokens.every((w) => STOP_WORDS.has(w))) {
    return 0;
  }

  let best = 0;

  // the whole thing, tolerating typos ("blinding lihgts")
  const whole = similarity(guess, target);
  if (whole >= 0.8) best = whole;

  // word by word, so partial titles count ("dont stop" for "Don't Stop Believin'")
  // the length check stops people from typing a paragraph and hoping a word hits
  if (guessTokens.length <= needed.length * 2 + 2) {
    const scores = needed.map((t) => tokenScore(guessTokens, t));
    const hits = scores.filter((s) => s > 0).length;
    const required = needed.length === 1 ? 1 : Math.ceil(needed.length * 0.6);
    if (hits >= required) {
      // missing words count as 0, so a half-typed title scores lower
      best = Math.max(best, scores.reduce((a, b) => a + b, 0) / needed.length);
    }
  }

  return best;
}

export function guessQuality(guess: string, title: string): number {
  // junk words are removed from both sides, so typing "official" or "remake" is worth nothing
  let stripNoise = true;
  let targets = targetsFrom(title, true);

  // a title that is only junk words (a song really called "Music"): keep them
  if (targets.length === 0) {
    stripNoise = false;
    targets = targetsFrom(title, false);
  }

  const g = clean(guess, stripNoise);
  if (g.length < 2) return 0;
  return Math.max(0, ...targets.map((t) => targetQuality(g, t)));
}

export function isCorrectGuess(guess: string, title: string): boolean {
  return guessQuality(guess, title) > 0;
}

/* ---------- points ---------- */

export const POINTS = {
  base: 400, // for any correct guess
  speed: 500, // extra, scaled by how much time is left
  firstBonus: 100, // for the first player to find it
};
// best possible: (400 + 500) x 1.0 + 100 = 1000
// worst possible: 400 x 0.6 = 240

export function calcPoints(
  quality: number,
  timeLeft: number,
  totalTime: number,
  isFirst: boolean,
): number {
  const speed = Math.max(0, Math.min(1, timeLeft / totalTime));

  // 0.6 quality (barely accepted) -> 60% of the points, 1.0 -> 100%
  const precision = Math.max(0, Math.min(1, (quality - 0.6) / 0.4));
  const multiplier = 0.6 + 0.4 * precision;

  const points = (POINTS.base + POINTS.speed * speed) * multiplier;
  return Math.round(points + (isFirst ? POINTS.firstBonus : 0));
}
