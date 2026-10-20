import React, { useState, useEffect, useCallback } from 'react';
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

// ---------- Questions ----------

const ROUND_SECONDS = 60;
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Difficulty grows with the number of correct answers so far.
function makeQuestion(level) {
  const ops =
    level < 4 ? ['+', '−'] : level < 10 ? ['+', '−', '×'] : ['+', '−', '×', '÷'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const scale = Math.min(level, 20);
  if (op === '+') {
    const a = rand(2, 9 + scale * 4);
    const b = rand(2, 9 + scale * 4);
    return {
      text: `${a} + ${b}`,
      answer: a + b,
    };
  }
  if (op === '−') {
    const a = rand(5, 12 + scale * 4);
    const b = rand(1, a);
    return {
      text: `${a} − ${b}`,
      answer: a - b,
    };
  }
  if (op === '×') {
    const a = rand(2, 5 + Math.floor(scale / 2));
    const b = rand(2, 9 + Math.floor(scale / 3));
    return {
      text: `${a} × ${b}`,
      answer: a * b,
    };
  }
  const b = rand(2, 9 + Math.floor(scale / 4));
  const answer = rand(2, 12);
  return {
    text: `${b * answer} ÷ ${b}`,
    answer,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Quick Sums');

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
  const [phase, setPhase] = useState('ready');
  const [question, setQuestion] = useState(() => makeQuestion(0));
  const [input, setInput] = useState('');
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [flash, setFlash] = useState(null);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('quick-sums-best')) || 0;
    } catch (e) {
      return 0;
    }
  });
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'playing' && timeLeft <= 0) {
      setPhase('done');
      playTone(220, 0.5, 'sawtooth', 0.04);
      if (score > best) {
        setBest(score);
        try {
          localStorage.setItem('quick-sums-best', String(score));
        } catch (e) {
          /* storage unavailable */
        }
      }
    }
  }, [timeLeft, phase]);
  const start = () => {
    setPhase('playing');
    setQuestion(makeQuestion(0));
    setInput('');
    setCorrect(0);
    setWrong(0);
    setStreak(0);
    setScore(0);
    setTimeLeft(ROUND_SECONDS);
  };
  const submit = useCallback(
    (value) => {
      if (phase !== 'playing' || value === '') return;
      if (Number(value) === question.answer) {
        const nextStreak = streak + 1;
        const multiplier = 1 + Math.floor(nextStreak / 5);
        setScore((s) => s + 10 * multiplier);
        setCorrect((c) => c + 1);
        setStreak(nextStreak);
        setFlash('right');
        playTone(600 + Math.min(nextStreak, 12) * 40, 0.08);
        setQuestion(makeQuestion(correct + 1));
      } else {
        setWrong((w) => w + 1);
        setStreak(0);
        setFlash('wrong');
        setTimeLeft((t) => Math.max(0, t - 3));
        playTone(160, 0.2, 'square', 0.04);
      }
      setInput('');
      setTimeout(() => setFlash(null), 250);
    },
    [phase, question, streak, correct],
  );

  // Auto-submit once the typed answer has as many digits as the real answer.
  const type = useCallback(
    (digit) => {
      if (phase !== 'playing') return;
      const next = (input + digit).slice(0, 4);
      setInput(next);
      if (next.length >= String(question.answer).length) submit(next);
    },
    [phase, input, question, submit],
  );
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) type(e.key);
      else if (e.key === 'Backspace') setInput((v) => v.slice(0, -1));
      else if (e.key === 'Enter') {
        if (phase === 'playing') submit(input);
        else start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [type, submit, input, phase]);
  const multiplier = 1 + Math.floor(streak / 5);
  return (
    <main className="font-body max-w-[560px] mx-auto py-6 flex flex-col gap-4">
      <div className="border-[14px] border-frame rounded-md shadow-2xl">
        <div className="chalkboard p-5 flex flex-col gap-4 min-h-[340px]">
          <header className="flex justify-between items-start gap-3">
            <h1 className="font-chalk text-[clamp(34px,9vw,48px)] leading-none font-bold">
              Quick Sums
            </h1>
            <div className="text-right font-chalk text-xl leading-tight">
              <div className={timeLeft <= 10 && phase === 'playing' ? 'text-pink' : ''}>
                ⏱ {Math.max(0, timeLeft)}s
              </div>
              <div className="text-yellow">★ {score}</div>
            </div>
          </header>

          {phase === 'ready' && (
            <div className="flex-1 flex flex-col justify-center gap-3 font-chalk text-2xl leading-snug">
              <p>Answer as many sums as you can in {ROUND_SECONDS} seconds.</p>
              <p className="text-muted text-xl">
                Answers go in by themselves once you've typed enough digits. Every five in
                a row raises your multiplier. A wrong answer costs three seconds.
              </p>
            </div>
          )}

          {phase === 'playing' && (
            <div
              className={`flex-1 flex flex-col items-center justify-center gap-2 transition-colors rounded-md
                ${flash === 'right' ? 'bg-white/5' : flash === 'wrong' ? 'bg-pink/10' : ''}`}
            >
              <div
                className="font-chalk font-bold text-[clamp(56px,16vw,96px)] leading-none tabular-nums"
                aria-live="polite"
              >
                {question.text}
              </div>
              <div className="font-chalk text-[clamp(40px,11vw,64px)] leading-none text-yellow min-h-[1.1em] border-b-4 border-dashed border-chalk/40 min-w-[3ch] text-center">
                {input || '?'}
              </div>
              <div className="font-chalk text-lg text-muted mt-1">
                streak {streak}
                {multiplier > 1 ? ` · ×${multiplier}` : ''}
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex-1 flex flex-col justify-center gap-2 font-chalk text-2xl">
              <p className="text-4xl font-bold">Time's up!</p>
              <p>
                {correct} right, {wrong} wrong. Score{' '}
                <span className="text-yellow">{score}</span>.
              </p>
              <p className="text-muted">Best on this board: {best}</p>
            </div>
          )}
        </div>
      </div>

      {phase === 'playing' ? (
        <div className="grid grid-cols-3 gap-2" aria-label="Keypad">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => (
            <Key key={String(String(d))} onClick={() => type(d)}>
              {d}
            </Key>
          ))}
          <Key onClick={() => setInput((v) => v.slice(0, -1))} label="Delete">
            ⌫
          </Key>
          <Key onClick={() => type('0')}>0</Key>
          <Key onClick={() => submit(input)} label="Submit">
            ↵
          </Key>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="font-chalk font-bold text-3xl py-3 rounded-md bg-chalk text-board focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow"
        >
          {phase === 'done' ? 'Wipe the board and go again' : 'Start the clock'}
        </button>
      )}
    </main>
  );
}

function Key({ children, onClick, label = undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="font-chalk font-bold text-3xl py-3 rounded-md bg-white/10 hover:bg-white/15 active:bg-white/25
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow"
    >
      {children}
    </button>
  );
}
export default App;
