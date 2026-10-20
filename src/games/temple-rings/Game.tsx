import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.15, type = 'sine', volume = 0.06) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Puzzle ----------

const RING_COLORS = [
  '#7fd1ae',
  '#5fbf94',
  '#47aa7d',
  '#3a946b',
  '#2f7f5b',
  '#256a4b',
  '#1d573d',
  '#164630',
];
const NOTES = [784, 698, 659, 587, 523, 494, 440, 392];
const startPegs = (n) => [
  Array.from(
    {
      length: n,
    },
    (_, i) => n - i,
  ),
  [],
  [],
];

// Classic recursive solution, used by the "Show me" demo.
function solution(n, from = 0, to = 2, via = 1, moves = []) {
  if (n === 0) return moves;
  solution(n - 1, from, via, to, moves);
  moves.push([from, to]);
  solution(n - 1, via, to, from, moves);
  return moves;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Temple Rings');

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
  const [count, setCount] = useState(4);
  const [pegs, setPegs] = useState(() => startPegs(4));
  const [held, setHeld] = useState(null); // index of the peg whose top ring is lifted
  const [moves, setMoves] = useState(0);
  const [demo, setDemo] = useState(false);
  const demoRef = useRef(null);
  const minimum = 2 ** count - 1;
  const solved = pegs[2].length === count;
  const moveRing = (from, to) => {
    const source = pegs[from];
    const target = pegs[to];
    const ring = source[source.length - 1];
    if (ring === undefined) return false;
    if (target.length && target[target.length - 1] < ring) return false;
    const next = pegs.map((p) => [...p]);
    next[from].pop();
    next[to].push(ring);
    setPegs(next);
    setMoves((m) => m + 1);
    playTone(NOTES[ring - 1] || 400);
    if (next[2].length === count) {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.3, 'triangle'), 300 + i * 120),
      );
      try {
        const key = `temple-best-${count}`;
        const best = Number(localStorage.getItem(key)) || Infinity;
        if (moves + 1 < best) localStorage.setItem(key, String(moves + 1));
      } catch (e) {
        // Storage may be unavailable.
      }
    }
    return true;
  };
  const clickPeg = (i) => {
    if (demo || solved) return;
    if (held === null) {
      if (pegs[i].length) setHeld(i);
      return;
    }
    if (held === i) {
      setHeld(null);
      return;
    }
    if (!moveRing(held, i)) playTone(140, 0.2, 'square', 0.03);
    setHeld(null);
  };
  const restart = (n = count) => {
    clearInterval(demoRef.current);
    setDemo(false);
    setCount(n);
    setPegs(startPegs(n));
    setHeld(null);
    setMoves(0);
  };

  // "Show me": replays the optimal solution from the start.
  const showMe = () => {
    restart();
    setDemo(true);
    const steps = solution(count);
    let k = 0;
    let state = startPegs(count);
    demoRef.current = setInterval(
      () => {
        if (k >= steps.length) {
          clearInterval(demoRef.current);
          setDemo(false);
          return;
        }
        const [from, to] = steps[k++];
        state = state.map((p) => [...p]);
        const ring = state[from].pop();
        state[to].push(ring);
        setPegs(state);
        setMoves(k);
        playTone(NOTES[ring - 1] || 400, 0.1);
      },
      Math.max(120, 600 - count * 60),
    );
  };
  useEffect(() => () => clearInterval(demoRef.current), []);
  useEffect(() => {
    const onKey = (e) => {
      if (['1', '2', '3'].includes(e.key)) clickPeg(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  let best = null;
  try {
    best = Number(localStorage.getItem(`temple-best-${count}`)) || null;
  } catch (e) {
    best = null;
  }
  return (
    <main className="font-body max-w-[820px] mx-auto py-6 flex flex-col gap-5">
      <header className="text-center">
        <h1 className="font-display text-[clamp(40px,11vw,64px)] leading-none text-torch">
          Temple Rings
        </h1>
        <p className="text-muted mt-2 max-w-[56ch] mx-auto">
          Move the whole stack of jade rings to the right-hand pillar. Move one ring at a
          time, and never put a ring on a smaller one.
        </p>
      </header>

      <div className="flex justify-center gap-6 text-center">
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-muted">Moves</div>
          <div className="font-display text-3xl">{moves}</div>
        </div>
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-muted">Minimum</div>
          <div className="font-display text-3xl">{minimum}</div>
        </div>
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-muted">
            Your best
          </div>
          <div className="font-display text-3xl">{best ?? '–'}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-stone/30 rounded-2xl p-3 pt-8 border-b-[14px] border-stone">
        {pegs.map((rings, i) => (
          <button
            key={String(String(i))}
            type="button"
            onClick={() => clickPeg(i)}
            aria-label={`Pillar ${i + 1}, ${rings.length} rings${held === i ? ', ring lifted' : ''}`}
            className={`relative h-[clamp(220px,52vw,320px)] flex flex-col-reverse items-center rounded-xl
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-torch
                ${held === i ? 'bg-torch/10' : 'hover:bg-white/5'}`}
          >
            <span className="absolute bottom-0 top-4 w-[8%] min-w-[8px] rounded-t-full bg-stone shadow-[inset_-3px_0_0_rgba(0,0,0,.3)]" />
            {rings.map((size, k) => {
              const lifted = held === i && k === rings.length - 1;
              return (
                <span
                  key={String(String(size))}
                  className="relative z-10 h-[clamp(18px,4.4vw,26px)] rounded-full transition-transform duration-150
                      shadow-[inset_0_-4px_0_rgba(0,0,0,.25),0_2px_0_rgba(0,0,0,.4)]"
                  style={{
                    width: `${28 + (size / count) * 70}%`,
                    background: RING_COLORS[(size - 1) % RING_COLORS.length],
                    transform: lifted ? 'translateY(-40px)' : 'none',
                  }}
                />
              );
            })}
          </button>
        ))}
      </div>

      <p className="text-center font-display text-2xl min-h-[36px]" aria-live="polite">
        {solved
          ? moves === minimum
            ? 'Flawless. The temple doors open.'
            : `Done in ${moves} moves. The perfect solution takes ${minimum}.`
          : demo
            ? 'Watch the ancient method…'
            : held !== null
              ? 'Choose a pillar to place the ring.'
              : 'Tap a pillar to lift its top ring.'}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {[3, 4, 5, 6, 7, 8].map((n) => (
          <button
            key={String(String(n))}
            type="button"
            onClick={() => restart(n)}
            className={`w-11 h-11 rounded-full border-2 border-torch font-display text-lg
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink
                ${count === n ? 'bg-torch text-bg' : 'text-torch'}`}
            aria-label={`${n} rings`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => restart()}
          className="rounded-full border-2 border-muted px-4 font-semibold"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={showMe}
          className="rounded-full border-2 border-muted px-4 font-semibold"
        >
          Show me
        </button>
      </div>

      <p className="text-center text-sm text-muted">
        Keys 1, 2 and 3 select the pillars.
      </p>
    </main>
  );
}
export default App;
