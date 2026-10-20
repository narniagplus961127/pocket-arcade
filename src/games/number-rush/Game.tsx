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
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Helpers ----------

const shuffled = (n) =>
  [...Array(n * n).keys()].map((i) => i + 1).sort(() => Math.random() - 0.5);
const fmt = (ms) => (ms / 1000).toFixed(2);
function readBest(n) {
  try {
    return Number(localStorage.getItem(`number-rush-best-${n}`)) || null;
  } catch (e) {
    return null;
  }
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Number Rush');

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
  const [n, setN] = useState(5);
  const [numbers, setNumbers] = useState(() => shuffled(5));
  const [next, setNext] = useState(1);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [wrongCell, setWrongCell] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const [best, setBest] = useState(() => readBest(5));
  const frame = useRef(0);

  // Stopwatch, updated every animation frame while running.
  useEffect(() => {
    if (startTime === null || done) return undefined;
    const tick = () => {
      setElapsed(performance.now() - startTime);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [startTime, done]);
  const reset = (size = n) => {
    setN(size);
    setNumbers(shuffled(size));
    setNext(1);
    setStartTime(null);
    setElapsed(0);
    setDone(false);
    setMistakes(0);
    setBest(readBest(size));
  };
  const tap = (value, index) => {
    if (done) return;
    if (value !== next) {
      setWrongCell(index);
      setMistakes((m) => m + 1);
      setTimeout(() => setWrongCell(null), 200);
      playTone(120, 0.12);
      return;
    }
    const now = performance.now();
    if (value === 1) setStartTime(now);
    playTone(400 + value * 18);
    if (value === n * n) {
      const total = now - (value === 1 ? now : startTime);
      setElapsed(total);
      setDone(true);
      [523, 659, 784].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.15, 'triangle', 0.05), i * 90),
      );
      if (!best || total < best) {
        setBest(total);
        try {
          localStorage.setItem(`number-rush-best-${n}`, String(Math.round(total)));
        } catch (e) {
          /* storage unavailable */
        }
      }
    }
    setNext(value + 1);
  };
  return (
    <main className="font-mono max-w-[560px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 border-b-4 border-ink pb-3">
        <div>
          <h1 className="font-display text-[clamp(48px,14vw,84px)] leading-[.85] uppercase">
            Number
            <br />
            Rush
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-muted">Find</div>
          <div className="font-display text-[clamp(64px,18vw,110px)] leading-none text-hot tabular-nums">
            {done ? '✓' : next}
          </div>
        </div>
      </header>

      <div className="flex justify-between text-sm font-bold">
        <span>TIME {fmt(elapsed)}s</span>
        <span>MISSES {mistakes}</span>
        <span>BEST {best ? `${fmt(best)}s` : '—'}</span>
      </div>

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${n}, 1fr)`,
        }}
      >
        {numbers.map((value, i) => {
          const found = value < next;
          return (
            <button
              key={String(String(value))}
              type="button"
              onClick={() => tap(value, i)}
              aria-label={`Number ${value}${found ? ', found' : ''}`}
              className={`aspect-square min-w-0 border-[3px] border-ink font-display text-[clamp(22px,7vw,44px)] leading-none
                  focus-visible:outline focus-visible:outline-4 focus-visible:outline-hot
                  ${wrongCell === i ? 'bg-hot text-white' : found ? 'bg-ink text-bg' : 'bg-tile text-ink'}`}
            >
              {value}
            </button>
          );
        })}
      </div>

      {done && (
        <p className="font-display text-3xl uppercase" role="status">
          {n * n} in {fmt(elapsed)} seconds
          {best && Math.round(elapsed) <= Math.round(best) ? ', a new record' : ''}.
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {[4, 5, 6].map((size) => (
          <button
            key={String(String(size))}
            type="button"
            onClick={() => reset(size)}
            className={`border-[3px] border-ink px-4 py-2 font-bold uppercase focus-visible:outline focus-visible:outline-4 focus-visible:outline-hot
                ${n === size ? 'bg-ink text-bg' : ''}`}
          >
            {size}×{size}
          </button>
        ))}
        <button
          type="button"
          onClick={() => reset()}
          className="border-[3px] border-ink px-4 py-2 font-bold uppercase ml-auto"
        >
          Shuffle
        </button>
      </div>

      <p className="text-sm text-muted leading-relaxed">
        A Schulte table: tap the numbers in order from 1 as fast as you can. The clock
        starts on 1. Try to keep your eyes on the centre of the grid and find each number
        with your peripheral vision.
      </p>
    </main>
  );
}
export default App;
