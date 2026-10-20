import React, { useState, useEffect, useMemo } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'triangle', volume = 0.06) {
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
// Board is 64 squares. 'r'/'R' = your men/kings (move up), 'b'/'B' = club champion (moves down).

const isMine = (p) => p === 'r' || p === 'R';
const isTheirs = (p) => p === 'b' || p === 'B';
const isKing = (p) => p === 'R' || p === 'B';
const rowOf = (i) => Math.floor(i / 8);
const colOf = (i) => i % 8;
function startBoard() {
  const board = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const dark = (rowOf(i) + colOf(i)) % 2 === 1;
    if (!dark) continue;
    if (rowOf(i) < 3) board[i] = 'b';
    if (rowOf(i) > 4) board[i] = 'r';
  }
  return board;
}

function directions(piece) {
  if (isKing(piece))
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  return isMine(piece)
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ];
}
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crowns = (piece, square) =>
  (piece === 'r' && rowOf(square) === 0) || (piece === 'b' && rowOf(square) === 7);

// All capture sequences starting from `from`. Each is { from, to, path, captured }.
function jumpsFrom(board, from, piece, path = [from], captured = []) {
  const results = [];
  const enemy = isMine(piece) ? isTheirs : isMine;
  for (const [dr, dc] of directions(piece)) {
    const r = rowOf(from) + dr;
    const c = colOf(from) + dc;
    const r2 = r + dr;
    const c2 = c + dc;
    if (!onBoard(r2, c2)) continue;
    const over = r * 8 + c;
    const land = r2 * 8 + c2;
    if (!enemy(board[over]) || captured.includes(over) || board[land]) continue;
    const nextPath = [...path, land];
    const nextCaptured = [...captured, over];

    // A man that reaches the far row is crowned and the move ends there.
    if (crowns(piece, land)) {
      results.push({
        from: path[0],
        to: land,
        path: nextPath,
        captured: nextCaptured,
      });
      continue;
    }
    const temp = [...board];
    temp[from] = null;
    temp[land] = piece;
    const further = jumpsFrom(temp, land, piece, nextPath, nextCaptured);
    if (further.length) results.push(...further);
    else
      results.push({
        from: path[0],
        to: land,
        path: nextPath,
        captured: nextCaptured,
      });
  }
  return results;
}

function allMoves(board, side) {
  const owns = side === 'r' ? isMine : isTheirs;
  const jumps = [];
  const steps = [];
  board.forEach((piece, i) => {
    if (!owns(piece)) return;
    jumps.push(...jumpsFrom(board, i, piece));
    for (const [dr, dc] of directions(piece)) {
      const r = rowOf(i) + dr;
      const c = colOf(i) + dc;
      if (onBoard(r, c) && !board[r * 8 + c]) {
        steps.push({
          from: i,
          to: r * 8 + c,
          path: [i, r * 8 + c],
          captured: [],
        });
      }
    }
  });
  return jumps.length ? jumps : steps; // captures are compulsory
}

function doMove(board, move) {
  const next = [...board];
  let piece = next[move.from];
  next[move.from] = null;
  move.captured.forEach((sq) => {
    next[sq] = null;
  });
  if (crowns(piece, move.to)) piece = piece.toUpperCase();
  next[move.to] = piece;
  return next;
}

// ---------- Champion AI (minimax with alpha-beta) ----------

function evaluate(board) {
  let score = 0;
  board.forEach((p, i) => {
    if (!p) return;
    const value = isKing(p) ? 1.7 : 1 + (isTheirs(p) ? rowOf(i) : 7 - rowOf(i)) * 0.04;
    score += isTheirs(p) ? value : -value;
  });
  return score;
}

