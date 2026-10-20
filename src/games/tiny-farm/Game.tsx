import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'triangle', volume = 0.04) {
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

// ---------- Farm rules ----------
// Times are in real seconds. One real second is one minute on the farm clock, so a day lasts 24 minutes.

const CROPS = {
  radish: {
    name: 'Radish',
    seed: 2,
    sell: 5,
    grow: 30,
    unlock: 0,
    color: '#d6336c',
  },
  carrot: {
    name: 'Carrot',
    seed: 4,
    sell: 11,
    grow: 60,
    unlock: 0,
    color: '#f08c2e',
  },
  lettuce: {
    name: 'Lettuce',
    seed: 6,
    sell: 17,
    grow: 80,
    unlock: 25,
    color: '#8cc63f',
  },
  strawberry: {
    name: 'Strawberry',
    seed: 10,
    sell: 32,
    grow: 120,
    unlock: 80,
    color: '#e63946',
  },
  pumpkin: {
    name: 'Pumpkin',
    seed: 20,
    sell: 75,
    grow: 240,
    unlock: 200,
    color: '#f4842a',
  },
  sunflower: {
    name: 'Sunflower',
    seed: 35,
    sell: 130,
    grow: 360,
    unlock: 500,
    color: '#f6c445',
  },
};
const CROP_IDS = Object.keys(CROPS);
const TOTAL_PLOTS = 16;
const START_PLOTS = 4;
const WATER_LASTS = 90; // one watering keeps the soil damp this long
const DRY_RATE = 0.35; // dry crops grow at this fraction of full speed
const WILT_TIME = 150; // seconds of dryness before a growing crop withers
const CROW_GRACE = 6; // seconds to shoo a crow before it steals the crop
const SCARECROW_PRICE = 60;
const OFFLINE_CAP = 7200; // growth while away is capped at two hours
const SAVE_KEY = 'tiny-farm-save-v1';
const plotPrice = (unlocked) => Math.round(20 * Math.pow(1.6, unlocked - START_PLOTS));
const emptyPlot = () => ({
  crop: null,
  growth: 0,
  water: 0,
  wilt: 0,
  dead: false,
});
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function freshFarm() {
  return {
    coins: 15,
    plots: Array.from(
      {
        length: TOTAL_PLOTS,
      },
      emptyPlot,
    ),
    unlocked: START_PLOTS,
    seeds: {
      radish: 4,
    },
    barn: {},
    crops: ['radish', 'carrot'],
    scarecrow: false,
    clock: 6 * 60,
    crow: null,
    crowTimer: 50,
    harvested: 0,
    savedAt: Date.now(),
  };
}

function loadFarm() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (data && Array.isArray(data.plots) && data.plots.length === TOTAL_PLOTS) {
      return {
        ...freshFarm(),
        ...data,
      };
    }
  } catch (e) {
    // Fall through to a fresh farm.
  }
  return null;
}

function saveFarm(farm) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      String(
        JSON.stringify({
          ...farm,
          savedAt: Date.now(),
        }),
      ),
    );
  } catch (e) {
    /* storage unavailable */
  }
}

// Moves the farm forward by dt seconds. `online` is false while catching up after being away:
// then crows stay home and nothing withers completely.
function advance(s, dt, online) {
  const events = [];
  const plots = s.plots.map((p) => {
    if (!p.crop || p.dead) return p;
    const crop = CROPS[p.crop];
    const wet = p.water > 0;
    let growth = p.growth;
    let wilt = p.wilt;
    if (growth < 1) {
      growth = Math.min(1, growth + (dt / crop.grow) * (wet ? 1 : DRY_RATE));
      // Damp soil revives a drooping plant; dry soil makes it droop further.
      wilt = wet ? Math.max(0, wilt - dt / 40) : wilt + dt / WILT_TIME;
    }
    const water = Math.max(0, p.water - dt / WATER_LASTS);
    let dead = false;
    if (wilt >= 1) {
      if (online) {
        dead = true;
        events.push({
          type: 'withered',
          crop: p.crop,
        });
      } else {
        wilt = 0.95;
      }
    }
    return {
      ...p,
      growth,
      water,
      wilt,
      dead,
    };
  });
  const clock = s.clock + dt;
  let crow = s.crow;
  let crowTimer = s.crowTimer;

  // Crows: one at a time, only in daylight, never when the scarecrow stands guard.
  if (online && !s.scarecrow) {
    if (crow) {
      const target = plots[crow.plot];
      const left = crow.left - dt;
      if (!target.crop || target.dead) {
        crow = null;
      } else if (left <= 0) {
        events.push({
          type: 'stolen',
          crop: target.crop,
        });
        plots[crow.plot] = emptyPlot();
        crow = null;
      } else {
        crow = {
          ...crow,
          left,
        };
      }
    } else {
      crowTimer -= dt;
      if (crowTimer <= 0) {
        crowTimer = rnd(40, 80);
        const hour = (clock / 60) % 24;
        const targets = plots
          .map((p, i) => i)
          .filter(
            (i) =>
              i < s.unlocked && plots[i].crop && !plots[i].dead && plots[i].growth > 0.25,
          );
        if (targets.length && hour >= 6 && hour < 20) {
          crow = {
            plot: pick(targets),
            left: CROW_GRACE,
          };
          events.push({
            type: 'crow',
          });
        }
      }
    }
  }
  if (s.scarecrow) crow = null;
  return {
    next: {
      ...s,
      plots,
      clock,
      crow,
      crowTimer,
    },
    events,
  };
}

