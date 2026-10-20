import React, { useState, useRef, useEffect } from 'react';
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
// Each level is a 6×6 grid read row by row. 'A' is your red car (always horizontal, third row).
// Minimum move counts were found with a breadth-first search; a move slides one car any distance.

const LEVELS = [
  {
    moves: 3,
    grid: 'FFFIEH.DDIEHCAA..BCKJ.GBCKJ.GB.KJ.LL',
  },
  {
    moves: 5,
    grid: '.HDFF..HD.G.AAD.GE..BB.EC.....C.....',
  },
  {
    moves: 7,
    grid: 'JELLLCJEBBMCAAK.M.DDKFF.III....GG.HH',
  },
  {
    moves: 10,
    grid: 'HHH.FF.CCBBBAAE..G..E..G.DDD.G......',
  },
  {
    moves: 11,
    grid: 'EEEHH..FF.J.L.AAJCLBBKKC...GDDII.GMM',
  },
  {
    moves: 14,
    grid: 'HGGDE.H.CDE.AAC..K...BBK.IIIFF..JJLL',
  },
  {
    moves: 16,
    grid: '.KKIIIL.DDEHL.AAEHLFGGGH.FC.BB..CJJ.',
  },
  {
    moves: 18,
    grid: 'KK..B.FFLLBJ.AA..J..EGGJH.EDCCHIID..',
  },
  {
    moves: 19,
    grid: '..HECCD.HEKFDAA.KF.....BIIIJJB..GGG.',
  },
  {
    moves: 21,
    grid: 'HHJI.D..JIBDAAJIBDGG....E...FFE.CC..',
  },
];
const COLORS = [
  '#3d7be0',
  '#f2a516',
  '#2fb38a',
  '#9b59d0',
  '#e07a3d',
  '#4cc3d9',
  '#d94f8c',
  '#8fbf3a',
  '#6b6fd6',
  '#c9a227',
  '#3fa66b',
  '#e05c5c',
  '#5a8fd6',
  '#b07ad9',
  '#d98f3d',
];
function parseLevel(grid) {
  const cells: Record<string, number[]> = {};
  grid.split('').forEach((ch, i) => {
    if (ch === '.') return;
    (cells[ch] = cells[ch] || []).push(i);
  });
  return Object.entries(cells).map(([id, list], k) => {
    const horizontal = Math.floor(list[0] / 6) === Math.floor(list[1] / 6);
    return {
      id,
      r: Math.floor(list[0] / 6),
      c: list[0] % 6,
      len: list.length,
      horizontal,
      color: id === 'A' ? 'var(--hero)' : COLORS[k % COLORS.length],
    };
  });
}

function occupied(cars, exceptId) {
  const grid = Array(36).fill(false);
  cars.forEach((car) => {
    if (car.id === exceptId) return;
    for (let k = 0; k < car.len; k++)
      grid[(car.r + (car.horizontal ? 0 : k)) * 6 + car.c + (car.horizontal ? k : 0)] =
        true;
  });
  return grid;
}

