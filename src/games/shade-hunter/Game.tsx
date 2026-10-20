import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'sine', volume = 0.05) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Levels ----------

const ROUND_SECONDS = 45;

// Grid size grows from 2×2 to 9×9; the odd tile's lightness difference shrinks from 22% to 3%.
function makeLevel(level) {
  const size = Math.min(2 + Math.floor(level / 2), 9);
  const diff = Math.max(3, 22 - level * 0.9);
  const hue = Math.floor(Math.random() * 360);
  const sat = 45 + Math.floor(Math.random() * 40);
  const light = 38 + Math.floor(Math.random() * 24);
  const odd = Math.floor(Math.random() * size * size);
  const sign = light > 50 ? -1 : 1;
  return {
    size,
    odd,
    base: `hsl(${hue} ${sat}% ${light}%)`,
    special: `hsl(${hue} ${sat}% ${light + sign * diff}%)`,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Shade Hunter');

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
  const [phase, setPhase] = useState('ready');
  const [level, setLevel] = useState(0);
  const [board, setBoard] = useState(() => makeLevel(0));
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [missFlash, setMissFlash] = useState(false);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('shade-hunter-best')) || 0;
    } catch (e) {
      return 0;
    }
  });
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(
      () => setTimeLeft((t) => Math.max(0, +(t - 0.1).toFixed(1))),
      100,
    );
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'playing' && timeLeft <= 0) {
      setPhase('done');
      playTone(200, 0.5, 'sawtooth', 0.04);
      if (level > best) {
        setBest(level);
        try {
          localStorage.setItem('shade-hunter-best', String(level));
        } catch (e) {
          /* storage unavailable */
        }
      }
    }
  }, [timeLeft, phase]);
  const start = () => {
    setLevel(0);
    setBoard(makeLevel(0));
    setTimeLeft(ROUND_SECONDS);
    setPhase('playing');
  };
  const pick = (i) => {
    if (phase !== 'playing') return;
    if (i === board.odd) {
      const next = level + 1;
      setLevel(next);
      setBoard(makeLevel(next));
      setTimeLeft((t) => Math.min(ROUND_SECONDS, t + 1));
      playTone(500 + Math.min(next, 30) * 20);
    } else {
      setTimeLeft((t) => Math.max(0, t - 3));
      setMissFlash(true);
      setTimeout(() => setMissFlash(false), 200);
      playTone(140, 0.15, 'square', 0.04);
    }
  };
  const rank =
    level >= 30
      ? 'Hawk eye'
      : level >= 22
        ? 'Painter'
        : level >= 14
          ? 'Sharp'
          : level >= 7
            ? 'Keen'
            : 'Warming up';
  return (
    <main className="font-body max-w-[560px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(34px,9vw,52px)] leading-none">
            Shade Hunter
          </h1>
          <p className="text-muted mt-1">
            One tile is a different shade. Find it before time runs out.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
            Found
          </div>
          <div className="font-display text-4xl leading-none">{level}</div>
        </div>
      </header>

      <div
        className="h-2.5 rounded-full bg-panel overflow-hidden"
        aria-label={`${timeLeft.toFixed(0)} seconds left`}
      >
        <div
          className={`h-full transition-[width] duration-100 ${timeLeft < 8 ? 'bg-accent' : 'bg-ink'}`}
          style={{
            width: `${(timeLeft / ROUND_SECONDS) * 100}%`,
          }}
        />
      </div>

      <div
        className={`relative bg-panel rounded-2xl p-3 shadow-sm ${missFlash ? 'ring-4 ring-accent' : ''}`}
      >
        <div
          className="grid gap-1.5 aspect-square"
          style={{
            gridTemplateColumns: `repeat(${board.size}, 1fr)`,
          }}
        >
          {Array.from({
            length: board.size * board.size,
          }).map((_, i) => (
            <button
              key={String(String(`${level}-${i}`))}
              type="button"
              onClick={() => pick(i)}
              disabled={phase !== 'playing'}
              aria-label={`Tile ${i + 1}`}
              className="rounded-lg min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              style={{
                background: i === board.odd ? board.special : board.base,
              }}
            />
          ))}
        </div>

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-2xl bg-panel/90 flex flex-col items-center justify-center gap-3 text-center p-6">
            {phase === 'done' ? (
              <>
                <p className="font-display text-3xl">{rank}</p>
                <p className="text-muted">
                  You found {level} odd tiles. Best: {Math.max(best, level)}.
                </p>
              </>
            ) : (
              <p className="text-muted max-w-[34ch]">
                You start with {ROUND_SECONDS} seconds. Each find adds a second, and each
                wrong tap costs three. The grid grows and the shades get closer as you go.
              </p>
            )}
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-ink text-bg font-display px-6 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {phase === 'done' ? 'Test again' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted text-center">
        {timeLeft.toFixed(1)} s left · grid {board.size}×{board.size}
      </p>
    </main>
  );
}
export default App;
