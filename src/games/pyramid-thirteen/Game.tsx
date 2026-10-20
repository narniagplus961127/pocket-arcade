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
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function newDeck() {
  const deck = [];
  SUITS.forEach((suit) =>
    RANKS.forEach((rank, i) =>
      deck.push({
        suit,
        rank,
        value: i + 1,
        id: `${rank}${suit}`,
      }),
    ),
  );
  return deck.sort(() => Math.random() - 0.5);
}

// Pyramid positions: row r (0–6) has r+1 cards. Index helpers:
const indexOf = (r, c) => (r * (r + 1)) / 2 + c;
const ROWS = 7;

// A pyramid card is free when both cards that overlap it (in the row below) are gone.
function isFree(pyramid, r, c) {
  if (!pyramid[indexOf(r, c)]) return false;
  if (r === ROWS - 1) return true;
  return !pyramid[indexOf(r + 1, c)] && !pyramid[indexOf(r + 1, c + 1)];
}

function deal() {
  const deck = newDeck();
  return {
    pyramid: deck.slice(0, 28),
    stock: deck.slice(28),
    waste: [],
  };
}

// ---------- Components ----------

function Card({
  card = undefined,
  free = undefined,
  selected = undefined,
  onClick = undefined,
  faceDown = undefined,
  label = undefined,
}) {
  if (!card && !faceDown) {
    return (
      <div
        className="w-[clamp(36px,11vw,62px)] aspect-[5/7] rounded-md border-2 border-dashed border-ink/25"
        aria-hidden="true"
      />
    );
  }
  const red = card && (card.suit === '♥' || card.suit === '♦');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!free && !faceDown}
      aria-label={label || (card ? `${card.rank} of ${card.suit}` : 'Stock pile')}
      className={`w-[clamp(36px,11vw,62px)] aspect-[5/7] rounded-md shadow-lg transition-transform relative
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold
          ${faceDown ? 'bg-sky border-2 border-gold bg-[repeating-linear-gradient(45deg,#f0c35a33_0_2px,transparent_2px_7px)]' : 'bg-card'}
          ${selected ? '-translate-y-2 ring-4 ring-gold' : ''}
          ${!free && !faceDown ? 'brightness-[.62]' : 'hover:-translate-y-1'}`}
    >
      {card && !faceDown && (
        <span
          className={`absolute inset-0 p-1 flex flex-col justify-between ${red ? 'text-[#c0283e]' : 'text-[#1c1638]'}`}
        >
          <span className="font-display text-[clamp(12px,3.4vw,18px)] leading-none text-left">
            {card.rank}
          </span>
          <span className="text-[clamp(16px,5vw,28px)] leading-none text-center">
            {card.suit}
          </span>
        </span>
      )}
    </button>
  );
}

// ---------- App ----------

