import React, { useState, useEffect } from 'react';
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

// ---------- Rules ----------

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// Returns 'X', 'O', 'draw' or null for a 9-cell array.
function winnerOf(cells) {
  for (const [a, b, c] of LINES) {
    if (
      cells[a] &&
      cells[a] !== 'draw' &&
      cells[a] === cells[b] &&
      cells[a] === cells[c]
    ) {
      return cells[a];
    }
  }
  return cells.every(Boolean) ? 'draw' : null;
}

function legalMoves(boards, owners, active) {
  const moves = [];
  const targets =
    active !== null && !owners[active] ? [active] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (const b of targets) {
    if (owners[b]) continue;
    boards[b].forEach((cell, c) => {
      if (!cell) moves.push([b, c]);
    });
  }
  return moves;
}

function applyMove(state, [b, c], player) {
  const boards = state.boards.map((board) => [...board]);
  boards[b][c] = player;
  const owners = [...state.owners];
  owners[b] = winnerOf(boards[b]);
  const next = owners[c] ? null : c;
  return {
    boards,
    owners,
    active: next,
  };
}

// ---------- Teacher AI ----------

// Scores a move from the AI's (O) point of view with simple, readable heuristics.
function scoreMove(state, move, level) {
  const [b, c] = move;
  const after = applyMove(state, move, 'O');
  let score = 0;
  if (winnerOf(after.owners) === 'O') return 10000;
  if (after.owners[b] === 'O' && !state.owners[b]) score += 120;

  // Block X from taking this small board.
  const blocked = [...state.boards[b]];
  blocked[c] = 'X';
  if (winnerOf(blocked) === 'X') score += 90;

  // Where does this send the opponent?
  const replies = legalMoves(after.boards, after.owners, after.active);
  let worst = 0;
  for (const reply of replies) {
    const afterReply = applyMove(after, reply, 'X');
    if (winnerOf(afterReply.owners) === 'X') worst = Math.max(worst, 5000);
    else if (afterReply.owners[reply[0]] === 'X' && !after.owners[reply[0]])
      worst = Math.max(worst, 100);
  }
  score -= worst;
  if (after.active === null) score -= 30; // giving a free choice is risky

  if (c === 4) score += 8;
  if ([0, 2, 6, 8].includes(c)) score += 4;
  if (b === 4) score += 6;
  return score + Math.random() * (level === 0 ? 120 : level === 1 ? 25 : 4);
}

function chooseMove(state, level) {
  const moves = legalMoves(state.boards, state.owners, state.active);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const s = scoreMove(state, move, level);
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best;
}

// ---------- Components ----------

const fresh = () => ({
  boards: Array.from(
    {
      length: 9,
    },
    () => Array(9).fill(null),
  ),
  owners: Array(9).fill(null),
  active: null,
});
function Mark({ player, big = false }) {
  const color = player === 'X' ? 'text-blue' : 'text-red';
  return (
    <span
      className={`font-hand leading-none ${color} ${big ? 'text-[clamp(60px,18vw,110px)]' : 'text-[clamp(16px,4.6vw,26px)]'}`}
    >
      {player === 'X' ? '✕' : '○'}
    </span>
  );
}

