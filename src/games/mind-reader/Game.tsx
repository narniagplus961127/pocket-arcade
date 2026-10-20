import React, { useState, useMemo } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.2, type = 'sine', volume = 0.05) {
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

const HANDS = [
  {
    id: 'R',
    name: 'Rock',
    glyph: '✊',
  },
  {
    id: 'P',
    name: 'Paper',
    glyph: '✋',
  },
  {
    id: 'S',
    name: 'Scissors',
    glyph: '✌️',
  },
];
const BEATS = {
  R: 'S',
  P: 'R',
  S: 'P',
}; // key beats value
const COUNTER = {
  R: 'P',
  P: 'S',
  S: 'R',
}; // what beats the key

const TARGET = 10;

// ---------- The mind reader ----------
// She remembers what you played after every recent pair of moves (and single move), and plays
// whatever beats your most likely next move.

function predict(history) {
  const counts = {
    R: 0,
    P: 0,
    S: 0,
  };
  let evidence = 0;
  const tally = (contextLength, weight) => {
    if (history.length <= contextLength) return;
    const context = history.slice(-contextLength).join('');
    for (let i = contextLength; i < history.length; i++) {
      if (history.slice(i - contextLength, i).join('') === context) {
        counts[history[i]] += weight;
        evidence += weight;
      }
    }
  };
  tally(3, 3);
  tally(2, 2);
  tally(1, 1);
  // Overall habits count a little too.
  history.forEach((h) => {
    counts[h] += 0.2;
    evidence += 0.2;
  });
  if (evidence === 0)
    return {
      guess: null,
      confidence: 0,
    };
  const guess = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  return {
    guess,
    confidence: counts[guess] / evidence,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Madame Zoltara');

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
  const [history, setHistory] = useState([]);
  const [log, setLog] = useState([]);
  const [score, setScore] = useState({
    you: 0,
    her: 0,
  });
  const [last, setLast] = useState(null);
  const [shaking, setShaking] = useState(false);
  const prediction = useMemo(() => predict(history), [history]);
  const over = score.you >= TARGET || score.her >= TARGET;
  const play = (hand) => {
    if (over || shaking) return;
    setShaking(true);
    playTone(300, 0.1, 'triangle');
    setTimeout(() => {
      // She commits to her move before seeing yours.
      const her =
        prediction.guess && Math.random() < 0.92
          ? COUNTER[prediction.guess]
          : HANDS[Math.floor(Math.random() * 3)].id;
      const outcome = hand === her ? 'draw' : BEATS[hand] === her ? 'you' : 'her';
      setScore((s) =>
        outcome === 'draw'
          ? s
          : {
              ...s,
              [outcome]: s[outcome] + 1,
            },
      );
      setHistory((h) => [...h, hand]);
      setLast({
        hand,
        her,
        outcome,
        predicted: prediction.guess,
      });
      setLog((l) =>
        [
          {
            hand,
            her,
            outcome,
          },
          ...l,
        ].slice(0, 14),
      );
      setShaking(false);
      if (outcome === 'you') playTone(784, 0.25, 'triangle');
      else if (outcome === 'her') playTone(196, 0.35, 'sawtooth', 0.04);
      else playTone(440, 0.15);
    }, 650);
  };
  const restart = () => {
    setHistory([]);
    setLog([]);
    setScore({
      you: 0,
      her: 0,
    });
    setLast(null);
  };
  const quotes = {
    you: [
      'Hmm… the spirits were cloudy.',
      'A lucky guess, child.',
      'You hide your thoughts well.',
    ],
    her: ['I saw that coming.', 'The cards never lie.', 'Your mind is an open book.'],
    draw: [
      'Our minds met in the middle.',
      'Curious… a reflection.',
      'Great minds, as they say.',
    ],
  };
  const quote = last
    ? quotes[last.outcome][history.length % 3]
    : 'Cross my palm and show me your hand…';
  const byId = (id) => HANDS.find((h) => h.id === id);
  const confidencePct = Math.round(prediction.confidence * 100);
  return (
    <main className="font-body max-w-[760px] mx-auto pb-8 flex flex-col gap-5">
      <div
        className="h-8 -mx-4 bg-velvet border-b-4 border-gold
          [mask:radial-gradient(circle_12px_at_12px_100%,#0000_98%,#000)_0_0/24px_100%]"
        aria-hidden="true"
      />

      <header className="text-center">
        <h1 className="font-display text-[clamp(40px,11vw,68px)] leading-none text-gold">
          Madame Zoltara
        </h1>
        <p className="text-muted mt-2">
          She reads minds. Beat her at rock, paper, scissors. First to {TARGET} wins.
        </p>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="text-center">
          <div className="text-xs tracking-[.2em] uppercase text-muted">You</div>
          <div className="font-display text-6xl">{score.you}</div>
        </div>

        {/* Crystal ball: brightens the more confident she is. */}
        <div className="relative w-[clamp(120px,32vw,180px)] aspect-square">
          <div
            className="absolute inset-0 rounded-full overflow-hidden shadow-[0_0_40px_rgba(155,227,224,.35)]"
            style={{
              background: `radial-gradient(circle at 35% 30%, #ffffffaa, var(--orb) ${30 + confidencePct / 3}%, #0b2b33 90%)`,
            }}
          >
            <div
              className="swirl absolute inset-[-20%] opacity-40"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent, #ffffff55, transparent 30%, #e7b85044, transparent 60%)',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-[clamp(36px,10vw,60px)]">
              {last && !shaking ? byId(last.her).glyph : ''}
            </div>
          </div>
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[70%] h-6 rounded-[50%] bg-gold/80" />
        </div>

        <div className="text-center">
          <div className="text-xs tracking-[.2em] uppercase text-muted">Zoltara</div>
          <div className="font-display text-6xl">{score.her}</div>
        </div>
      </div>

      <p
        className="text-center font-display text-2xl mt-4 min-h-[36px]"
        aria-live="polite"
      >
        “{quote}”
      </p>
      <p className="text-center text-sm text-muted">
        She is {confidencePct}% sure what you'll play next.
      </p>

      {!over ? (
        <div className={`grid grid-cols-3 gap-3 ${shaking ? 'shake' : ''}`}>
          {HANDS.map((h) => (
            <button
              key={String(String(h.id))}
              type="button"
              onClick={() => play(h.id)}
              disabled={shaking}
              className="rounded-2xl bg-velvet border-2 border-gold py-5 flex flex-col items-center gap-1 shadow-xl
                  hover:-translate-y-1 transition-transform disabled:opacity-70
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              <span
                className="text-[clamp(36px,10vw,54px)] leading-none"
                aria-hidden="true"
              >
                {h.glyph}
              </span>
              <span className="font-display text-xl text-gold">{h.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl bg-velvet border-2 border-gold p-5 text-center flex flex-col items-center gap-3"
          role="status"
        >
          <p className="font-display text-3xl text-gold">
            {score.you > score.her
              ? 'You out-thought the oracle!'
              : 'Zoltara saw it all.'}
          </p>
          <p className="text-muted">
            {score.you > score.her
              ? 'Truly unpredictable. Few manage it.'
              : 'Humans fall into patterns without noticing. Try to be truly random.'}
          </p>
          <button
            type="button"
            onClick={restart}
            className="rounded-full bg-gold text-tent font-semibold px-6 py-2.5"
          >
            Another reading
          </button>
        </div>
      )}

      {log.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center" aria-label="Round history">
          {log.map((r, i) => (
            <span
              key={String(String(i))}
              className={`rounded-full px-2.5 py-1 text-sm ${r.outcome === 'you' ? 'bg-gold text-tent' : r.outcome === 'her' ? 'bg-velvet' : 'bg-black/30'}`}
            >
              {byId(r.hand).glyph}
              {byId(r.her).glyph}
            </span>
          ))}
        </div>
      )}

      <p className="text-center text-sm text-muted max-w-[60ch] mx-auto">
        Zoltara keeps track of what you tend to play after each of your recent moves, and
        plays the hand that beats your most likely choice.
      </p>
    </main>
  );
}
export default App;
