import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.12, type = 'triangle', volume = 0.05) {
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

// ---------- Sudoku generation ----------

const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
function canPlace(grid, index, value) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    if (grid[row * 9 + i] === value) return false;
    if (grid[i * 9 + col] === value) return false;
    const r = boxRow + Math.floor(i / 3);
    const c = boxCol + (i % 3);
    if (grid[r * 9 + c] === value) return false;
  }
  return true;
}

// Fills the grid in place. Returns true when complete.
function fillGrid(grid) {
  const empty = grid.indexOf(0);
  if (empty === -1) return true;
  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(grid, empty, value)) {
      grid[empty] = value;
      if (fillGrid(grid)) return true;
      grid[empty] = 0;
    }
  }
  return false;
}

// Counts solutions, stopping once it finds `limit` of them.
function countSolutions(grid, limit = 2) {
  const empty = grid.indexOf(0);
  if (empty === -1) return 1;
  let count = 0;
  for (let value = 1; value <= 9 && count < limit; value++) {
    if (canPlace(grid, empty, value)) {
      grid[empty] = value;
      count += countSolutions(grid, limit - count);
      grid[empty] = 0;
    }
  }
  return count;
}
const LEVELS = {
  Seedling: 36,
  Gardener: 46,
  'Head gardener': 54,
};
function makePuzzle(holes) {
  const solution = Array(81).fill(0);
  fillGrid(solution);
  const puzzle = [...solution];
  let removed = 0;
  for (const index of shuffle([...Array(81).keys()])) {
    if (removed >= holes) break;
    const backup = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions([...puzzle]) === 1) {
      removed++;
    } else {
      puzzle[index] = backup;
    }
  }
  return {
    puzzle,
    solution,
  };
}

// ---------- Helpers ----------

function readBest(key) {
  try {
    return Number(localStorage.getItem(key)) || null;
  } catch (e) {
    return null;
  }
}

function writeBest(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // Storage may be unavailable.
  }
}
const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// ---------- Components ----------

