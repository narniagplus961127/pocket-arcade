import React, { useState, useRef, useMemo, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.05, type = 'sine', volume = 0.04) {
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

// ---------- Puzzle generation ----------
// 1. Build a random path that visits every socket (a Hamiltonian path), randomised with "backbite" moves.
// 2. Cut it into segments. Each segment's two ends become a pair of plugs.
// Every puzzle is therefore solvable by filling the whole board.

const CORD_COLORS = [
  '#e63946',
  '#2a9d8f',
  '#f4a261',
  '#3a86ff',
  '#9d4edd',
  '#ffbe0b',
  '#43aa8b',
  '#ff70a6',
  '#8d6e63',
  '#00b4d8',
];
function neighbors(n, i) {
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

function hamiltonianPath(n) {
  // Start from a serpentine path.
  let path = [];
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) path.push(r * n + (r % 2 ? n - 1 - k : k));
  }
  // Backbite: repeatedly attach an end to a neighbour and reverse the loop that forms.
  for (let step = 0; step < n * n * 40; step++) {
    if (Math.random() < 0.5) path.reverse();
    const end = path[path.length - 1];
    const options = neighbors(n, end).filter((x) => x !== path[path.length - 2]);
    const pick = options[Math.floor(Math.random() * options.length)];
    const j = path.indexOf(pick);
    path = [...path.slice(0, j + 1), ...path.slice(j + 1).reverse()];
  }
  return path;
}

