import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  pegs: any[];
  balls: any[];
  slotFlash: any[];
  aim?: number;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.04, type = 'triangle', volume = 0.03) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Board geometry (logical units; the canvas scales to fit) ----------

const W = 400;
const H = 560;
const ROWS = 11;
const PEG_R = 4;
const BALL_R = 7;
const GRAVITY = 900;
const SLOTS = [10, 3, 1, 0.5, 0.3, 0.5, 1, 3, 10]; // multipliers of your bet
const SLOT_COLORS = [
  '#ff4d6d',
  '#ff8c42',
  '#ffd34d',
  '#7bd389',
  '#4cc9f0',
  '#7bd389',
  '#ffd34d',
  '#ff8c42',
  '#ff4d6d',
];
function buildPegs() {
  const pegs = [];
  for (let r = 0; r < ROWS; r++) {
    const count = r + 3;
    const spacing = W / (ROWS + 3);
    const rowWidth = (count - 1) * spacing;
    for (let i = 0; i < count; i++) {
      pegs.push({
        x: W / 2 - rowWidth / 2 + i * spacing,
        y: 70 + r * 38,
        glow: 0,
      });
    }
  }
  return pegs;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Plinko Drop');

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
  const canvasRef = useRef(null);
  const world = useRef({
    pegs: buildPegs(),
    balls: [],
    slotFlash: Array(SLOTS.length).fill(0),
  } as GameState);
  const [chips, setChips] = useState(() => {
    try {
      return Number(localStorage.getItem('plinko-chips')) || 100;
    } catch (e) {
      return 100;
    }
  });
  const [bet, setBet] = useState(5);
  const [lastWin, setLastWin] = useState(null);
  const [aim, setAim] = useState(W / 2);

  // Accepts a number or an updater function, so chips landing in the same frame never overwrite each other.
  const saveChips = (value) => {
    setChips((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      try {
        localStorage.setItem('plinko-chips', String(next));
      } catch (e) {
        /* storage unavailable */
      }
      return next;
    });
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    const step = (dt) => {
      const w = world.current;
      const slotWidth = W / SLOTS.length;
      for (const b of w.balls) {
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Bounce off pegs.
        for (const p of w.pegs) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < PEG_R + BALL_R && d > 0) {
            const nx = dx / d;
            const ny = dy / d;
            b.x = p.x + nx * (PEG_R + BALL_R);
            b.y = p.y + ny * (PEG_R + BALL_R);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              b.vx -= 1.5 * vn * nx;
              b.vy -= 1.5 * vn * ny;
              b.vx += (Math.random() - 0.5) * 40; // a little randomness, like a real board
              p.glow = 1;
              playTone(900 + Math.random() * 400);
            }
          }
        }

        // Side walls
        if (b.x < BALL_R) {
          b.x = BALL_R;
          b.vx = Math.abs(b.vx) * 0.6;
        }
        if (b.x > W - BALL_R) {
          b.x = W - BALL_R;
          b.vx = -Math.abs(b.vx) * 0.6;
        }

        // Landed in a slot
        if (b.y > H - 40 && !b.done) {
          b.done = true;
          const slot = Math.max(
            0,
            Math.min(SLOTS.length - 1, Math.floor(b.x / slotWidth)),
          );
          const win = Math.round(b.bet * SLOTS[slot] * 10) / 10;
          w.slotFlash[slot] = 1;
          saveChips((c) => Math.round((c + win) * 10) / 10);
          setLastWin({
            win,
            mult: SLOTS[slot],
            key: Math.random(),
          });
          playTone(SLOTS[slot] >= 3 ? 1320 : 520, 0.2, 'sine', 0.06);
        }
      }
      w.balls = w.balls.filter((b) => b.y < H + 20);
      w.pegs.forEach((p) => {
        p.glow = Math.max(0, p.glow - dt * 3);
      });
      w.slotFlash = w.slotFlash.map((f) => Math.max(0, f - dt * 1.5));
    };
    const draw = () => {
      const w = world.current;
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#2e1150';
      ctx.fillRect(0, 0, W, H);

      // Prize slots
      const slotWidth = W / SLOTS.length;
      SLOTS.forEach((m, i) => {
        ctx.fillStyle = SLOT_COLORS[i];
        ctx.globalAlpha = 0.55 + w.slotFlash[i] * 0.45;
        ctx.fillRect(i * slotWidth + 2, H - 38, slotWidth - 4, 36);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1d0b33';
        ctx.font = '900 13px "Nunito Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`×${m}`, i * slotWidth + slotWidth / 2, H - 15);
      });

      // Pegs
      for (const p of w.pegs) {
        ctx.fillStyle = p.glow > 0 ? `rgba(255,211,77,${0.5 + p.glow / 2})` : '#c8b4e6';
        ctx.beginPath();
        ctx.arc(p.x, p.y, PEG_R + p.glow * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Balls
      for (const b of w.balls) {
        const grad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#ffd34d');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Aim marker
      ctx.fillStyle = 'rgba(255,244,224,.6)';
      ctx.beginPath();
      ctx.moveTo(w.aim - 8, 18);
      ctx.lineTo(w.aim + 8, 18);
      ctx.lineTo(w.aim, 30);
      ctx.fill();
    };
    const frame = (now) => {
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      // Two physics substeps per frame keeps fast balls from tunnelling through pegs.
      step(dt / 2);
      step(dt / 2);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    world.current.aim = aim;
  }, [aim]);
  const drop = () => {
    if (chips < bet) return;
    saveChips((c) => Math.round((c - bet) * 10) / 10);
    world.current.balls.push({
      x: aim + (Math.random() - 0.5) * 4,
      y: 30,
      vx: 0,
      vy: 0,
      bet,
    });
    playTone(400, 0.08, 'square', 0.03);
  };
  const onMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    setAim(Math.max(40, Math.min(W - 40, x)));
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        drop();
      }
      if (e.key === 'ArrowLeft') setAim((a) => Math.max(40, a - 12));
      if (e.key === 'ArrowRight') setAim((a) => Math.min(W - 40, a + 12));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <main className="font-body max-w-[900px] mx-auto py-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <div
        className="p-3 rounded-2xl bg-[#140726] relative"
        style={{
          boxShadow: '0 0 0 6px #ffd34d55, 0 30px 60px rgba(0,0,0,.5)',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerMove={onMove}
          onPointerDown={(e) => {
            onMove(e);
            drop();
          }}
          aria-label="Plinko board. Move to aim, tap to drop a chip."
          className="block w-full aspect-[400/560] rounded-lg touch-none cursor-pointer"
        />
      </div>

      <aside className="flex flex-col gap-4">
        <h1 className="font-display text-[clamp(40px,10vw,64px)] leading-none text-bulb">
          Plinko Drop
        </h1>
        <p className="text-muted">
          Aim along the top, drop a chip, and watch it bounce down the pegs into a prize
          slot.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-board p-3 border-2 border-bulb/40">
            <div className="text-[11px] font-black tracking-[.16em] uppercase text-muted">
              Chips
            </div>
            <div className="font-display text-4xl text-bulb">{chips}</div>
          </div>
          <div className="rounded-xl bg-board p-3 border-2 border-bulb/40">
            <div className="text-[11px] font-black tracking-[.16em] uppercase text-muted">
              Last prize
            </div>
            <div className="font-display text-4xl" key={String(String(lastWin?.key))}>
              {lastWin ? `${lastWin.win}` : '–'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted">Bet per chip:</span>
          {[1, 5, 10, 25].map((b) => (
            <button
              key={String(String(b))}
              type="button"
              onClick={() => setBet(b)}
              className={`w-12 h-12 rounded-full font-black border-4 border-dashed ${bet === b ? 'bg-bulb text-bg border-white' : 'border-bulb text-bulb'}`}
            >
              {b}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={drop}
          disabled={chips < bet}
          className="font-display text-3xl py-3 rounded-xl bg-bulb text-bg shadow-[0_6px_0_#b8901f] disabled:opacity-40
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Drop a chip
        </button>

        {chips < 1 && (
          <button
            type="button"
            onClick={() => saveChips(100)}
            className="underline text-sm self-start"
          >
            Out of chips? The host hands you another 100.
          </button>
        )}

        <p className="text-sm text-muted leading-relaxed">
          The middle slots are the most likely and pay the least. The edges are rare and
          pay ten times your bet. You can drop several chips at once. Keyboard: arrows to
          aim, Space to drop.
        </p>
      </aside>
    </main>
  );
}
export default App;
