import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Morse ----------

const CODE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
};

// Koch-method order: start with a few distinct letters, add one at a time.
const LESSON_ORDER = 'ETAIMNSOHRDUKGWLCFBPYVXJQZ'.split('');
const UNIT = 0.09; // seconds per dot

let audioCtx = null;

// Plays the code with a sine tone. Calls onSymbol(true/false) as the lamp turns on and off.
function playMorse(code, onSymbol) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    audioCtx = null;
  }
  let t = 0;
  const timers = [];
  const now = audioCtx ? audioCtx.currentTime + 0.05 : 0;
  for (const symbol of code) {
    const length = symbol === '.' ? UNIT : UNIT * 3;
    if (audioCtx) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 620;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.08, now + t + 0.005);
      gain.gain.setValueAtTime(0.08, now + t + length - 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + length);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + t);
      osc.stop(now + t + length + 0.02);
    }
    timers.push(setTimeout(() => onSymbol(true), (t + 0.05) * 1000));
    timers.push(setTimeout(() => onSymbol(false), (t + length + 0.05) * 1000));
    t += length + UNIT;
  }
  return {
    duration: t,
    cancel: () => timers.forEach(clearTimeout),
  };
}

function chime(freq) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Morse Telegraph');

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
  const [known, setKnown] = useState(() => {
    try {
      return Number(localStorage.getItem('morse-known')) || 4;
    } catch (e) {
      return 4;
    }
  });
  const [letter, setLetter] = useState(null);
  const [lamp, setLamp] = useState(false);
  const [tape, setTape] = useState([]); // { letter, code, right }
  const [streak, setStreak] = useState(0);
  const [showCode, setShowCode] = useState(true);
  const [message, setMessage] = useState(
    'Press "Send a letter" and listen for the code.',
  );
  const playback = useRef(null);
  const pool = LESSON_ORDER.slice(0, known);
  const send = useCallback(
    (target = undefined) => {
      if (playback.current) playback.current.cancel();
      const next = target || pool[Math.floor(Math.random() * pool.length)];
      setLetter(next);
      setMessage('Which letter was that?');
      playback.current = playMorse(CODE[next], setLamp);
    },
    [pool],
  );
  const guess = useCallback(
    (g) => {
      if (!letter) return;
      const right = g === letter;
      setTape((t) =>
        [
          {
            letter,
            code: CODE[letter],
            right,
            guess: g,
          },
          ...t,
        ].slice(0, 12),
      );
      if (right) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        chime(880);
        // Every 8 in a row unlocks a new letter.
        if (nextStreak % 8 === 0 && known < LESSON_ORDER.length) {
          const k = known + 1;
          setKnown(k);
          try {
            localStorage.setItem('morse-known', String(k));
          } catch (e) {
            /* storage unavailable */
          }
          setMessage(
            `Right! New letter unlocked: ${LESSON_ORDER[k - 1]} (${CODE[LESSON_ORDER[k - 1]]}).`,
          );
        } else {
          setMessage(`Right, ${letter} is ${CODE[letter]}.`);
        }
        setTimeout(() => send(), 900);
      } else {
        setStreak(0);
        chime(220);
        setMessage(`That was ${letter} (${CODE[letter]}), not ${g}. Listen again.`);
        setTimeout(() => send(letter), 1300);
      }
      setLetter(null);
    },
    [letter, streak, known, send],
  );
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toUpperCase();
      if (CODE[k] && pool.includes(k)) guess(k);
      else if (e.key === ' ') {
        e.preventDefault();
        if (letter) send(letter);
        else send();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guess, send, letter, pool]);
  useEffect(() => () => playback.current && playback.current.cancel(), []);
  return (
    <main className="font-mono max-w-[760px] mx-auto py-6 flex flex-col gap-5">
      <header className="text-center">
        <div className="text-[11px] tracking-[.3em] uppercase text-muted">
          Western Union · Night Desk
        </div>
        <h1 className="font-display text-[clamp(40px,11vw,66px)] leading-none text-brass mt-1">
          Morse Telegraph
        </h1>
        <p className="text-muted mt-2">
          Learn to read Morse by ear, one letter at a time.
        </p>
      </header>

      <section
        className="bg-desk rounded-2xl p-5 shadow-2xl flex flex-col gap-4 items-center"
        style={{
          backgroundImage:
            'repeating-linear-gradient(95deg, rgba(255,255,255,.03) 0 5px, transparent 5px 16px)',
        }}
      >
        <div className="flex items-center gap-6">
          <div
            aria-hidden="true"
            className={`w-20 h-20 rounded-full border-[6px] border-brass transition-all duration-75
                ${lamp ? 'bg-lamp shadow-[0_0_40px_#ffcf6b]' : 'bg-[#3a2416]'}`}
          />
          <div className="text-left">
            <div className="text-xs uppercase tracking-widest text-muted">
              Letters on the course
            </div>
            <div className="font-display text-3xl text-brass">{known} / 26</div>
            <div className="text-xs text-muted">
              Streak {streak} · next letter at {8 - (streak % 8)} more
            </div>
          </div>
        </div>

        <div
          className="w-full bg-tape text-[#2a1a10] rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap shadow-inner min-h-[48px]"
          aria-label="Paper tape"
        >
          {tape.length === 0 && (
            <span className="opacity-50">The paper tape is blank.</span>
          )}
          {tape.map((t, i) => (
            <span
              key={String(String(i))}
              className={`inline-block mr-5 ${i === 0 ? 'font-semibold' : 'opacity-60'}`}
            >
              <span className="tracking-[.2em]">
                {t.code.replace(/\./g, '•').replace(/-/g, '—')}
              </span>
              <span className={t.right ? '' : 'line-through text-[#a0281a]'}>
                {t.guess}
              </span>
              {!t.right && <span> → {t.letter}</span>}
            </span>
          ))}
        </div>

        <p className="text-center min-h-[24px]" aria-live="polite">
          {message}
        </p>

        <div className="flex gap-2 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => send(letter || undefined)}
            className="rounded-full bg-brass text-[#2a1a10] px-6 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {letter ? 'Repeat' : 'Send a letter'}{' '}
            <span className="opacity-70 text-xs">(Space)</span>
          </button>
        </div>
      </section>

      <div
        className="grid grid-cols-5 sm:grid-cols-7 gap-2"
        aria-label="Letters on the course"
      >
        {pool.map((l) => (
          <button
            key={String(String(l))}
            type="button"
            onClick={() => guess(l)}
            disabled={!letter}
            className="rounded-lg border-2 border-brass/60 bg-black/20 py-2 flex flex-col items-center disabled:opacity-50
                hover:bg-brass/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
          >
            <span className="font-display text-2xl text-brass leading-none">{l}</span>
            {showCode && (
              <span className="text-[11px] tracking-[.15em] text-muted mt-1">
                {CODE[l].replace(/\./g, '•').replace(/-/g, '—')}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center text-sm text-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCode}
            onChange={(e) => setShowCode(e.target.checked)}
          />
          Show the codes on the letter board
        </label>
        <button
          type="button"
          onClick={() => {
            setKnown(4);
            setStreak(0);
            try {
              localStorage.setItem('morse-known', String(4));
            } catch (e) {
              /* ok */
            }
          }}
          className="underline ml-auto"
        >
          Restart the course
        </button>
      </div>

      <p className="text-sm text-muted leading-relaxed">
        A dot is a short beep and a dash is three times longer. Get eight right in a row
        and a new letter joins the course. Hide the codes once you're confident, so you're
        reading by ear alone. Type letters on your keyboard to answer.
      </p>
    </main>
  );
}
export default App;
