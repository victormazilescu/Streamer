import { useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  durationSec?: number;
  artworkUrl?: string;
  audioUrl?: string;
  sourceUrl?: string;
};

type VisualMode = "bars" | "wave" | "radial";

function formatTime(totalSeconds?: number): string {
  if (!totalSeconds || Number.isNaN(totalSeconds)) return "--:--";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seededNoise(i: number, t: number): number {
  const raw = Math.sin(i * 12.9898 + t * 0.0017) * 43758.5453;
  return raw - Math.floor(raw);
}

function useAnalyser(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  demoEnabled: boolean,
) {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(
    new Uint8Array(128),
  );
  const [timeData, setTimeData] = useState<Uint8Array>(new Uint8Array(128));

  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      oscillatorRef.current?.disconnect();
      gainRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      analyserRef.current?.disconnect();
      if (audioContext) void audioContext.close();
    };
  }, [audioContext]);

  const setup = async (): Promise<void> => {
    let ctx = audioContext;
    if (!ctx) {
      ctx = new AudioContext();
      setAudioContext(ctx);
    }

    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;
    }

    const analyser = analyserRef.current;

    if (audioRef.current && !sourceNodeRef.current) {
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceNodeRef.current = source;
    }

    if (demoEnabled && !oscillatorRef.current) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.value = 120;
      gain.gain.value = 0.0001;

      osc.connect(gain);
      gain.connect(analyser);
      osc.start();

      oscillatorRef.current = osc;
      gainRef.current = gain;
    }

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      setFrequencyData(new Uint8Array(freq));
      setTimeData(new Uint8Array(time));
      rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current === null) tick();
  };

  const stopDemo = (): void => {
    oscillatorRef.current?.disconnect();
    gainRef.current?.disconnect();
    oscillatorRef.current = null;
    gainRef.current = null;
  };

  return { setup, stopDemo, frequencyData, timeData };
}

function VisualizerCanvas(props: {
  frequencyData: Uint8Array;
  timeData: Uint8Array;
  title: string;
  artist: string;
  mode: VisualMode;
  progress: number;
}) {
  const { frequencyData, timeData, title, artist, mode, progress } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.fillStyle = "#02040d";
      ctx.fillRect(0, 0, w, h);

      const data = frequencyData;

      for (let i = 0; i < data.length; i++) {
        const val = data[i] / 255;
        const barHeight = val * h * 0.4;
        const x = (i / data.length) * w;
        ctx.fillStyle = `rgba(${80 + i}, 200, 255, 0.9)`;
        ctx.fillRect(x, h - barHeight - 50, 4, barHeight);
      }

      ctx.fillStyle = "white";
      ctx.font = "20px sans-serif";
      ctx.fillText(title, 20, h - 40);

      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(artist, 20, h - 20);

      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [frequencyData, timeData, title, artist, mode, progress]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}

/* 🔥 THIS IS THE IMPORTANT PART */
async function parseSunoPlaylist(url: string): Promise<Track[]> {
  const response = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);

  if (!response.ok) {
    throw new Error("Failed to load playlist");
  }

  const data = await response.json();
  return data.tracks || [];
}

export default function App() {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { setup, frequencyData, timeData } = useAnalyser(audioRef, true);

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) ?? tracks[0],
    [tracks, currentTrackId],
  );

  const handleLoad = async () => {
    setStatus("Loading...");
    setError(null);

    try {
      const data = await parseSunoPlaylist(playlistUrl);
      setTracks(data);
      setCurrentTrackId(data[0]?.id ?? null);
      setStatus(`Loaded ${data.length} tracks`);
    } catch (e) {
      setError("Failed to load playlist");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Streamer</h1>

      <input
        value={playlistUrl}
        onChange={(e) => setPlaylistUrl(e.target.value)}
        placeholder="Paste Suno playlist URL"
        style={{ width: "100%", padding: 10 }}
      />

      <button onClick={handleLoad}>Load playlist</button>

      <div>{status}</div>
      {error && <div style={{ color: "red" }}>{error}</div>}

      <div style={{ height: 300 }}>
        <VisualizerCanvas
          frequencyData={frequencyData}
          timeData={timeData}
          title={currentTrack?.title || ""}
          artist={currentTrack?.artist || ""}
          mode="bars"
          progress={0}
        />
      </div>

      <ul>
        {tracks.map((t) => (
          <li key={t.id}>
            {t.title} — {t.artist}
          </li>
        ))}
      </ul>

      <audio ref={audioRef} />
    </div>
  );
}
