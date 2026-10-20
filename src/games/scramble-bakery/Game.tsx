import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// ---------- Words ----------

const WORDS = [
  'BREAD',
  'CRUMB',
  'FLOUR',
  'SUGAR',
  'BUTTER',
  'MUFFIN',
  'SCONE',
  'BAGEL',
  'DONUT',
  'TOAST',
  'COOKIE',
  'PASTRY',
  'CRUST',
  'YEAST',
  'DOUGH',
  'WHISK',
  'OVEN',
  'TART',
  'ECLAIR',
  'BROWNIE',
  'CINNAMON',
  'VANILLA',
  'GINGER',
  'HONEY',
  'ALMOND',
  'PRETZEL',
  'WAFFLE',
  'CUSTARD',
  'MERINGUE',
  'BISCUIT',
  'CARAMEL',
  'CHERRY',
  'LEMON',
  'CREAM',
  'SPRINKLE',
  'TOFFEE',
  'NUTMEG',
  'RAISIN',
  'PLANET',
  'GARDEN',
  'WINDOW',
  'BRIDGE',
  'CASTLE',
  'POCKET',
  'MARKET',
  'SILVER',
  'ORANGE',
  'PUZZLE',
];
const ROUND_SECONDS = 90;
function scramble(word) {
  let letters = word.split('');
  do {
    letters = [...letters].sort(() => Math.random() - 0.5);
  } while (letters.join('') === word);
  return letters.map((ch, i) => ({
    id: `${ch}${i}${Math.random()}`,
    ch,
  }));
}

function pickWord(exclude?) {
  let w;
  do {
    w = WORDS[Math.floor(Math.random() * WORDS.length)];
  } while (w === exclude);
  return w;
}

// ---------- Components ----------