// ---------- Time of day ----------

function skyAt(clock) {
  const hour = (clock / 60) % 24;
  let night = 0;
  if (hour >= 18 && hour < 21) night = (hour - 18) / 3;
  else if (hour >= 21 || hour < 4) night = 1;
  else if (hour >= 4 && hour < 7) night = 1 - (hour - 4) / 3;

  // A warm glow around sunrise and sunset.
  let glow = 0;
  if (hour >= 17 && hour < 20) glow = 1 - Math.abs(hour - 18.5) / 1.5;
  if (hour >= 5 && hour < 7.5) glow = 1 - Math.abs(hour - 6.25) / 1.25;
  return {
    hour,
    night,
    glow: Math.max(0, glow),
  };
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(String(a.slice(i, i + 2)), 16));
  const pb = [1, 3, 5].map((i) => parseInt(String(b.slice(i, i + 2)), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}
const clockLabel = (clock) => {
  const day = Math.floor(clock / 1440) + 1;
  const mins = Math.floor(clock % 1440);
  return `Day ${day} · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

// ---------- Drawings ----------

function SkyStrip({ clock, scarecrow, crow }) {
  const { hour, night, glow } = skyAt(clock);
  let sky = mix('#9fd3ec', '#1d2650', night);
  if (glow > 0) sky = mix(night > 0.5 ? '#1d2650' : '#9fd3ec', '#f59e5b', glow * 0.55);

  // Sun by day, moon by night, both travelling along an arc.
  const dayT = (hour - 6) / 12;
  const nightT = ((hour + 6) % 24) / 12;
  const sun =
    dayT >= 0 && dayT <= 1
      ? {
          x: 20 + dayT * 360,
          y: 92 - Math.sin(dayT * Math.PI) * 74,
        }
      : null;
  const moon = !sun
    ? {
        x: 20 + nightT * 360,
        y: 92 - Math.sin(nightT * Math.PI) * 70,
      }
    : null;
  return (
    <svg
      viewBox="0 0 400 110"
      className="w-full block rounded-2xl"
      role="img"
      aria-label={`Sky over the farm, ${night > 0.6 ? 'night' : glow > 0.3 ? 'twilight' : 'daytime'}`}
    >
      <rect x="0" y="0" width="400" height="110" fill={sky} />
      {night > 0.4 &&
        [
          [40, 18],
          [90, 34],
          [150, 12],
          [210, 28],
          [270, 16],
          [330, 36],
          [370, 14],
          [120, 50],
        ].map(([x, y], k) => (
          <circle
            key={String(String(k))}
            cx={x}
            cy={y}
            r="1.3"
            fill="#fff8d6"
            opacity={night}
          />
        ))}
      {sun && (
        <circle
          cx={sun.x}
          cy={sun.y}
          r="13"
          fill="#ffd34d"
          stroke="#fff1a8"
          strokeWidth="4"
        />
      )}
      {moon && (
        <g>
          <circle cx={moon.x} cy={moon.y} r="10" fill="#f6f1d3" />
          <circle cx={moon.x + 5} cy={moon.y - 3} r="9" fill={sky} />
        </g>
      )}
      <path d="M0 78 Q 80 48 170 72 T 400 62 V 110 H 0 Z" fill="#7fb25a" />
      <path d="M0 96 Q 120 70 240 92 T 400 86 V 110 H 0 Z" fill="#5d9a45" />
      <g transform="translate(300 60)">
        <rect x="0" y="12" width="34" height="22" fill="#c8453a" />
        <path d="M-4 13 L17 -2 L38 13 Z" fill="#8f2f28" />
        <rect x="13" y="20" width="8" height="14" fill="#f6e7c8" />
        <line x1="13" y1="20" x2="21" y2="34" stroke="#c8453a" strokeWidth="1.5" />
        <line x1="21" y1="20" x2="13" y2="34" stroke="#c8453a" strokeWidth="1.5" />
        {night > 0.5 && <rect x="4" y="16" width="6" height="5" fill="#ffd34d" />}
      </g>
      {scarecrow && (
        <g transform="translate(70 66)">
          <line x1="0" y1="0" x2="0" y2="30" stroke="#7a5a32" strokeWidth="2.5" />
          <line x1="-12" y1="10" x2="12" y2="10" stroke="#7a5a32" strokeWidth="2.5" />
          <rect x="-6" y="6" width="12" height="14" rx="2" fill="#4f6d8f" />
          <circle cx="0" cy="0" r="5" fill="#f2c14e" />
          <path d="M-8 -3 L8 -3 L4 -9 L-4 -9 Z" fill="#7a5a32" />
        </g>
      )}
      {crow && (
        <g transform="translate(180 30)">
          <g
            className="crow-bob"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          >
            <path
              d="M-10 0 Q -4 -6 0 0 Q 4 -6 10 0"
              fill="none"
              stroke="#1f1f1f"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        </g>
      )}
      <rect x="0" y="0" width="400" height="110" fill="#0d1433" opacity={night * 0.25} />
    </svg>
  );
}

// One crop drawn around its root at (0,0), growing upwards. Wilting tilts and yellows it.
function CropArt({ plot }) {
  const { crop, growth, wilt, dead } = plot;
  if (dead) {
    return (
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        <path
          d="M14 34 L16 23 M20 34 L21 19 M26 34 L24 24 M16 23 L12 20 M21 19 L25 16"
          stroke="#7a5a32"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  const info = CROPS[crop];
  const ripe = growth >= 1;
  const leaf = wilt > 0.55 ? '#a39a46' : wilt > 0.25 ? '#76a344' : '#4f9a3c';
  const scale = 0.35 + Math.min(1, growth) * 0.65;
  const sprout = growth < 0.3;
  const leaves = (
    <>
      <path d="M0 0 Q -11 -7 -10 -17 Q -2 -12 0 0 Z" fill={leaf} />
      <path d="M0 0 Q 11 -7 10 -17 Q 2 -12 0 0 Z" fill={leaf} />
      {!sprout && <path d="M0 0 Q -4 -12 0 -21 Q 4 -12 0 0 Z" fill={leaf} />}
    </>
  );
  let body = leaves;
  if (crop === 'radish' && ripe) {
    body = (
      <>
        {leaves}
        <circle cx="0" cy="-1" r="6.5" fill={info.color} />
        <path d="M-1 5 L0 9 L1 5 Z" fill="#fbe3ec" />
      </>
    );
  }
  if (crop === 'carrot' && ripe) {
    body = (
      <>
        {leaves}
        <path d="M-5.5 -3 L5.5 -3 L0 8 Z" fill={info.color} />
      </>
    );
  }
  if (crop === 'lettuce' && !sprout) {
    const light = ripe ? '#a6d65a' : leaf;
    body = (
      <>
        <circle cx="-7" cy="-6" r="6" fill={leaf} />
        <circle cx="7" cy="-6" r="6" fill={leaf} />
        <circle cx="0" cy="-10" r="7" fill={light} />
        <circle cx="0" cy="-4" r="6" fill={light} />
      </>
    );
  }
  if (crop === 'strawberry' && ripe) {
    body = (
      <>
        {leaves}
        {[
          [-9, -3],
          [8, -2],
          [1, -8],
        ].map(([x, y], k) => (
          <g key={String(String(k))}>
            <path
              d={`M${x - 3.5} ${y - 2} Q ${x} ${y - 4} ${x + 3.5} ${y - 2} L ${x} ${y + 4} Z`}
              fill={info.color}
            />
            <circle cx={x - 1} cy={y - 1} r="0.5" fill="#fff3a0" />
            <circle cx={x + 1} cy={y} r="0.5" fill="#fff3a0" />
          </g>
        ))}
      </>
    );
  }
  if (crop === 'pumpkin' && !sprout) {
    body = (
      <>
        {leaves}
        {ripe && (
          <>
            <ellipse cx="3" cy="-6" rx="11" ry="8" fill={info.color} />
            <path
              d="M-2 -13 Q -4 -6 -2 1 M8 -13 Q 10 -6 8 1"
              stroke="#c9631a"
              strokeWidth="1"
              fill="none"
            />
            <rect x="2" y="-17" width="2.5" height="5" fill="#6b8f2a" />
          </>
        )}
      </>
    );
  }
  if (crop === 'sunflower' && !sprout) {
    body = (
      <>
        <line x1="0" y1="0" x2="0" y2="-24" stroke={leaf} strokeWidth="2.5" />
        <path d="M0 -8 Q -9 -10 -10 -17 Q -3 -15 0 -8 Z" fill={leaf} />
        <path d="M0 -12 Q 9 -14 10 -21 Q 3 -19 0 -12 Z" fill={leaf} />
        {ripe ? (
          <g transform="translate(0 -26)">
            {Array.from(
              {
                length: 10,
              },
              (_, k) => (
                <ellipse
                  key={String(String(k))}
                  cx="0"
                  cy="-6"
                  rx="2.4"
                  ry="4.5"
                  fill={info.color}
                  transform={`rotate(${k * 36})`}
                />
              ),
            )}
            <circle cx="0" cy="0" r="4.5" fill="#6b4423" />
          </g>
        ) : (
          <circle cx="0" cy="-25" r="3" fill="#7cae4a" />
        )}
      </>
    );
  }
  return (
    <svg
      viewBox="0 0 40 40"
      className={`absolute inset-0 w-full h-full ${ripe ? 'ripe-wiggle' : ''}`}
      aria-hidden="true"
    >
      <g transform={`translate(20 33) rotate(${wilt * 22}) scale(${scale})`}>{body}</g>
    </svg>
  );
}

function CropIcon({ crop, className = 'w-7 h-7' }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      <CropArt
        plot={{
          crop,
          growth: 1,
          wilt: 0,
          dead: false,
        }}
      />
    </span>
  );
}

function Crow() {
  return (
    <svg
      viewBox="0 0 30 24"
      className="absolute right-[6%] top-[8%] w-[48%] crow-bob pointer-events-none"
      aria-hidden="true"
    >
      <ellipse cx="13" cy="14" rx="9" ry="6" fill="#1f1f24" />
      <circle cx="21" cy="8" r="5" fill="#1f1f24" />
      <path d="M25 7 L30 9 L25 10 Z" fill="#e0a526" />
      <circle cx="22.5" cy="7" r="1" fill="#fff" />
      <path d="M5 12 L0 8 L6 16 Z" fill="#1f1f24" />
      <path d="M10 10 Q 14 2 18 11 Z" fill="#33333b" />
      <line x1="12" y1="19" x2="11" y2="23" stroke="#e0a526" strokeWidth="1.2" />
      <line x1="15" y1="19" x2="16" y2="23" stroke="#e0a526" strokeWidth="1.2" />
    </svg>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Tiny Farm');

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
  const [farm, setFarm] = useState(() => loadFarm() || freshFarm());
  const farmRef = useRef(farm);
  const [selected, setSelected] = useState('radish');
  const [toast, setToast] = useState(null);
  const [away, setAway] = useState(null);
  const [resetStep, setResetStep] = useState(0);
  const [showHelp, setShowHelp] = useState(() => !loadFarm());
  const plotRefs = useRef([]);

  // Every change goes through here so the ref and the screen agree.
  const update = (fn) => {
    const next = fn(farmRef.current);
    farmRef.current = next;
    setFarm(next);
  };
  const say = (text) => {
    const id = Math.random();
    setToast({
      id,
      text,
    });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2600);
  };

  // ---- Catch up on time spent away (capped), in five-second steps ----
  useEffect(() => {
    const elapsed = Math.min(OFFLINE_CAP, (Date.now() - farmRef.current.savedAt) / 1000);
    if (elapsed > 30) {
      let s = farmRef.current;
      for (let t = 0; t < elapsed; t += 5) {
        s = advance(s, Math.min(5, elapsed - t), false).next;
      }
      farmRef.current = s;
      setFarm(s);
      setAway(elapsed);
    }
  }, []);

  // ---- Live clock: four ticks a second ----
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(2, (now - last) / 1000);
      last = now;
      const { next, events } = advance(farmRef.current, dt, true);
      farmRef.current = next;
      setFarm(next);
      events.forEach((ev) => {
        if (ev.type === 'crow') {
          say('A crow has landed! Tap it to shoo it away.');
          playTone(300, 0.15, 'sawtooth', 0.03);
          setTimeout(() => playTone(260, 0.15, 'sawtooth', 0.03), 160);
        }
        if (ev.type === 'stolen') {
          say(`A crow made off with your ${CROPS[ev.crop].name.toLowerCase()}.`);
          playTone(180, 0.3, 'square', 0.03);
        }
        if (ev.type === 'withered') {
          say(`Your ${CROPS[ev.crop].name.toLowerCase()} dried out and withered.`);
          playTone(140, 0.4, 'triangle', 0.04);
        }
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ---- Autosave ----
  useEffect(() => {
    const write = () => saveFarm(farmRef.current);
    const id = setInterval(write, 3000);
    window.addEventListener('pagehide', write);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', write);
    };
  }, []);

  // ---- Actions ----

  const setPlot = (s, i, plot) => {
    const plots = [...s.plots];
    plots[i] = plot;
    return {
      ...s,
      plots,
    };
  };
  const buyPlot = () => {
    const s = farmRef.current;
    if (s.unlocked >= TOTAL_PLOTS) return;
    const price = plotPrice(s.unlocked);
    if (s.coins < price) {
      say(`A new plot costs ${price} coins.`);
      return;
    }
    update((f) => ({
      ...f,
      coins: f.coins - price,
      unlocked: f.unlocked + 1,
    }));
    playTone(523, 0.1);
    setTimeout(() => playTone(784, 0.14), 90);
  };
  const tapPlot = (i) => {
    const s = farmRef.current;
    if (i >= s.unlocked) {
      if (i === s.unlocked) buyPlot();
      return;
    }
    const p = s.plots[i];
    if (s.crow && s.crow.plot === i) {
      update((f) => ({
        ...f,
        crow: null,
      }));
      say('Shoo! The crow flapped off.');
      playTone(900, 0.06, 'square', 0.03);
      setTimeout(() => playTone(1200, 0.06, 'square', 0.03), 60);
      return;
    }
    if (!p.crop) {
      const crop = CROPS[selected];
      const owned = s.seeds[selected] || 0;
      if (owned <= 0 && s.coins < crop.seed) {
        say(`No ${crop.name.toLowerCase()} seeds, and not enough coins to buy one.`);
        playTone(160, 0.15);
        return;
      }
      // Out of seeds? Buy one on the spot.
      update((f) => {
        const paid =
          owned > 0
            ? f
            : {
                ...f,
                coins: f.coins - crop.seed,
                seeds: {
                  ...f.seeds,
                  [selected]: 1,
                },
              };
        const withSeed = {
          ...paid,
          seeds: {
            ...paid.seeds,
            [selected]: paid.seeds[selected] - 1,
          },
        };
        return setPlot(withSeed, i, {
          ...emptyPlot(),
          crop: selected,
        });
      });
      playTone(392, 0.08);
      return;
    }
    if (p.dead) {
      update((f) => setPlot(f, i, emptyPlot()));
      playTone(220, 0.08);
      return;
    }
    if (p.growth >= 1) {
      update((f) => ({
        ...setPlot(f, i, emptyPlot()),
        barn: {
          ...f.barn,
          [p.crop]: (f.barn[p.crop] || 0) + 1,
        },
        harvested: f.harvested + 1,
      }));
      playTone(660, 0.08);
      setTimeout(() => playTone(990, 0.1), 60);
      return;
    }
    if (p.water > 0.75) {
      say('That soil is still nice and damp.');
      return;
    }
    update((f) =>
      setPlot(f, i, {
        ...f.plots[i],
        water: 1,
      }),
    );
    [700, 620, 540].forEach((fr, k) =>
      setTimeout(() => playTone(fr, 0.05, 'sine', 0.03), k * 50),
    );
  };
  const buySeeds = (id, n) => {
    const cost = CROPS[id].seed * n;
    if (farmRef.current.coins < cost) return;
    update((f) => ({
      ...f,
      coins: f.coins - cost,
      seeds: {
        ...f.seeds,
        [id]: (f.seeds[id] || 0) + n,
      },
    }));
    setSelected(id);
    playTone(587, 0.08);
  };
  const sell = (id) => {
    const count = farmRef.current.barn[id] || 0;
    if (!count) return;
    update((f) => ({
      ...f,
      coins: f.coins + count * CROPS[id].sell,
      barn: {
        ...f.barn,
        [id]: 0,
      },
    }));
    [784, 988, 1175].forEach((fr, k) => setTimeout(() => playTone(fr, 0.07), k * 60));
  };
  const sellAll = () => {
    const s = farmRef.current;
    const total = CROP_IDS.reduce((a, id) => a + (s.barn[id] || 0) * CROPS[id].sell, 0);
    if (!total) return;
    update((f) => ({
      ...f,
      coins: f.coins + total,
      barn: {},
    }));
    say(`Sold everything for ${total} coins.`);
    [784, 988, 1175, 1568].forEach((fr, k) =>
      setTimeout(() => playTone(fr, 0.07), k * 60),
    );
  };
  const unlockCrop = (id) => {
    const cost = CROPS[id].unlock;
    if (farmRef.current.coins < cost) return;
    update((f) => ({
      ...f,
      coins: f.coins - cost,
      crops: [...f.crops, id],
    }));
    setSelected(id);
    say(`${CROPS[id].name} seeds are now sold at the market.`);
    playTone(523, 0.1);
    setTimeout(() => playTone(659, 0.1), 80);
    setTimeout(() => playTone(784, 0.16), 160);
  };
  const buyScarecrow = () => {
    if (farmRef.current.coins < SCARECROW_PRICE || farmRef.current.scarecrow) return;
    update((f) => ({
      ...f,
      coins: f.coins - SCARECROW_PRICE,
      scarecrow: true,
      crow: null,
    }));
    say('The scarecrow is up. No more crows!');
    playTone(440, 0.12);
    setTimeout(() => playTone(660, 0.16), 100);
  };
  const resetFarm = () => {
    const fresh = freshFarm();
    farmRef.current = fresh;
    setFarm(fresh);
    saveFarm(fresh);
    setSelected('radish');
    setResetStep(0);
    setAway(null);
    say('A brand new farm. Happy planting!');
  };

  // ---- Keyboard: arrows move between plots, number keys pick seeds, S sells everything ----

  const onGridKey = (e) => {
    const moves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -4,
      ArrowDown: 4,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const current = Number(
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.index
        : undefined,
    );
    const base = Number.isFinite(current) ? current : 0;
    const target = Math.max(0, Math.min(TOTAL_PLOTS - 1, base + moves[e.key]));
    if (plotRefs.current[target]) plotRefs.current[target].focus();
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const n = Number(e.key);
      const crops = farmRef.current.crops;
      if (n >= 1 && n <= crops.length) setSelected(crops[n - 1]);
      if (e.key === 's' || e.key === 'S') sellAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Render ----

  const { night, glow } = skyAt(farm.clock);
  const barnTotal = CROP_IDS.reduce((a, id) => a + (farm.barn[id] || 0), 0);
  const barnValue = CROP_IDS.reduce(
    (a, id) => a + (farm.barn[id] || 0) * CROPS[id].sell,
    0,
  );
  const nextPlotPrice = farm.unlocked < TOTAL_PLOTS ? plotPrice(farm.unlocked) : null;
  const lockedCrops = CROP_IDS.filter((id) => !farm.crops.includes(id));
  return (
    <main className="font-body max-w-[1060px] mx-auto py-5 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="font-display text-[clamp(38px,11vw,64px)] leading-none text-meadow">
          Tiny Farm
        </h1>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums">
            <span
              className="inline-block w-5 h-5 rounded-full bg-hay border-2 border-[#c99a2e] align-middle mr-1.5"
              aria-hidden="true"
            />
            {Math.floor(farm.coins)}{' '}
            <span className="text-base font-normal text-muted">coins</span>
          </div>
          <div className="text-sm text-muted tabular-nums">
            {clockLabel(farm.clock)} · {farm.harvested} harvested
          </div>
        </div>
      </header>

      <SkyStrip clock={farm.clock} scarecrow={farm.scarecrow} crow={!!farm.crow} />

      {away && (
        <div
          className="rounded-xl border-2 border-hay px-4 py-3 flex justify-between items-center gap-3"
          role="status"
          style={{
            background: 'color-mix(in srgb, var(--hay) 35%, transparent)',
          }}
        >
          <span>
            You were away for {away >= 3600 ? `${Math.floor(away / 3600)}h ` : ''}
            {Math.floor((away % 3600) / 60)}m. Your crops kept growing
            {away >= OFFLINE_CAP ? ' (up to two hours of it)' : ''}.
          </span>
          <button
            type="button"
            onClick={() => setAway(null)}
            className="font-bold underline"
          >
            Lovely
          </button>
        </div>
      )}

      {showHelp && (
        <section className="rounded-2xl bg-card border-2 border-line p-4 flex flex-col gap-2">
          <p className="font-display text-2xl">Welcome to your farm</p>
          <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
            <li>Pick a seed from the bag, then tap an empty plot to plant it.</li>
            <li>
              Tap a growing crop to water it. Damp soil grows crops about three times
              faster.
            </li>
            <li>Dry crops slowly droop. Leave them too long and they wither.</li>
            <li>Tap a ripe crop to harvest it, then sell it at the market.</li>
            <li>Crows sometimes land on crops. Tap them away, or buy a scarecrow.</li>
            <li>
              Spend coins on new plots and better seeds. Crops keep growing while you are
              away.
            </li>
          </ul>
          <p className="text-sm text-muted">
            Keyboard: arrows move between plots, Enter acts, 1–6 pick a seed, S sells
            everything.
          </p>
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="self-start px-5 py-2 rounded-full bg-meadow text-white font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            Start farming
          </button>
        </section>
      )}

      {toast && (
        <div
          key={String(String(toast.id))}
          className="rounded-xl bg-ink text-bg px-4 py-2 text-sm"
          role="status"
        >
          {toast.text}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
        {/* ---- The vegetable patch ---- */}
        <section
          aria-label="Vegetable patch"
          className="relative rounded-2xl p-2.5 bg-[#79b356] border-4 border-[#5f8f43]"
        >
          <div className="grid grid-cols-4 gap-2" onKeyDown={onGridKey}>
            {farm.plots.map((p, i) => {
              const locked = i >= farm.unlocked;
              const forSale = i === farm.unlocked;
              const hasCrow = farm.crow && farm.crow.plot === i;
              const ripe = p.crop && !p.dead && p.growth >= 1;
              const status = locked
                ? forSale
                  ? `Buy this plot for ${nextPlotPrice} coins`
                  : 'Overgrown plot'
                : hasCrow
                  ? 'A crow is pecking here, tap to shoo it'
                  : !p.crop
                    ? `Empty, tap to plant ${CROPS[selected].name.toLowerCase()}`
                    : p.dead
                      ? `Withered ${CROPS[p.crop].name.toLowerCase()}, tap to clear`
                      : ripe
                        ? `Ripe ${CROPS[p.crop].name.toLowerCase()}, tap to harvest`
                        : `${CROPS[p.crop].name} ${Math.floor(p.growth * 100)}% grown, ${p.water > 0 ? 'damp' : 'dry'}, tap to water`;
              if (locked) {
                return (
                  <button
                    key={String(String(i))}
                    ref={(el) => {
                      plotRefs.current[i] = el;
                    }}
                    data-index={i}
                    type="button"
                    onClick={() => tapPlot(i)}
                    aria-label={status}
                    disabled={!forSale}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-center text-xs font-bold leading-tight
                        focus-visible:outline focus-visible:outline-4 focus-visible:outline-hay
                        ${forSale ? 'border-2 border-dashed border-white/80 text-white bg-[#5f8f43]/60 hover:bg-[#5f8f43]' : 'bg-[#5f8f43]/50 text-white/50'}`}
                  >
                    {forSale ? (
                      <>
                        <span className="text-2xl leading-none">+</span>
                        <span>{nextPlotPrice} coins</span>
                      </>
                    ) : (
                      <svg viewBox="0 0 40 40" className="w-2/3" aria-hidden="true">
                        <path
                          d="M6 30 Q 10 18 14 30 Q 18 16 22 30 Q 26 18 30 30 Q 33 22 36 30"
                          fill="none"
                          stroke="#3f6d2f"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              }
              const soil =
                p.crop && p.water > 0
                  ? mix('#a27447', '#5c3d24', Math.min(1, p.water * 1.5))
                  : '#a27447';
              return (
                <button
                  key={String(String(i))}
                  ref={(el) => {
                    plotRefs.current[i] = el;
                  }}
                  data-index={i}
                  type="button"
                  onClick={() => tapPlot(i)}
                  aria-label={status}
                  className="soil relative aspect-square rounded-xl overflow-hidden shadow-[inset_0_-4px_0_rgba(0,0,0,.2)]
                      focus-visible:outline focus-visible:outline-4 focus-visible:outline-hay hover:brightness-110"
                  style={{
                    backgroundColor: soil,
                  }}
                >
                  {p.crop && <CropArt plot={p} />}
                  {hasCrow && <Crow />}
                  {p.crop && !p.dead && !ripe && (
                    <span className="absolute left-1.5 right-1.5 bottom-1.5 h-1.5 rounded-full bg-black/30 overflow-hidden">
                      <span
                        className="block h-full bg-hay"
                        style={{
                          width: `${p.growth * 100}%`,
                        }}
                      />
                    </span>
                  )}
                  {p.crop && !p.dead && !ripe && p.water <= 0 && (
                    <span className="absolute top-1 left-1.5 text-[10px] font-bold text-white/90 bg-black/30 rounded px-1">
                      dry
                    </span>
                  )}
                  {p.crop && !p.dead && p.water > 0 && (
                    <svg
                      viewBox="0 0 10 14"
                      className="absolute top-1 left-1.5 w-2.5"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 0 Q 10 7 9 9.5 A 4 4 0 0 1 1 9.5 Q 0 7 5 0 Z"
                        fill="#7cc4f2"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Day and night tint across the field */}
          <div
            className="absolute inset-0 rounded-xl pointer-events-none transition-colors duration-1000"
            style={{
              background: `rgba(18, 26, 70, ${night * 0.42})`,
            }}
          />
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: `rgba(255, 150, 60, ${glow * 0.16})`,
            }}
          />
        </section>

        {/* ---- Seed bag, barn and market ---- */}
        <div className="flex flex-col gap-4">
          <section
            className="rounded-2xl bg-card border-2 border-line p-3"
            aria-label="Seed bag"
          >
            <h2 className="font-display text-xl mb-2">Seed bag</h2>
            <div className="flex flex-col gap-1.5">
              {farm.crops.map((id, k) => {
                const c = CROPS[id];
                const active = selected === id;
                return (
                  <div
                    key={String(String(id))}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 border-2 ${active ? 'border-meadow' : 'border-transparent'}`}
                    style={{
                      background: active
                        ? 'color-mix(in srgb, var(--meadow) 12%, transparent)'
                        : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(id)}
                      aria-pressed={active}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-meadow rounded-lg"
                    >
                      <CropIcon crop={id} />
                      <span className="min-w-0">
                        <span className="block font-bold leading-tight">
                          {k + 1}. {c.name}{' '}
                          <span className="font-normal text-muted">
                            ×{farm.seeds[id] || 0}
                          </span>
                        </span>
                        <span className="block text-xs text-muted">
                          {c.grow < 60 ? `${c.grow}s` : `${c.grow / 60} min`} to grow ·
                          sells for {c.sell}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => buySeeds(id, 1)}
                      disabled={farm.coins < c.seed}
                      className="px-2 py-1 rounded-lg bg-hay text-[#3a2f10] text-xs font-bold disabled:opacity-40 whitespace-nowrap"
                    >
                      +1 · {c.seed}c
                    </button>
                    <button
                      type="button"
                      onClick={() => buySeeds(id, 5)}
                      disabled={farm.coins < c.seed * 5}
                      className="px-2 py-1 rounded-lg bg-hay text-[#3a2f10] text-xs font-bold disabled:opacity-40 whitespace-nowrap"
                    >
                      +5 · {c.seed * 5}c
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="rounded-2xl bg-card border-2 border-line p-3"
            aria-label="Barn and market"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="font-display text-xl">Barn</h2>
              <button
                type="button"
                onClick={sellAll}
                disabled={!barnTotal}
                className="px-3 py-1.5 rounded-full bg-barn text-white text-sm font-bold disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              >
                Sell all · {barnValue}c
              </button>
            </div>
            {barnTotal === 0 ? (
              <p className="text-sm text-muted">
                Nothing in the barn yet. Harvest some crops.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {CROP_IDS.filter((id) => farm.barn[id]).map((id) => (
                  <button
                    key={String(String(id))}
                    type="button"
                    onClick={() => sell(id)}
                    className="flex items-center gap-1.5 rounded-xl border-2 border-line px-2 py-1 text-sm hover:border-barn focus-visible:outline focus-visible:outline-2 focus-visible:outline-barn"
                  >
                    <CropIcon crop={id} className="w-6 h-6" />
                    <span>
                      {farm.barn[id]} × {CROPS[id].sell}c
                    </span>
                  </button>
                ))}
              </div>
            )}

            <h2 className="font-display text-xl mt-4 mb-2">Village market</h2>
            <div className="flex flex-col gap-1.5 text-sm">
              {nextPlotPrice !== null && (
                <button
                  type="button"
                  onClick={buyPlot}
                  disabled={farm.coins < nextPlotPrice}
                  className="flex justify-between gap-2 rounded-xl border-2 border-line px-3 py-2 text-left enabled:hover:border-meadow disabled:opacity-50"
                >
                  <span>
                    <b>New plot</b>{' '}
                    <span className="text-muted">
                      ({farm.unlocked} of {TOTAL_PLOTS})
                    </span>
                  </span>
                  <b>{nextPlotPrice}c</b>
                </button>
              )}
              {!farm.scarecrow && (
                <button
                  type="button"
                  onClick={buyScarecrow}
                  disabled={farm.coins < SCARECROW_PRICE}
                  className="flex justify-between gap-2 rounded-xl border-2 border-line px-3 py-2 text-left enabled:hover:border-meadow disabled:opacity-50"
                >
                  <span>
                    <b>Scarecrow</b>{' '}
                    <span className="text-muted">keeps crows away for good</span>
                  </span>
                  <b>{SCARECROW_PRICE}c</b>
                </button>
              )}
              {lockedCrops.map((id) => (
                <button
                  key={String(String(id))}
                  type="button"
                  onClick={() => unlockCrop(id)}
                  disabled={farm.coins < CROPS[id].unlock}
                  className="flex justify-between items-center gap-2 rounded-xl border-2 border-line px-3 py-2 text-left enabled:hover:border-meadow disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <CropIcon crop={id} className="w-6 h-6" />
                    <span>
                      <b>{CROPS[id].name} seeds</b>{' '}
                      <span className="text-muted">sell for {CROPS[id].sell}</span>
                    </span>
                  </span>
                  <b>{CROPS[id].unlock}c</b>
                </button>
              ))}
              {nextPlotPrice === null && farm.scarecrow && !lockedCrops.length && (
                <p className="text-muted">
                  You own everything the village sells. What a farm!
                </p>
              )}
            </div>
          </section>

          <div className="text-sm text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className="underline" onClick={() => setShowHelp(true)}>
              How to play
            </button>
            {resetStep === 0 && (
              <button type="button" className="underline" onClick={() => setResetStep(1)}>
                Reset the farm
              </button>
            )}
            {resetStep === 1 && (
              <span>
                Plough everything under and start again?
                <button
                  type="button"
                  className="underline font-bold"
                  onClick={() => setResetStep(2)}
                >
                  Yes
                </button>
                ·
                <button
                  type="button"
                  className="underline"
                  onClick={() => setResetStep(0)}
                >
                  Cancel
                </button>
              </span>
            )}
            {resetStep === 2 && (
              <span className="text-barn">
                Last chance: all coins, crops and plots will be lost.
                <button type="button" className="underline font-bold" onClick={resetFarm}>
                  Erase my farm
                </button>
                ·
                <button
                  type="button"
                  className="underline text-muted"
                  onClick={() => setResetStep(0)}
                >
                  Keep it
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
export default App;
