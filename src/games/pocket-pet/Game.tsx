import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound (square-wave beeps, like the real toys) ----------

let audioCtx = null;
function beep(freqs) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.09;
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.03, t);
      gain.gain.setValueAtTime(0.0001, t + 0.07);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    });
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Pet sprites (8×8 pixel art, one string per row) ----------

const SPRITES = {
  egg: [
    '..####..',
    '.#....#.',
    '#..#...#',
    '#.....##',
    '#.#....#',
    '#....#.#',
    '.#....#.',
    '..####..',
  ],
  happy: [
    '..#..#..',
    '.######.',
    '#.#..#.#',
    '#......#',
    '#.#..#.#',
    '#..##..#',
    '.######.',
    '.#....#.',
  ],
  neutral: [
    '..#..#..',
    '.######.',
    '#.#..#.#',
    '#......#',
    '#......#',
    '#.####.#',
    '.######.',
    '.#....#.',
  ],
  sad: [
    '..#..#..',
    '.######.',
    '#.#..#.#',
    '#......#',
    '#..##..#',
    '#.#..#.#',
    '.######.',
    '.#....#.',
  ],
  sleep: [
    '........',
    '..#..#..',
    '.######.',
    '#.##.###',
    '#......#',
    '#..##..#',
    '.######.',
    '........',
  ],
  sick: [
    '..#..#..',
    '.######.',
    '#.#..#.#',
    '#..#...#',
    '#......#',
    '#.#.#..#',
    '.######.',
    '.#....#.',
  ],
};
function Sprite({ name, flip }) {
  const rows = SPRITES[name];
  return (
    <svg
      viewBox="0 0 8 8"
      className="w-[46%] h-auto"
      style={{
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
      aria-hidden="true"
    >
      {rows.map((row, y) =>
        row
          .split('')
          .map((ch, x) =>
            ch === '#' ? (
              <rect
                key={String(String(`${x}-${y}`))}
                x={x}
                y={y}
                width="1"
                height="1"
                fill="var(--pixel)"
              />
            ) : null,
          ),
      )}
    </svg>
  );
}

// ---------- Pet state ----------

const SAVE_KEY = 'pocket-pet-save';
const NAMES = ['Mochi', 'Pip', 'Bean', 'Noodle', 'Tofu', 'Pebble', 'Biscuit', 'Sprout'];
function newPet() {
  return {
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    born: Date.now(),
    hunger: 80,
    fun: 80,
    energy: 80,
    clean: 90,
    asleep: false,
    poop: 0,
    alive: true,
    hatched: false,
    updated: Date.now(),
  };
}

function loadPet() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (p && p.name) return p;
  } catch (e) {
    // Fresh pet.
  }
  return newPet();
}
const clamp = (v) => Math.max(0, Math.min(100, v));

// Advances the pet by `seconds` of time. Stats fall slowly; sleeping restores energy.
function tick(pet, seconds) {
  if (!pet.alive || !pet.hatched) return pet;
  const p = {
    ...pet,
  };
  const rate = seconds / 60; // one point per minute at base rate
  p.hunger = clamp(p.hunger - rate * 1.6);
  p.fun = clamp(p.fun - rate * (p.asleep ? 0.3 : 1.3));
  p.energy = clamp(p.energy + (p.asleep ? rate * 6 : -rate * 0.9));
  p.clean = clamp(p.clean - rate * (0.5 + p.poop * 1.5));
  if (Math.random() < seconds / 300 && p.poop < 3) p.poop += 1;
  if (p.asleep && p.energy >= 100) p.asleep = false;
  if (p.hunger <= 0 && p.clean <= 0) p.alive = false;
  p.updated = Date.now();
  return p;
}

function mood(p) {
  if (!p.hatched) return 'egg';
  if (p.asleep) return 'sleep';
  if (p.clean < 25 || p.poop >= 3) return 'sick';
  const avg = (p.hunger + p.fun + p.energy + p.clean) / 4;
  return avg > 65 ? 'happy' : avg > 35 ? 'neutral' : 'sad';
}

