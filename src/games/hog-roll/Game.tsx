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

function oink() {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.25);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Rules ----------
// Pig: roll as often as you like. Each roll adds to your turn total; a 1 wipes the turn total and ends your turn.
// Bank to keep what you've rolled. First to 100 wins.

const GOAL = 100;
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
function Die({ value, rollKey }) {
  return (
    <div
      key={String(String(rollKey))}
      className="tumble w-[clamp(90px,24vw,130px)] aspect-square rounded-[22%] bg-white shadow-[0_8px_0_#d9c9a3]
        grid grid-cols-3 grid-rows-3 p-[14%]"
      aria-label={value ? `Die shows ${value}` : 'Die'}
    >
      {Array.from({
        length: 9,
      }).map((_, i) => (
        <span
          key={String(String(i))}
          className={`rounded-full place-self-center w-[70%] aspect-square ${value && PIPS[value].includes(i) ? (value === 1 ? 'bg-barn' : 'bg-ink') : ''}`}
        />
      ))}
    </div>
  );
}

// The farmer banks once the turn total reaches a target that depends on the race situation.
function farmerShouldHold(turnTotal, farmerScore, yourScore, level) {
  if (farmerScore + turnTotal >= GOAL) return true;
  const base = [12, 20, 22][level];
  const behind = yourScore - farmerScore;
  const target =
    level === 2 ? base + Math.max(-6, Math.min(10, Math.round(behind / 8))) : base;
  return turnTotal >= target;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Hog Roll');

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
  const [scores, setScores] = useState({
    you: 0,
    farmer: 0,
  });
  const [turn, setTurn] = useState('you');
  const [turnTotal, setTurnTotal] = useState(0);
  const [die, setDie] = useState(null);
  const [rollKey, setRollKey] = useState(0);
  const [level, setLevel] = useState(1);
  const [message, setMessage] = useState('Roll the die. Bank before a 1 comes up.');
  const [winner, setWinner] = useState(null);
  const [record, setRecord] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('hog-roll-record')) || {
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
  const finish = (who) => {
    setWinner(who);
    const next =
      who === 'you'
        ? {
            ...record,
            won: record.won + 1,
          }
        : {
            ...record,
            lost: record.lost + 1,
          };
    setRecord(next);
    try {
      localStorage.setItem('hog-roll-record', String(JSON.stringify(next)));
    } catch (e) {
      /* storage unavailable */
    }
    if (who === 'you')
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.2), i * 100),
      );
    else oink();
  };
  const roll = (who) => {
    const value = 1 + Math.floor(Math.random() * 6);
    setDie(value);
    setRollKey((k) => k + 1);
    if (value === 1) {
      oink();
      setTurnTotal(0);
      setMessage(
        who === 'you'
          ? 'Pig out! You rolled a 1 and lost the turn total.'
          : 'The farmer rolled a 1. Their turn is wasted.',
      );
      setTurn(who === 'you' ? 'farmer' : 'you');
      return 0;
    }
    playTone(300 + value * 60, 0.08);
    setTurnTotal((t) => t + value);
    return value;
  };
  const bank = (who) => {
    const total = scores[who] + turnTotal;
    setScores((s) => ({
      ...s,
      [who]: total,
    }));
    setMessage(`${who === 'you' ? 'You bank' : 'The farmer banks'} ${turnTotal}.`);
    playTone(880, 0.15);
    setTurnTotal(0);
    if (total >= GOAL) finish(who);
    else setTurn(who === 'you' ? 'farmer' : 'you');
  };

  // The farmer plays their turn one roll at a time.
  useEffect(() => {
    if (turn !== 'farmer' || winner) return undefined;
    const id = setTimeout(() => {
      if (turnTotal > 0 && farmerShouldHold(turnTotal, scores.farmer, scores.you, level))
        bank('farmer');
      else roll('farmer');
    }, 800);
    return () => clearTimeout(id);
  }, [turn, turnTotal, winner]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setScores({
      you: 0,
      farmer: 0,
    });
    setTurn('you');
    setTurnTotal(0);
    setDie(null);
    setWinner(null);
    setMessage('Roll the die. Bank before a 1 comes up.');
  };
  useEffect(() => {
    const onKey = (e) => {
      if (turn !== 'you' || winner) return;
      if (e.key === 'r' || e.key === ' ') {
        e.preventDefault();
        roll('you');
      }
      if (e.key === 'b' || e.key === 'Enter') {
        if (turnTotal > 0) bank('you');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const Pen = ({ who, label }) => {
    const active = turn === who && !winner;
    const score = scores[who];
    return (
      <div
        className={`rounded-2xl p-4 border-[6px] ${active ? 'border-barn bg-white' : 'border-plank/50 bg-white/60'}`}
      >
        <div className="flex justify-between items-baseline">
          <span className="font-extrabold">{label}</span>
          <span className="font-display text-5xl leading-none">{score}</span>
        </div>
        <div className="mt-2 h-4 rounded-full bg-plank/20 overflow-hidden relative">
          <div
            className="h-full bg-pig transition-all"
            style={{
              width: `${Math.min(100, score)}%`,
            }}
          />
          {active && turnTotal > 0 && (
            <div
              className="absolute top-0 h-full bg-pig/40"
              style={{
                left: `${Math.min(100, score)}%`,
                width: `${Math.min(100 - score, turnTotal)}%`,
              }}
            />
          )}
        </div>
      </div>
    );
  };
  return (
    <main className="font-body max-w-[760px] mx-auto py-6 flex flex-col gap-5">
      <header className="bg-barn text-straw rounded-t-[50%_40px] pt-6 pb-4 px-4 text-center shadow-xl">
        <h1 className="font-display text-[clamp(56px,15vw,96px)] leading-[.8]">
          Hog Roll
        </h1>
        <p className="text-straw/85 mt-2">
          The dice game called Pig, against the farmer. First to {GOAL}.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-3">
        <Pen who="you" label="Your pen" />
        <Pen who="farmer" label="The farmer" />
      </div>

      <div className="flex flex-col items-center gap-3 py-2">
        <Die value={die} rollKey={rollKey} />
        <div className="text-center">
          <div className="text-xs font-extrabold tracking-[.16em] uppercase text-muted">
            This turn
          </div>
          <div className="font-display text-5xl leading-none">{turnTotal}</div>
        </div>
        <p className="font-semibold text-center min-h-[24px]" aria-live="polite">
          {winner
            ? winner === 'you'
              ? 'You win the blue ribbon!'
              : 'The farmer takes the prize pig.'
            : message}
        </p>
      </div>

      {!winner ? (
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => roll('you')}
            disabled={turn !== 'you'}
            className="font-display text-3xl px-8 py-2 rounded-xl bg-barn text-straw shadow-[0_5px_0_#5e1712] disabled:opacity-40"
          >
            Roll
          </button>
          <button
            type="button"
            onClick={() => bank('you')}
            disabled={turn !== 'you' || turnTotal === 0}
            className="font-display text-3xl px-8 py-2 rounded-xl bg-plank text-straw shadow-[0_5px_0_#3e2210] disabled:opacity-40"
          >
            Bank {turnTotal || ''}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => restart()}
          className="self-center font-display text-3xl px-8 py-2 rounded-xl bg-barn text-straw"
        >
          Play again
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-center text-sm">
        <span className="text-muted">Farmer:</span>
        {['Careless', 'Steady', 'Shrewd'].map((n, i) => (
          <button
            key={String(String(n))}
            type="button"
            onClick={() => restart(i)}
            className={`rounded-full border-2 border-plank px-3 py-1 font-semibold ${level === i ? 'bg-plank text-straw' : ''}`}
          >
            {n}
          </button>
        ))}
        <span className="text-muted ml-2">
          Record {record.won}–{record.lost}
        </span>
      </div>

      <p className="text-sm text-muted text-center">
        Keyboard: R or Space to roll, B or Enter to bank.
      </p>
    </main>
  );
}
export default App;
