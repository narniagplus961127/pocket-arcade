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

// ---------- Word bank ----------

const WORDS = {
  'At the seaside': [
    'LIGHTHOUSE',
    'SANDCASTLE',
    'SEAGULL',
    'PIER',
    'SEASHELL',
    'DECKCHAIR',
    'HARBOUR',
    'TIDEPOOL',
  ],
  'In the kitchen': [
    'SPATULA',
    'COLANDER',
    'WHISK',
    'TEAPOT',
    'SAUCEPAN',
    'ROLLING PIN',
    'TOASTER',
    'LADLE',
  ],
  Animals: [
    'PLATYPUS',
    'FLAMINGO',
    'HEDGEHOG',
    'OCTOPUS',
    'CHAMELEON',
    'PANGOLIN',
    'WALRUS',
    'NARWHAL',
  ],
  Weather: [
    'DRIZZLE',
    'THUNDER',
    'RAINBOW',
    'BLIZZARD',
    'MONSOON',
    'SUNSHINE',
    'HAILSTONE',
    'TORNADO',
  ],
  Music: [
    'TRUMPET',
    'XYLOPHONE',
    'MELODY',
    'ORCHESTRA',
    'TAMBOURINE',
    'HARMONICA',
    'CHORUS',
    'VIOLIN',
  ],
  Space: [
    'ASTEROID',
    'GALAXY',
    'TELESCOPE',
    'COMET',
    'NEBULA',
    'SATELLITE',
    'ECLIPSE',
    'ORBIT',
  ],
};
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const RIBBONS = 6;
function pickWord() {
  const categories = Object.keys(WORDS);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const list = WORDS[category];
  return {
    category,
    word: list[Math.floor(Math.random() * list.length)],
  };
}

// ---------- Kite drawing ----------