// ---------- Components ----------

function Meter({ label, value }) {
  return (
    <div className="flex items-center gap-1 font-pixel text-[9px] text-pixel">
      <span className="w-9">{label}</span>
      <span className="flex gap-[2px]">
        {Array.from({
          length: 5,
        }).map((_, i) => (
          <span
            key={String(String(i))}
            className={`w-2 h-2 ${value > i * 20 ? 'bg-pixel' : 'border border-pixel/60'}`}
          />
        ))}
      </span>
    </div>
  );
}

function App() {
  usePageStyles(styles, 'Pocket Pet');

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
  const [pet, setPet] = useState(() => {
    const p = loadPet();
    // Catch up on time away (capped at 8 hours, and gentler while you're gone).
    const away = Math.min(8 * 3600, (Date.now() - p.updated) / 1000);
    return tick(p, away * 0.5);
  });
  const [menu, setMenu] = useState(0);
  const [bubble, setBubble] = useState(null);
  const [flip, setFlip] = useState(false);
  const petRef = useRef(pet);
  petRef.current = pet;

  // Live ticking and saving.
  useEffect(() => {
    const id = setInterval(() => setPet((p) => tick(p, 2)), 2000);
    const wander = setInterval(() => setFlip((f) => !f), 1300);
    return () => {
      clearInterval(id);
      clearInterval(wander);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, String(JSON.stringify(pet)));
    } catch (e) {
      /* storage unavailable */
    }
  }, [pet]);
  const say = (text) => {
    setBubble(text);
    setTimeout(() => setBubble(null), 1600);
  };
  const ACTIONS = [
    {
      label: 'FEED',
      run: (p) => {
        beep([660, 880]);
        say('Yum!');
        return {
          ...p,
          hunger: clamp(p.hunger + 30),
          clean: clamp(p.clean - 5),
        };
      },
    },
    {
      label: 'PLAY',
      run: (p) => {
        if (p.energy < 15) {
          say('Too tired…');
          return p;
        }
        beep([523, 659, 784]);
        say('Wheee!');
        return {
          ...p,
          fun: clamp(p.fun + 30),
          energy: clamp(p.energy - 12),
          hunger: clamp(p.hunger - 6),
        };
      },
    },
    {
      label: 'CLEAN',
      run: (p) => {
        beep([880, 660, 880]);
        say('Sparkly!');
        return {
          ...p,
          clean: 100,
          poop: 0,
        };
      },
    },
    {
      label: pet.asleep ? 'WAKE' : 'SLEEP',
      run: (p) => {
        beep([392, 330]);
        say(p.asleep ? 'Morning!' : 'Zzz…');
        return {
          ...p,
          asleep: !p.asleep,
        };
      },
    },
  ];

  // Three-button control, like the original toys: A cycles, B confirms, C cancels.
  const pressA = () => {
    if (!pet.hatched) {
      setPet({
        ...pet,
        hatched: true,
        born: Date.now(),
        updated: Date.now(),
      });
      beep([523, 659, 784, 1047]);
      say('Hello!');
      return;
    }
    setMenu((m) => (m + 1) % ACTIONS.length);
    beep([1200]);
  };
  const pressB = () => {
    if (!pet.alive) {
      setPet(newPet());
      return;
    }
    if (!pet.hatched) {
      pressA();
      return;
    }
    if (pet.asleep && ACTIONS[menu].label !== 'WAKE') {
      say('Shh, sleeping');
      return;
    }
    setPet(ACTIONS[menu].run(pet));
  };
  const pressC = () => {
    beep([300]);
    const m = mood(pet);
    say(
      m === 'happy'
        ? '♥ ♥ ♥'
        : m === 'sad'
          ? 'Pay attention to me!'
          : m === 'sick'
            ? 'Ugh… messy'
            : m === 'sleep'
              ? 'Zzz'
              : 'Hi!',
    );
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'a' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') pressA();
      if (e.key === 'b' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pressB();
      }
      if (e.key === 'c') pressC();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const ageDays = pet.hatched ? Math.floor((Date.now() - pet.born) / 86400000) : 0;
  const ageHours = pet.hatched ? Math.floor((Date.now() - pet.born) / 3600000) % 24 : 0;
  return (
    <main className="font-body max-w-[760px] mx-auto py-6 flex flex-col items-center gap-5">
      <header className="text-center">
        <h1 className="font-pixel text-[clamp(30px,8vw,46px)] leading-none font-bold">
          Pocket Pet
        </h1>
        <p className="text-muted mt-2 max-w-[48ch]">
          A tiny creature lives in this egg. Feed it, play with it, clean up after it, and
          let it sleep. It keeps living while you're away.
        </p>
      </header>

      <div
        className="relative w-[min(340px,86vw)] aspect-[5/6] rounded-[50%_50%_46%_46%/58%_58%_42%_42%] bg-shell
          shadow-[inset_-20px_-30px_0_rgba(0,0,0,.12),inset_14px_18px_0_rgba(255,255,255,.25),0_20px_40px_rgba(0,0,0,.2)]
          flex flex-col items-center justify-center gap-5 p-8"
      >
        <div className="w-[78%] aspect-square rounded-2xl bg-[#3a1f18]/80 p-2.5 shadow-inner">
          <div
            className="relative w-full h-full rounded-lg bg-lcd flex flex-col p-2 overflow-hidden"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px)',
              backgroundSize: '4px 4px',
            }}
          >
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <Meter label="FOOD" value={pet.hunger} />
              <Meter label="FUN" value={pet.fun} />
              <Meter label="REST" value={pet.energy} />
              <Meter label="TIDY" value={pet.clean} />
            </div>
            <div className="flex-1 flex items-center justify-center relative">
              {pet.alive ? (
                <Sprite name={mood(pet)} flip={flip && !pet.asleep} />
              ) : (
                <span className="font-pixel text-pixel text-center text-xs leading-relaxed">
                  {pet.name} has gone
                  <br />
                  to the stars.
                  <br />B for a new egg
                </span>
              )}
              {bubble && (
                <span className="absolute top-1 right-1 font-pixel text-[9px] bg-lcd border border-pixel px-1 text-pixel">
                  {bubble}
                </span>
              )}
              {Array.from({
                length: pet.poop,
              }).map((_, i) => (
                <span
                  key={String(String(i))}
                  className="absolute bottom-0 font-pixel text-pixel text-xs"
                  style={{
                    left: `${10 + i * 14}%`,
                  }}
                >
                  ●
                </span>
              ))}
            </div>
            <div className="flex justify-between font-pixel text-[9px] text-pixel">
              {pet.hatched ? (
                ACTIONS.map((a, i) => (
                  <span
                    key={String(String(a.label))}
                    className={i === menu ? 'bg-pixel text-lcd px-0.5' : ''}
                  >
                    {a.label}
                  </span>
                ))
              ) : (
                <span>A or B to hatch</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-5">
          {(
            [
              ['A', pressA, 'Next action'],
              ['B', pressB, 'Do it'],
              ['C', pressC, 'Check mood'],
            ] as Array<[string, () => void, string]>
          ).map(([k, fn, label]) => (
            <button
              key={String(String(k))}
              type="button"
              onClick={fn}
              aria-label={`${k}: ${label}`}
              className="w-12 h-12 rounded-full bg-[#ffd4c9] shadow-[0_4px_0_#b5483c] active:translate-y-1 active:shadow-none
                  font-pixel text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="text-center text-sm">
        <p className="font-bold">
          {pet.name} ·{' '}
          {pet.hatched
            ? `${ageDays} day${ageDays === 1 ? '' : 's'}, ${ageHours} h old`
            : 'not hatched yet'}
        </p>
        <p className="text-muted mt-1">
          A: choose an action · B: do it · C: check mood. Keyboard: A, B (or Enter) and C.
        </p>
      </div>
    </main>
  );
}
export default App;