// How far a car can slide backwards (negative) and forwards (positive).
function slideRange(cars, car) {
  const grid = occupied(cars, car.id);
  let min = 0;
  let max = 0;
  if (car.horizontal) {
    while (car.c + min - 1 >= 0 && !grid[car.r * 6 + car.c + min - 1]) min--;
    while (car.c + car.len + max <= 5 && !grid[car.r * 6 + car.c + car.len + max]) max++;
    if (car.id === 'A' && car.c + car.len + max === 6) max++; // red car can drive out of the exit
  } else {
    while (car.r + min - 1 >= 0 && !grid[(car.r + min - 1) * 6 + car.c]) min--;
    while (car.r + car.len + max <= 5 && !grid[(car.r + car.len + max) * 6 + car.c])
      max++;
  }
  return {
    min,
    max,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Traffic Jam');

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
  const [level, setLevel] = useState(() => {
    try {
      return Math.min(
        LEVELS.length - 1,
        Number(localStorage.getItem('traffic-jam-level')) || 0,
      );
    } catch (e) {
      return 0;
    }
  });
  const [cars, setCars] = useState(() => parseLevel(LEVELS[0].grid));
  const [moves, setMoves] = useState(0);
  const [drag, setDrag] = useState(null); // { id, startX, startY, offset, range }
  const [escaped, setEscaped] = useState(false);
  const boardRef = useRef(null);
  useEffect(() => {
    load(level);
  }, []);
  const load = (i) => {
    setLevel(i);
    setCars(parseLevel(LEVELS[i].grid));
    setMoves(0);
    setEscaped(false);
    setDrag(null);
    try {
      localStorage.setItem('traffic-jam-level', String(i));
    } catch (e) {
      /* storage unavailable */
    }
  };
  const cellSize = () =>
    boardRef.current ? boardRef.current.getBoundingClientRect().width / 6 : 60;
  const onDown = (e, car) => {
    if (escaped) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      id: car.id,
      startX: e.clientX,
      startY: e.clientY,
      offset: 0,
      range: slideRange(cars, car),
    });
  };
  const onMove = (e) => {
    if (!drag) return;
    const car = cars.find((c) => c.id === drag.id);
    const delta =
      (car.horizontal ? e.clientX - drag.startX : e.clientY - drag.startY) / cellSize();
    setDrag({
      ...drag,
      offset: Math.max(drag.range.min, Math.min(drag.range.max, delta)),
    });
  };
  const onUp = () => {
    if (!drag) return;
    const steps = Math.round(drag.offset);
    if (steps !== 0) {
      const next = cars.map((c) =>
        c.id === drag.id
          ? {
              ...c,
              r: c.r + (c.horizontal ? 0 : steps),
              c: c.c + (c.horizontal ? steps : 0),
            }
          : c,
      );
      setCars(next);
      setMoves((m) => m + 1);
      playTone(300 + Math.abs(steps) * 60, 0.07);
      const hero = next.find((c) => c.id === 'A');
      if (hero.c + hero.len > 6) {
        setEscaped(true);
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.2, 'triangle'), k * 100),
        );
        try {
          const key = `traffic-jam-best-${level}`;
          const best = Number(localStorage.getItem(key)) || Infinity;
          if (moves + 1 < best) localStorage.setItem(key, String(moves + 1));
        } catch (e) {
          // Storage may be unavailable.
        }
      }
    }
    setDrag(null);
  };

  // Keyboard: Tab to a car, then arrow keys slide it one bay.
  const onKey = (e, car) => {
    const dir = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
    }[e.key];
    if (!dir || escaped) return;
    const axisOk = car.horizontal
      ? ['ArrowLeft', 'ArrowRight'].includes(e.key)
      : ['ArrowUp', 'ArrowDown'].includes(e.key);
    if (!axisOk) return;
    e.preventDefault();
    const range = slideRange(cars, car);
    if ((dir < 0 && range.min < 0) || (dir > 0 && range.max > 0)) {
      const next = cars.map((c) =>
        c.id === car.id
          ? {
              ...c,
              r: c.r + (c.horizontal ? 0 : dir),
              c: c.c + (c.horizontal ? dir : 0),
            }
          : c,
      );
      setCars(next);
      setMoves((m) => m + 1);
      playTone(340, 0.06);
      const hero = next.find((c) => c.id === 'A');
      if (hero.c + hero.len > 6) setEscaped(true);
    }
  };
  let best = null;
  try {
    best = Number(localStorage.getItem(`traffic-jam-best-${level}`)) || null;
  } catch (e) {
    best = null;
  }
  return (
    <main className="font-body max-w-[1000px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
      <div className="relative bg-lot p-3 rounded-xl shadow-xl">
        {/* Exit marker on the right wall of the third row */}
        <div
          className="absolute right-0 top-[calc(12px+(100%-24px)*2/6)] h-[calc((100%-24px)/6)] w-3 bg-line rounded-l"
          aria-hidden="true"
        />
        <div
          ref={boardRef}
          className="relative aspect-square touch-none"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(242,209,75,.35) 2px, transparent 2px)',
            backgroundSize: 'calc(100% / 6) 100%',
          }}
        >
          {cars.map((car) => {
            const dragging = drag && drag.id === car.id;
            const off = dragging ? drag.offset : 0;
            const left = ((car.c + (car.horizontal ? off : 0)) / 6) * 100;
            const top = ((car.r + (car.horizontal ? 0 : off)) / 6) * 100;
            const isHero = car.id === 'A';
            return (
              <button
                key={String(String(car.id))}
                type="button"
                onPointerDown={(e) => onDown(e, car)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={(e) => onKey(e, car)}
                aria-label={`${isHero ? 'Your red car' : 'Car'}, ${car.horizontal ? 'horizontal' : 'vertical'}, length ${car.len}`}
                className={`absolute p-[1.2%] focus-visible:outline-none group ${dragging ? 'z-20' : 'z-10'}
                    ${escaped && isHero ? 'transition-all duration-700 !left-[110%]' : dragging ? '' : 'transition-all duration-150'}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${((car.horizontal ? car.len : 1) / 6) * 100}%`,
                  height: `${((car.horizontal ? 1 : car.len) / 6) * 100}%`,
                  cursor: car.horizontal ? 'ew-resize' : 'ns-resize',
                }}
              >
                <span
                  className="block w-full h-full rounded-[18%] shadow-[0_4px_0_rgba(0,0,0,.35)] relative group-focus-visible:ring-4 group-focus-visible:ring-line"
                  style={{
                    background: car.color,
                  }}
                >
                  {/* Windscreens */}
                  <span
                    className={`absolute bg-black/35 rounded-sm ${car.horizontal ? 'top-[18%] bottom-[18%] right-[14%] w-[16%]' : 'left-[18%] right-[18%] bottom-[14%] h-[16%]'}`}
                  />
                  <span
                    className={`absolute bg-black/25 rounded-sm ${car.horizontal ? 'top-[22%] bottom-[22%] left-[12%] w-[10%]' : 'left-[22%] right-[22%] top-[12%] h-[10%]'}`}
                  />
                  {isHero && (
                    <span className="absolute inset-0 flex items-center justify-center font-display text-white text-[clamp(12px,3vw,18px)]">
                      GO
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[clamp(44px,12vw,72px)] leading-none">
            Traffic <span className="text-hero">Jam</span>
          </h1>
          <p className="text-muted mt-1">
            Slide the other cars out of the way so the red car can drive out of the gap on
            the right.
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Car park
            </div>
            <div className="font-display text-3xl">
              {level + 1}/{LEVELS.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Moves
            </div>
            <div className="font-display text-3xl">{moves}</div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Par
            </div>
            <div className="font-display text-3xl">{LEVELS[level].moves}</div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold tracking-[.14em] uppercase text-muted">
              Best
            </div>
            <div className="font-display text-3xl">{best ?? '–'}</div>
          </div>
        </div>

        {escaped && (
          <div
            className="rounded-xl bg-hero/10 border-2 border-hero p-4 flex flex-col gap-2 items-start"
            role="status"
          >
            <p className="font-display text-2xl">
              {moves <= LEVELS[level].moves
                ? 'Out in the minimum number of moves!'
                : `Free in ${moves} moves. The shortest route is ${LEVELS[level].moves}.`}
            </p>
            {level < LEVELS.length - 1 && (
              <button
                type="button"
                onClick={() => load(level + 1)}
                className="rounded-full bg-hero text-white font-bold px-5 py-2.5"
              >
                Next car park
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load(level)}
            className="rounded-full border-2 border-ink px-4 py-2 font-bold"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => load(Math.max(0, level - 1))}
            disabled={level === 0}
            className="rounded-full border-2 border-ink px-4 py-2 font-bold disabled:opacity-40"
          >
            ← Easier
          </button>
          <button
            type="button"
            onClick={() => load(Math.min(LEVELS.length - 1, level + 1))}
            disabled={level === LEVELS.length - 1}
            className="rounded-full border-2 border-ink px-4 py-2 font-bold disabled:opacity-40"
          >
            Harder →
          </button>
        </div>

        <p className="text-sm text-muted leading-relaxed">
          Drag a car along its own direction. Cars can't turn or jump over each other. A
          move is one slide of any length. With a keyboard, Tab to a car and use the arrow
          keys.
        </p>
      </aside>
    </main>
  );
}
export default App;
