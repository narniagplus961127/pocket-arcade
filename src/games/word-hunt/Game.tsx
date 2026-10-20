import React, { useState, useEffect, useMemo } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.1, type = 'triangle', volume = 0.05) {
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

// ---------- Puzzle generation ----------

const SIZE = 12;
const THEMES = {
  Desert: [
    'CACTUS',
    'CAMEL',
    'DUNE',
    'OASIS',
    'MIRAGE',
    'SCORPION',
    'CANYON',
    'LIZARD',
    'MESA',
    'SANDSTORM',
    'VULTURE',
    'COYOTE',
  ],
  Ocean: [
    'CORAL',
    'WHALE',
    'SHARK',
    'LAGOON',
    'OYSTER',
    'SQUID',
    'TIDE',
    'KELP',
    'DOLPHIN',
    'REEF',
    'ANCHOR',
    'PLANKTON',
  ],
  Forest: [
    'MAPLE',
    'BADGER',
    'FERN',
    'ACORN',
    'OWL',
    'MOSS',
    'BIRCH',
    'FOX',
    'TRAIL',
    'PINECONE',
    'WOODPECKER',
    'DEER',
  ],
  Kitchen: [
    'KETTLE',
    'SPOON',
    'GRATER',
    'OVEN',
    'TOASTER',
    'PANTRY',
    'WHISK',
    'LADLE',
    'SKILLET',
    'BLENDER',
    'APRON',
    'TEACUP',
  ],
};
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];
const HIGHLIGHTS = [
  '#f6b93b',
  '#6fd3b0',
  '#ff8fa3',
  '#8fb8ff',
  '#c3a6ff',
  '#ffd166',
  '#7fe0e8',
  '#ffa66b',
  '#b7e36b',
  '#f2a0e0',
];
function makePuzzle(themeName) {
  const grid = Array(SIZE * SIZE).fill('');
  const placed = [];
  const words = [...THEMES[themeName]].sort(() => Math.random() - 0.5).slice(0, 9);
  for (const word of words) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
      const r0 = Math.floor(Math.random() * SIZE);
      const c0 = Math.floor(Math.random() * SIZE);
      const cells = [];
      let ok = true;
      for (let k = 0; k < word.length; k++) {
        const r = r0 + dr * k;
        const c = c0 + dc * k;
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
          ok = false;
          break;
        }
        const existing = grid[r * SIZE + c];
        if (existing && existing !== word[k]) {
          ok = false;
          break;
        }
        cells.push(r * SIZE + c);
      }
      if (ok) {
        cells.forEach((i, k) => {
          grid[i] = word[k];
        });
        placed.push({
          word,
          cells,
        });
        break;
      }
    }
  }
  const letters = 'ABCDEFGHIJKLMNOPRSTUVWY';
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) grid[i] = letters[Math.floor(Math.random() * letters.length)];
  }
  return {
    grid,
    placed,
  };
}

