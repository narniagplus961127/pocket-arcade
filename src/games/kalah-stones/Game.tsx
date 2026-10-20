import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.07, type = 'sine', volume = 0.05) {
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

// ---------- Rules ----------
// Indexes 0–5: your pits (left to right), 6: your store,
// 7–12: computer's pits (right to left from your view), 13: computer's store.

const MY_STORE = 6;
const AI_STORE = 13;
const STONES_PER_PIT = 4;
const startBoard = () =>
  [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0].map((v, i) =>
    i % 7 === 6 ? 0 : STONES_PER_PIT,
  );
const myPits = [0, 1, 2, 3, 4, 5];
const aiPits = [7, 8, 9, 10, 11, 12];

// Sows the stones from `pit`. Returns the new board, whether the mover goes again, and the path taken.
function sow(board, pit, mover) {
  const next = [...board];
  let stones = next[pit];
  next[pit] = 0;
  let index = pit;
  const path = [];
  const skip = mover === 'me' ? AI_STORE : MY_STORE;
  while (stones > 0) {
    index = (index + 1) % 14;
    if (index === skip) continue;
    next[index]++;
    stones--;
    path.push(index);
  }
  const ownStore = mover === 'me' ? MY_STORE : AI_STORE;
  const ownPits = mover === 'me' ? myPits : aiPits;
  let captured = 0;

  // Landing in an empty pit of your own captures the stones opposite.
  if (ownPits.includes(index) && next[index] === 1) {
    const opposite = 12 - index;
    if (next[opposite] > 0) {
      captured = next[opposite] + 1;
      next[ownStore] += captured;
      next[opposite] = 0;
      next[index] = 0;
    }
  }
  return {
    board: next,
    again: index === ownStore,
    path,
    captured,
  };
}

function isOver(board) {
  return myPits.every((i) => board[i] === 0) || aiPits.every((i) => board[i] === 0);
}

// Sweeps remaining stones into each owner's store.
function finalize(board) {
  const next = [...board];
  myPits.forEach((i) => {
    next[MY_STORE] += next[i];
    next[i] = 0;
  });
  aiPits.forEach((i) => {
    next[AI_STORE] += next[i];
    next[i] = 0;
  });
  return next;
}

// ---------- Computer opponent ----------

function search(board, depth, maximizing, alpha, beta) {
  if (isOver(board)) {
    const f = finalize(board);
    return (f[AI_STORE] - f[MY_STORE]) * 100;
  }
  if (depth === 0) return board[AI_STORE] - board[MY_STORE];
  const pits = (maximizing ? aiPits : myPits).filter((i) => board[i] > 0);
  if (maximizing) {
    let best = -Infinity;
    for (const p of pits) {
      const r = sow(board, p, 'ai');
      best = Math.max(best, search(r.board, depth - 1, r.again, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const p of pits) {
    const r = sow(board, p, 'me');
    best = Math.min(best, search(r.board, depth - 1, !r.again, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function computerMove(board, depth) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of aiPits.filter((i) => board[i] > 0)) {
    const r = sow(board, p, 'ai');
    const s =
      search(r.board, depth - 1, r.again, -Infinity, Infinity) + Math.random() * 0.2;
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}
const LEVELS = [
  {
    name: 'Novice',
    depth: 2,
  },
  {
    name: 'Elder',
    depth: 5,
  },
  {
    name: 'Griot',
    depth: 8,
  },
];

// ---------- Components ----------

const STONE_COLORS = ['#8fd3c1', '#f2c46d', '#e88b7a', '#a8b8f0', '#d7e8a0', '#f1f1e6'];

// Draws up to 18 stones in a pit with a stable scatter pattern, plus a count.
function Stones({ count, seed }) {
  const shown = Math.min(count, 18);
  return (
    <span className="absolute inset-0">
      {Array.from({
        length: shown,
      }).map((_, k) => {
        const angle = (k * 2.4 + seed) % (Math.PI * 2);
        const radius = 12 + ((k * 7) % 26);
        return (
          <span
            key={String(String(k))}
            className="absolute w-[22%] aspect-square rounded-full shadow-[inset_-2px_-2px_0_rgba(0,0,0,.2)]"
            style={{
              left: `${39 + Math.cos(angle) * radius}%`,
              top: `${39 + Math.sin(angle) * radius}%`,
              background: STONE_COLORS[(k + seed) % STONE_COLORS.length],
            }}
          />
        );
      })}
    </span>
  );
}

function Pit({ index, count, active, highlight, onClick = undefined, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!active}
      aria-label={label}
      className={`relative aspect-square min-w-0 rounded-full bg-pit shadow-[inset_0_6px_10px_rgba(0,0,0,.5)]
          ${active ? 'cursor-pointer hover:ring-4 hover:ring-glow/70' : ''}
          ${highlight ? 'ring-4 ring-glow' : ''}
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-glow`}
    >
      <Stones count={count} seed={index} />
      <span className="absolute -bottom-0 right-1 font-display text-sm text-[#f3e7d7] bg-black/40 rounded px-1">
        {count}
      </span>
    </button>
  );
}

function Store({ count, label }) {
  return (
    <div
      aria-label={label}
      className="relative rounded-[999px] bg-pit shadow-[inset_0_6px_10px_rgba(0,0,0,.5)] row-span-2 flex items-end justify-center pb-2 min-h-[140px]"
    >
      <Stones count={count} seed={3} />
      <span className="relative font-display text-xl text-[#f3e7d7] bg-black/40 rounded px-1.5">
        {count}
      </span>
    </div>
  );
}

function App() {
  usePageStyles(styles, 'Kalah Stones');

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
  const [board, setBoard] = useState(startBoard);
  const [turn, setTurn] = useState('me');
  const [level, setLevel] = useState(1);
  const [trail, setTrail] = useState([]);
  const [message, setMessage] = useState(
    'Your turn. Pick one of your pits along the bottom.',
  );
  const [over, setOver] = useState(false);
  const resolve = (result, mover) => {
    setTrail(result.path);
    result.path.forEach((_, i) => setTimeout(() => playTone(600 + i * 25), i * 45));
    let next = result.board;
    if (isOver(next)) {
      next = finalize(next);
      setBoard(next);
      setOver(true);
      const me = next[MY_STORE];
      const ai = next[AI_STORE];
      setMessage(
        me > ai
          ? `You win, ${me} to ${ai}!`
          : me < ai
            ? `The computer wins, ${ai} to ${me}.`
            : `A draw at ${me} each.`,
      );
      if (me > ai)
        [523, 659, 784].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.2, 'triangle'), 400 + i * 110),
        );
      return;
    }
    setBoard(next);
    const who = mover === 'me' ? 'You' : 'The computer';
    if (result.captured) setMessage(`${who} captured ${result.captured} stones!`);
    else if (result.again)
      setMessage(`${who} landed in the store and go${mover === 'me' ? '' : 'es'} again.`);
    else setMessage('');
    setTurn(result.again ? mover : mover === 'me' ? 'ai' : 'me');
  };
  const pick = (pit) => {
    if (turn !== 'me' || over || board[pit] === 0) return;
    resolve(sow(board, pit, 'me'), 'me');
  };
  useEffect(() => {
    if (turn !== 'ai' || over) return undefined;
    const id = setTimeout(() => {
      const p = computerMove(board, LEVELS[level].depth);
      if (p !== null) resolve(sow(board, p, 'ai'), 'ai');
    }, 750);
    return () => clearTimeout(id);
  }, [turn, over, board]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setBoard(startBoard());
    setTurn('me');
    setTrail([]);
    setOver(false);
    setMessage('Your turn. Pick one of your pits along the bottom.');
  };
  return (
    <main className="font-body max-w-[820px] mx-auto py-6 flex flex-col gap-4">
      <header>
        <h1 className="font-display text-[clamp(36px,9vw,54px)] leading-none">
          Kalah Stones
        </h1>
        <p className="text-muted mt-1">
          A mancala game. Sow stones around the board and gather more than the computer.
        </p>
      </header>

      <div
        className="bg-wood rounded-[40px] p-3 sm:p-5 shadow-2xl grid grid-cols-[1fr_6fr_1fr] gap-3 items-stretch"
        style={{
          backgroundImage:
            'repeating-linear-gradient(100deg, rgba(255,255,255,.04) 0 6px, transparent 6px 18px)',
        }}
      >
        <Store
          count={board[AI_STORE]}
          label={`Computer's store, ${board[AI_STORE]} stones`}
        />

        <div className="grid grid-rows-2 gap-3">
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {[12, 11, 10, 9, 8, 7].map((i) => (
              <Pit
                key={String(String(i))}
                index={i}
                count={board[i]}
                active={false}
                highlight={trail.includes(i)}
                label={`Computer pit, ${board[i]} stones`}
              />
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {myPits.map((i) => (
              <Pit
                key={String(String(i))}
                index={i}
                count={board[i]}
                active={turn === 'me' && !over && board[i] > 0}
                highlight={trail.includes(i)}
                onClick={() => pick(i)}
                label={`Your pit ${i + 1}, ${board[i]} stones`}
              />
            ))}
          </div>
        </div>

        <Store count={board[MY_STORE]} label={`Your store, ${board[MY_STORE]} stones`} />
      </div>

      <div className="flex justify-between text-sm text-muted">
        <span>← Computer's store</span>
        <span>Your store →</span>
      </div>

      <p className="font-display text-xl min-h-[32px]" aria-live="polite">
        {message || (turn === 'me' ? 'Your turn.' : 'The computer is sowing…')}
      </p>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l, i) => (
          <button
            key={String(String(l.name))}
            type="button"
            onClick={() => restart(i)}
            className={`rounded-full border-2 border-ink px-4 py-2 text-sm font-bold
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-wood
                ${level === i ? 'bg-ink text-bg' : ''}`}
          >
            {l.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => restart()}
          className="rounded-full border-2 border-ink px-4 py-2 text-sm font-bold ml-auto"
        >
          New game
        </button>
      </div>

      <p className="text-sm text-muted leading-relaxed max-w-[70ch]">
        Pick up every stone in one of your pits and drop them one at a time,
        anticlockwise, into the following pits and your own store. Your last stone lands
        in your store: go again. Your last stone lands in one of your own empty pits:
        capture it plus everything in the pit opposite. When one row is empty, the game
        ends and each side keeps what's left.
      </p>
    </main>
  );
}
export default App;
