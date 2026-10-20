import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'triangle', volume = 0.05) {
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

// ---------- Board model ----------
// N×N pens. Horizontal fences: (N+1) rows × N. Vertical fences: N rows × (N+1).
// A fence is identified by a string key: 'h-r-c' or 'v-r-c'.

const N = 5;
function allFences() {
  const list = [];
  for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) list.push(`h-${r}-${c}`);
  for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) list.push(`v-${r}-${c}`);
  return list;
}
const FENCES = allFences();

// The four fences around pen (r, c).
const sidesOf = (r, c) => [
  `h-${r}-${c}`,
  `h-${r + 1}-${c}`,
  `v-${r}-${c}`,
  `v-${r}-${c + 1}`,
];

// The pens (one or two) that a fence borders.
function pensOf(key) {
  const [kind, rs, cs] = key.split('-');
  const r = Number(rs);
  const c = Number(cs);
  const pens = [];
  if (kind === 'h') {
    if (r > 0) pens.push([r - 1, c]);
    if (r < N) pens.push([r, c]);
  } else {
    if (c > 0) pens.push([r, c - 1]);
    if (c < N) pens.push([r, c]);
  }
  return pens;
}
const sidesBuilt = (built, r, c) => sidesOf(r, c).filter((k) => built.has(k)).length;

// ---------- Computer opponent ----------

function chooseFence(built, level) {
  const open = FENCES.filter((k) => !built.has(k));

  // 1. Close any pen we can.
  const closing = open.filter((k) =>
    pensOf(k).some(([r, c]) => sidesBuilt(built, r, c) === 3),
  );
  if (closing.length && (level > 0 || Math.random() < 0.7)) return closing[0];

  // 2. Avoid building the third side of a pen (that hands the opponent a pen).
  const safe = open.filter((k) =>
    pensOf(k).every(([r, c]) => sidesBuilt(built, r, c) < 2),
  );
  if (safe.length && level > 0) return safe[Math.floor(Math.random() * safe.length)];

  // 3. Forced to give something away: give the smallest chain we can.
  if (level === 2) {
    let best = open[0];
    let bestCost = Infinity;
    for (const k of open) {
      const cost = chainCost(new Set([...built, k]));
      if (cost < bestCost) {
        bestCost = cost;
        best = k;
      }
    }
    return best;
  }
  return open[Math.floor(Math.random() * open.length)];
}

