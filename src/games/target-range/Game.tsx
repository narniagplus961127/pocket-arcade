import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.05, type = 'square', volume = 0.03) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Game settings ----------

const ROUND_SECONDS = 30;
const MODES = {
  Standard: {
    life: 1.6,
    size: 38,
    spawn: 0.7,
  },
  Precision: {
    life: 2.2,
    size: 20,
    spawn: 0.9,
  },
  Flick: {
    life: 0.9,
    size: 34,
    spawn: 0.45,
  },
};

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Target Range');

  // Close the synthesizer when this game leaves the page.
  React.useEffect(
    () => () => {
      if (audioCtx) {
        void audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    },
    [],
  );
  const canvasRef = useRef(null);
  const game = useRef(null); // mutable per-frame state lives here, not in React state
  const [mode, setMode] = useState('Standard');
  const [phase, setPhase] = useState('ready');
  const [hud, setHud] = useState({
    score: 0,
    hits: 0,
    misses: 0,
    expired: 0,
    time: ROUND_SECONDS,
  });
  const [result, setResult] = useState(null);

  // Canvas setup and the animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = game.current;
      const { width, height } = canvas.getBoundingClientRect();
      const styles = getComputedStyle(document.documentElement);
      const ink = styles.getPropertyValue('--ink').trim();
      const signal = styles.getPropertyValue('--signal').trim();
      const field = styles.getPropertyValue('--field').trim();
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(127,127,127,.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      if (g && g.running) {
        g.elapsed += dt;
        g.spawnIn -= dt;
        const settings = MODES[g.mode];
        if (g.spawnIn <= 0) {
          const size = settings.size;
          g.targets.push({
            x: size + Math.random() * (width - size * 2),
            y: size + Math.random() * (height - size * 2),
            age: 0,
            born: now,
          });
          g.spawnIn = settings.spawn * (0.75 + Math.random() * 0.5);
        }
        g.targets.forEach((t) => {
          t.age += dt;
        });
        const before = g.targets.length;
        g.targets = g.targets.filter((t) => t.age < settings.life);
        g.expired += before - g.targets.length;
        const timeLeft = Math.max(0, ROUND_SECONDS - g.elapsed);
        if (Math.floor(timeLeft * 10) !== g.lastHudTenth) {
          g.lastHudTenth = Math.floor(timeLeft * 10);
          setHud({
            score: g.score,
            hits: g.hits,
            misses: g.misses,
            expired: g.expired,
            time: timeLeft,
          });
        }
        if (timeLeft <= 0) {
          g.running = false;
          finish(g);
        }

        // Targets: rings that shrink as their time runs out.
        for (const t of g.targets) {
          const life = 1 - t.age / settings.life;
          const r = settings.size * (0.35 + 0.65 * life);
          ctx.fillStyle = signal;
          ctx.beginPath();
          ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = field;
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.66, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = signal;
          ctx.beginPath();
          ctx.arc(t.x, t.y, r * 0.33, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Hit markers
      if (g) {
        g.marks = g.marks.filter((m) => now - m.t < 400);
        for (const m of g.marks) {
          const a = 1 - (now - m.t) / 400;
          ctx.strokeStyle = m.hit ? ink : signal;
          ctx.globalAlpha = a;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const s = m.hit ? 10 : 6;
          ctx.moveTo(m.x - s, m.y - s);
          ctx.lineTo(m.x + s, m.y + s);
          ctx.moveTo(m.x + s, m.y - s);
          ctx.lineTo(m.x - s, m.y + s);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  const finish = (g) => {
    const shots = g.hits + g.misses;
    const accuracy = shots ? Math.round((g.hits / shots) * 100) : 0;
    const reaction = g.reactions.length
      ? Math.round(g.reactions.reduce((a, b) => a + b, 0) / g.reactions.length)
      : 0;
    let best = 0;
    try {
      const key = `target-range-best-${g.mode}`;
      best = Number(localStorage.getItem(key)) || 0;
      if (g.score > best) {
        localStorage.setItem(key, String(g.score));
        best = g.score;
      }
    } catch (e) {
      // Storage may be unavailable.
    }
    setResult({
      score: g.score,
      accuracy,
      reaction,
      hits: g.hits,
      expired: g.expired,
      best,
    });
    setPhase('done');
    playTone(440, 0.3, 'triangle', 0.05);
  };
  const start = () => {
    game.current = {
      running: true,
      mode,
      elapsed: 0,
      spawnIn: 0.4,
      targets: [],
      marks: [],
      score: 0,
      hits: 0,
      misses: 0,
      expired: 0,
      reactions: [],
      lastHudTenth: -1,
    };
    setResult(null);
    setPhase('playing');
  };
  const shoot = (e) => {
    const g = game.current;
    if (!g || !g.running) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const settings = MODES[g.mode];

    // Topmost (newest) target under the pointer wins.
    for (let i = g.targets.length - 1; i >= 0; i--) {
      const t = g.targets[i];
      const r = settings.size * (0.35 + 0.65 * (1 - t.age / settings.life));
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= r) {
        const bull = d <= r * 0.33;
        g.score += bull ? 150 : 100;
        g.hits++;
        g.reactions.push(t.age * 1000);
        g.targets.splice(i, 1);
        g.marks.push({
          x,
          y,
          t: performance.now(),
          hit: true,
        });
        playTone(bull ? 1400 : 1000, 0.05);
        return;
      }
    }
    g.misses++;
    g.score = Math.max(0, g.score - 25);
    g.marks.push({
      x,
      y,
      t: performance.now(),
      hit: false,
    });
    playTone(180, 0.06);
  };
  return (
    <main className="font-display max-w-[1000px] mx-auto py-6 flex flex-col gap-4">
      <header className="grid grid-cols-2 sm:grid-cols-[1fr_repeat(4,auto)] gap-x-8 gap-y-2 items-end border-b-2 border-ink pb-3">
        <h1 className="text-[clamp(36px,9vw,58px)] leading-none font-bold col-span-2 sm:col-span-1">
          Target Range
        </h1>
        <Stat label="Score" value={hud.score} />
        <Stat label="Hits" value={hud.hits} />
        <Stat label="Misses" value={hud.misses + hud.expired} />
        <Stat label="Time" value={hud.time.toFixed(1)} />
      </header>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={shoot}
          aria-label="Target field"
          className="w-full h-[clamp(320px,60vh,560px)] block border border-ink/20 cursor-crosshair touch-none"
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 bg-bg/85 flex flex-col items-center justify-center gap-4 text-center p-6">
            {result ? (
              <table className="font-mono text-sm">
                <tbody>
                  <Row k="Score" v={result.score} />
                  <Row k="Accuracy" v={`${result.accuracy}%`} />
                  <Row k="Average reaction" v={`${result.reaction} ms`} />
                  <Row k="Targets hit" v={result.hits} />
                  <Row k="Targets missed" v={result.expired} />
                  <Row k={`Best (${mode})`} v={result.best} />
                </tbody>
              </table>
            ) : (
              <p className="max-w-[44ch] text-muted">
                Targets appear and shrink. Click or tap them before they vanish. The
                centre ring is worth 150 points, the rest 100, and missed shots cost 25.
                Each round lasts {ROUND_SECONDS} seconds.
              </p>
            )}
            <div className="flex gap-2 flex-wrap justify-center">
              {Object.keys(MODES).map((m) => (
                <button
                  key={String(String(m))}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`border-2 border-ink px-3 py-1.5 text-sm font-bold ${mode === m ? 'bg-ink text-bg' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={start}
              className="bg-signal text-white px-8 py-3 text-xl font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {result ? 'Again' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted font-mono">
        Standard: balanced. Precision: small targets that last longer. Flick: fast,
        short-lived targets.
      </p>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted">
        {label}
      </div>
      <div className="text-3xl font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <tr>
      <td className="text-left pr-8 py-1 text-muted">{k}</td>
      <td className="text-right font-medium">{v}</td>
    </tr>
  );
}
export default App;