function App() {
  usePageStyles(styles, 'Grid of Grids');

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
  const [state, setState] = useState(fresh);
  const [turn, setTurn] = useState('X');
  const [level, setLevel] = useState(1);
  const [result, setResult] = useState(null);
  const [tally, setTally] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('grid-of-grids-tally')) || {
          you: 0,
          teacher: 0,
          draws: 0,
        }
      );
    } catch (e) {
      return {
        you: 0,
        teacher: 0,
        draws: 0,
      };
    }
  });
  const legal = legalMoves(state.boards, state.owners, state.active);
  const isLegal = (b, c) => legal.some(([lb, lc]) => lb === b && lc === c);
  const finish = (outcome) => {
    setResult(outcome);
    const key = outcome === 'X' ? 'you' : outcome === 'O' ? 'teacher' : 'draws';
    const next = {
      ...tally,
      [key]: tally[key] + 1,
    };
    setTally(next);
    try {
      localStorage.setItem('grid-of-grids-tally', String(JSON.stringify(next)));
    } catch (e) {
      // Storage may be unavailable.
    }
    if (outcome === 'X')
      [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.2), i * 100));
    else playTone(200, 0.4, 'sawtooth', 0.04);
  };
  const play = (b, c) => {
    if (turn !== 'X' || result || !isLegal(b, c)) return;
    const next = applyMove(state, [b, c], 'X');
    playTone(520, 0.06);
    setState(next);
    const overall =
      winnerOf(next.owners) ||
      (legalMoves(next.boards, next.owners, next.active).length ? null : 'draw');
    if (overall) finish(overall);
    else setTurn('O');
  };

  // Teacher's move
  useEffect(() => {
    if (turn !== 'O' || result) return undefined;
    const id = setTimeout(() => {
      const move = chooseMove(state, level);
      const next = applyMove(state, move, 'O');
      playTone(390, 0.06);
      setState(next);
      const overall =
        winnerOf(next.owners) ||
        (legalMoves(next.boards, next.owners, next.active).length ? null : 'draw');
      if (overall) finish(overall);
      else setTurn('X');
    }, 450);
    return () => clearTimeout(id);
  }, [turn, result]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setState(fresh());
    setTurn('X');
    setResult(null);
  };
  const status = result
    ? result === 'X'
      ? 'You win the big board!'
      : result === 'O'
        ? 'The teacher wins this one.'
        : 'A draw. Nobody gets the gold star.'
    : turn === 'X'
      ? state.active === null || state.owners[state.active]
        ? 'Your move: play in any open board.'
        : 'Your move: play in the highlighted board.'
      : 'The teacher is thinking…';
  return (
    <main className="font-body max-w-[560px] mx-auto py-6 flex flex-col gap-4">
      <header>
        <h1 className="font-hand text-[clamp(44px,12vw,64px)] leading-none">
          Grid of Grids
        </h1>
        <p className="text-muted mt-1">
          Tic-tac-toe inside tic-tac-toe, against the teacher.
        </p>
      </header>

      <p className="font-hand text-2xl min-h-[32px]" aria-live="polite">
        {status}
      </p>

      <div className="grid grid-cols-3 gap-2 bg-ink p-2 rounded-xl">
        {state.boards.map((board, b) => {
          const owner = state.owners[b];
          const highlight = !result && turn === 'X' && legal.some(([lb]) => lb === b);
          return (
            <div
              key={String(String(b))}
              className={`relative grid grid-cols-3 gap-[3px] p-1.5 rounded-lg transition-colors
                  ${highlight ? 'bg-glow' : 'bg-paper'}`}
            >
              {board.map((cell, c) => (
                <button
                  key={String(String(c))}
                  type="button"
                  onClick={() => play(b, c)}
                  disabled={!isLegal(b, c) || turn !== 'X' || Boolean(result)}
                  aria-label={`Board ${b + 1}, cell ${c + 1}${cell ? `, ${cell}` : ''}`}
                  className="aspect-square min-w-0 flex items-center justify-center rounded
                      border border-line enabled:hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  {cell && <Mark player={cell} />}
                </button>
              ))}
              {owner && owner !== 'draw' && (
                <div className="absolute inset-0 flex items-center justify-center bg-paper/80 rounded-lg">
                  <Mark player={owner} big />
                </div>
              )}
              {owner === 'draw' && (
                <div className="absolute inset-0 bg-paper/60 rounded-lg" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted text-sm mr-1">Teacher:</span>
        {['Kind', 'Fair', 'Strict'].map((name, i) => (
          <button
            key={String(String(name))}
            type="button"
            onClick={() => restart(i)}
            className={`rounded-full border-2 border-ink px-3.5 py-1.5 text-sm font-bold
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue
                ${level === i ? 'bg-ink text-paper' : ''}`}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => restart()}
          className="rounded-full border-2 border-ink px-3.5 py-1.5 text-sm font-bold ml-auto"
        >
          New game
        </button>
      </div>

      <p className="text-sm text-muted">
        You {tally.you} · Teacher {tally.teacher} · Draws {tally.draws}
      </p>

      <p className="text-sm text-muted leading-relaxed">
        Win three small boards in a row to win. The catch is that the cell you play in
        decides which small board your opponent must play in next. If that board is
        already decided, they can go anywhere.
      </p>
    </main>
  );
}
export default App;