// Cells on the straight line from a to b, or null if not a straight line.
function lineBetween(a, b) {
  const r1 = Math.floor(a / SIZE);
  const c1 = a % SIZE;
  const r2 = Math.floor(b / SIZE);
  const c2 = b % SIZE;
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  const steps = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  if (!(r1 === r2 || c1 === c2 || Math.abs(r2 - r1) === Math.abs(c2 - c1))) return null;
  return Array.from(
    {
      length: steps + 1,
    },
    (_, k) => (r1 + dr * k) * SIZE + (c1 + dc * k),
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Word Hunt');

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
  const [theme, setTheme] = useState('Desert');
  const [puzzle, setPuzzle] = useState(() => makePuzzle('Desert'));
  const [found, setFound] = useState([]); // { word, cells, color }
  const [anchor, setAnchor] = useState(null);
  const [hover, setHover] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const done = found.length === puzzle.placed.length;
  useEffect(() => {
    if (done) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [done, puzzle]);
  const preview = useMemo(
    () =>
      anchor !== null && hover !== null
        ? lineBetween(anchor, hover) || [anchor]
        : anchor !== null
          ? [anchor]
          : [],
    [anchor, hover],
  );
  const cellColor = useMemo(() => {
    const map = {};
    found.forEach((f) =>
      f.cells.forEach((c) => {
        map[c] = f.color;
      }),
    );
    return map;
  }, [found]);
  const tryLine = (cells) => {
    if (!cells || cells.length < 2) return false;
    const text = cells.map((i) => puzzle.grid[i]).join('');
    const match = puzzle.placed.find(
      (p) =>
        !found.some((f) => f.word === p.word) &&
        (p.word === text || p.word === [...text].reverse().join('')),
    );
    if (match) {
      const color = HIGHLIGHTS[found.length % HIGHLIGHTS.length];
      const next = [
        ...found,
        {
          word: match.word,
          cells,
          color,
        },
      ];
      setFound(next);
      playTone(660 + next.length * 40, 0.15);
      if (next.length === puzzle.placed.length) {
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.22), 200 + i * 110),
        );
        try {
          const key = `word-hunt-best-${theme}`;
          const best = Number(localStorage.getItem(key)) || Infinity;
          if (seconds < best) localStorage.setItem(key, String(seconds));
        } catch (e) {
          // Storage may be unavailable.
        }
      }
      return true;
    }
    playTone(200, 0.08, 'sine', 0.03);
    return false;
  };

  // Pointer: press on the first letter, drag to the last, release. Tapping two letters also works.
  const onDown = (i) => {
    if (done) return;
    if (anchor !== null && !dragging) {
      tryLine(lineBetween(anchor, i));
      setAnchor(null);
      setHover(null);
      return;
    }
    setAnchor(i);
    setHover(i);
    setDragging(true);
  };
  const onEnter = (i) => {
    if (anchor !== null) setHover(i);
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (hover !== null && hover !== anchor) {
      tryLine(lineBetween(anchor, hover));
      setAnchor(null);
      setHover(null);
    }
  };
  useEffect(() => {
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  });
  const onMove = (e) => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const index = el && el.dataset && el.dataset.index;
    if (index !== undefined) setHover(Number(index));
  };
  const newPuzzle = (name = theme) => {
    setTheme(name);
    setPuzzle(makePuzzle(name));
    setFound([]);
    setAnchor(null);
    setHover(null);
    setSeconds(0);
  };
  let best = null;
  try {
    best = Number(localStorage.getItem(`word-hunt-best-${theme}`)) || null;
  } catch (e) {
    best = null;
  }
  return (
    <main className="font-body max-w-[980px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
      <div
        className="bg-board rounded-2xl p-3 shadow-lg select-none touch-none"
        onPointerMove={onMove}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
        }}
      >
        {puzzle.grid.map((ch, i) => {
          const inPreview = preview.includes(i);
          const color = cellColor[i];
          return (
            <button
              key={String(String(i))}
              type="button"
              data-index={i}
              onPointerDown={(e) => {
                e.preventDefault();
                onDown(i);
              }}
              onPointerEnter={() => onEnter(i)}
              aria-label={`Letter ${ch}`}
              className="aspect-square min-w-0 flex items-center justify-center font-display text-[clamp(13px,3.6vw,22px)] rounded-md
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              style={{
                background: inPreview ? 'var(--accent)' : color || 'transparent',
                color: inPreview ? '#fff' : color ? '#1d2a2c' : undefined,
              }}
            >
              {ch}
            </button>
          );
        })}
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[clamp(32px,8vw,46px)] leading-none">
            Word Hunt
          </h1>
          <p className="text-muted mt-2">
            Nine words are hidden across, down, diagonally and even backwards. Drag from
            the first letter to the last, or tap both ends.
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Found
            </div>
            <div className="font-display text-2xl">
              {found.length}/{puzzle.placed.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Time
            </div>
            <div className="font-display text-2xl tabular-nums">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Best
            </div>
            <div className="font-display text-2xl tabular-nums">
              {best
                ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}`
                : '–'}
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5" aria-label="Field log">
          {puzzle.placed.map((p) => {
            const hit = found.find((f) => f.word === p.word);
            return (
              <li
                key={String(String(p.word))}
                className={`font-semibold tracking-wide ${hit ? 'line-through text-muted' : ''}`}
              >
                {hit && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                    style={{
                      background: hit.color,
                    }}
                  />
                )}
                {p.word}
              </li>
            );
          })}
        </ul>

        {done && (
          <p className="font-display text-xl text-accent" role="status">
            Every word found in {seconds} seconds!
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {Object.keys(THEMES).map((name) => (
            <button
              key={String(String(name))}
              type="button"
              onClick={() => newPuzzle(name)}
              className={`rounded-full border-2 border-ink px-3.5 py-1.5 text-sm font-bold
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                  ${theme === name ? 'bg-ink text-bg' : ''}`}
            >
              {name}
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
export default App;
