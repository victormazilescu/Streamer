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

const DEMO_TRACKS: Track[] = [
  {
    id: "demo-1",
    title: "Neon Skyline",
    artist: "Victor + Suno",
    durationSec: 184,
    sourceUrl: "https://suno.com/playlist/demo",
  },
  {
    id: "demo-2",
    title: "Chrome Dreams",
    artist: "Victor + Suno",
    durationSec: 203,
    sourceUrl: "https://suno.com/playlist/demo",
  },
  {
    id: "demo-3",
    title: "Digital Midnight",
    artist: "Victor + Suno",
    durationSec: 196,
    sourceUrl: "https://suno.com/playlist/demo",
  },
];

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
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      oscillatorRef.current?.disconnect();
      gainRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      analyserRef.current?.disconnect();
      if (audioContext) {
        void audioContext.close();
      }
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

    if (rafRef.current === null) {
      tick();
    }
  };

  const stopDemo = (): void => {
    oscillatorRef.current?.disconnect();
    gainRef.current?.disconnect();
    oscillatorRef.current = null;
    gainRef.current = null;
  };

  return {
    setup,
    stopDemo,
    frequencyData,
    timeData,
  };
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
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawBars = (w: number, h: number, now: number) => {
      const data = frequencyData.length ? frequencyData : new Uint8Array(128);
      const bars = Math.min(96, data.length);
      const gap = 4;
      const totalGap = gap * (bars - 1);
      const barWidth = (w - 80 - totalGap) / bars;
      const baseY = h * 0.72;

      for (let i = 0; i < bars; i += 1) {
        const raw = data[i] || 0;
        const value = raw / 255;
        const demoBoost = seededNoise(i, now) * 0.15;
        const barHeight = clamp(
          (value + demoBoost) * (h * 0.34),
          8,
          h * 0.42,
        );
        const x = 40 + i * (barWidth + gap);
        const y = baseY - barHeight;

        ctx.fillStyle = `rgba(${80 + i * 2}, ${220 - i}, 255, 0.95)`;
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x, baseY + 6, barWidth, 8);
      }
    };

    const drawWave = (w: number, h: number, now: number) => {
      const data = timeData.length ? timeData : new Uint8Array(128);
      ctx.lineWidth = 3;
      ctx.beginPath();

      for (let i = 0; i < data.length; i += 1) {
        const x = (i / Math.max(1, data.length - 1)) * (w - 80) + 40;
        const centered = data[i]
          ? (data[i] - 128) / 128
          : seededNoise(i, now) - 0.5;
        const y = h * 0.5 + centered * h * 0.2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = "rgba(88, 200, 255, 0.95)";
      ctx.stroke();
    };

    const drawRadial = (w: number, h: number, now: number) => {
      const data = frequencyData.length ? frequencyData : new Uint8Array(128);
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.18;
      const bars = 96;

      for (let i = 0; i < bars; i += 1) {
        const angle = (Math.PI * 2 * i) / bars - Math.PI / 2;
        const raw = data[i] || 0;
        const magnitude = raw / 255 + seededNoise(i, now) * 0.12;
        const extra = clamp(magnitude * 120, 6, 120);

        const x1 = cx + Math.cos(angle) * baseRadius;
        const y1 = cy + Math.sin(angle) * baseRadius;
        const x2 = cx + Math.cos(angle) * (baseRadius + extra);
        const y2 = cy + Math.sin(angle) * (baseRadius + extra);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(120, ${180 + (i % 50)}, 255, 0.92)`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius - 12, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "#050816");
      gradient.addColorStop(0.55, "#091329");
      gradient.addColorStop(1, "#02040d");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 18; i += 1) {
        const px =
          (seededNoise(i + 10, now) * w + now * (0.005 + i * 0.00007)) % w;
        const py = (seededNoise(i + 100, now) * h + i * 30) % h;
        const radius = 1 + seededNoise(i + 200, now) * 2.5;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1);
      }

      if (mode === "bars") drawBars(w, h, now);
      if (mode === "wave") drawWave(w, h, now);
      if (mode === "radial") drawRadial(w, h, now);

      const cardX = 32;
      const cardY = h - 132;
      const cardW = Math.min(520, w - 64);
      const cardH = 92;

      ctx.fillStyle = "rgba(9,12,20,0.72)";
      ctx.fillRect(cardX, cardY, cardW, cardH);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText("NOW PLAYING", cardX + 16, cardY + 22);

      ctx.fillStyle = "rgba(255,255,255,0.97)";
      ctx.font = "700 28px Inter, system-ui, sans-serif";
      ctx.fillText(title || "No track selected", cardX + 16, cardY + 52);

      ctx.fillStyle = "rgba(124,196,255,0.95)";
      ctx.font = "500 18px Inter, system-ui, sans-serif";
      ctx.fillText(artist || "Unknown artist", cardX + 16, cardY + 76);

      const progressW = Math.max(0, cardW - 32);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(cardX + 16, cardY + cardH - 14, progressW, 6);

      ctx.fillStyle = "rgba(90,200,255,0.95)";
      ctx.fillRect(cardX + 16, cardY + cardH - 14, progressW * progress, 6);

      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [artist, frequencyData, mode, progress, timeData, title]);

  return (
    <div className="canvas-shell">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

async function parseSunoPlaylist(url: string): Promise<Track[]> {
  const trimmed = url.trim();

  if (!trimmed) {
    throw new Error("Paste a Suno playlist URL first.");
  }

  if (!trimmed.includes("suno")) {
    throw new Error("This starter expects a Suno URL.");
  }

  return DEMO_TRACKS.map((track, index) => ({
    ...track,
    id: `${track.id}-${index}`,
    sourceUrl: trimmed,
  }));
}

export default function App() {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [mode, setMode] = useState<VisualMode>("bars");
  const [status, setStatus] = useState("Paste a Suno playlist link to begin.");
  const [error, setError] = useState<string | null>(null);
  const [demoAudioEnabled, setDemoAudioEnabled] = useState(true);
  const [isSceneMode, setIsSceneMode] = useState(false);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { setup, stopDemo, frequencyData, timeData } = useAnalyser(
    audioRef,
    demoAudioEnabled,
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsSceneMode(params.get("scene") === "1");
  }, []);

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId) ?? tracks[0] ?? null,
    [currentTrackId, tracks],
  );

  useEffect(() => {
    if (currentTrack && !currentTrackId) {
      setCurrentTrackId(currentTrack.id);
    }
  }, [currentTrack, currentTrackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) {
        setProgress(0);
        return;
      }
      setProgress(clamp(audio.currentTime / audio.duration, 0, 1));
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack?.audioUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setProgress(0);
      return;
    }

    audio.src = currentTrack.audioUrl;
    audio.load();
  }, [currentTrack?.audioUrl]);

  const handleLoadPlaylist = async (): Promise<void> => {
    setError(null);
    setStatus("Loading playlist...");

    try {
      const loadedTracks = await parseSunoPlaylist(playlistUrl);
      setTracks(loadedTracks);
      setCurrentTrackId(loadedTracks[0]?.id ?? null);
      setStatus(`Loaded ${loadedTracks.length} tracks.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load playlist.";
      setError(message);
      setStatus("Playlist load failed.");
    }
  };

  const handleDemo = async (): Promise<void> => {
    setError(null);
    setTracks(DEMO_TRACKS);
    setCurrentTrackId(DEMO_TRACKS[0].id);
    setStatus("Demo playlist loaded.");
    await setup();
  };

  const handlePrepareAudio = async (): Promise<void> => {
    await setup();
    setStatus("Audio engine ready.");
  };

  const updateTrack = (id: string, patch: Partial<Track>): void => {
    setTracks((prev) =>
      prev.map((track) => (track.id === id ? { ...track, ...patch } : track)),
    );
  };

  const nextTrack = (): void => {
    if (!tracks.length || !currentTrack) return;
    const currentIndex = tracks.findIndex((track) => track.id === currentTrack.id);
    const next = tracks[(currentIndex + 1) % tracks.length];
    setCurrentTrackId(next.id);
    setProgress(0);
  };

  const prevTrack = (): void => {
    if (!tracks.length || !currentTrack) return;
    const currentIndex = tracks.findIndex((track) => track.id === currentTrack.id);
    const prev = tracks[(currentIndex - 1 + tracks.length) % tracks.length];
    setCurrentTrackId(prev.id);
    setProgress(0);
  };

  if (isSceneMode) {
    return (
      <div className="scene-shell">
        <VisualizerCanvas
          frequencyData={frequencyData}
          timeData={timeData}
          title={currentTrack?.title ?? "No track selected"}
          artist={currentTrack?.artist ?? "Unknown artist"}
          mode={mode}
          progress={progress}
        />
        <audio ref={audioRef} crossOrigin="anonymous" style={{ display: "none" }} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <div className="sidebar">
          <section className="panel">
            <div className="eyebrow">Suno → Twitch</div>
            <h1 className="title">Overlay starter</h1>
            <p className="subtitle">
              First milestone: playlist input, editable metadata, audio engine
              hookup, and a stream-ready visual scene.
            </p>

            <div style={{ marginTop: 18 }}>
              <label className="label" htmlFor="playlist-url">
                Suno playlist URL
              </label>
              <input
                id="playlist-url"
                className="input"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="https://suno.com/..."
              />
            </div>

            <div className="button-row">
              <button className="button button--primary" onClick={handleLoadPlaylist}>
                Load playlist
              </button>
              <button className="button" onClick={handleDemo}>
                Load demo
              </button>
              <button className="button" onClick={handlePrepareAudio}>
                Enable audio engine
              </button>
            </div>

            <div className="status-box">
              <div>{status}</div>
              {error ? <div className="status-error">{error}</div> : null}
              <div className="status-note">
                Right now the loader is stubbed. The next implementation step is
                a tiny playlist parser backend or a Chrome extension content
                script.
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <h2 className="section-title">Now playing</h2>
              <div className="meta-text">
                OBS scene: add <span className="mono">?scene=1</span>
              </div>
            </div>

            <div className="card">
              <div className="now-playing-kicker">Track</div>
              <div className="now-playing-title">
                {currentTrack?.title ?? "No track selected"}
              </div>
              <div className="now-playing-artist">
                {currentTrack?.artist ?? "Unknown artist"}
              </div>

              <div className="controls-row">
                <button className="button" onClick={prevTrack}>
                  Prev
                </button>
                <button className="button" onClick={nextTrack}>
                  Next
                </button>
                <select
                  className="select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as VisualMode)}
                  style={{ width: 140 }}
                >
                  <option value="bars">Bars</option>
                  <option value="wave">Wave</option>
                  <option value="radial">Radial</option>
                </select>
              </div>

              <div className="progress-wrap">
                <div className="progress-meta">
                  <span>{formatTime((currentTrack?.durationSec ?? 0) * progress)}</span>
                  <span>{formatTime(currentTrack?.durationSec)}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar__fill"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="helper-box">
              <div>
                <div className="helper-title">Demo synth visual input</div>
                <div className="helper-copy">
                  Useful before real Suno audio is wired in.
                </div>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={demoAudioEnabled}
                  onChange={(e) => {
                    setDemoAudioEnabled(e.target.checked);
                    if (!e.target.checked) {
                      stopDemo();
                    }
                  }}
                />
                Enabled
              </label>
            </div>
          </section>

          <audio
            ref={audioRef}
            controls
            crossOrigin="anonymous"
            className="audio-player"
          />
        </div>

        <div className="main-column">
          <section className="panel preview-shell">
            <VisualizerCanvas
              frequencyData={frequencyData}
              timeData={timeData}
              title={currentTrack?.title ?? "No track selected"}
              artist={currentTrack?.artist ?? "Unknown artist"}
              mode={mode}
              progress={progress}
            />
          </section>

          <section className="panel panel--flat">
            <div className="section-head">
              <div>
                <h2 className="section-title">Playlist editor</h2>
                <p className="section-copy">
                  This is where manual corrections for title and artist happen.
                </p>
              </div>
              <div className="meta-text">{tracks.length} tracks</div>
            </div>

            <div className="playlist-stack">
              {tracks.length === 0 ? (
                <div className="empty-state">
                  No tracks yet. Load a Suno link or use the demo playlist.
                </div>
              ) : (
                tracks.map((track) => {
                  const selected = currentTrackId === track.id;

                  return (
                    <div
                      key={track.id}
                      className={`track-card ${
                        selected ? "track-card--selected" : ""
                      }`}
                    >
                      <div className="track-grid">
                        <div>
                          <label className="field-label" htmlFor={`title-${track.id}`}>
                            Title
                          </label>
                          <input
                            id={`title-${track.id}`}
                            className="input"
                            value={track.title}
                            onChange={(e) =>
                              updateTrack(track.id, { title: e.target.value })
                            }
                          />
                        </div>

                        <div>
                          <label className="field-label" htmlFor={`artist-${track.id}`}>
                            Artist
                          </label>
                          <input
                            id={`artist-${track.id}`}
                            className="input"
                            value={track.artist}
                            onChange={(e) =>
                              updateTrack(track.id, { artist: e.target.value })
                            }
                          />
                        </div>

                        <div>
                          <button
                            className="button"
                            onClick={() => setCurrentTrackId(track.id)}
                          >
                            Select
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
