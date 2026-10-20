import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function strike() {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const length = Math.floor(audioCtx.sampleRate * 0.18);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    source.buffer = buffer;
    source.connect(filter).connect(audioCtx.destination);
    source.start(now);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Rules ----------
// Misère Nim: on your turn take any number of matches from ONE row. Whoever takes the last match loses.

// Rows are random each game, so some starting positions favour you and some favour the house.
const randomRows = () => [1, 2, 3, 4].map((base) => base + Math.floor(Math.random() * 4));

// Optimal misère strategy, with a chance of a casual move at lower levels.
function computerMove(rows, level) {
  const nonEmpty = rows.map((n, i) => [n, i]).filter(([n]) => n > 0);
  const randomMove = () => {
    const [n, i] = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
    return {
      row: i,
      take: 1 + Math.floor(Math.random() * n),
    };
  };
  if (Math.random() < [0.65, 0.25, 0][level]) return randomMove();
  const big = rows.filter((n) => n > 1).length;

  // Endgame: when at most one row has more than one match, leave an odd number of single rows.
  if (big <= 1) {
    const ones = rows.filter((n) => n === 1).length;
    if (big === 0)
      return {
        row: rows.findIndex((n) => n > 0),
        take: 1,
      };
    const bigRow = rows.findIndex((n) => n > 1);
    return {
      row: bigRow,
      take: ones % 2 === 1 ? rows[bigRow] : rows[bigRow] - 1,
    };
  }

  // Otherwise play normal Nim: make the XOR of all rows zero.
  const nimSum = rows.reduce((a, b) => a ^ b, 0);
  if (nimSum === 0) return randomMove();
  for (let i = 0; i < rows.length; i++) {
    const target = rows[i] ^ nimSum;
    if (target < rows[i])
      return {
        row: i,
        take: rows[i] - target,
      };
  }
  return randomMove();
}

// ---------- Components ----------

function Match({ selected, burning, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={selected ? 'Selected match' : 'Match'}
      className={`relative w-[clamp(12px,3vw,18px)] h-[clamp(80px,20vw,120px)] flex flex-col items-center
          transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-red
          ${selected ? '-translate-y-3' : ''} ${burning ? 'burning' : ''}`}
    >
      <span className="w-full h-[18%] rounded-[50%] bg-red shadow-[inset_-2px_-3px_0_rgba(0,0,0,.25)]" />
      <span className={`w-[60%] flex-1 bg-wood ${selected ? 'ring-2 ring-red' : ''}`} />
    </button>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Last Match');

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
  const [rows, setRows] = useState(randomRows);
  const [selRow, setSelRow] = useState(null);
  const [selCount, setSelCount] = useState(0);
  const [turn, setTurn] = useState('you');
  const [level, setLevel] = useState(1);
  const [burning, setBurning] = useState(null); // { row, from, count }
  const [loser, setLoser] = useState(null);
  const [tally, setTally] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('last-match-tally')) || {
          you: 0,
          house: 0,
        }
      );
    } catch (e) {
      return {
        you: 0,
        house: 0,
      };
    }
  });
  const total = rows.reduce((a, b) => a + b, 0);
  const apply = (row, take, who) => {
    const from = rows[row] - take;
    setBurning({
      row,
      from,
      count: take,
    });
    strike();
    setTimeout(() => {
      const next = [...rows];
      next[row] -= take;
      setRows(next);
      setBurning(null);
      if (next.every((n) => n === 0)) {
        setLoser(who);
        const t = {
          ...tally,
          [who === 'you' ? 'house' : 'you']: tally[who === 'you' ? 'house' : 'you'] + 1,
        };
        setTally(t);
        try {
          localStorage.setItem('last-match-tally', String(JSON.stringify(t)));
        } catch (e) {
          /* storage unavailable */
        }
      } else {
        setTurn(who === 'you' ? 'house' : 'you');
      }
    }, 520);
  };
  const toggle = (row, index) => {
    if (turn !== 'you' || loser || burning) return;
    // Selecting a match takes it and every match to its right in the same row.
    const count = rows[row] - index;
    if (selRow === row && selCount === count) {
      setSelRow(null);
      setSelCount(0);
    } else {
      setSelRow(row);
      setSelCount(count);
    }
  };
  const take = () => {
    if (selRow === null || selCount === 0) return;
    apply(selRow, selCount, 'you');
    setSelRow(null);
    setSelCount(0);
  };
  useEffect(() => {
    if (turn !== 'house' || loser) return undefined;
    const id = setTimeout(() => {
      const m = computerMove(rows, level);
      apply(m.row, m.take, 'house');
    }, 800);
    return () => clearTimeout(id);
  }, [turn, loser]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setRows(randomRows());
    setSelRow(null);
    setSelCount(0);
    setTurn('you');
    setLoser(null);
    setBurning(null);
  };
  const status = loser
    ? loser === 'you'
      ? 'You picked up the last match. The house wins.'
      : 'The house was left with the last match. You win!'
    : turn === 'you'
      ? selCount
        ? `Take ${selCount} from row ${selRow + 1}?`
        : 'Your turn: pick matches from one row.'
      : 'The house is choosing…';
  return (
    <main className="font-body max-w-[640px] mx-auto py-6 flex flex-col gap-4">
      <div className="bg-label border-[6px] border-red rounded-xl p-5 shadow-xl relative">
        <div className="absolute inset-2 border-2 border-red/40 rounded-md pointer-events-none" />
        <header className="text-center relative">
          <div className="text-[11px] tracking-[.3em] uppercase text-muted">
            Safety matches · Strike to play
          </div>
          <h1 className="font-display text-[clamp(40px,11vw,64px)] leading-none text-red mt-1">
            Last Match
          </h1>
          <p className="text-muted text-sm mt-1">Whoever takes the last match loses.</p>
        </header>

        <div className="flex flex-col gap-4 items-center my-6">
          {rows.map((n, r) => (
            <div
              key={String(String(r))}
              className="flex items-end gap-[clamp(8px,2.6vw,16px)] min-h-[clamp(80px,20vw,120px)]"
            >
              {Array.from({
                length: n,
              }).map((_, k) => {
                const selected = selRow === r && k >= n - selCount;
                const isBurning = burning && burning.row === r && k >= burning.from;
                return (
                  <Match
                    key={String(String(k))}
                    selected={selected}
                    burning={isBurning}
                    disabled={turn !== 'you' || Boolean(loser)}
                    onClick={() => toggle(r, k)}
                  />
                );
              })}
              {n === 0 && (
                <span className="text-muted text-sm italic self-center">empty</span>
              )}
            </div>
          ))}
        </div>

        <p
          className="text-center font-display text-xl min-h-[30px] relative"
          aria-live="polite"
        >
          {status}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={take}
          disabled={!selCount || turn !== 'you'}
          className="rounded-full bg-red text-white font-display text-lg px-6 py-2.5 disabled:opacity-40
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Take {selCount || ''}
        </button>
        <span className="text-sm text-muted ml-2">{total} left</span>
        <span className="flex-1" />
        {['Casual', 'Sharp', 'Perfect'].map((name, i) => (
          <button
            key={String(String(name))}
            type="button"
            onClick={() => restart(i)}
            className={`rounded-full border-2 border-ink px-3.5 py-1.5 text-sm font-semibold
                ${level === i ? 'bg-ink text-bg' : ''}`}
          >
            {name}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        You {tally.you} · House {tally.house}
      </p>

      <p className="text-sm text-muted leading-relaxed">
        On your turn, tap a match to select it and every match to its right in that row,
        then press Take. You can take as many as you like, but only from one row. A
        perfect house never makes a mistake, and some deals can't be won against it, so
        try a new deal if the odds look grim.
      </p>
    </main>
  );
}
export default App;
