import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameControls = {
  phase?: string;
  pullHandle?: () => void;
  beginSafe?: (lvl: any) => void;
  level?: number;
  startGame?: () => void;
  restartSequence?: () => void;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.02, type = 'square', volume = 0.02) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Safe rules ----------
// The dial shows 0–99. Numbers are printed clockwise, so turning RIGHT (clockwise) counts DOWN at the index mark.
// A combination is entered right-left-right: the number where you reverse direction is what the lock reads.

const STEP = 3.6; // degrees per number
const HYSTERESIS = 5.4; // a reversal only counts after 1.5 numbers in the new direction (absorbs finger wobble)
const BEST_KEY = 'safe-cracker-best';
const mod = (a, n) => ((a % n) + n) % n;
const circDist = (a, b) => {
  const d = Math.abs(mod(a, 100) - mod(b, 100));
  return Math.min(d, 100 - d);
};
const numberAt = (theta) => mod(Math.round(-theta / STEP), 100);
const exactAt = (theta) => mod(-theta / STEP, 100);
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Stricter safes: a narrower "listening window", exact numbers from safe 4, and less time.
function safeSpec(level) {
  return {
    window: Math.max(1, 7 - level),
    tolerance: level <= 3 ? 1 : 0,
    seconds: Math.max(60, 130 - level * 10),
  };
}

function makeCombination() {
  const combo = [];
  while (combo.length < 3) {
    const n = rint(0, 99);
    const prev = combo.length ? combo[combo.length - 1] : 0;
    if (circDist(n, prev) >= 10) combo.push(n);
  }
  return combo;
}

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}
const freshDial = (theta = 0) => ({
  theta,
  dir: null,
  extreme: theta,
  travel: 0,
  stage: 0,
  entries: [],
  leftTravel: 0,
});
const STAGES = [
  {
    dir: 'R',
    text: 'Turn right to the first number.',
  },
  {
    dir: 'L',
    text: 'Turn left, one full turn past the second number, then stop on it.',
  },
  {
    dir: 'R',
    text: 'Turn right to the third number, then pull the handle.',
  },
];

// ---------- Dial face ----------

function DialFace({
  theta,
  tremble,
  amp,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  svgRef,
}) {
  return (
    <svg
      ref={svgRef}
      viewBox="-120 -120 240 240"
      className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="brass" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fbe7a8" />
          <stop offset="45%" stopColor="#d4af5a" />
          <stop offset="100%" stopColor="#7d6024" />
        </radialGradient>
        <radialGradient id="enamel" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#1d5a53" />
          <stop offset="100%" stopColor="#0a2725" />
        </radialGradient>
      </defs>

      {/* Fixed bezel and index mark */}
      <circle r="117" fill="#2c2d27" />
      <circle r="112" fill="none" stroke="#8a6f30" strokeWidth="2" />
      <path
        d="M-7 -119 L7 -119 L0 -104 Z"
        fill="#c2453a"
        stroke="#fbe7a8"
        strokeWidth="1"
      />

      <g
        key={String(String(tremble))}
        className={tremble ? 'tremble' : ''}
        style={{
          '--amp': `${amp}px`,
        }}
      >
        <g transform={`rotate(${theta})`}>
          <circle r="102" fill="url(#brass)" />
          {/* Knurled grip ring */}
          {Array.from(
            {
              length: 72,
            },
            (_, k) => (
              <rect
                key={String(String(k))}
                x="-1.4"
                y="-102"
                width="2.8"
                height="8"
                fill="#6b5220"
                opacity="0.55"
                transform={`rotate(${k * 5})`}
              />
            ),
          )}
          <circle r="92" fill="url(#enamel)" stroke="#fbe7a8" strokeWidth="1.2" />
          {Array.from(
            {
              length: 100,
            },
            (_, n) => (
              <line
                key={String(String(n))}
                x1="0"
                y1={-90}
                x2="0"
                y2={n % 10 === 0 ? -78 : n % 5 === 0 ? -81 : -85}
                stroke="#efe4c8"
                strokeWidth={n % 5 === 0 ? 1.6 : 0.8}
                transform={`rotate(${n * STEP})`}
              />
            ),
          )}
          {Array.from(
            {
              length: 10,
            },
            (_, k) => (
              <text
                key={String(String(k))}
                x="0"
                y="-64"
                fill="#efe4c8"
                fontSize="12"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="'Cutive Mono', monospace"
                transform={`rotate(${k * 36})`}
              >
                {k * 10}
              </text>
            ),
          )}
          {/* Art-deco sunburst and the centre knob */}
          {Array.from(
            {
              length: 16,
            },
            (_, k) => (
              <path
                key={String(String(k))}
                d="M0 -50 L3 -24 L-3 -24 Z"
                fill="#d4af5a"
                opacity="0.35"
                transform={`rotate(${k * 22.5})`}
              />
            ),
          )}
          <circle r="26" fill="url(#brass)" stroke="#6b5220" strokeWidth="1.5" />
          <rect
            x="-5"
            y="-24"
            width="10"
            height="48"
            rx="4"
            fill="#b08e44"
            stroke="#6b5220"
            strokeWidth="1"
          />
          <circle r="4" fill="#6b5220" />
        </g>
      </g>
    </svg>
  );
}