const MAX_PASSES = 3;
function App() {
  usePageStyles(styles, 'Pyramid Thirteen');

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
  const [game, setGame] = useState(deal);
  const [selected, setSelected] = useState(null); // { from: 'pyramid', index } | { from: 'waste' }
  const [passes, setPasses] = useState(1);
  const [removed, setRemoved] = useState(0);
  const [message, setMessage] = useState(
    'Pair cards that add up to 13. Kings go on their own.',
  );
  const cleared = game.pyramid.every((c) => !c);
  const valueOf = (sel) =>
    sel.from === 'waste' ? game.waste[game.waste.length - 1] : game.pyramid[sel.index];
  const take = (selections) => {
    const pyramid = [...game.pyramid];
    const waste = [...game.waste];
    selections.forEach((s) => {
      if (s.from === 'pyramid') pyramid[s.index] = null;
      else waste.pop();
    });
    const next = {
      ...game,
      pyramid,
      waste,
    };
    setGame(next);
    setRemoved((n) => n + selections.length);
    setSelected(null);
    playTone(700 + selections.length * 100, 0.15);
    if (pyramid.every((c) => !c)) {
      setMessage('The pyramid is cleared. The desert is yours!');
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.25), 200 + i * 110),
      );
      try {
        const wins = (Number(localStorage.getItem('pyramid-wins')) || 0) + 1;
        localStorage.setItem('pyramid-wins', String(wins));
      } catch (e) {
        // Storage may be unavailable.
      }
    }
  };
  const choose = (sel) => {
    const card = valueOf(sel);
    if (!card) return;
    if (card.value === 13) {
      take([sel]);
      setMessage('A king leaves on its own.');
      return;
    }
    if (!selected) {
      setSelected(sel);
      playTone(500, 0.05, 'sine', 0.03);
      return;
    }
    const same = selected.from === sel.from && selected.index === sel.index;
    if (same) {
      setSelected(null);
      return;
    }
    const other = valueOf(selected);
    if (other.value + card.value === 13) {
      take([selected, sel]);
      setMessage(`${other.rank} + ${card.rank} = 13.`);
    } else {
      setSelected(sel);
      setMessage(
        `${other.rank} and ${card.rank} make ${other.value + card.value}, not 13.`,
      );
      playTone(200, 0.1, 'square', 0.03);
    }
  };
  const flipStock = () => {
    setSelected(null);
    if (game.stock.length) {
      const stock = [...game.stock];
      const card = stock.shift();
      setGame({
        ...game,
        stock,
        waste: [...game.waste, card],
      });
      playTone(420, 0.05, 'sine', 0.03);
      return;
    }
    if (passes < MAX_PASSES) {
      setGame({
        ...game,
        stock: [...game.waste],
        waste: [],
      });
      setPasses(passes + 1);
      setMessage(`Pass ${passes + 1} of ${MAX_PASSES} through the stock.`);
    } else {
      setMessage('No passes left. Start a new deal when you are ready.');
    }
  };
  const restart = () => {
    setGame(deal());
    setSelected(null);
    setPasses(1);
    setRemoved(0);
    setMessage('Pair cards that add up to 13. Kings go on their own.');
  };
  const topWaste = game.waste[game.waste.length - 1];
  let wins = 0;
  try {
    wins = Number(localStorage.getItem('pyramid-wins')) || 0;
  } catch (e) {
    wins = 0;
  }
  return (
    <main className="font-body max-w-[760px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(36px,10vw,58px)] leading-none text-gold">
            Pyramid Thirteen
          </h1>
          <p className="text-muted mt-1">
            Solitaire. Clear the pyramid by pairing cards worth 13.
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[11px] tracking-[.16em] uppercase text-muted">
              Removed
            </div>
            <div className="font-display text-2xl">{removed}</div>
          </div>
          <div>
            <div className="text-[11px] tracking-[.16em] uppercase text-muted">Pass</div>
            <div className="font-display text-2xl">
              {passes}/{MAX_PASSES}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-[.16em] uppercase text-muted">
              Pyramids
            </div>
            <div className="font-display text-2xl">{wins}</div>
          </div>
        </div>
      </header>

      <div className="flex flex-col items-center" aria-label="Pyramid">
        {Array.from({
          length: ROWS,
        }).map((_, r) => (
          <div
            key={String(String(r))}
            className="flex gap-1 -mt-[clamp(18px,5vw,34px)] first:mt-0"
          >
            {Array.from({
              length: r + 1,
            }).map((__, c) => {
              const index = indexOf(r, c);
              const card = game.pyramid[index];
              const free = isFree(game.pyramid, r, c);
              return card ? (
                <Card
                  key={String(String(c))}
                  card={card}
                  free={free}
                  selected={
                    selected && selected.from === 'pyramid' && selected.index === index
                  }
                  onClick={() =>
                    free &&
                    choose({
                      from: 'pyramid',
                      index,
                    })
                  }
                />
              ) : (
                <div
                  key={String(String(c))}
                  className="w-[clamp(36px,11vw,62px)] aspect-[5/7]"
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-end justify-center gap-6 mt-4">
        <div className="flex flex-col items-center gap-1">
          {game.stock.length ? (
            <Card
              faceDown
              free
              onClick={flipStock}
              label={`Stock, ${game.stock.length} cards. Tap to turn one over.`}
            />
          ) : (
            <button
              type="button"
              onClick={flipStock}
              className="w-[clamp(36px,11vw,62px)] aspect-[5/7] rounded-md border-2 border-dashed border-gold/60 text-gold text-xs"
            >
              {passes < MAX_PASSES ? '↻' : '✕'}
            </button>
          )}
          <span className="text-xs text-ink/80">Stock {game.stock.length}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {topWaste ? (
            <Card
              card={topWaste}
              free
              selected={selected && selected.from === 'waste'}
              onClick={() =>
                choose({
                  from: 'waste',
                })
              }
            />
          ) : (
            <Card card={null} />
          )}
          <span className="text-xs text-ink/80">Waste</span>
        </div>
      </div>

      <p className="text-center font-semibold min-h-[24px] text-ink" aria-live="polite">
        {message}
      </p>

      {cleared && (
        <p className="text-center font-display text-3xl text-gold" role="status">
          Pyramid cleared!
        </p>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={restart}
          className="rounded-full bg-gold text-dusk font-bold px-6 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          New deal
        </button>
      </div>

      <p className="text-sm text-[#2a1a10] bg-sand/70 rounded-xl p-3 leading-relaxed max-w-[64ch] mx-auto">
        A card is free when nothing overlaps it from below. Aces are 1, jacks 11, queens
        12, and kings 13, so kings leave alone. Tap two free cards that add up to 13 to
        remove them. Turn over the stock for more options. You get three passes through
        it.
      </p>
    </main>
  );
}
export default App;