function minimax(board, depth, alpha, beta, maximizing) {
  const side = maximizing ? 'b' : 'r';
  const moves = allMoves(board, side);
  if (!moves.length) return maximizing ? -100 : 100;
  if (depth === 0) return evaluate(board);
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, minimax(doMove(board, m), depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, minimax(doMove(board, m), depth - 1, alpha, beta, true));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

function championMove(board, depth) {
  const moves = allMoves(board, 'b');
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const s =
      minimax(doMove(board, m), depth - 1, -Infinity, Infinity, false) +
      Math.random() * 0.05;
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

// ---------- Components ----------

function Piece({ piece }) {
  const mine = isMine(piece);
  return (
    <span
      className={`w-[78%] aspect-square rounded-full flex items-center justify-center shadow-[0_4px_0_rgba(0,0,0,.45)]
          ${mine ? 'bg-[radial-gradient(circle_at_35%_30%,#ff8b77,#b8291c_65%)]' : 'bg-[radial-gradient(circle_at_35%_30%,#6a6a6a,#141414_65%)]'}`}
    >
      <span className="w-[62%] aspect-square rounded-full border-2 border-white/20 flex items-center justify-center text-brass text-[clamp(12px,3.6vw,22px)]">
        {isKing(piece) ? '♛' : ''}
      </span>
    </span>
  );
}
const LEVELS = [
  {
    name: 'Newcomer',
    depth: 2,
  },
  {
    name: 'Member',
    depth: 4,
  },
  {
    name: 'Champion',
    depth: 6,
  },
];
function App() {
  usePageStyles(styles, 'Draughts Club');

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
  const [turn, setTurn] = useState('r');
  const [picked, setPicked] = useState(null);
  const [level, setLevel] = useState(1);
  const [lastMove, setLastMove] = useState(null);
  const [winner, setWinner] = useState(null);
  const myMoves = useMemo(
    () => (turn === 'r' ? allMoves(board, 'r') : []),
    [board, turn],
  );
  const movable = new Set(myMoves.map((m) => m.from));
  const targets = picked !== null ? myMoves.filter((m) => m.from === picked) : [];
  const countSide = (owns) => board.filter(owns).length;
  const checkEnd = (next, sideToMove) => {
    if (!allMoves(next, sideToMove).length) {
      setWinner(sideToMove === 'r' ? 'b' : 'r');
      if (sideToMove === 'b')
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.2), i * 110),
        );
      else playTone(150, 0.5, 'sawtooth', 0.05);
      return true;
    }
    return false;
  };
  const clickSquare = (i) => {
    if (turn !== 'r' || winner) return;
    if (movable.has(i)) {
      setPicked(i);
      playTone(600, 0.04, 'sine', 0.03);
      return;
    }
    const move = targets.find((m) => m.to === i);
    if (!move) return;
    const next = doMove(board, move);
    setBoard(next);
    setPicked(null);
    setLastMove(move);
    playTone(move.captured.length ? 300 : 440);
    if (!checkEnd(next, 'b')) setTurn('b');
  };

  // Champion's turn
  useEffect(() => {
    if (turn !== 'b' || winner) return undefined;
    const id = setTimeout(() => {
      const move = championMove(board, LEVELS[level].depth);
      const next = doMove(board, move);
      setBoard(next);
      setLastMove(move);
      playTone(move.captured.length ? 260 : 380);
      if (!checkEnd(next, 'r')) setTurn('r');
    }, 500);
    return () => clearTimeout(id);
  }, [turn, winner]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setBoard(startBoard());
    setTurn('r');
    setPicked(null);
    setLastMove(null);
    setWinner(null);
  };
  const mustJump = myMoves.some((m) => m.captured.length);
  const status = winner
    ? winner === 'r'
      ? 'Checkmate of a sort. You have beaten the club!'
      : 'The club takes the game. Another round?'
    : turn === 'r'
      ? mustJump
        ? 'You must capture. Jumps are compulsory.'
        : 'Your move. Pick a red piece.'
      : 'The club is considering…';
  return (
    <main className="font-body max-w-[1000px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
      <div className="bg-wood p-3 rounded-lg shadow-2xl border-4 border-brass/40">
        <div className="grid grid-cols-8 rounded overflow-hidden">
          {board.map((piece, i) => {
            const dark = (rowOf(i) + colOf(i)) % 2 === 1;
            const isTarget = targets.some((m) => m.to === i);
            const isPicked = picked === i;
            const wasMoved = lastMove && (lastMove.from === i || lastMove.to === i);
            return (
              <button
                key={String(String(i))}
                type="button"
                onClick={() => clickSquare(i)}
                disabled={!dark}
                aria-label={`Square ${String.fromCharCode(97 + colOf(i))}${8 - rowOf(i)}${piece ? `, ${isMine(piece) ? 'your' : 'club'} ${isKing(piece) ? 'king' : 'man'}` : ''}`}
                className={`relative aspect-square min-w-0 flex items-center justify-center
                    ${dark ? 'bg-dark' : 'bg-light'}
                    ${isPicked ? 'ring-4 ring-inset ring-brass' : ''}
                    ${wasMoved && dark ? 'after:absolute after:inset-0 after:bg-brass/15' : ''}
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass`}
              >
                {piece && <Piece piece={piece} />}
                {isTarget && (
                  <span className="absolute w-1/3 aspect-square rounded-full bg-brass/70" />
                )}
                {piece && movable.has(i) && !isPicked && turn === 'r' && (
                  <span className="absolute inset-1 rounded-full border-2 border-brass/50 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[clamp(32px,8vw,44px)] leading-tight text-brass">
            Draughts Club
          </h1>
          <p className="text-muted mt-1">
            The members' table is open. You play red and move first.
          </p>
        </div>

        <p className="font-display text-lg min-h-[56px]" aria-live="polite">
          {status}
        </p>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-black/25 p-3">
            <div className="text-[11px] tracking-[.16em] uppercase text-muted">
              Your pieces
            </div>
            <div className="font-display text-3xl">{countSide(isMine)}</div>
          </div>
          <div className="rounded-lg bg-black/25 p-3">
            <div className="text-[11px] tracking-[.16em] uppercase text-muted">
              The club's
            </div>
            <div className="font-display text-3xl">{countSide(isTheirs)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l, i) => (
            <button
              key={String(String(l.name))}
              type="button"
              onClick={() => restart(i)}
              className={`rounded border border-brass px-3 py-2 text-sm font-semibold
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink
                  ${level === i ? 'bg-brass text-room' : 'text-ink'}`}
            >
              {l.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => restart()}
            className="rounded border border-muted px-3 py-2 text-sm font-semibold"
          >
            New game
          </button>
        </div>

        <div className="text-sm text-muted leading-relaxed border-t border-brass/30 pt-3">
          <p className="font-semibold text-ink mb-1">House rules</p>
          <p>
            Men move diagonally forward one square. Captures are compulsory, and you must
            keep jumping while you can. Reach the far row to be crowned. Kings move both
            ways. Take every piece, or leave the club with no legal move, to win.
          </p>
        </div>
      </aside>
    </main>
  );
}
export default App;
