import React, { useState, useMemo } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.12, type = 'sine', volume = 0.05) {
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

// ---------- Colour model ----------
// Paints mix by a weighted geometric mean of their reflectance in RGB, which behaves roughly like pigment
// (blue + yellow gives a green, not a grey).

const PAINTS = [
  {
    name: 'Lemon yellow',
    rgb: [250, 220, 40],
  },
  {
    name: 'Cadmium red',
    rgb: [215, 40, 40],
  },
  {
    name: 'Ultramarine',
    rgb: [35, 55, 175],
  },
  {
    name: 'Titanium white',
    rgb: [250, 250, 248],
  },
  {
    name: 'Ivory black',
    rgb: [30, 30, 32],
  },
  {
    name: 'Burnt umber',
    rgb: [110, 65, 35],
  },
];
function mix(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return [0, 1, 2].map((ch) => {
    let logSum = 0;
    counts.forEach((n, i) => {
      if (n) logSum += n * Math.log(Math.max(PAINTS[i].rgb[ch], 1) / 255);
    });
    return Math.round(Math.exp(logSum / total) * 255);
  });
}

// Approximate perceptual distance (CIE76 on Lab).
function toLab([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function distance(a, b) {
  const la = toLab(a);
  const lb = toLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
const css = (rgb) => (rgb ? `rgb(${rgb.join(',')})` : 'transparent');

// A target made from a hidden recipe, so it can always be matched exactly.
function makeTarget() {
  const counts = PAINTS.map(() => 0);
  const drops = 2 + Math.floor(Math.random() * 6);
  const used = [...PAINTS.keys()]
    .sort(() => Math.random() - 0.5)
    .slice(0, 2 + Math.floor(Math.random() * 2));
  for (let k = 0; k < drops; k++) counts[used[k % used.length]]++;
  return {
    rgb: mix(counts),
    recipe: counts,
  };
}
const NAMES = [
  'Harbour Fog',
  'Old Moss',
  'Autumn Brick',
  'Morning Lake',
  'Saffron Dust',
  'Plum Shadow',
  'Sea Glass',
  'Clay Path',
  'Olive Grove',
  'Storm Cloud',
];
const ROUNDS = 5;

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Paint Mixer');

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
  const [round, setRound] = useState(1);
  const [target, setTarget] = useState(makeTarget);
  const [name, setName] = useState(() => NAMES[Math.floor(Math.random() * NAMES.length)]);
  const [counts, setCounts] = useState(() => PAINTS.map(() => 0));
  const [scores, setScores] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const mixed = useMemo(() => mix(counts), [counts]);
  const match = mixed
    ? Math.max(0, Math.round(100 - distance(mixed, target.rgb) * 1.6))
    : 0;
  const finished = scores.length === ROUNDS;
  const addDrop = (i) => {
    if (revealed) return;
    setCounts((c) => c.map((n, k) => (k === i ? Math.min(n + 1, 20) : n)));
    playTone(300 + i * 70, 0.08);
  };
  const removeDrop = (i) => {
    if (revealed) return;
    setCounts((c) => c.map((n, k) => (k === i ? Math.max(0, n - 1) : n)));
  };
  const submit = () => {
    if (!mixed || revealed) return;
    setScores([...scores, match]);
    setRevealed(true);
    if (match >= 90)
      [659, 784, 988].forEach((f, k) =>
        setTimeout(() => playTone(f, 0.15, 'triangle'), k * 90),
      );
    else playTone(match > 60 ? 520 : 260, 0.2, 'triangle');
  };
  const nextRound = () => {
    if (finished) {
      const total = scores.reduce((a, b) => a + b, 0);
      try {
        const best = Number(localStorage.getItem('paint-mixer-best')) || 0;
        if (total > best) localStorage.setItem('paint-mixer-best', String(total));
      } catch (e) {
        // Storage may be unavailable.
      }
      setScores([]);
      setRound(1);
    } else {
      setRound(round + 1);
    }
    setTarget(makeTarget());
    setName(NAMES[Math.floor(Math.random() * NAMES.length)]);
    setCounts(PAINTS.map(() => 0));
    setRevealed(false);
  };
  const total = scores.reduce((a, b) => a + b, 0);
  let best = 0;
  try {
    best = Number(localStorage.getItem('paint-mixer-best')) || 0;
  } catch (e) {
    best = 0;
  }
  return (
    <main className="font-body max-w-[900px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-brush text-[clamp(46px,12vw,72px)] leading-none">
            Paint Mixer
          </h1>
          <p className="text-muted">
            Mix paint drops to match each commission. Five colours make a set.
          </p>
        </div>
        <div className="flex gap-5 text-right">
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Round
            </div>
            <div className="font-brush text-3xl">
              {Math.min(round, ROUNDS)}/{ROUNDS}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Set score
            </div>
            <div className="font-brush text-3xl">{total}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Best set
            </div>
            <div className="font-brush text-3xl">{best}</div>
          </div>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-5">
        <figure className="m-0 rounded-2xl overflow-hidden shadow-lg">
          <div
            className="aspect-[4/3]"
            style={{
              background: css(target.rgb),
            }}
          />
          <figcaption className="bg-white text-[#22201d] px-4 py-3 flex justify-between">
            <span className="font-brush text-2xl">“{name}”</span>
            <span className="text-xs text-[#6e695f] self-center tracking-widest uppercase">
              Commission
            </span>
          </figcaption>
        </figure>

        <figure className="m-0 rounded-2xl overflow-hidden shadow-lg">
          <div
            className="aspect-[4/3] flex items-center justify-center bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:24px_24px]"
            style={
              mixed
                ? {
                    background: css(mixed),
                  }
                : undefined
            }
          >
            {!mixed && (
              <span className="text-[#6e695f] font-semibold">Add some paint</span>
            )}
          </div>
          <figcaption className="bg-white text-[#22201d] px-4 py-3 flex justify-between items-center">
            <span className="font-brush text-2xl">Your mix</span>
            <span className="text-sm font-bold tabular-nums">
              {revealed
                ? `${match}% match`
                : `${counts.reduce((a, b) => a + b, 0)} drops`}
            </span>
          </figcaption>
        </figure>
      </div>

      <div className="bg-palette rounded-[50px_50px_50px_120px] p-5 shadow-xl grid grid-cols-3 sm:grid-cols-6 gap-4">
        {PAINTS.map((p, i) => (
          <div
            key={String(String(p.name))}
            className="flex flex-col items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => addDrop(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                removeDrop(i);
              }}
              aria-label={`Add a drop of ${p.name}`}
              className="w-16 h-14 rounded-[45%_55%_50%_50%] shadow-[inset_-5px_-6px_0_rgba(0,0,0,.18),0_4px_0_rgba(0,0,0,.2)]
                  hover:scale-105 active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              style={{
                background: css(p.rgb),
              }}
            />
            <span className="text-[11px] font-semibold text-center leading-tight text-[#2b1d10]">
              {p.name}
            </span>
            <div className="flex items-center gap-1 text-[#2b1d10]">
              <button
                type="button"
                onClick={() => removeDrop(i)}
                aria-label={`Remove a drop of ${p.name}`}
                className="w-6 h-6 rounded-full bg-black/15 font-bold leading-none"
              >
                −
              </button>
              <span className="w-5 text-center font-bold tabular-nums">{counts[i]}</span>
            </div>
          </div>
        ))}
      </div>

      {!revealed ? (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={submit}
            disabled={!mixed}
            className="rounded-full bg-ink text-bg px-6 py-3 font-bold disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-palette"
          >
            Deliver this colour
          </button>
          <button
            type="button"
            onClick={() => setCounts(PAINTS.map(() => 0))}
            className="rounded-full border-2 border-ink px-5 py-3 font-bold"
          >
            Clean the brush
          </button>
        </div>
      ) : (
        <div
          className="rounded-2xl bg-white/60 p-4 flex items-center justify-between gap-3 flex-wrap"
          role="status"
        >
          <p>
            <b className="font-brush text-2xl">
              {match >= 95
                ? 'Perfect!'
                : match >= 80
                  ? 'Lovely work.'
                  : match >= 60
                    ? 'Close enough to sell.'
                    : 'The client squints.'}
            </b>
            The studio's recipe was
            {target.recipe
              .map((n, i) => (n ? `${n} ${PAINTS[i].name.toLowerCase()}` : null))
              .filter(Boolean)
              .join(', ')}
            .
            {finished && (
              <>
                {' '}
                Set total: <b>{total}</b> out of {ROUNDS * 100}.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={nextRound}
            className="rounded-full bg-ink text-bg px-5 py-2.5 font-bold"
          >
            {finished ? 'New set' : 'Next commission'}
          </button>
        </div>
      )}

      <p className="text-sm text-muted">
        Tap a paint to add a drop. Use − or right-click to take one away. Ratios matter
        more than amounts.
      </p>
    </main>
  );
}
export default App;
