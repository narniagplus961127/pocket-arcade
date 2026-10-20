import React, { useState } from 'react';
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

// ---------- Cards ----------

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
function newDeck() {
  const deck = [];
  SUITS.forEach((suit) =>
    RANKS.forEach((rank, value) =>
      deck.push({
        suit,
        rank,
        value,
        id: `${rank}${suit}`,
      }),
    ),
  );
  return deck.sort(() => Math.random() - 0.5);
}

function Card({ card = undefined, faceDown = false, small = false }) {
  const red = card && (card.suit === '♥' || card.suit === '♦');
  const size = small ? 'w-[64px]' : 'w-[clamp(120px,34vw,170px)]';
  if (faceDown) {
    return (
      <div
        className={`${size} aspect-[5/7] rounded-xl border-4 border-gold bg-velvet shadow-xl
          bg-[repeating-linear-gradient(45deg,#e0b54a33_0_3px,transparent_3px_10px)]`}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      className={`deal ${size} aspect-[5/7] rounded-xl bg-card shadow-2xl p-2 flex flex-col justify-between
        ${red ? 'text-suitred' : 'text-[#1a1a1a]'}`}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <div className={`font-display leading-none ${small ? 'text-lg' : 'text-3xl'}`}>
        {card.rank}
        <br />
        {card.suit}
      </div>
      {!small && (
        <div className="text-center text-[clamp(48px,14vw,72px)] leading-none">
          {card.suit}
        </div>
      )}
      <div
        className={`font-display leading-none self-end rotate-180 ${small ? 'text-lg' : 'text-3xl'}`}
      >
        {card.rank}
        <br />
        {card.suit}
      </div>
    </div>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'High Low Riverboat');

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
  const [deck, setDeck] = useState(newDeck);
  const [current, setCurrent] = useState(() => deck[0]);
  const [position, setPosition] = useState(1);
  const [run, setRun] = useState(0);
  const [bank, setBank] = useState(() => {
    try {
      return Number(localStorage.getItem('riverboat-bank')) || 100;
    } catch (e) {
      return 100;
    }
  });
  const [stake, setStake] = useState(10);
  const [inPlay, setInPlay] = useState(false);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState(
    'Place a stake and guess whether the next card is higher or lower.',
  );
  const pot = inPlay ? Math.round(stake * Math.pow(1.5, run)) : 0;
  const saveBank = (value) => {
    setBank(value);
    try {
      localStorage.setItem('riverboat-bank', String(value));
    } catch (e) {
      /* storage unavailable */
    }
  };
  const drawNext = () => {
    let d = deck;
    let p = position;
    if (p >= d.length) {
      d = newDeck();
      p = 0;
      setDeck(d);
      setMessage('The dealer shuffles a fresh deck.');
    }
    setPosition(p + 1);
    return d[p];
  };
  const guess = (direction) => {
    let stakeNow = stake;
    if (!inPlay) {
      if (bank < stake) {
        setMessage('Not enough chips for that stake.');
        return;
      }
      saveBank(bank - stake);
      setInPlay(true);
      stakeNow = stake;
    }
    const next = drawNext();
    setHistory((h) => [current, ...h].slice(0, 8));
    setCurrent(next);
    const correct =
      (direction === 'higher' && next.value > current.value) ||
      (direction === 'lower' && next.value < current.value);
    if (next.value === current.value) {
      setMessage(`A tie. ${next.rank} matches, so the run stands.`);
      playTone(440, 0.1);
      return;
    }
    if (correct) {
      const nextRun = run + 1;
      setRun(nextRun);
      setMessage(
        `Right! The pot is now ${Math.round(stakeNow * Math.pow(1.5, nextRun))} chips. Cash out or keep going.`,
      );
      playTone(523 + nextRun * 60, 0.15);
    } else {
      setRun(0);
      setInPlay(false);
      setMessage(`Wrong way. The pot sinks to the bottom of the Mississippi.`);
      playTone(160, 0.4, 'sawtooth', 0.05);
      if (bank - (inPlay ? 0 : stakeNow) <= 0)
        setMessage('Out of chips. The captain lends you 100 to keep playing.');
    }
  };
  const cashOut = () => {
    if (!inPlay || run === 0) return;
    saveBank(bank + pot);
    setMessage(`You pocket ${pot} chips.`);
    [659, 784, 988].forEach((f, i) => setTimeout(() => playTone(f, 0.15), i * 90));
    setRun(0);
    setInPlay(false);
  };

  // A friendly safety net so the game never gets stuck.
  if (!inPlay && bank <= 0) {
    setTimeout(() => saveBank(100), 0);
  }
  return (
    <main className="font-body max-w-[760px] mx-auto py-6 flex flex-col gap-5">
      <header className="text-center border-y-2 border-gold/60 py-3">
        <div className="text-[11px] tracking-[.3em] uppercase text-muted">
          The Belle of Natchez · Card Room
        </div>
        <h1 className="font-display text-[clamp(34px,9vw,58px)] leading-none text-gold mt-1">
          High Low Riverboat
        </h1>
      </header>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Chips" value={bank} />
        <Stat label="Run" value={run} />
        <Stat label="Pot" value={pot} highlight={inPlay} />
      </div>

      <div className="flex items-center justify-center gap-6 py-2">
        <Card key={String(String(current.id + position))} card={current} />
        <div className="flex flex-col items-center gap-2">
          <Card faceDown />
          <span className="text-xs text-muted">{deck.length - position} left</span>
        </div>
      </div>

      <p className="text-center font-semibold min-h-[48px]" aria-live="polite">
        {message}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <GameButton onClick={() => guess('higher')}>▲ Higher</GameButton>
        <GameButton onClick={() => guess('lower')}>▼ Lower</GameButton>
        <GameButton onClick={cashOut} disabled={!inPlay || run === 0} variant="ghost">
          Cash out {pot || ''}
        </GameButton>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm text-muted mr-1">Stake:</span>
        {[5, 10, 25, 50].map((s) => (
          <button
            key={String(String(s))}
            type="button"
            disabled={inPlay}
            onClick={() => setStake(s)}
            className={`w-12 h-12 rounded-full border-4 border-dashed font-bold text-sm disabled:opacity-40
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold
                ${stake === s ? 'bg-gold text-deep border-deep' : 'border-gold text-gold'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div
          className="flex gap-2 justify-center flex-wrap opacity-80"
          aria-label="Previous cards"
        >
          {history.map((c, i) => (
            <Card key={String(String(c.id + i))} card={c} small />
          ))}
        </div>
      )}

      <p className="text-sm text-muted text-center max-w-[60ch] mx-auto leading-relaxed">
        Aces are high. Each correct guess multiplies the pot by 1.5. Cash out any time
        after a correct guess, because one wrong call loses the whole pot. A tie doesn't
        count either way.
      </p>
    </main>
  );
}

function Stat({ label, value, highlight = undefined }) {
  return (
    <div
      className={`rounded-lg border border-gold/40 py-2 ${highlight ? 'bg-gold/15' : 'bg-black/20'}`}
    >
      <div className="text-[11px] tracking-[.18em] uppercase text-muted">{label}</div>
      <div className="font-display text-3xl text-gold tabular-nums">{value}</div>
    </div>
  );
}

function GameButton({ children, variant = undefined, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`font-display text-xl px-6 py-3 rounded-full disabled:opacity-40
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2
          ${variant === 'ghost' ? 'border-2 border-gold text-gold' : 'bg-gold text-deep shadow-[0_5px_0_#8a6a1e]'}`}
    >
      {children}
    </button>
  );
}
export default App;