function makePuzzle(n) {
  const path = hamiltonianPath(n);
  const pairs = Math.min(CORD_COLORS.length, n + Math.floor(Math.random() * 2));
  // Choose cut points so every segment is at least 3 long.
  const cuts = new Set<number>();
  while (cuts.size < pairs - 1) {
    const cut = 3 + Math.floor(Math.random() * (path.length - 5));
    const ok = [...cuts].every((c) => Math.abs(c - cut) >= 3);
    if (ok) cuts.add(cut);
  }
  const sorted = [0, ...[...cuts].sort((a, b) => a - b), path.length];
  const ends = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const segment = path.slice(sorted[k], sorted[k + 1]);
    ends.push({
      color: CORD_COLORS[k],
      a: segment[0],
      b: segment[segment.length - 1],
    });
  }
  return {
    n,
    ends,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Switchboard');

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
  const [size, setSize] = useState(5);
  const [puzzle, setPuzzle] = useState(() => makePuzzle(5));
  const [paths, setPaths] = useState<Record<string, number[]>>({}); // color -> [cells]
  const [drawing, setDrawing] = useState(null); // color being drawn
  const [moves, setMoves] = useState(0);
  const boardRef = useRef(null);
  const n = puzzle.n;
  const endpointAt = useMemo(() => {
    const map = {};
    puzzle.ends.forEach((e) => {
      map[e.a] = e;
      map[e.b] = e;
    });
    return map;
  }, [puzzle]);
  const owner = useMemo(() => {
    const map = {};
    Object.entries(paths).forEach(([color, cells]) =>
      cells.forEach((c) => {
        map[c] = color;
      }),
    );
    return map;
  }, [paths]);
  const isConnected = (end) => {
    const p = paths[end.color] || [];
    return (
      p.length > 1 &&
      ((p[0] === end.a && p[p.length - 1] === end.b) ||
        (p[0] === end.b && p[p.length - 1] === end.a))
    );
  };
  const connectedCount = puzzle.ends.filter(isConnected).length;
  const filled = Object.keys(owner).length;
  const solved = connectedCount === puzzle.ends.length && filled === n * n;
  useEffect(() => {
    if (!solved) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.2, 'triangle', 0.05), i * 100),
    );
    try {
      const key = `switchboard-solved-${n}`;
      localStorage.setItem(key, String((Number(localStorage.getItem(key)) || 0) + 1));
    } catch (e) {
      // Storage may be unavailable.
    }
  }, [solved]);
  const start = (cell) => {
    if (solved) return;
    const end = endpointAt[cell];
    if (end) {
      setPaths((p) => ({
        ...p,
        [end.color]: [cell],
      }));
      setDrawing(end.color);
      playTone(500);
      return;
    }
    const color = owner[cell];
    if (color) {
      setPaths((p) => ({
        ...p,
        [color]: p[color].slice(0, p[color].indexOf(cell) + 1),
      }));
      setDrawing(color);
    }
  };
  const extend = (cell) => {
    if (!drawing) return;
    const path = paths[drawing] || [];
    const last = path[path.length - 1];
    if (cell === last) return;

    // Moving back over your own cord shortens it.
    const back = path.indexOf(cell);
    if (back >= 0) {
      setPaths((p) => ({
        ...p,
        [drawing]: path.slice(0, back + 1),
      }));
      return;
    }
    if (!neighbors(n, last).includes(cell)) return;

    // Already reached the matching plug? Stop extending.
    const startEnd = endpointAt[path[0]];
    if (path.length > 1 && endpointAt[last] === startEnd) return;
    const end = endpointAt[cell];
    if (end && end.color !== drawing) return; // can't plug into another colour's socket

    setPaths((p) => {
      const next = {
        ...p,
      };
      // Cutting through another cord trims it back.
      const other = owner[cell];
      if (other && other !== drawing)
        next[other] = p[other].slice(0, p[other].indexOf(cell));
      next[drawing] = [...path, cell];
      return next;
    });
    playTone(end ? 880 : 380 + path.length * 12, end ? 0.12 : 0.03);
    if (end) setMoves((m) => m + 1);
  };
  const onPointerMove = (e) => {
    if (!drawing) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const idx = el && el.closest && el.closest<HTMLElement>('[data-cell]');
    if (idx) extend(Number(idx.dataset.cell));
  };
  const stop = () => setDrawing(null);
  const newPuzzle = (s = size) => {
    setSize(s);
    setPuzzle(makePuzzle(s));
    setPaths({});
    setDrawing(null);
    setMoves(0);
  };

  // Draws each cord as a thick rounded line between cell centres.
  const cords = Object.entries(paths).map(([color, cells]) => {
    if (cells.length < 2) return null;
    const points = cells
      .map((c) => `${(c % n) + 0.5},${Math.floor(c / n) + 0.5}`)
      .join(' ');
    return (
      <polyline
        key={String(String(color))}
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="0.36"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });
  return (
    <main className="font-body max-w-[980px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
      <div className="bg-panel rounded-2xl p-3 shadow-xl border-8 border-[#7a5a3a]">
        <div
          ref={boardRef}
          className="relative aspect-square touch-none select-none"
          onPointerMove={onPointerMove}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
        >
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${n}, 1fr)`,
            }}
          >
            {Array.from({
              length: n * n,
            }).map((_, i) => {
              const end = endpointAt[i];
              const color = owner[i];
              return (
                <div
                  key={String(String(i))}
                  data-cell={i}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.releasePointerCapture?.(e.pointerId);
                    start(i);
                  }}
                  className="flex items-center justify-center"
                  style={{
                    background: color ? `${color}22` : 'transparent',
                  }}
                >
                  <span className="w-[30%] aspect-square rounded-full bg-socket shadow-[inset_0_2px_3px_rgba(0,0,0,.4)]" />
                </div>
              );
            })}
          </div>

          <svg
            viewBox={`0 0 ${n} ${n}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            {cords}
            {puzzle.ends.map((e) =>
              [e.a, e.b].map((cell) => (
                <g key={String(String(`${e.color}-${cell}`))}>
                  <circle
                    cx={(cell % n) + 0.5}
                    cy={Math.floor(cell / n) + 0.5}
                    r="0.34"
                    fill={e.color}
                    stroke="#00000033"
                    strokeWidth="0.04"
                  />
                  <circle
                    cx={(cell % n) + 0.42}
                    cy={Math.floor(cell / n) + 0.42}
                    r="0.09"
                    fill="#ffffff88"
                  />
                  {isConnected(e) && (
                    <circle
                      cx={(cell % n) + 0.5}
                      cy={Math.floor(cell / n) + 0.5}
                      r="0.42"
                      fill="none"
                      stroke={e.color}
                      strokeWidth="0.05"
                    />
                  )}
                </g>
              )),
            )}
          </svg>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="text-[clamp(40px,11vw,62px)] leading-none font-extrabold">
            Switchboard
          </h1>
          <p className="text-muted mt-1">
            Connect every pair of matching plugs with a cord. Cords can't cross, and when
            you're done every socket on the board must be used.
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-muted">
              Lines
            </div>
            <div className="text-3xl font-extrabold">
              {connectedCount}/{puzzle.ends.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-muted">
              Sockets
            </div>
            <div className="text-3xl font-extrabold">
              {Math.round((filled / (n * n)) * 100)}%
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-muted">
              Plugs in
            </div>
            <div className="text-3xl font-extrabold">{moves}</div>
          </div>
        </div>

        {solved ? (
          <p className="text-2xl font-extrabold text-[#2a9d8f]" role="status">
            Every call is connected!
          </p>
        ) : connectedCount === puzzle.ends.length ? (
          <p className="text-lg font-semibold">
            All lines are connected, but some sockets are still empty. Reroute a cord to
            fill them.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {[5, 6, 7, 8].map((s) => (
            <button
              key={String(String(s))}
              type="button"
              onClick={() => newPuzzle(s)}
              className={`rounded-full border-2 border-ink px-3.5 py-1.5 font-semibold ${size === s ? 'bg-ink text-bg' : ''}`}
            >
              {s}×{s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPaths({})}
            className="rounded-full border-2 border-ink px-3.5 py-1.5 font-semibold"
          >
            Unplug all
          </button>
          <button
            type="button"
            onClick={() => newPuzzle()}
            className="rounded-full bg-ink text-bg px-3.5 py-1.5 font-semibold"
          >
            New board
          </button>
        </div>

        <p className="text-sm text-muted leading-relaxed">
          Press on a plug and drag through neighbouring sockets to run a cord. Drag back
          to shorten it, or start again from either end. Running a cord through another
          one cuts the other back.
        </p>
      </aside>
    </main>
  );
}
export default App;
