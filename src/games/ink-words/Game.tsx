import React, { useState, useEffect, useCallback } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.07, type = 'triangle', volume = 0.05) {
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

// ---------- Inks ----------

const INKS = [
  {
    name: 'RED',
    color: '#e23b3b',
    key: 'r',
  },
  {
    name: 'BLUE',
    color: '#2d6be0',
    key: 'b',
  },
  {
    name: 'GREEN',
    color: '#24a148',
    key: 'g',
  },
  {
    name: 'YELLOW',
    color: '#e6b800',
    key: 'y',
  },
  {
    name: 'PURPLE',
    color: '#8b46d6',
    key: 'p',
  },
  {
    name: 'ORANGE',
    color: '#f07d18',
    key: 'o',
  },
];
const ROUND_SECONDS = 40;

// The word and the ink colour usually disagree, which is what makes it hard.
function makeCard(inkCount) {
  const pool = INKS.slice(0, inkCount);
  const word = pool[Math.floor(Math.random() * pool.length)];
  let ink = word;
  if (Math.random() < 0.8) {
    while (ink === word) ink = pool[Math.floor(Math.random() * pool.length)];
  }
  return {
    word: word.name,
    ink: ink.name,
    id: Math.random(),
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Ink Words');

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
  const [card, setCard] = useState(() => makeCard(4));
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [feedback, setFeedback] = useState(null);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [shownAt, setShownAt] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('ink-words-best')) || 0;
    } catch (e) {
      return 0;
    }
  });

  // The number of inks in play grows as you score.
  const inkCount = score < 10 ? 4 : score < 22 ? 5 : 6;
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'playing' && timeLeft <= 0) {
      setPhase('done');
      playTone(200, 0.5, 'sawtooth', 0.04);
      if (score > best) {
        setBest(score);
        try {
          localStorage.setItem('ink-words-best', String(score));
        } catch (e) {
          /* storage unavailable */
        }
      }
    }
  }, [timeLeft, phase]);
  const start = () => {
    setScore(0);
    setAnswered(0);
    setStreak(0);
    setReactionTimes([]);
    setTimeLeft(ROUND_SECONDS);
    setCard(makeCard(4));
    setShownAt(performance.now());
    setPhase('playing');
  };
  const answer = useCallback(
    (name) => {
      if (phase !== 'playing') return;
      const right = name === card.ink;
      setAnswered((a) => a + 1);
      setReactionTimes((r) => [...r, performance.now() - shownAt]);
      if (right) {
        setScore((s) => s + 1);
        setStreak((s) => s + 1);
        playTone(600 + Math.min(streak, 10) * 30);
      } else {
        setScore((s) => Math.max(0, s - 1));
        setStreak(0);
        playTone(150, 0.15, 'square', 0.04);
      }
      setFeedback(right ? 'right' : 'wrong');
      setTimeout(() => setFeedback(null), 180);
      setCard(makeCard(inkCount));
      setShownAt(performance.now());
    },
    [phase, card, shownAt, streak, inkCount],
  );
  useEffect(() => {
    const onKey = (e) => {
      const ink = INKS.slice(0, inkCount).find((i) => i.key === e.key.toLowerCase());
      if (ink) answer(ink.name);
      else if (e.key === 'Enter' && phase !== 'playing') start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, inkCount, phase]);
  const avg = reactionTimes.length
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : 0;
  const accuracy = answered ? Math.round((score / answered) * 100) : 0;
  const inkColor = INKS.find((i) => i.name === card.ink).color;
  return (
    <main className="font-body max-w-[620px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(40px,11vw,64px)] leading-none">
            <span
              style={{
                color: '#2d6be0',
              }}
            >
              Ink
            </span>{' '}
            <span
              style={{
                color: '#e23b3b',
              }}
            >
              Words
            </span>
          </h1>
          <p className="text-muted mt-1">Name the ink colour, not the word.</p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Time
            </div>
            <div className="font-display text-3xl tabular-nums">
              {Math.max(0, timeLeft)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Score
            </div>
            <div className="font-display text-3xl tabular-nums">{score}</div>
          </div>
        </div>
      </header>

      <div
        className={`bg-panel rounded-3xl h-[clamp(180px,42vw,260px)] flex items-center justify-center shadow-sm border-4
          ${feedback === 'right' ? 'border-[#24a148]' : feedback === 'wrong' ? 'border-[#e23b3b]' : 'border-transparent'}`}
      >
        {phase === 'playing' ? (
          <span
            key={String(String(card.id))}
            className="stamp font-display text-[clamp(56px,17vw,120px)] leading-none tracking-wide"
            style={{
              color: inkColor,
            }}
            aria-live="polite"
          >
            {card.word}
          </span>
        ) : phase === 'done' ? (
          <div className="text-center flex flex-col gap-1 px-4">
            <p className="font-display text-4xl">Time!</p>
            <p className="text-muted">
              Score {score} · {accuracy}% correct · {avg} ms average
            </p>
            <p className="text-muted text-sm">Best score: {Math.max(best, score)}</p>
          </div>
        ) : (
          <p className="text-muted text-center max-w-[36ch] px-4 leading-relaxed">
            A colour word appears in a different coloured ink. Pick the colour of the{' '}
            <b className="text-ink">ink</b> as fast as you can. Wrong answers lose a
            point. More inks join as your score climbs.
          </p>
        )}
      </div>

      {phase === 'playing' ? (
        <div className="grid grid-cols-3 gap-2" aria-label="Ink pots">
          {INKS.slice(0, inkCount).map((ink) => (
            <button
              key={String(String(ink.name))}
              type="button"
              onClick={() => answer(ink.name)}
              className="rounded-2xl py-4 font-display text-xl text-white shadow-[0_5px_0_rgba(0,0,0,.25)] active:translate-y-1
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              style={{
                background: ink.color,
              }}
            >
              {ink.name.toLowerCase()}{' '}
              <span className="text-xs opacity-75">({ink.key})</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="rounded-2xl py-4 bg-ink text-bg font-display text-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          {phase === 'done' ? 'Run the test again' : 'Start the test'}
        </button>
      )}

      <p className="text-sm text-muted">
        This is the Stroop effect: reading the word is so automatic that it gets in the
        way of naming the colour. Keys: the first letter of each ink.
      </p>
    </main>
  );
}
export default App;