// Stethoscope gauge: the needle swings right the closer you are to the number you need.
function Gauge({ value }) {
  const angle = -70 + value * 140;
  return (
    <svg
      viewBox="0 0 160 92"
      className="w-full max-w-[220px] block"
      role="img"
      aria-label={`Stethoscope reading ${Math.round(value * 100)} percent`}
    >
      <path
        d="M14 82 A 66 66 0 0 1 146 82"
        fill="none"
        stroke="#5b513a"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M14 82 A 66 66 0 0 1 146 82"
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="gaugeGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#3c6e64" />
          <stop offset="70%" stopColor="#d4af5a" />
          <stop offset="100%" stopColor="#c2453a" />
        </linearGradient>
      </defs>
      {Array.from(
        {
          length: 8,
        },
        (_, k) => (
          <line
            key={String(String(k))}
            x1="80"
            y1="22"
            x2="80"
            y2="30"
            stroke="#a99c78"
            strokeWidth="1.5"
            transform={`rotate(${-70 + k * 20} 80 82)`}
          />
        ),
      )}
      <g
        style={{
          transform: `rotate(${angle}deg)`,
          transformOrigin: '80px 82px',
          transition: 'transform 0.18s ease-out',
        }}
      >
        <line
          x1="80"
          y1="82"
          x2="80"
          y2="26"
          stroke="#efe4c8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
      <circle cx="80" cy="82" r="7" fill="#d4af5a" stroke="#6b5220" strokeWidth="1.5" />
    </svg>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Safe Cracker');

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
  const [phase, setPhase] = useState('intro');
  const [level, setLevel] = useState(1);
  const [cracked, setCracked] = useState(0);
  const [best, setBest] = useState(readBest);
  const [view, setView] = useState(freshDial());
  const [closeness, setCloseness] = useState(0);
  const [tremble, setTremble] = useState(0);
  const [amp, setAmp] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [message, setMessage] = useState('');
  const dial = useRef(freshDial());
  const combo = useRef(makeCombination());
  const endsAt = useRef(0);
  const lastClickAt = useRef(0);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const spec = safeSpec(level);

  // ---- Safes ----

  const beginSafe = (lvl) => {
    combo.current = makeCombination();
    dial.current = freshDial(dial.current.theta);
    setView({
      ...dial.current,
    });
    setCloseness(0);
    setLevel(lvl);
    setMessage('');
    const secs = safeSpec(lvl).seconds;
    endsAt.current = Date.now() + secs * 1000;
    setTimeLeft(secs * 1000);
    setPhase('playing');
  };
  const startGame = () => {
    setCracked(0);
    beginSafe(1);
  };
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => {
      const left = endsAt.current - Date.now();
      if (left <= 0) {
        setTimeLeft(0);
        setPhase('over');
        [330, 262, 196].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.3, 'triangle', 0.05), k * 180),
        );
      } else {
        setTimeLeft(left);
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ---- Turning the dial ----

  // The lock registers the number where the dial turned back, for the step the ledger is on.
  const reversal = (d, fromDir, value, travel) => {
    if (d.stage === 0) {
      if (fromDir === 'R') {
        d.entries = [value];
        d.stage = 1;
        setMessage('');
        playTone(140, 0.05, 'triangle', 0.04);
      }
    } else if (d.stage === 1) {
      d.entries = [d.entries[0], value];
      d.leftTravel = travel;
      d.stage = 2;
      setMessage('');
      playTone(140, 0.05, 'triangle', 0.04);
    } else if (d.stage === 2) {
      // Turning left again on the last step scrambles the sequence.
      d.stage = 0;
      d.entries = [];
      d.leftTravel = 0;
      setMessage(
        'You turned back on the last number. The sequence starts over: turn right.',
      );
    }
  };
  const rotateBy = (delta) => {
    if (phase !== 'playing' || delta === 0) return;
    const d = dial.current;
    const before = d.theta;
    d.theta += delta;

    // Direction tracking with hysteresis.
    if (d.dir === null) {
      d.dir = delta > 0 ? 'R' : 'L';
      d.extreme = d.theta;
      d.travel = Math.abs(delta);
    } else if (d.dir === 'R') {
      if (d.theta > d.extreme) {
        d.travel += d.theta - d.extreme;
        d.extreme = d.theta;
      } else if (d.extreme - d.theta > HYSTERESIS) {
        reversal(d, 'R', numberAt(d.extreme), d.travel);
        d.dir = 'L';
        d.travel = d.extreme - d.theta;
        d.extreme = d.theta;
      }
    } else {
      if (d.theta < d.extreme) {
        d.travel += d.extreme - d.theta;
        d.extreme = d.theta;
      } else if (d.theta - d.extreme > HYSTERESIS) {
        reversal(d, 'L', numberAt(d.extreme), d.travel);
        d.dir = 'R';
        d.travel = d.theta - d.extreme;
        d.extreme = d.theta;
      }
    }

    // Feedback for the number this step needs.
    const target = combo.current[d.stage];
    const near = Math.max(
      0,
      1 - circDist(exactAt(d.theta), target) / (spec.window + 0.5),
    );
    setCloseness(near);

    // A click for each number that passes the index mark.
    const fromN = Math.round(-before / STEP);
    const toN = Math.round(-d.theta / STEP);
    if (fromN !== toN) {
      const now = performance.now();
      const value = mod(toN, 100);
      const dist = circDist(value, target);
      if (now - lastClickAt.current > 22) {
        lastClickAt.current = now;
        if (dist === 0) {
          playTone(1900, 0.03, 'square', 0.09);
          setTimeout(() => playTone(320, 0.05, 'triangle', 0.06), 18);
        } else if (dist <= spec.window) {
          playTone(2100, 0.018, 'square', 0.012 + 0.05 * (1 - dist / (spec.window + 1)));
        } else {
          playTone(2300, 0.012, 'square', 0.008);
        }
      }
      if (dist <= spec.window) {
        setAmp(0.6 + 2.6 * (1 - dist / (spec.window + 1)));
        setTremble((t) => t + 1);
      }
    }
    setView({
      ...d,
      entries: [...d.entries],
    });
  };
  const rotateRef = useRef(rotateBy);
  rotateRef.current = rotateBy;

  // ---- Pulling the handle ----

  const pullHandle = () => {
    if (phase !== 'playing') return;
    const d = dial.current;
    const [c1, c2, c3] = combo.current;
    const tol = spec.tolerance;
    const ok =
      d.stage === 2 &&
      circDist(d.entries[0], c1) <= tol &&
      circDist(d.entries[1], c2) <= tol &&
      d.leftTravel >= 360 - STEP * 2 &&
      circDist(numberAt(d.theta), c3) <= tol;
    if (ok) {
      const total = cracked + 1;
      setCracked(total);
      if (total > best) {
        setBest(total);
        try {
          localStorage.setItem(BEST_KEY, String(String(total)));
        } catch (e) {
          /* storage unavailable */
        }
      }
      setPhase('opened');
      [392, 523, 659, 784].forEach((f, k) =>
        setTimeout(() => playTone(f, 0.2, 'triangle', 0.05), k * 110),
      );
      return;
    }

    // Wrong: the bolt clunks, five seconds are lost, and the sequence must start over.
    endsAt.current -= 5000;
    dial.current = freshDial(d.theta);
    setView({
      ...dial.current,
    });
    setMessage(
      d.stage < 2
        ? "The handle won't budge: the sequence isn't finished. Start again by turning right."
        : 'Clunk. Wrong combination, and the sequence resets. Turn right to begin again.',
    );
    playTone(90, 0.25, 'sawtooth', 0.06);
    setTimeout(() => playTone(70, 0.3, 'sawtooth', 0.05), 120);
  };
  const restartSequence = () => {
    if (phase !== 'playing') return;
    dial.current = freshDial(dial.current.theta);
    setView({
      ...dial.current,
    });
    setMessage('Sequence cleared. Turn right to begin.');
  };
  const actions = useRef({} as GameControls);
  actions.current = {
    pullHandle,
    restartSequence,
    startGame,
    beginSafe,
    phase,
    level,
  };

  // ---- Keyboard and mouse wheel ----

  useEffect(() => {
    const onKey = (e) => {
      const a = actions.current;
      const step = e.shiftKey ? STEP * 10 : STEP;
      if (
        e.key === 'ArrowRight' ||
        e.key === 'd' ||
        e.key === 'D' ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        rotateRef.current(step);
      } else if (
        e.key === 'ArrowLeft' ||
        e.key === 'a' ||
        e.key === 'A' ||
        e.key === 'ArrowUp'
      ) {
        e.preventDefault();
        rotateRef.current(-step);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        if (a.phase === 'playing') a.pullHandle();
        else if (a.phase === 'opened') a.beginSafe(a.level + 1);
        else a.startGame();
      } else if (e.key === 'r' || e.key === 'R') {
        a.restartSequence();
      }
    };
    window.addEventListener('keydown', onKey);
    const svg = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      rotateRef.current(e.deltaY > 0 ? STEP : -STEP);
    };
    svg.addEventListener('wheel', onWheel, {
      passive: false,
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      svg.removeEventListener('wheel', onWheel);
    };
  }, []);

  // ---- Dragging around the dial ----

  const angleOf = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    return {
      a: (Math.atan2(dy, dx) * 180) / Math.PI,
      r: Math.hypot(dx, dy) / (rect.width / 2),
    };
  };
  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = angleOf(e).a;
  };
  const onPointerMove = (e) => {
    if (drag.current === null) return;
    const { a, r } = angleOf(e);
    let delta = a - drag.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.current = a;
    // Very near the centre the angle jumps wildly, so ignore it there.
    if (r > 0.18) rotateBy(delta);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // ---- Render ----

  const seconds = Math.ceil(timeLeft / 1000);
  const current = numberAt(view.theta);
  const turns = view.stage === 1 ? Math.min(view.travel / 360, 9) : view.leftTravel / 360;
  return (
    <main className="font-mono max-w-[980px] mx-auto py-5 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(38px,11vw,64px)] leading-none text-brass tracking-wide">
            Safe Cracker
          </h1>
          <p className="text-muted text-sm mt-1">
            The Gilded Mutual Bank, vault level B. Est. 1931.
          </p>
        </div>
        <div className="text-right text-sm">
          <div>
            Safe <b className="text-brass text-xl">No. {level}</b> · cracked{' '}
            <b className="text-xl">{cracked}</b>
          </div>
          <div className="text-muted">Best {Math.max(best, cracked)}</div>
        </div>
      </header>

      <div className="deco-rule" aria-hidden="true" />

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
        {/* ---- The door ---- */}
        <section className="relative rounded-[28px] door border-4 border-[#4a4536] p-4 sm:p-6 shadow-[inset_0_0_0_2px_rgba(212,175,90,.25)]">
          {[
            [3, 3],
            [97, 3],
            [3, 97],
            [97, 97],
          ].map(([x, y]) => (
            <span
              key={String(String(`${x}-${y}`))}
              className="absolute w-3 h-3 rounded-full bg-[#8a7a50] shadow-[inset_-1px_-1px_0_rgba(0,0,0,.5)]"
              style={{
                left: `calc(${x}% - 6px)`,
                top: `calc(${y}% - 6px)`,
              }}
            />
          ))}
          <div
            className={`relative mx-auto w-full max-w-[420px] aspect-square ${phase === 'opened' ? 'swing-open' : ''}`}
            role="slider"
            aria-label="Combination dial"
            aria-valuemin={0}
            aria-valuemax={99}
            aria-valuenow={current}
            aria-valuetext={`Dial at ${current}`}
            tabIndex={0}
          >
            <DialFace
              theta={view.theta}
              tremble={tremble}
              amp={amp}
              svgRef={svgRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => rotateBy(-STEP)}
              aria-label="Turn left one number"
              className="px-4 py-2 rounded-full border-2 border-brass text-brass text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              ⟲ Left
            </button>
            <span
              className="font-mono text-3xl tabular-nums w-14 text-center text-ink"
              aria-live="off"
            >
              {String(current).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => rotateBy(STEP)}
              aria-label="Turn right one number"
              className="px-4 py-2 rounded-full border-2 border-brass text-brass text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              Right ⟳
            </button>
          </div>

          {phase === 'opened' && (
            <div
              className="absolute inset-0 rounded-[24px] flex flex-col items-center justify-center gap-3 text-center p-6"
              style={{
                background:
                  'radial-gradient(circle, rgba(212,175,90,.35), rgba(23,24,21,.92) 70%)',
              }}
            >
              <p className="font-display text-4xl text-brass">Safe No. {level} is open</p>
              <p className="text-sm text-muted max-w-[32ch]">
                Deeds, bonds and a forgotten pocket watch. The manager will be delighted.
              </p>
              <button
                type="button"
                onClick={() => beginSafe(level + 1)}
                className="px-6 py-2 rounded-full bg-brass text-[#171815] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              >
                Next safe
              </button>
            </div>
          )}
        </section>

        {/* ---- The brass plate ---- */}
        <section className="rounded-2xl bg-panel border-2 border-[#4a4536] p-4 flex flex-col gap-4">
          {phase === 'intro' || phase === 'over' ? (
            <div className="flex flex-col gap-3">
              <p className="font-display text-3xl text-brass">
                {phase === 'over' ? "The guard's whistle!" : 'Your brief'}
              </p>
              {phase === 'over' ? (
                <p className="text-sm">
                  Time ran out on safe No. {level}. You cracked {cracked}{' '}
                  {cracked === 1 ? 'safe' : 'safes'}. Best: {Math.max(best, cracked)}.
                </p>
              ) : (
                <ul className="text-sm list-disc pl-5 flex flex-col gap-1.5">
                  <li>The bank has lost its combinations. You are the locksmith.</li>
                  <li>Each safe opens with three numbers from 0 to 99.</li>
                  <li>Turn right and stop on the first number.</li>
                  <li>
                    Turn left one full turn past the second number, then stop on it.
                  </li>
                  <li>Turn right to the third number and pull the handle.</li>
                  <li>
                    Listen: near the number you need, clicks get louder, the dial trembles
                    and the stethoscope needle rises.
                  </li>
                  <li>
                    Each safe is quieter and quicker than the last. A wrong pull costs 5
                    seconds.
                  </li>
                </ul>
              )}
              <p className="text-xs text-muted">
                Drag around the dial, scroll, or use ←/→ (Shift for ten). Enter pulls the
                handle, R restarts the sequence.
              </p>
              <button
                type="button"
                onClick={startGame}
                className="self-start px-6 py-2 rounded-full bg-brass text-[#171815] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              >
                {phase === 'over' ? 'Try another vault' : 'Begin'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">Time</span>
                <span
                  className={`text-3xl tabular-nums ${seconds <= 15 ? 'text-alarm' : 'text-ink'}`}
                >
                  {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                </span>
              </div>

              <div className="flex flex-col items-center">
                <Gauge value={phase === 'playing' ? closeness : 1} />
                <span className="text-xs text-muted -mt-1">
                  Stethoscope · listening window ±{spec.window}
                </span>
              </div>

              <ol className="flex flex-col gap-1.5" aria-label="Combination ledger">
                {STAGES.map((s, i) => {
                  const active = view.stage === i;
                  const done = view.stage > i;
                  return (
                    <li
                      key={String(String(i))}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${active ? 'border-brass' : 'border-[#3b3a30]'} ${done ? 'opacity-70' : ''}`}
                    >
                      <span
                        className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{
                          background: active ? 'var(--brass)' : '#3b3a30',
                          color: active ? '#171815' : 'var(--ink)',
                        }}
                      >
                        {s.dir}
                      </span>
                      <span className="flex-1 text-sm leading-snug">{s.text}</span>
                      <span className="text-xl tabular-nums w-8 text-right">
                        {done ? String(view.entries[i]).padStart(2, '0') : '··'}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {view.stage >= 1 && (
                <p className="text-xs text-muted">
                  Left turn so far: {turns.toFixed(1)} of a full turn
                  {turns >= 1 ? ' ✓' : ''}.
                </p>
              )}

              {message && (
                <p className="text-sm text-alarm" role="status">
                  {message}
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={pullHandle}
                  disabled={phase !== 'playing'}
                  className="flex-1 min-w-[140px] px-4 py-3 rounded-full bg-brass text-[#171815] font-bold text-lg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                >
                  Pull the handle
                </button>
                <button
                  type="button"
                  onClick={restartSequence}
                  disabled={phase !== 'playing'}
                  className="px-4 py-3 rounded-full border-2 border-[#5b513a] text-muted disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                >
                  Start over
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
export default App;
