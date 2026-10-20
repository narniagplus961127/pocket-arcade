import React, { useState, useEffect } from 'react';
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

// ---------- Cards and scoring ----------

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function newShoe() {
  const shoe = [];
  for (let d = 0; d < 4; d++) {
    SUITS.forEach((s) =>
      RANKS.forEach((r) =>
        shoe.push({
          rank: r,
          suit: s,
          id: `${d}${r}${s}`,
        }),
      ),
    );
  }
  return shoe.sort(() => Math.random() - 0.5);
}

// Best total for a hand, counting aces as 11 when that doesn't bust.
function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') {
      aces++;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}
const isBlackjack = (hand) => hand.length === 2 && handValue(hand) === 21;
function Card({ card, hidden = undefined, index }) {
  const red = card.suit === '♥' || card.suit === '♦';
  return (
    <div
      className="slide-in w-[clamp(62px,17vw,92px)] aspect-[5/7] rounded-lg shadow-xl -ml-5 first:ml-0"
      style={{
        animationDelay: `${index * 0.12}s`,
      }}
      aria-label={hidden ? 'Face-down card' : `${card.rank} of ${card.suit}`}
    >
      {hidden ? (
        <div className="w-full h-full rounded-lg border-4 border-card bg-neon bg-[repeating-linear-gradient(45deg,#0b102833_0_4px,transparent_4px_10px)]" />
      ) : (
        <div
          className={`w-full h-full rounded-lg bg-card p-1.5 flex flex-col justify-between ${red ? 'text-[#c81e4a]' : 'text-[#111]'}`}
        >
          <span className="font-display text-2xl leading-none">
            {card.rank}
            <span className="block text-lg">{card.suit}</span>
          </span>
          <span className="text-center text-3xl leading-none">{card.suit}</span>
        </div>
      )}
    </div>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Twenty-One Lounge');

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
  const [shoe, setShoe] = useState(newShoe);
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [phase, setPhase] = useState('betting'); // betting | player | dealer | done
  const [bet, setBet] = useState(25);
  const [chips, setChips] = useState(() => {
    try {
      return Number(localStorage.getItem('lounge-chips')) || 500;
    } catch (e) {
      return 500;
    }
  });
  const [message, setMessage] = useState('Place your bet and deal.');
  const [stake, setStake] = useState(0);
  const saveChips = (value) => {
    const safe = value <= 0 ? 500 : value;
    setChips(safe);
    try {
      localStorage.setItem('lounge-chips', String(safe));
    } catch (e) {
      /* storage unavailable */
    }
  };

  // Draws `n` cards, reshuffling when the shoe runs low.
  const draw = (n, currentShoe = shoe) => {
    let s = currentShoe.length < 20 ? newShoe() : [...currentShoe];
    const cards = s.splice(0, n);
    return {
      cards,
      shoe: s,
    };
  };

  // `chipsNow` is the chip count after the wager was taken.
  const settle = (finalPlayer, finalDealer, wager, chipsNow = chips) => {
    const p = handValue(finalPlayer);
    const d = handValue(finalDealer);
    let payout = 0;
    let text;
    if (p > 21) {
      text = `Bust at ${p}. The house takes it.`;
    } else if (isBlackjack(finalPlayer) && !isBlackjack(finalDealer)) {
      payout = wager * 2.5;
      text = 'Blackjack! Paid three to two.';
    } else if (d > 21) {
      payout = wager * 2;
      text = `Dealer busts at ${d}. You win!`;
    } else if (p > d) {
      payout = wager * 2;
      text = `${p} beats ${d}. You win!`;
    } else if (p === d) {
      payout = wager;
      text = `Push at ${p}. Your bet comes back.`;
    } else {
      text = `Dealer's ${d} beats your ${p}.`;
    }
    setMessage(text);
    setPhase('done');
    saveChips(chipsNow + payout);
    if (payout > wager)
      [659, 784, 988].forEach((f, i) => setTimeout(() => playTone(f, 0.15), i * 90));
    else if (payout === 0) playTone(170, 0.4, 'sawtooth', 0.04);
  };
  const deal = () => {
    if (bet > chips) {
      setMessage('Not enough chips for that bet.');
      return;
    }
    const { cards, shoe: rest } = draw(4);
    const p = [cards[0], cards[2]];
    const d = [cards[1], cards[3]];
    setShoe(rest);
    setPlayer(p);
    setDealer(d);
    setStake(bet);
    setChips((c) => c - bet);
    playTone(500, 0.06);
    if (isBlackjack(p) || isBlackjack(d)) {
      setPhase('done');
      setTimeout(() => settleNow(p, d, bet, chips - bet), 600);
    } else {
      setPhase('player');
      setMessage('Hit, stand, or double down?');
    }
  };

  // Version of settle used straight after the deal, where `chips` has not re-rendered yet.
  const settleNow = (p, d, wager, chipsAfterBet) => {
    let payout = 0;
    let text;
    if (isBlackjack(p) && isBlackjack(d)) {
      payout = wager;
      text = 'Both blackjack. Push.';
    } else if (isBlackjack(p)) {
      payout = wager * 2.5;
      text = 'Blackjack! Paid three to two.';
    } else {
      text = 'Dealer has blackjack.';
    }
    setMessage(text);
    saveChips(chipsAfterBet + payout);
  };
  const hit = () => {
    const { cards, shoe: rest } = draw(1);
    const p = [...player, cards[0]];
    setShoe(rest);
    setPlayer(p);
    playTone(560, 0.05);
    if (handValue(p) > 21) settle(p, dealer, stake);
    else if (handValue(p) === 21) setPhase('dealer');
  };
  const double = () => {
    if (chips < stake) return;
    const { cards, shoe: rest } = draw(1);
    const p = [...player, cards[0]];
    setShoe(rest);
    setPlayer(p);
    setChips((c) => c - stake);
    setStake(stake * 2);
    playTone(620, 0.08);
    if (handValue(p) > 21) settle(p, dealer, stake * 2, chips - stake);
    else setPhase('dealer');
  };

  // Dealer draws to 17.
  useEffect(() => {
    if (phase !== 'dealer') return undefined;
    setMessage('Dealer plays…');
    const id = setTimeout(() => {
      if (handValue(dealer) < 17) {
        const { cards, shoe: rest } = draw(1);
        setShoe(rest);
        setDealer([...dealer, cards[0]]);
        playTone(460, 0.05);
      } else {
        settle(player, dealer, stake);
      }
    }, 650);
    return () => clearTimeout(id);
  }, [phase, dealer]);
  const showDealer = phase === 'dealer' || phase === 'done';
  return (
    <main className="font-body max-w-[820px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(44px,12vw,80px)] leading-none neon-text tracking-wide">
            Twenty-One Lounge
          </h1>
          <p className="text-muted">
            Blackjack after midnight. The dealer stands on 17. Blackjack pays 3 to 2.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] tracking-[.2em] uppercase text-muted">Chips</div>
          <div className="font-display text-5xl leading-none tabular-nums">{chips}</div>
        </div>
      </header>

      <section className="relative bg-felt rounded-t-[50%_120px] rounded-b-3xl px-4 pt-8 pb-6 border-[6px] border-[#3a2516] shadow-2xl flex flex-col gap-6 items-center">
        <span className="absolute top-3 text-[11px] tracking-[.3em] uppercase text-ink/40">
          Dealer must draw to 16 and stand on all 17s
        </span>

        <div className="flex flex-col items-center gap-2 mt-4">
          <div className="text-sm text-muted">
            Dealer {showDealer && dealer.length ? `· ${handValue(dealer)}` : ''}
          </div>
          <div className="flex min-h-[110px]">
            {dealer.map((c, i) => (
              <Card
                key={String(String(c.id))}
                card={c}
                index={i}
                hidden={i === 1 && !showDealer}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex min-h-[110px]">
            {player.map((c, i) => (
              <Card key={String(String(c.id))} card={c} index={i} />
            ))}
          </div>
          <div className="text-sm text-muted">
            You {player.length ? `· ${handValue(player)}` : ''}
            {stake && phase !== 'betting' ? ` · bet ${stake}` : ''}
          </div>
        </div>
      </section>

      <p
        className="text-center font-display text-3xl tracking-wide min-h-[40px]"
        aria-live="polite"
      >
        {message}
      </p>

      {phase === 'player' ? (
        <div className="flex justify-center gap-3 flex-wrap">
          <Action onClick={hit}>Hit</Action>
          <Action onClick={() => setPhase('dealer')}>Stand</Action>
          <Action onClick={double} disabled={player.length !== 2 || chips < stake}>
            Double
          </Action>
        </div>
      ) : phase === 'dealer' ? null : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-2 flex-wrap justify-center">
            {[10, 25, 50, 100].map((v) => (
              <button
                key={String(String(v))}
                type="button"
                onClick={() => setBet(v)}
                className={`w-14 h-14 rounded-full border-[5px] border-dashed font-display text-xl
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon
                    ${bet === v ? 'bg-neon border-white text-night' : 'border-neon text-neon'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Action onClick={deal}>{phase === 'done' ? 'Deal again' : 'Deal'}</Action>
        </div>
      )}

      <p className="text-center text-xs text-muted">
        If you run out of chips, the house lends you 500 to keep the music playing.
      </p>
    </main>
  );
}

function Action({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className="font-display text-2xl tracking-wider px-8 py-2.5 rounded-full bg-neon text-night shadow-[0_0_18px_rgba(255,79,163,.6)]
          disabled:opacity-30 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
    >
      {children}
    </button>
  );
}
export default App;