function Cell({
  index,
  value,
  given,
  notes,
  selected,
  related,
  sameValue,
  wrong,
  onSelect,
}) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const borders = [
    col % 3 === 2 && col < 8 ? 'border-r-2 border-r-leaf/60' : '',
    row % 3 === 2 && row < 8 ? 'border-b-2 border-b-leaf/60' : '',
  ].join(' ');
  let background = 'bg-bed';
  if (related) background = 'bg-soil/60';
  if (sameValue) background = 'bg-leaf/20';
  if (selected) background = 'bg-leaf/35';
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-label={`Row ${row + 1}, column ${col + 1}${value ? `, ${value}` : ', empty'}`}
      className={`relative aspect-square min-w-0 border border-soil ${borders} ${background}
          flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-bloom`}
    >
      {value ? (
        <span
          className={`font-display text-[clamp(16px,5vw,26px)] leading-none
              ${given ? 'text-given' : wrong ? 'text-bloom' : 'text-leaf'}`}
        >
          {value}
        </span>
      ) : (
        <span className="grid grid-cols-3 w-full h-full p-[2px] text-[clamp(7px,1.8vw,10px)] leading-none text-muted">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <span key={String(String(n))} className="flex items-center justify-center">
              {notes.includes(n) ? n : ''}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function App() {
  usePageStyles(styles, 'Nine Gardens');

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
  const [level, setLevel] = useState('Gardener');
  const [game, setGame] = useState(() => makePuzzle(LEVELS.Gardener));
  const [board, setBoard] = useState(() => [...game.puzzle]);
  const [notes, setNotes] = useState(() =>
    Array.from(
      {
        length: 81,
      },
      () => [],
    ),
  );
  const [selected, setSelected] = useState(null);
  const [pencil, setPencil] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [solved, setSolved] = useState(false);
  const [best, setBest] = useState(() => readBest('nine-gardens-best-Gardener'));

  // Timer
  useEffect(() => {
    if (solved) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [solved, game]);
  const newGame = useCallback(
    (nextLevel = level) => {
      const fresh = makePuzzle(LEVELS[nextLevel]);
      setLevel(nextLevel);
      setGame(fresh);
      setBoard([...fresh.puzzle]);
      setNotes(
        Array.from(
          {
            length: 81,
          },
          () => [],
        ),
      );
      setSelected(null);
      setMistakes(0);
      setHints(3);
      setSeconds(0);
      setSolved(false);
      setBest(readBest(`nine-gardens-best-${nextLevel}`));
    },
    [level],
  );
  const checkSolved = (nextBoard) => {
    if (nextBoard.every((v, i) => v === game.solution[i])) {
      setSolved(true);
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.25), i * 110),
      );
      const key = `nine-gardens-best-${level}`;
      const previous = readBest(key);
      if (!previous || seconds < previous) {
        writeBest(key, seconds);
        setBest(seconds);
      }
    }
  };
  const enter = useCallback(
    (value) => {
      if (selected === null || solved || game.puzzle[selected]) return;
      if (pencil && value) {
        setNotes((all) => {
          const copy = all.map((n) => [...n]);
          const cellNotes = copy[selected];
          copy[selected] = cellNotes.includes(value)
            ? cellNotes.filter((n) => n !== value)
            : [...cellNotes, value];
          return copy;
        });
        playTone(700, 0.04, 'sine', 0.03);
        return;
      }
      const nextBoard = [...board];
      nextBoard[selected] = value;
      setBoard(nextBoard);
      if (value && value !== game.solution[selected]) {
        setMistakes((m) => m + 1);
        playTone(160, 0.2, 'square', 0.04);
      } else if (value) {
        playTone(440 + value * 30, 0.1);
        // Clear this number from notes in the same row, column and box.
        setNotes((all) =>
          all.map((cellNotes, i) =>
            isRelated(i, selected) ? cellNotes.filter((n) => n !== value) : cellNotes,
          ),
        );
      }
      checkSolved(nextBoard);
    },
    [selected, solved, game, pencil, board],
  );
  const useHint = () => {
    if (hints === 0 || solved) return;
    const target =
      selected !== null && board[selected] !== game.solution[selected]
        ? selected
        : board.findIndex((v, i) => v !== game.solution[i]);
    if (target < 0) return;
    const nextBoard = [...board];
    nextBoard[target] = game.solution[target];
    setBoard(nextBoard);
    setSelected(target);
    setHints((h) => h - 1);
    playTone(880, 0.15, 'sine');
    checkSolved(nextBoard);
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '1' && e.key <= '9') enter(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') enter(0);
      else if (e.key === 'p' || e.key === 'P') setPencil((p) => !p);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        setSelected((s) => {
          const current = s ?? 40;
          const moves = {
            ArrowUp: -9,
            ArrowDown: 9,
            ArrowLeft: -1,
            ArrowRight: 1,
          };
          const next = current + moves[e.key];
          return next >= 0 && next < 81 ? next : current;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enter]);
  const selectedValue = selected !== null ? board[selected] : 0;

  // How many of each number are still to be planted correctly.
  const remaining = useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
      (n) => 9 - board.filter((v, i) => v === n && v === game.solution[i]).length,
    );
  }, [board, game]);
  return (
    <main className="font-body max-w-[520px] mx-auto py-5 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(34px,9vw,46px)] leading-none text-leaf">
            Nine Gardens
          </h1>
          <p className="text-muted mt-1 text-sm">
            Plant 1 to 9 once in every row, column and garden bed.
          </p>
        </div>
        <dl className="flex gap-4 text-right">
          <div>
            <dt className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Time
            </dt>
            <dd className="font-display text-xl tabular-nums">{formatTime(seconds)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Slips
            </dt>
            <dd className="font-display text-xl tabular-nums">{mistakes}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Best
            </dt>
            <dd className="font-display text-xl tabular-nums">
              {best ? formatTime(best) : '–'}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid grid-cols-9 rounded-xl overflow-hidden border-2 border-leaf/60 shadow-lg">
        {board.map((value, index) => (
          <Cell
            key={String(String(index))}
            index={index}
            value={value}
            given={Boolean(game.puzzle[index])}
            notes={notes[index]}
            selected={selected === index}
            related={selected !== null && isRelated(index, selected)}
            sameValue={Boolean(selectedValue) && value === selectedValue}
            wrong={Boolean(value) && value !== game.solution[index]}
            onSelect={setSelected}
          />
        ))}
      </div>

      {solved && (
        <div
          className="rounded-xl bg-bed border-2 border-leaf p-4 text-center"
          role="status"
        >
          <p className="font-display text-2xl text-leaf">Every bed is in bloom</p>
          <p className="text-muted mt-1">
            Solved in {formatTime(seconds)} with {mistakes} slip
            {mistakes === 1 ? '' : 's'}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-9 gap-1.5" aria-label="Seed packets">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={String(String(n))}
            type="button"
            onClick={() => enter(n)}
            disabled={remaining[n - 1] === 0}
            className="rounded-lg bg-leaf text-bed py-2 font-display text-xl leading-none
                disabled:opacity-25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bloom"
          >
            {n}
            <span className="block font-body text-[10px] opacity-75 mt-1">
              {remaining[n - 1]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ToolButton active={pencil} onClick={() => setPencil((p) => !p)}>
          ✎ Notes {pencil ? 'on' : 'off'}
        </ToolButton>
        <ToolButton onClick={() => enter(0)}>Erase</ToolButton>
        <ToolButton onClick={useHint} disabled={hints === 0}>
          Hint ({hints})
        </ToolButton>
        <span className="flex-1" />
        {Object.keys(LEVELS).map((name) => (
          <ToolButton
            key={String(String(name))}
            active={level === name}
            onClick={() => newGame(name)}
          >
            {name}
          </ToolButton>
        ))}
      </div>

      <p className="text-muted text-sm leading-relaxed">
        Tap a plot, then a seed packet. Notes mode lets you jot small candidates.
        Keyboard: arrows to move, 1–9 to plant, Backspace to clear, P for notes. Each
        puzzle has exactly one solution.
      </p>
    </main>
  );
}

function ToolButton({ active = undefined, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border-2 border-ink px-3.5 py-2 text-sm font-semibold
          disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bloom
          ${active ? 'bg-ink text-bg' : 'bg-transparent text-ink'}`}
    >
      {children}
    </button>
  );
}

function isRelated(a, b) {
  const ra = Math.floor(a / 9);
  const ca = a % 9;
  const rb = Math.floor(b / 9);
  const cb = b % 9;
  const sameBox =
    Math.floor(ra / 3) === Math.floor(rb / 3) &&
    Math.floor(ca / 3) === Math.floor(cb / 3);
  return ra === rb || ca === cb || sameBox;
}
export default App;