function Cookie({ ch, onClick, faded = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pop w-[clamp(40px,11vw,56px)] aspect-square rounded-full bg-dough border-4 border-crust
          shadow-[inset_-4px_-4px_0_rgba(201,138,69,.35),0_4px_0_rgba(58,29,20,.25)]
          font-display text-[clamp(20px,6vw,28px)] text-ink flex items-center justify-center
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-frosting
          ${faded ? 'opacity-30' : ''}`}
    >
      {ch}
    </button>
  );
}

function App() {
  usePageStyles(styles, 'Scramble Bakery');

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
  const [phase, setPhase] = useState('ready'); // ready | playing | done
  const [word, setWord] = useState(() => pickWord());
  const [tray, setTray] = useState(() => scramble(word));
  const [tin, setTin] = useState([]);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [shaking, setShaking] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('scramble-bakery-best')) || 0;
    } catch (e) {
      return 0;
    }
  });

  // Oven timer
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'playing' && timeLeft <= 0) {
      setPhase('done');
      playTone(180, 0.6, 'sawtooth', 0.05);
      if (score > best) {
        setBest(score);
        try {
          localStorage.setItem('scramble-bakery-best', String(score));
        } catch (e) {
          /* storage unavailable */
        }
      }
    }
  }, [timeLeft, phase]);
  const nextWord = (previous) => {
    const w = pickWord(previous);
    setWord(w);
    setTray(scramble(w));
    setTin([]);
  };
  const start = () => {
    setScore(0);
    setSolved(0);
    setTimeLeft(ROUND_SECONDS);
    setRevealed(null);
    nextWord(word);
    setPhase('playing');
  };
  const moveToTin = useCallback(
    (piece) => {
      if (phase !== 'playing') return;
      const nextTin = [...tin, piece];
      setTray((t) => t.filter((p) => p.id !== piece.id));
      setTin(nextTin);
      playTone(500 + nextTin.length * 40, 0.05, 'sine', 0.04);
      if (nextTin.length === word.length) {
        const attempt = nextTin.map((p) => p.ch).join('');
        if (attempt === word) {
          const points = word.length * 10 + Math.max(0, timeLeft);
          setScore((s) => s + points);
          setSolved((n) => n + 1);
          setRevealed(null);
          [659, 784, 988].forEach((f, i) => setTimeout(() => playTone(f, 0.15), i * 80));
          setTimeout(() => nextWord(word), 350);
        } else {
          setShaking(true);
          playTone(200, 0.2, 'square', 0.04);
          setTimeout(() => {
            setShaking(false);
            setTray(scramble(word));
            setTin([]);
          }, 450);
        }
      }
    },
    [phase, tin, word, timeLeft],
  );
  const moveToTray = (piece) => {
    setTin((t) => t.filter((p) => p.id !== piece.id));
    setTray((t) => [...t, piece]);
  };
  const skip = () => {
    setRevealed(word);
    setTimeLeft((t) => Math.max(0, t - 5));
    nextWord(word);
  };

  // Typing support: type a letter to move a matching cookie, Backspace to take one back.
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'playing') {
        if (e.key === 'Enter') start();
        return;
      }
      const key = e.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        const piece = tray.find((p) => p.ch === key);
        if (piece) moveToTin(piece);
      } else if (e.key === 'Backspace' && tin.length) {
        moveToTray(tin[tin.length - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, tray, tin, moveToTin]);
  return (
    <main className="font-body max-w-[640px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(38px,10vw,56px)] leading-none text-counter">
            Scramble Bakery
          </h1>
          <p className="text-muted mt-1">
            The letter cookies came out of the oven in a muddle. Put them back in order.
          </p>
        </div>
        <div className="flex gap-3">
          <Stat
            label="Oven"
            value={`${Math.max(0, timeLeft)}s`}
            warn={timeLeft <= 10 && phase === 'playing'}
          />
          <Stat label="Takings" value={`£${score}`} />
          <Stat label="Best" value={`£${best}`} />
        </div>
      </header>

      <section className="bg-counter rounded-3xl p-5 flex flex-col gap-5 shadow-xl">
        <div>
          <div className="text-[11px] font-bold tracking-[.14em] uppercase text-dough/70 mb-2">
            Cooling tray
          </div>
          <div className="flex flex-wrap gap-2 min-h-[60px]">
            {tray.map((p) => (
              <Cookie
                key={String(String(p.id))}
                ch={phase === 'ready' ? '?' : p.ch}
                onClick={() => moveToTin(p)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold tracking-[.14em] uppercase text-dough/70 mb-2">
            Baking tin · {word.length} letters
          </div>
          <div
            className={`flex flex-wrap gap-2 p-3 rounded-2xl bg-black/25 border-2 border-dashed border-dough/40 min-h-[76px] ${shaking ? 'shake' : ''}`}
          >
            {tin.map((p) => (
              <Cookie
                key={String(String(p.id))}
                ch={p.ch}
                onClick={() => moveToTray(p)}
              />
            ))}
            {Array.from({
              length: word.length - tin.length,
            }).map((_, i) => (
              <span
                key={String(String(i))}
                className="w-[clamp(40px,11vw,56px)] aspect-square rounded-full border-2 border-dough/20"
              />
            ))}
          </div>
        </div>
      </section>

      {phase === 'ready' && (
        <Panel>
          <p>
            You have {ROUND_SECONDS} seconds. Tap the cookies (or type the letters) in the
            right order to spell each word. Faster answers earn more. Skipping a word
            costs 5 seconds.
          </p>
          <button type="button" onClick={start} className="btn">
            Open the shop
          </button>
        </Panel>
      )}

      {phase === 'playing' && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              setTray(scramble(word));
              setTin([]);
            }}
            className="btn-ghost"
          >
            Re-shuffle
          </button>
          <button type="button" onClick={skip} className="btn-ghost">
            Skip word (−5s)
          </button>
          {revealed && (
            <span className="text-sm text-muted">
              That one was <b className="text-ink">{revealed}</b>.
            </span>
          )}
        </div>
      )}

      {phase === 'done' && (
        <Panel>
          <p className="font-display text-2xl">Closing time!</p>
          <p>
            You unscrambled {solved} word{solved === 1 ? '' : 's'} for £{score} in
            takings. Best day so far: £{best}.
          </p>
          <button type="button" onClick={start} className="btn">
            Bake another batch
          </button>
        </Panel>
      )}
    </main>
  );
}

function Stat({ label, value, warn = undefined }) {
  return (
    <div className="bg-white/70 rounded-2xl px-3 py-2 text-center min-w-[72px]">
      <div className="text-[10px] font-extrabold tracking-[.14em] uppercase text-muted">
        {label}
      </div>
      <div className={`font-display text-xl tabular-nums ${warn ? 'text-frosting' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({ children }) {
  return (
    <div className="bg-white/80 rounded-2xl p-5 flex flex-col gap-3 items-start leading-relaxed">
      {children}
    </div>
  );
}
export default App;
