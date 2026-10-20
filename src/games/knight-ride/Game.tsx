import React, { useState, useMemo } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function hoof(freq = 300) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.09].forEach((delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + delay;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.06);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Rules ----------

const JUMPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
function knightMoves(n, index, visited) {
  const r = Math.floor(index / n);
  const c = index % n;
  const moves = [];
  for (const [dr, dc] of JUMPS) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n && !visited.has(rr * n + cc))
      moves.push(rr * n + cc);
  }
  return moves;
}

// Warnsdorff's rule: move to the square with the fewest onward moves.
function hintFor(n, current, visited) {
  const options = knightMoves(n, current, visited);
  let best = null;
  let bestCount = Infinity;
  for (const m of options) {
    const after = new Set(visited);
    after.add(m);
    const count = knightMoves(n, m, after).length;
    if (count < bestCount) {
      bestCount = count;
      best = m;
    }
  }
  return best;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Knight Ride');

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
  const [n, setN] = useState(6);
  const [path, setPath] = useState([]);
  const [hint, setHint] = useState(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const visited = useMemo(() => new Set(path), [path]);
  const current = path[path.length - 1];
  const options = current === undefined ? [] : knightMoves(n, current, visited);
  const complete = path.length === n * n;
  const stuck = current !== undefined && !complete && options.length === 0;
  const click = (i) => {
    if (complete) return;
    if (current === undefined) {
      setPath([i]);
      hoof(360);
      return;
    }
    if (!options.includes(i)) return;
    const next = [...path, i];
    setPath(next);
    setHint(null);
    hoof(260 + (next.length % 8) * 20);
    if (next.length === n * n) {
      try {
        const key = `knight-ride-${n}`;
        localStorage.setItem(key, String((Number(localStorage.getItem(key)) || 0) + 1));
      } catch (e) {
        // Storage may be unavailable.
      }
    }
  };
  const undo = () => {
    setPath(path.slice(0, -1));
    setHint(null);
  };
  const restart = (size = n) => {
    setN(size);
    setPath([]);
    setHint(null);
    setHintsUsed(0);
  };
  const showHint = () => {
    if (current === undefined || complete) return;
    setHint(hintFor(n, current, visited));
    setHintsUsed((h) => h + 1);
  };
  let tours = 0;
  try {
    tours = Number(localStorage.getItem(`knight-ride-${n}`)) || 0;
  } catch (e) {
    tours = 0;
  }
  return (
    <main className="font-body max-w-[1000px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
      <div className="p-3 bg-[#4a2a1a] rounded-md border-4 border-gold/60 shadow-2xl">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${n}, 1fr)`,
          }}
        >
          {Array.from({
            length: n * n,
          }).map((_, i) => {
            const r = Math.floor(i / n);
            const c = i % n;
            const dark = (r + c) % 2 === 1;
            const step = path.indexOf(i);
            const isCurrent = i === current;
            const isOption = options.includes(i);
            return (
              <button
                key={String(String(i))}
                type="button"
                onClick={() => click(i)}
                aria-label={`Square ${String.fromCharCode(97 + c)}${n - r}${step >= 0 ? `, visited at step ${step + 1}` : ''}`}
                className={`relative aspect-square min-w-0 flex items-center justify-center
                    ${dark ? 'bg-dark' : 'bg-light'}
                    ${isOption ? 'cursor-pointer' : current === undefined ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold`}
              >
                {step >= 0 && !isCurrent && (
                  <span
                    className={`font-display text-[clamp(11px,3vw,18px)] ${dark ? 'text-light/80' : 'text-dark'}`}
                  >
                    {step + 1}
                  </span>
                )}
                {step >= 0 && !isCurrent && (
                  <span className="absolute inset-0 bg-banner/25" />
                )}
                {isOption && (
                  <span
                    className={`absolute w-[30%] aspect-square rounded-full ${hint === i ? 'bg-gold ring-4 ring-gold/40' : 'bg-banner/70'}`}
                  />
                )}
                {isCurrent && (
                  <span className="text-[clamp(26px,8vw,52px)] leading-none text-banner drop-shadow-[0_2px_0_rgba(0,0,0,.3)]">
                    ♞
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="bg-banner px-5 py-4 rounded-sm shadow-xl [clip-path:polygon(0_0,100%_0,100%_85%,50%_100%,0_85%)] pb-8">
          <h1 className="font-display text-[clamp(36px,9vw,54px)] leading-none text-gold">
            Knight Ride
          </h1>
          <p className="mt-1 text-ink/90">
            Ride the knight to every square of the board, once each.
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <div className="text-xs tracking-[.2em] uppercase text-muted">Squares</div>
            <div className="font-display text-3xl">
              {path.length}/{n * n}
            </div>
          </div>
          <div>
            <div className="text-xs tracking-[.2em] uppercase text-muted">Tours done</div>
            <div className="font-display text-3xl">{tours}</div>
          </div>
          <div>
            <div className="text-xs tracking-[.2em] uppercase text-muted">Hints</div>
            <div className="font-display text-3xl">{hintsUsed}</div>
          </div>
        </div>

        <p className="font-display text-xl min-h-[30px]" aria-live="polite">
          {complete
            ? 'A full tour! The court applauds.'
            : stuck
              ? 'The knight has nowhere left to go. Undo, or start afresh.'
              : current === undefined
                ? 'Choose any square to begin.'
                : 'Ride to one of the marked squares.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!path.length}
            className="rounded border-2 border-gold px-4 py-2 font-semibold disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={showHint}
            disabled={current === undefined || complete}
            className="rounded border-2 border-gold px-4 py-2 font-semibold disabled:opacity-40"
          >
            Hint
          </button>
          <button
            type="button"
            onClick={() => restart()}
            className="rounded bg-gold text-bg px-4 py-2 font-semibold"
          >
            Start afresh
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[5, 6, 7, 8].map((size) => (
            <button
              key={String(String(size))}
              type="button"
              onClick={() => restart(size)}
              className={`rounded border px-3 py-1.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold
                  ${n === size ? 'bg-gold text-bg border-gold' : 'border-muted'}`}
            >
              {size}×{size}
            </button>
          ))}
        </div>

        <p className="text-muted leading-relaxed">
          The knight moves in an L: two squares one way, then one square to the side. On a
          5×5 board, tours only exist from some squares, such as the corners and the
          centre. The hint uses Warnsdorff's rule: go where you'll have the fewest onward
          moves.
        </p>
      </aside>
    </main>
  );
}
export default App;
