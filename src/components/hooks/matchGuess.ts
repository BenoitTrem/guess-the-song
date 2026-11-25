// src/components/hooks/matchGuess.ts
// Decides if a typed guess is "close enough" to a YouTube video title.
// A guess is correct if it matches the song name OR the artist name,
// ignoring case, accents, punctuation, "(Official Video)" and typos.

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

function tokenMatches(guessTokens: string[], target: string): boolean {
  return guessTokens.some(
    (g) =>
      g === target ||
      (g.length >= 4 && target.length >= 4 && similarity(g, target) >= 0.8),
  );
}

function matchesTarget(guess: string, target: string): boolean {
  // whole thing, tolerating typos ("blinding lihgts")
  if (similarity(guess, target) >= 0.8) return true;

  const guessTokens = guess.split(" ");
  const all = target.split(" ");
  const significant = all.filter((w) => !STOP_WORDS.has(w));
  const needed = significant.length > 0 ? significant : all;

  // stops people from typing a whole paragraph and hoping a word hits
  if (guessTokens.length > needed.length * 2 + 2) return false;

  const hits = needed.filter((t) => tokenMatches(guessTokens, t)).length;
  const required = needed.length === 1 ? 1 : Math.ceil(needed.length * 0.6);
  return hits >= required;
}

export function isCorrectGuess(guess: string, title: string): boolean {
  const g = clean(guess);
  if (g.length < 2) return false;
  return targetsFrom(title).some((target) => matchesTarget(g, target));
}
