export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const playlistUrl = url.searchParams.get("url");

    if (!playlistUrl) {
      return json(
        { error: "Missing url query parameter." },
        { status: 400 },
      );
    }

    if (!playlistUrl.includes("suno.com")) {
      return json(
        { error: "Only Suno URLs are supported." },
        { status: 400 },
      );
    }

    const response = await fetch(playlistUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return json(
        { error: `Could not fetch playlist page. Status ${response.status}` },
        { status: 502 },
      );
    }

    const html = await response.text();

    const tracks = extractTracks(html, playlistUrl);

    return json({ tracks });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return json({ error: message }, { status: 500 });
  }
}

type Track = {
  id: string;
  title: string;
  artist: string;
  durationSec?: number;
  artworkUrl?: string;
  audioUrl?: string;
  sourceUrl?: string;
};

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function extractTracks(html: string, sourceUrl: string): Track[] {
  const tracks: Track[] = [];

  const titleMatches = [
    ...html.matchAll(/"title":"([^"]+)"/g),
    ...html.matchAll(/"name":"([^"]+)"/g),
  ];

  const creatorMatches = [
    ...html.matchAll(/"display_name":"([^"]+)"/g),
    ...html.matchAll(/"username":"([^"]+)"/g),
    ...html.matchAll(/"artist":"([^"]+)"/g),
  ];

  const cleanedTitles = uniqueCleaned(
    titleMatches.map((m) => decodeText(m[1])),
  ).filter(isUsefulTitle);

  const cleanedArtists = uniqueCleaned(
    creatorMatches.map((m) => decodeText(m[1])),
  ).filter(Boolean);

  const fallbackArtist = cleanedArtists[0] || "Unknown artist";

  for (let i = 0; i < cleanedTitles.length; i += 1) {
    tracks.push({
      id: `track-${i + 1}`,
      title: cleanedTitles[i],
      artist: cleanedArtists[i] || fallbackArtist,
      sourceUrl,
    });
  }

  return dedupeTracks(tracks).slice(0, 100);
}

function decodeText(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\\//g, "/")
    .trim();
}

function uniqueCleaned(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function isUsefulTitle(value: string): boolean {
  const lower = value.toLowerCase();

  if (lower.length < 2) return false;
  if (lower.includes("twitter")) return false;
  if (lower.includes("instagram")) return false;
  if (lower.includes("tiktok")) return false;
  if (lower.includes("suno")) return false;
  if (lower.includes("playlist")) return false;
  if (lower.includes("home")) return false;

  return true;
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];

  for (const track of tracks) {
    const key = `${track.title}___${track.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }

  return result;
}
