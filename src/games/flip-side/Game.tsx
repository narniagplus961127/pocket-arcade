import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'sine', volume = 0.06) {
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
// 1 = pearl (you), -1 = coal (computer), 0 = empty

const DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
function startBoard() {
  const b = Array(64).fill(0);
  b[27] = -1;
  b[28] = 1;
  b[35] = 1;
  b[36] = -1;
  return b;
}

// Squares that would flip if `player` plays at `index`.
function flipsFor(board, index, player) {
  if (board[index] !== 0) return [];
  const r0 = Math.floor(index / 8);
  const c0 = index % 8;
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === -player) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (
      line.length &&
      r >= 0 &&
      r < 8 &&
      c >= 0 &&
      c < 8 &&
      board[r * 8 + c] === player
    ) {
      flips.push(...line);
    }
  }
  return flips;
}

function legalMoves(board, player) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    if (flipsFor(board, i, player).length) moves.push(i);
  }
  return moves;
}

function play(board, index, player) {
  const next = [...board];
  next[index] = player;
  flipsFor(board, index, player).forEach((i) => {
    next[i] = player;
  });
  return next;
}

// ---------- Computer opponent ----------

// Classic positional weights: corners are gold, squares next to corners are dangerous.
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120, -20, -40, -5, -5, -5, -5, -40, -20, 20, -5, 15, 3, 3,
  15, -5, 20, 5, -5, 3, 3, 3, 3, -5, 5, 5, -5, 3, 3, 3, 3, -5, 5, 20, -5, 15, 3, 3, 15,
  -5, 20, -20, -40, -5, -5, -5, -5, -40, -20, 120, -20, 20, 5, 5, 20, -20, 120,
];
function evaluate(board) {
  let positional = 0;
  for (let i = 0; i < 64; i++) positional += WEIGHTS[i] * board[i];
  const mobility = legalMoves(board, -1).length - legalMoves(board, 1).length;
  return -positional + mobility * 5; // from the computer's (-1) side
}

