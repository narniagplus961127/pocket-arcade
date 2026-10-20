import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function clack() {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const length = Math.floor(audioCtx.sampleRate * 0.05);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    source.buffer = buffer;
    source.connect(filter).connect(audioCtx.destination);
    source.start(now);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Rules ----------

const SIZE = 15;
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Returns the five winning indexes if `player` has five in a row through `index`.
function winningLine(board, index, player) {
  const r0 = Math.floor(index / SIZE);
  const c0 = index % SIZE;
  for (const [dr, dc] of DIRS) {
    const line = [index];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === player) {
        line.push(r * SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

// ---------- Computer opponent ----------
// Scores each empty point by the lines it would make for both sides.

function lineScore(count, openEnds) {
  if (count >= 5) return 1000000;
  if (openEnds === 0) return 0;
  const table = {
    4: openEnds === 2 ? 50000 : 6000,
    3: openEnds === 2 ? 3000 : 300,
    2: openEnds === 2 ? 200 : 30,
    1: openEnds === 2 ? 10 : 2,
  };
  return table[count] || 0;
}

function pointScore(board, index, player) {
  const r0 = Math.floor(index / SIZE);
  const c0 = index % SIZE;
  let total = 0;
  for (const [dr, dc] of DIRS) {
    let count = 1;
    let openEnds = 0;
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === player) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === 0)
        openEnds++;
    }
    total += lineScore(count, openEnds);
  }
  return total;
}

function computerMove(board, level) {
  const empty = [];
  board.forEach((v, i) => {
    if (v === 0) empty.push(i);
  });
  if (empty.length === SIZE * SIZE) return Math.floor((SIZE * SIZE) / 2);

  // Only consider points near existing stones.
  const near = empty.filter((i) => {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] !== 0)
          return true;
      }
    }
    return false;
  });
  const defense = [0.6, 0.9, 1.05][level];
  const noise = [400, 60, 5][level];
  let best = near[0];
  let bestScore = -Infinity;
  for (const i of near) {
    const attack = pointScore(board, i, 2);
    const block = pointScore(board, i, 1) * defense;
    const s = attack + block + Math.random() * noise;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

// ---------- App ----------

const STAR_POINTS = [
  3 * SIZE + 3,
  3 * SIZE + 11,
  7 * SIZE + 7,
  11 * SIZE + 3,
  11 * SIZE + 11,
];
const LEVELS = ['Apprentice', 'Dan', 'Master'];
function App() {
  usePageStyles(styles, 'Five Stones');

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
  const [board, setBoard] = useState(() => Array(SIZE * SIZE).fill(0));
  const [turn, setTurn] = useState(1);
  const [level, setLevel] = useState(1);
  const [winLine, setWinLine] = useState(null);
  const [last, setLast] = useState(null);
  const [record, setRecord] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('five-stones-record')) || {
          won: 0,
          lost: 0,
        }
      );
    } catch (e) {
      return {
        won: 0,
        lost: 0,
      };
    }
  });
  const over = Boolean(winLine) || board.every((v) => v !== 0);
  const saveRecord = (next) => {
    setRecord(next);
    try {
      localStorage.setItem('five-stones-record', String(JSON.stringify(next)));
    } catch (e) {
      // Storage may be unavailable.
    }
  };
  const place = (index, player) => {
    const next = [...board];
    next[index] = player;
    setBoard(next);
    setLast(index);
    clack();
    const line = winningLine(next, index, player);
    if (line) {
      setWinLine(line);
      saveRecord(
        player === 1
          ? {
              ...record,
              won: record.won + 1,
            }
          : {
              ...record,
              lost: record.lost + 1,
            },
      );
      return;
    }
    setTurn(player === 1 ? 2 : 1);
  };
  const click = (i) => {
    if (turn !== 1 || over || board[i] !== 0) return;
    place(i, 1);
  };
  useEffect(() => {
    if (turn !== 2 || over) return undefined;
    const id = setTimeout(() => place(computerMove(board, level), 2), 380);
    return () => clearTimeout(id);
  }, [turn, over, board]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setBoard(Array(SIZE * SIZE).fill(0));
    setTurn(1);
    setWinLine(null);
    setLast(null);
  };
  const winner = winLine ? board[winLine[0]] : 0;
  const status = winLine
    ? winner === 1
      ? 'Five in a row. You win.'
      : 'White completes five. The master bows.'
    : over
      ? 'The board is full: a draw.'
      : turn === 1
        ? 'Black to play: your move.'
        : 'White considers…';
  return (
    <main className="font-body max-w-[1000px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
      <div className="bg-kaya p-[3%] rounded-md shadow-[0_18px_40px_rgba(0,0,0,.25)]">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          }}
        >
          {board.map((v, i) => {
            const r = Math.floor(i / SIZE);
            const c = i % SIZE;
            const inWin = winLine && winLine.includes(i);
            return (
              <button
                key={String(String(i))}
                type="button"
                onClick={() => click(i)}
                aria-label={`Point ${String.fromCharCode(65 + c)}${SIZE - r}${v === 1 ? ', black' : v === 2 ? ', white' : ''}`}
                className="relative aspect-square min-w-0 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {/* Grid lines through the centre of each cell */}
                <span
                  className={`absolute top-1/2 h-px bg-grid ${c === 0 ? 'left-1/2' : 'left-0'} ${c === SIZE - 1 ? 'right-1/2' : 'right-0'}`}
                />
                <span
                  className={`absolute left-1/2 w-px bg-grid ${r === 0 ? 'top-1/2' : 'top-0'} ${r === SIZE - 1 ? 'bottom-1/2' : 'bottom-0'}`}
                />
                {STAR_POINTS.includes(i) && (
                  <span className="absolute left-1/2 top-1/2 w-[22%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-grid" />
                )}
                {v === 0 && !over && turn === 1 && (
                  <span className="absolute inset-[8%] rounded-full bg-black/0 group-hover:bg-black/25" />
                )}
                {v !== 0 && (
                  <span
                    className={`absolute inset-[6%] rounded-full
                        ${v === 1 ? 'bg-[radial-gradient(circle_at_35%_30%,#555,#0d0d0d_60%)]' : 'bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d6d1c4_70%)]'}
                        shadow-[0_2px_2px_rgba(0,0,0,.4)]
                        ${inWin ? 'ring-[3px] ring-accent' : ''}`}
                  />
                )}
                {last === i && !inWin && (
                  <span
                    className={`absolute left-1/2 top-1/2 w-[24%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full ${v === 1 ? 'bg-white/70' : 'bg-black/50'}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[clamp(36px,9vw,52px)] leading-none">
            Five Stones
          </h1>
          <p className="text-muted mt-2">
            Gomoku. Place black and white stones in turn. The first to make an unbroken
            line of five wins.
          </p>
        </div>

        <p className="font-display text-xl min-h-[30px]" aria-live="polite">
          {status}
        </p>

        <div className="flex gap-6">
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Won
            </div>
            <div className="font-display text-3xl">{record.won}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Lost
            </div>
            <div className="font-display text-3xl">{record.lost}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {LEVELS.map((name, i) => (
            <button
              key={String(String(name))}
              type="button"
              onClick={() => restart(i)}
              className={`rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                  ${level === i ? 'bg-ink text-bg' : ''}`}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => restart()}
            className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold"
          >
            Clear the board
          </button>
        </div>

        <p className="text-sm text-muted leading-relaxed">
          You play black and move first. Lines can run across, down or diagonally. Watch
          for an open three or four, a line with space at both ends, because that's how
          most games are won and lost.
        </p>
      </aside>
    </main>
  );
}
export default App;
