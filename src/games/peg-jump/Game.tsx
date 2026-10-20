import React, { useState, useMemo } from 'react';
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

// ---------- Board ----------
// 7×7 grid; the four 2×2 corners are not part of the English cross board.

const N = 7;
const CENTER = 24;
const onBoard = (r, c) =>
  r >= 0 && r < N && c >= 0 && c < N && !((r < 2 || r > 4) && (c < 2 || c > 4));
function startBoard() {
  return Array.from(
    {
      length: N * N,
    },
    (_, i) => {
      const r = Math.floor(i / N);
      const c = i % N;
      if (!onBoard(r, c)) return null; // not a hole
      return i !== CENTER; // true = marble
    },
  );
}
const JUMPS = [
  [0, 2],
  [0, -2],
  [2, 0],
  [-2, 0],
];

// Legal jumps for the marble at `from`: [{ to, over }]
function jumpsFrom(board, from) {
  if (board[from] !== true) return [];
  const r = Math.floor(from / N);
  const c = from % N;
  const result = [];
  for (const [dr, dc] of JUMPS) {
    const r2 = r + dr;
    const c2 = c + dc;
    if (!onBoard(r2, c2)) continue;
    const over = (r + dr / 2) * N + (c + dc / 2);
    const to = r2 * N + c2;
    if (board[over] === true && board[to] === false)
      result.push({
        to,
        over,
      });
  }
  return result;
}
const RANKS = [
  [1, 'Genius'],
  [2, 'Excellent'],
  [3, 'Very good'],
  [4, 'Good'],
  [5, 'Not bad'],
  [99, 'Keep practising'],
];

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Peg Jump');

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
  const [picked, setPicked] = useState(null);
  const [history, setHistory] = useState([]);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('peg-jump-best')) || null;
    } catch (e) {
      return null;
    }
  });
  const marbles = board.filter((v) => v === true).length;
  const anyMoves = useMemo(
    () => board.some((v, i) => v === true && jumpsFrom(board, i).length > 0),
    [board],
  );
  const targets = picked !== null ? jumpsFrom(board, picked) : [];
  const over = !anyMoves;
  const click = (i) => {
    if (board[i] === null || over) return;
    if (board[i] === true) {
      if (jumpsFrom(board, i).length) {
        setPicked(i === picked ? null : i);
        playTone(500, 0.04, 'sine', 0.03);
      } else {
        playTone(180, 0.08, 'square', 0.02);
      }
      return;
    }
    const jump = targets.find((t) => t.to === i);
    if (!jump) return;
    const next = [...board];
    next[picked] = false;
    next[jump.over] = false;
    next[i] = true;
    setHistory([...history, board]);
    setBoard(next);
    setPicked(null);
    playTone(700 - next.filter((v) => v === true).length * 10, 0.1);

    // Did that end the game?
    const left = next.filter((v) => v === true).length;
    const stuck = !next.some((v, k) => v === true && jumpsFrom(next, k).length > 0);
    if (stuck) {
      if (!best || left < best) {
        setBest(left);
        try {
          localStorage.setItem('peg-jump-best', String(left));
        } catch (e) {
          /* storage unavailable */
        }
      }
      if (left === 1)
        [523, 659, 784, 1047, 1319].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.25, 'triangle'), k * 110),
        );
    }
  };
  const undo = () => {
    if (!history.length) return;
    setBoard(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setPicked(null);
  };
  const restart = () => {
    setBoard(startBoard());
    setHistory([]);
    setPicked(null);
  };
  const rank = RANKS.find(([n]) => marbles <= Number(n))[1];
  return (
    <main className="font-body max-w-[920px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center">
      <div
        className="bg-birch rounded-full aspect-square p-[7%] shadow-[inset_0_-10px_0_rgba(0,0,0,.12),0_20px_40px_rgba(0,0,0,.18)]"
        style={{
          backgroundImage:
            'repeating-radial-gradient(circle at 30% 20%, rgba(0,0,0,.035) 0 3px, transparent 3px 11px)',
        }}
      >
        <div className="grid grid-cols-7 gap-[3%] w-full h-full">
          {board.map((v, i) => {
            if (v === null) return <div key={String(String(i))} />;
            const isTarget = targets.some((t) => t.to === i);
            return (
              <button
                key={String(String(i))}
                type="button"
                onClick={() => click(i)}
                aria-label={`Hole ${i + 1}${v ? ', marble' : ', empty'}${isTarget ? ', jump here' : ''}`}
                className={`relative aspect-square rounded-full bg-hole shadow-[inset_0_4px_6px_rgba(0,0,0,.55)]
                    flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                    ${isTarget ? 'ring-4 ring-accent/70' : ''}`}
              >
                {v && (
                  <span
                    className={`w-[92%] aspect-square rounded-full transition-transform
                        shadow-[0_3px_3px_rgba(0,0,0,.35)] ${picked === i ? '-translate-y-1.5 scale-110' : ''}`}
                    style={{
                      background:
                        'radial-gradient(circle at 32% 28%, #ffffffee 0 12%, var(--marble) 45%, #0b2a4a 100%)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[clamp(40px,10vw,60px)] leading-none">
            Peg Jump
          </h1>
          <p className="text-muted mt-2">
            Solitaire on the English cross board. Jump marbles over each other until only
            one is left.
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Marbles left
            </div>
            <div className="font-display text-4xl tabular-nums">{marbles}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Best finish
            </div>
            <div className="font-display text-4xl tabular-nums">{best ?? '–'}</div>
          </div>
        </div>

        <p className="font-display text-xl min-h-[30px]" aria-live="polite">
          {over
            ? `No jumps left. ${marbles} marble${marbles === 1 ? '' : 's'}: ${rank}${marbles === 1 && board[CENTER] ? ', and right in the centre!' : '.'}`
            : picked !== null
              ? 'Now tap a highlighted hole to jump.'
              : 'Tap a marble that can jump.'}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            className="rounded-full border-2 border-ink px-5 py-2.5 font-bold disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={restart}
            className="rounded-full bg-ink text-bg px-5 py-2.5 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Reset board
          </button>
        </div>

        <p className="text-sm text-muted leading-relaxed">
          A marble jumps straight over a neighbouring marble into an empty hole directly
          beyond, and the jumped marble is removed. No diagonal jumps. Finishing with a
          single marble in the centre hole is the classic perfect game.
        </p>
      </aside>
    </main>
  );
}
export default App;