function search(board, depth, alpha, beta, player) {
  const moves = legalMoves(board, player);
  if (depth === 0) return evaluate(board);
  if (!moves.length) {
    if (!legalMoves(board, -player).length) {
      const diff = board.reduce((a, b) => a + b, 0);
      return diff < 0 ? 10000 : diff > 0 ? -10000 : 0;
    }
    return search(board, depth - 1, alpha, beta, -player);
  }
  if (player === -1) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(play(board, m, -1), depth - 1, alpha, beta, 1));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(play(board, m, 1), depth - 1, alpha, beta, -1));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function computerMove(board, depth) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of legalMoves(board, -1)) {
    const s =
      search(play(board, m, -1), depth - 1, -Infinity, Infinity, 1) + Math.random();
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}
const LEVELS = [
  {
    name: 'Easy',
    depth: 1,
  },
  {
    name: 'Medium',
    depth: 3,
  },
  {
    name: 'Hard',
    depth: 5,
  },
];

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Flip Side');

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
  const [turn, setTurn] = useState(1);
  const [level, setLevel] = useState(1);
  const [flipped, setFlipped] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [message, setMessage] = useState(
    'You play pearl. Place a disc that traps a line of coal.',
  );
  const [over, setOver] = useState(false);
  const moves = useMemo(
    () => (turn === 1 && !over ? legalMoves(board, 1) : []),
    [board, turn, over],
  );
  const pearls = board.filter((v) => v === 1).length;
  const coals = board.filter((v) => v === -1).length;
  const advance = (next, mover) => {
    const other = -mover;
    if (legalMoves(next, other).length) {
      setTurn(other);
      return;
    }
    if (legalMoves(next, mover).length) {
      setMessage(
        other === 1
          ? 'You have no legal move, so you pass.'
          : 'The computer has no move and passes.',
      );
      setTurn(mover);
      return;
    }
    setOver(true);
    const p = next.filter((v) => v === 1).length;
    const c = next.filter((v) => v === -1).length;
    setMessage(
      p > c
        ? `You win, ${p} to ${c}!`
        : p < c
          ? `The computer wins, ${c} to ${p}.`
          : `A draw at ${p} each.`,
    );
    if (p > c)
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.2, 'triangle'), i * 110),
      );
  };
  const place = (index, player) => {
    const flips = flipsFor(board, index, player);
    const next = play(board, index, player);
    setBoard(next);
    setFlipped(flips);
    setLastMove(index);
    flips.forEach((_, i) => setTimeout(() => playTone(500 + i * 40, 0.05), i * 40));
    advance(next, player);
  };
  const onClick = (i) => {
    if (turn !== 1 || over || !moves.includes(i)) return;
    setMessage('');
    place(i, 1);
  };
  useEffect(() => {
    if (turn !== -1 || over) return undefined;
    const id = setTimeout(() => {
      const m = computerMove(board, LEVELS[level].depth);
      if (m !== null) place(m, -1);
    }, 550);
    return () => clearTimeout(id);
  }, [turn, over, board]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setBoard(startBoard());
    setTurn(1);
    setFlipped([]);
    setLastMove(null);
    setOver(false);
    setMessage('You play pearl. Place a disc that traps a line of coal.');
  };
  const share = (pearls / (pearls + coals)) * 100;
  return (
    <main className="font-body max-w-[540px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(40px,11vw,60px)] leading-[.9] tracking-tight">
            Flip Side
          </h1>
          <p className="text-muted mt-1">
            Reversi against the house. Most discs at the end wins.
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <span className="font-display text-2xl tabular-nums w-10 text-right">
          {pearls}
        </span>
        <div
          className="flex-1 h-3 rounded-full bg-coal overflow-hidden"
          aria-label={`Pearl ${pearls}, coal ${coals}`}
        >
          <div
            className="h-full bg-pearl border-r-2 border-hint transition-all duration-300"
            style={{
              width: `${share}%`,
            }}
          />
        </div>
        <span className="font-display text-2xl tabular-nums w-10">{coals}</span>
      </div>

      <div className="bg-board p-2 rounded-2xl shadow-xl">
        <div className="grid grid-cols-8 gap-1">
          {board.map((v, i) => {
            const legal = moves.includes(i);
            return (
              <button
                key={String(String(i))}
                type="button"
                onClick={() => onClick(i)}
                aria-label={`Square ${i + 1}${v === 1 ? ', pearl' : v === -1 ? ', coal' : legal ? ', legal move' : ''}`}
                className="aspect-square min-w-0 rounded-md bg-cell flex items-center justify-center [perspective:300px]
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-pearl"
              >
                {v !== 0 && (
                  <span
                    className={`disc w-[82%] aspect-square rounded-full shadow-[0_3px_0_rgba(0,0,0,.35)]
                        ${v === 1 ? 'bg-pearl' : 'bg-coal'} ${flipped.includes(i) ? 'flipping' : ''}
                        ${lastMove === i ? 'ring-2 ring-offset-2 ring-offset-cell ring-pearl/60' : ''}`}
                  />
                )}
                {v === 0 && legal && (
                  <span className="w-[26%] aspect-square rounded-full bg-hint" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="font-semibold min-h-[24px]" aria-live="polite">
        {message || (turn === 1 ? 'Your move.' : 'The computer is thinking…')}
      </p>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l, i) => (
          <button
            key={String(String(l.name))}
            type="button"
            onClick={() => restart(i)}
            className={`rounded-full border-2 border-ink px-4 py-2 text-sm font-bold
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-board
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

      <p className="text-sm text-muted leading-relaxed">
        Every move has to sandwich at least one line of the computer's discs between your
        new disc and one you already have. All the sandwiched discs flip to your colour.
        Corners can never be flipped back, so they're worth fighting for.
      </p>
    </main>
  );
}
export default App;
