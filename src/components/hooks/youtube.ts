// src/components/hooks/youtube.ts
// Put your key in .env as VITE_YOUTUBE_API_KEY=xxxx
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined;

export type VideoResult = {
  id: string;
  title: string;
  channel: string;
  thumb: string;
};

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Returns the video id if the text is a YouTube link, otherwise null
export function parseVideoId(text: string): string | null {
  const match = text
    .trim()
    .match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
    );
  return match ? match[1] : null;
}

export async function searchVideos(query: string): Promise<VideoResult[]> {
  if (!API_KEY)
    throw new Error("Missing VITE_YOUTUBE_API_KEY in your .env file.");

  const url =
    "https://www.googleapis.com/youtube/v3/search?" +
    new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "6",
      videoEmbeddable: "true",
      q: query,
      key: API_KEY,
    });

  const res = await fetch(url);
  if (!res.ok)
    throw new Error("YouTube search failed. Check your API key and quota.");
  const data = await res.json();

  return data.items.map((item: any) => ({
    id: item.id.videoId,
    title: decodeHtml(item.snippet.title),
    channel: item.snippet.channelTitle,
    thumb: item.snippet.thumbnails.medium.url,
  }));
}

// No API key needed for this one, so pasted links work even without the key
export async function fetchTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`,
    );
    if (!res.ok) return "Unknown song";
    return (await res.json()).title as string;
  } catch {
    return "Unknown song";
  }
}

function decodeHtml(text: string) {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}