// How many pens the opponent could chain-capture after this position.
function chainCost(built) {
  const b = new Set(built);
  let taken = 0;
  let found = true;
  while (found) {
    found = false;
    for (const k of FENCES) {
      if (b.has(k)) continue;
      if (pensOf(k).some(([r, c]) => sidesBuilt(b, r, c) === 3)) {
        b.add(k);
        taken += pensOf(k).filter(([r, c]) => sidesBuilt(b, r, c) === 4).length;
        found = true;
      }
    }
  }
  return taken;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Fence Builders');

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
  const [built, setBuilt] = useState(() => new Set());
  const [owners, setOwners] = useState({}); // 'r-c' -> 'me' | 'ai'
  const [builtBy, setBuiltBy] = useState({});
  const [turn, setTurn] = useState('me');
  const [level, setLevel] = useState(1);
  const [lastFence, setLastFence] = useState(null);
  const mine = Object.values(owners).filter((o) => o === 'me').length;
  const theirs = Object.values(owners).filter((o) => o === 'ai').length;
  const over = mine + theirs === N * N;
  const build = (key, who) => {
    const next = new Set(built);
    next.add(key);
    const closed = pensOf(key).filter(([r, c]) => sidesBuilt(next, r, c) === 4);
    const nextOwners = {
      ...owners,
    };
    closed.forEach(([r, c]) => {
      nextOwners[`${r}-${c}`] = who;
    });
    setBuilt(next);
    setOwners(nextOwners);
    setBuiltBy({
      ...builtBy,
      [key]: who,
    });
    setLastFence(key);
    if (closed.length) {
      playTone(who === 'me' ? 784 : 330, 0.18);
      if (Object.keys(nextOwners).length === N * N) {
        const m = Object.values(nextOwners).filter((o) => o === 'me').length;
        if (m > (N * N) / 2)
          [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.2), 200 + i * 110),
          );
      }
      // Closing a pen earns another turn, so the turn stays.
      if (who === 'ai') setTurn('ai-again');
    } else {
      playTone(who === 'me' ? 520 : 400, 0.05, 'square', 0.03);
      setTurn(who === 'me' ? 'ai' : 'me');
    }
  };
  const click = (key) => {
    if (turn !== 'me' || built.has(key) || over) return;
    build(key, 'me');
  };
  useEffect(() => {
    if ((turn !== 'ai' && turn !== 'ai-again') || over) return undefined;
    const id = setTimeout(() => build(chooseFence(built, level), 'ai'), 420);
    return () => clearTimeout(id);
  }, [turn, built, over]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setBuilt(new Set());
    setOwners({});
    setBuiltBy({});
    setTurn('me');
    setLastFence(null);
  };
  const status = over
    ? mine > theirs
      ? `You fenced ${mine} pens to ${theirs}. Your flock wins!`
      : `The neighbour fenced ${theirs} to ${mine}.`
    : turn === 'me'
      ? 'Your turn: build one fence. Close a pen to build again.'
      : 'Your neighbour is building…';

  // Rendered on a (2N+1) grid: even rows/cols are posts and fences, odd are pens.
  const cells = [];
  for (let gr = 0; gr <= 2 * N; gr++) {
    for (let gc = 0; gc <= 2 * N; gc++) {
      const key = `${gr}-${gc}`;
      if (gr % 2 === 0 && gc % 2 === 0) {
        cells.push(
          <div
            key={String(String(key))}
            className="bg-post rounded-[3px] w-full h-full"
          />,
        );
      } else if (gr % 2 === 0) {
        const f = `h-${gr / 2}-${(gc - 1) / 2}`;
        cells.push(
          <FenceButton
            key={String(String(key))}
            id={f}
            horizontal
            built={built}
            builtBy={builtBy}
            last={lastFence}
            onClick={click}
            myTurn={turn === 'me'}
          />,
        );
      } else if (gc % 2 === 0) {
        const f = `v-${(gr - 1) / 2}-${gc / 2}`;
        cells.push(
          <FenceButton
            key={String(String(key))}
            id={f}
            built={built}
            builtBy={builtBy}
            last={lastFence}
            onClick={click}
            myTurn={turn === 'me'}
          />,
        );
      } else {
        const owner = owners[`${(gr - 1) / 2}-${(gc - 1) / 2}`];
        cells.push(
          <div key={String(String(key))} className="flex items-center justify-center">
            {owner && (
              <span
                className="text-[clamp(22px,7vw,40px)] leading-none select-none"
                aria-label={owner === 'me' ? 'your pen' : "neighbour's pen"}
              >
                {owner === 'me' ? '🐑' : '🐐'}
              </span>
            )}
          </div>,
        );
      }
    }
  }
  const template = Array.from(
    {
      length: 2 * N + 1,
    },
    (_, i) => (i % 2 === 0 ? '10px' : '1fr'),
  ).join(' ');
  return (
    <main className="font-body max-w-[540px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(38px,10vw,54px)] leading-none">
            Fence Builders
          </h1>
          <p className="text-muted mt-1">Dots and boxes on the farm.</p>
        </div>
        <div className="flex gap-4 font-display text-2xl">
          <span className="text-mine">You {mine}</span>
          <span className="text-theirs">Neighbour {theirs}</span>
        </div>
      </header>

      <div
        className="bg-field rounded-2xl p-3 aspect-square shadow-inner"
        style={{
          display: 'grid',
          gridTemplateColumns: template,
          gridTemplateRows: template,
        }}
      >
        {cells}
      </div>

      <p className="font-display text-lg min-h-[28px]" aria-live="polite">
        {status}
      </p>

      <div className="flex flex-wrap gap-2">
        {['Gentle', 'Canny', 'Cunning'].map((name, i) => (
          <button
            key={String(String(name))}
            type="button"
            onClick={() => restart(i)}
            className={`rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-mine
                ${level === i ? 'bg-ink text-bg' : ''}`}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => restart()}
          className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold ml-auto"
        >
          New field
        </button>
      </div>

      <p className="text-sm text-muted leading-relaxed">
        Take turns building one fence between neighbouring posts. Whoever builds the
        fourth side of a pen claims it and builds again. Watch out for building the third
        side of a pen, because that hands it to your neighbour.
      </p>
    </main>
  );
}

function FenceButton({ id, horizontal = false, built, builtBy, last, onClick, myTurn }) {
  const isBuilt = built.has(id);
  const who = builtBy[id];
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      disabled={isBuilt || !myTurn}
      aria-label={`${horizontal ? 'Horizontal' : 'Vertical'} fence${isBuilt ? ', built' : ''}`}
      className="group relative flex items-center justify-center min-w-0 min-h-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mine"
    >
      <span
        className={`rounded-full transition-all
            ${horizontal ? 'h-[6px] w-full' : 'w-[6px] h-full'}
            ${isBuilt ? (who === 'me' ? 'bg-mine' : 'bg-theirs') : 'bg-post/15 group-enabled:group-hover:bg-post/50'}
            ${last === id ? 'ring-2 ring-offset-1 ring-post/40' : ''}`}
      />
    </button>
  );
}
export default App;
