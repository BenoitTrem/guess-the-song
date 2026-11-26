// src/components/hooks/matchGuess.ts
// Scores a typed guess against a YouTube title.
// guessQuality() returns 0 (wrong) or a number from 0.6 (barely accepted)
// to 1 (perfect). calcPoints() turns that and the time left into points.

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "to",
  "in",
  "on",
  "at",
  "for",
  "my",
  "me",
  "you",
  "i",
  "is",
  "it",
]);

const NOISE =
  /\b(official|video|music|audio|lyrics?|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|explicit)\b/g;

// Lowercase, no accents, no punctuation, no "official video" junk
function clean(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(NOISE, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

// Everything we accept as a right answer for this title
function targetsFrom(title: string): string[] {
  const stripped = title
    .replace(/[([{].*?[)\]}]/g, " ") // (Official Video), [Lyrics]
    .replace(/\b(?:feat|ft|featuring)\b\.?.*$/i, " "); // drop featured artists

  const parts = stripped.split(/\s+[-–—|:]\s+|\s*\|\s*/).filter(Boolean);
  const targets = [...parts];

  // "Artist A & Artist B" or "A, B" or "A x B": each artist counts on its own
  if (parts.length > 1) {
    const artists = parts[0].split(/\s*(?:,|&|\sx\s)\s*/i);
    if (artists.length > 1) targets.push(...artists);
  }

  targets.push(stripped); // the whole title too
  return [...new Set(targets.map(clean).filter((t) => t.length > 0))];
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
  let best = 0;

  // the whole thing, tolerating typos ("blinding lihgts")
  const whole = similarity(guess, target);
  if (whole >= 0.8) best = whole;

  // word by word, so partial titles count ("dont stop" for "Don't Stop Believin'")
  const guessTokens = guess.split(" ");
  const all = target.split(" ");
  const significant = all.filter((w) => !STOP_WORDS.has(w));
  const needed = significant.length > 0 ? significant : all;

  // stops people from typing a whole paragraph and hoping a word hits
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
  const g = clean(guess);
  if (g.length < 2) return 0;
  return Math.max(0, ...targetsFrom(title).map((t) => targetQuality(g, t)));
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
