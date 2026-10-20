import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.06, type = 'triangle', volume = 0.04) {
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

// ---------- Business model ----------
// Each upgrade costs more every time you buy one (×1.15) and earns a steady income.

const UPGRADES = [
  {
    id: 'pitcher',
    name: 'Bigger pitcher',
    blurb: '+1 per squeeze',
    cost: 15,
    perClick: 1,
  },
  {
    id: 'neighbour',
    name: 'Helpful neighbour',
    blurb: 'Squeezes 0.5 cups a second',
    cost: 25,
    perSecond: 0.5,
  },
  {
    id: 'stand',
    name: 'Second stand',
    blurb: '3 cups a second',
    cost: 120,
    perSecond: 3,
  },
  {
    id: 'juicer',
    name: 'Electric juicer',
    blurb: '+5 per squeeze',
    cost: 400,
    perClick: 5,
  },
  {
    id: 'kiosk',
    name: 'Beach kiosk',
    blurb: '15 cups a second',
    cost: 1300,
    perSecond: 15,
  },
  {
    id: 'truck',
    name: 'Lemonade truck',
    blurb: '60 cups a second',
    cost: 6000,
    perSecond: 60,
  },
  {
    id: 'orchard',
    name: 'Lemon orchard',
    blurb: '250 cups a second',
    cost: 30000,
    perSecond: 250,
  },
  {
    id: 'factory',
    name: 'Bottling plant',
    blurb: '1,200 cups a second',
    cost: 180000,
    perSecond: 1200,
  },
  {
    id: 'franchise',
    name: 'Global franchise',
    blurb: '7,000 cups a second',
    cost: 1200000,
    perSecond: 7000,
  },
];
const priceOf = (upgrade, owned) => Math.ceil(upgrade.cost * Math.pow(1.15, owned));
function format(n) {
  if (n < 1000) return n.toFixed(n < 10 && n % 1 ? 1 : 0);
  const units = ['K', 'M', 'B', 'T'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  return `${n.toFixed(n < 10 ? 2 : 1)}${units[u]}`;
}
const SAVE_KEY = 'lemonade-empire-save';
function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (data && data.owned) return data;
  } catch (e) {
    // Fall through to a fresh save.
  }
  return {
    cash: 0,
    total: 0,
    owned: {},
    savedAt: Date.now(),
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Lemonade Empire');

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
  const [save, setSave] = useState(loadSave);
  const [floats, setFloats] = useState([]);
  const [squish, setSquish] = useState(false);
  const [offline, setOffline] = useState(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const perClick =
    1 + UPGRADES.reduce((a, u) => a + (u.perClick || 0) * (save.owned[u.id] || 0), 0);
  const perSecond = UPGRADES.reduce(
    (a, u) => a + (u.perSecond || 0) * (save.owned[u.id] || 0),
    0,
  );

  // Earnings while the page was closed (capped at 2 hours).
  useEffect(() => {
    const away = Math.min(7200, (Date.now() - save.savedAt) / 1000);
    const earned = away * perSecond;
    if (earned >= 1) {
      setSave((s) => ({
        ...s,
        cash: s.cash + earned,
        total: s.total + earned,
      }));
      setOffline(earned);
    }
  }, []);

  // Passive income ticks ten times a second.
  useEffect(() => {
    const id = setInterval(() => {
      setSave((s) => {
        const ps = UPGRADES.reduce(
          (a, u) => a + (u.perSecond || 0) * (s.owned[u.id] || 0),
          0,
        );
        return ps
          ? {
              ...s,
              cash: s.cash + ps / 10,
              total: s.total + ps / 10,
            }
          : s;
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Autosave every few seconds and when leaving.
  useEffect(() => {
    const write = () => {
      try {
        localStorage.setItem(
          SAVE_KEY,
          String(
            JSON.stringify({
              ...saveRef.current,
              savedAt: Date.now(),
            }),
          ),
        );
      } catch (e) {
        /* storage unavailable */
      }
    };
    const id = setInterval(write, 3000);
    window.addEventListener('pagehide', write);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', write);
    };
  }, []);
  const squeeze = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
    const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
    setSave((s) => ({
      ...s,
      cash: s.cash + perClick,
      total: s.total + perClick,
    }));
    const id = Math.random();
    setFloats((f) => [
      ...f.slice(-12),
      {
        id,
        x,
        y,
        text: `+${format(perClick)}`,
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((p) => p.id !== id)), 900);
    setSquish(true);
    setTimeout(() => setSquish(false), 90);
    playTone(500 + Math.random() * 200);
  };
  const buy = (u) => {
    const owned = save.owned[u.id] || 0;
    const price = priceOf(u, owned);
    if (save.cash < price) return;
    setSave((s) => ({
      ...s,
      cash: s.cash - price,
      owned: {
        ...s.owned,
        [u.id]: owned + 1,
      },
    }));
    playTone(880, 0.12);
    setTimeout(() => playTone(1175, 0.12), 70);
  };
  const reset = () => {
    const fresh = {
      cash: 0,
      total: 0,
      owned: {},
      savedAt: Date.now(),
    };
    setSave(fresh);
    try {
      localStorage.setItem(SAVE_KEY, String(JSON.stringify(fresh)));
    } catch (e) {
      /* storage unavailable */
    }
  };
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <main className="font-body max-w-[1060px] mx-auto pb-8 flex flex-col gap-5">
      <div className="awning h-14 -mx-4" aria-hidden="true" />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(42px,11vw,70px)] leading-none">
            Lemonade Empire
          </h1>
          <p className="text-muted mt-1">
            From one wobbly stand to a global brand, one squeeze at a time.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-extrabold tracking-[.16em] uppercase text-muted">
            In the till
          </div>
          <div className="font-display text-5xl leading-none tabular-nums">
            ${format(save.cash)}
          </div>
          <div className="text-sm text-muted mt-1">
            ${format(perSecond)} per second · ${format(perClick)} per squeeze
          </div>
        </div>
      </header>

      {offline && (
        <div
          className="rounded-xl bg-lemon/40 px-4 py-3 flex justify-between items-center gap-3"
          role="status"
        >
          <span>
            While you were away, your staff sold <b>${format(offline)}</b> of lemonade.
          </span>
          <button
            type="button"
            onClick={() => setOffline(null)}
            className="font-bold underline"
          >
            Nice
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
        <section className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={squeeze}
            aria-label={`Squeeze a lemon for ${format(perClick)} dollars`}
            className="relative w-[min(320px,76vw)] aspect-square rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-awning"
          >
            <span
              className={`absolute inset-[8%] rounded-[50%_50%_48%_52%/58%_58%_42%_42%] transition-transform duration-75
                  shadow-[inset_-18px_-22px_0_rgba(214,160,0,.35),0_18px_30px_rgba(0,0,0,.18)] ${squish ? 'scale-90' : 'hover:scale-[1.03]'}`}
              style={{
                background:
                  'radial-gradient(circle at 35% 30%, #fff7b0, var(--lemon) 45%, #f2b705)',
              }}
            />
            <span className="absolute top-[4%] left-1/2 -translate-x-1/2 w-[18%] h-[12%] rounded-[0_100%_0_100%] bg-leaf rotate-[-20deg]" />
            {floats.map((f) => (
              <span
                key={String(String(f.id))}
                className="float-up absolute font-display text-3xl text-awning pointer-events-none"
                style={{
                  left: f.x,
                  top: f.y,
                }}
              >
                {f.text}
              </span>
            ))}
          </button>
          <p className="text-sm text-muted">
            Tap the lemon to squeeze. Progress saves itself.
          </p>
          <p className="text-sm text-muted">Lifetime sales: ${format(save.total)}</p>
        </section>

        <section className="flex flex-col gap-2" aria-label="Business upgrades">
          {UPGRADES.map((u, i) => {
            const owned = save.owned[u.id] || 0;
            const price = priceOf(u, owned);
            const affordable = save.cash >= price;
            const visible =
              i === 0 || save.total >= UPGRADES[i - 1].cost * 0.5 || owned > 0;
            if (!visible) {
              return (
                <div
                  key={String(String(u.id))}
                  className="rounded-xl border-2 border-dashed border-muted/40 px-4 py-3 text-muted text-sm"
                >
                  ??? Keep selling to unlock
                </div>
              );
            }
            return (
              <button
                key={String(String(u.id))}
                type="button"
                onClick={() => buy(u)}
                disabled={!affordable}
                className="rounded-xl bg-card px-4 py-3 flex items-center gap-3 text-left shadow-sm border-2 border-transparent
                    enabled:hover:border-lemon disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-awning"
              >
                <span className="w-10 h-10 rounded-full bg-lemon/50 flex items-center justify-center font-extrabold">
                  {owned}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold">{u.name}</span>
                  <span className="block text-sm text-muted">{u.blurb}</span>
                </span>
                <span
                  className={`font-extrabold tabular-nums ${affordable ? 'text-leaf' : 'text-muted'}`}
                >
                  ${format(price)}
                </span>
              </button>
            );
          })}

          <div className="mt-2 text-sm text-muted">
            {confirmReset ? (
              <span>
                Start a brand new business?{' '}
                <button
                  type="button"
                  className="underline font-bold"
                  onClick={() => {
                    reset();
                    setConfirmReset(false);
                  }}
                >
                  Yes, reset
                </button>{' '}
                ·{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="underline"
                onClick={() => setConfirmReset(true)}
              >
                Reset the business
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
export default App;