function Kite({ lost, won }) {
  const ribbonColors = ['#f6b93b', '#4bb3e6', '#8bd450', '#f2789f', '#a77bf0', '#ffffff'];
  return (
    <svg
      viewBox="0 0 220 300"
      className="w-[min(240px,60vw)] h-auto mx-auto overflow-visible"
      aria-hidden="true"
    >
      {/* String to the ground */}
      <path
        d="M110 150 C 130 220, 60 260, 90 320"
        stroke="currentColor"
        strokeOpacity=".35"
        fill="none"
        strokeWidth="1.5"
      />
      <g className={won ? '' : 'kite-sway'}>
        <polygon points="110,10 175,85 110,150 45,85" fill="var(--kite)" />
        <polygon points="110,10 175,85 110,85" fill="#fff" fillOpacity=".25" />
        <line x1="110" y1="10" x2="110" y2="150" stroke="#00000033" strokeWidth="2" />
        <line x1="45" y1="85" x2="175" y2="85" stroke="#00000033" strokeWidth="2" />
        {/* Tail */}
        <path
          d="M110 150 C 100 175, 125 200, 108 225 C 95 245, 120 265, 110 290"
          stroke="currentColor"
          strokeOpacity=".6"
          fill="none"
          strokeWidth="1.5"
        />
        {Array.from({
          length: RIBBONS,
        }).map((_, i) => {
          const y = 165 + i * 22;
          const x = 110 + Math.sin(i * 1.3) * 10;
          return (
            <g
              key={String(String(i))}
              className={i >= RIBBONS - lost ? 'ribbon-gone' : ''}
            >
              <path d={`M${x} ${y} l -16 -8 l 0 16 z`} fill={ribbonColors[i]} />
              <path d={`M${x} ${y} l 16 -8 l 0 16 z`} fill={ribbonColors[i]} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Kite Letters');

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
  const [round, setRound] = useState(pickWord);
  const [guessed, setGuessed] = useState([]);
  const [streak, setStreak] = useState(() => {
    try {
      return Number(localStorage.getItem('kite-letters-streak')) || 0;
    } catch (e) {
      return 0;
    }
  });
  const letters = new Set(round.word.replace(/[^A-Z]/g, '').split(''));
  const wrong = guessed.filter((l) => !letters.has(l));
  const won = [...letters].every((l) => guessed.includes(l));
  const lost = wrong.length >= RIBBONS;
  const over = won || lost;
  const saveStreak = (value) => {
    setStreak(value);
    try {
      localStorage.setItem('kite-letters-streak', String(value));
    } catch (e) {
      /* storage unavailable */
    }
  };
  const guess = useCallback(
    (letter) => {
      if (over || guessed.includes(letter)) return;
      const next = [...guessed, letter];
      setGuessed(next);
      if (letters.has(letter)) {
        playTone(660 + Math.random() * 120, 0.12);
        if ([...letters].every((l) => next.includes(l))) {
          saveStreak(streak + 1);
          [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => playTone(f, 0.2), i * 100),
          );
        }
      } else {
        playTone(220, 0.25, 'sawtooth', 0.04);
        if (next.filter((l) => !letters.has(l)).length >= RIBBONS) saveStreak(0);
      }
    },
    [over, guessed, letters, streak],
  );
  useEffect(() => {
    const onKey = (e) => {
      const key = e.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) guess(key);
      if (e.key === 'Enter' && over) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guess, over]);
  const next = () => {
    setRound(pickWord());
    setGuessed([]);
  };
  return (
    <main className="font-body max-w-[640px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-hand text-[clamp(44px,12vw,64px)] leading-none">
            Kite Letters
          </h1>
          <p className="text-muted">Guess the word before the wind takes every ribbon.</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
            Streak
          </div>
          <div className="font-hand text-4xl leading-none">{streak}</div>
        </div>
      </header>

      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-center">
        <Kite lost={wrong.length} won={won} />

        <div className="bg-card rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <div className="text-xs font-bold tracking-[.14em] uppercase text-muted">
            Clue: {round.category}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Hidden word">
            {round.word.split(' ').map((part, w) => (
              <div key={String(String(w))} className="flex gap-1.5 mr-3">
                {part.split('').map((ch, i) => {
                  const shown = guessed.includes(ch) || lost;
                  return (
                    <span
                      key={String(String(i))}
                      className={`w-[clamp(22px,6vw,34px)] border-b-[3px] text-center font-hand text-[clamp(26px,7vw,38px)] leading-tight
                          ${shown ? (guessed.includes(ch) ? 'border-good' : 'border-bad text-bad') : 'border-muted'}`}
                    >
                      {shown ? ch : ' '}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="text-sm text-muted">
            Ribbons left: <b className="text-ink">{RIBBONS - wrong.length}</b>
            {wrong.length > 0 && (
              <>
                {' '}
                · Missed:{' '}
                <span className="text-bad font-semibold tracking-widest">
                  {wrong.join(' ')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {over && (
        <div
          className="bg-card rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap"
          role="status"
        >
          <p className="font-hand text-2xl">
            {won
              ? 'Your kite soars! Well guessed.'
              : `The wind won. The word was ${round.word}.`}
          </p>
          <button
            type="button"
            onClick={next}
            className="rounded-full bg-kite text-white px-5 py-2.5 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            Next word
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5" aria-label="Letters">
        {ALPHABET.map((l) => {
          const used = guessed.includes(l);
          const hit = used && letters.has(l);
          return (
            <button
              key={String(String(l))}
              type="button"
              onClick={() => guess(l)}
              disabled={used || over}
              className={`rounded-lg py-2.5 font-hand text-2xl leading-none
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-kite
                  ${hit ? 'bg-good text-white' : used ? 'bg-bad/20 text-bad line-through' : 'bg-card hover:bg-ribbon/40'}
                  disabled:cursor-default`}
            >
              {l}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted">
        Type letters on your keyboard or tap them. Press Enter for the next word.
      </p>
    </main>
  );
}
export default App;
