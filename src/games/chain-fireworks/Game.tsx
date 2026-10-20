import type { KeyboardState } from '../../shared/input';
import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  level: number;
  score: number;
  lanterns: number;
  particles: any[];
  cursor: {
    x: number;
    y: number;
  };
  showCursor: boolean;
  fired?: boolean;
  shells?: any[] | any;
  bursts?: undefined[] | any;
  popped?: number | any;
  levelScore?: number;
  resolved?: boolean;
  hudKey?: string;
  cfg?: {
    total: number;
    need: number;
    radius: number;
    speed: number;
  };
};

// ---------- Sound ----------

let audioCtx = null;
let lastToneAt = 0;
function playTone(freq, duration = 0.08, type = 'triangle', volume = 0.03) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// Big chains set off dozens of bursts at once; this keeps the crackle from turning into a roar.
function crackle(depth) {
  const now = performance.now();
  if (now - lastToneAt < 45) return;
  lastToneAt = now;
  playTone(320 + Math.min(depth, 12) * 70 + Math.random() * 60, 0.14, 'triangle', 0.035);
}

// ---------- Sky geometry (logical units; the canvas scales to fit) ----------

const W = 480;
const H = 600;
const WATER_Y = 490;
const SHELL_R = 5;
const GROW = 0.25; // seconds for a burst to reach full size
const HOLD = 2.0; // a burst stays full until this age
const LIFE = 2.4; // and is gone at this age
const BEST_KEY = 'chain-fireworks-best';
const COLORS = ['#ff5a36', '#ffcc4d', '#3ee0a1', '#ff8fc4', '#8fe3ff', '#fff4e0'];

// Shells per show, how many must pop, burst size and drift speed. It keeps getting harder after level 12.
function levelConfig(level) {
  const total = Math.min(60, 12 + level * 4);
  const fraction = Math.min(0.8, 0.1 + level * 0.048);
  return {
    total,
    need: Math.max(1, Math.round(total * fraction)),
    radius: Math.max(32, 50 - level * 1.2),
    speed: 26 + level * 4,
  };
}

function makeShells(cfg) {
  const shells = [];
  for (let i = 0; i < cfg.total; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = cfg.speed * (0.5 + Math.random() * 0.5);
    shells.push({
      x: 20 + Math.random() * (W - 40),
      y: 40 + Math.random() * (WATER_Y - 90),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      color: COLORS[Math.floor(Math.random() * (COLORS.length - 1))],
      flicker: Math.random() * 6,
    });
  }
  return shells;
}

// Fixed star field, scattered once.
const STARS = Array.from(
  {
    length: 90,
  },
  () => ({
    x: Math.random() * W,
    y: Math.random() * (WATER_Y - 80),
    r: Math.random() * 1.2 + 0.3,
    tw: Math.random() * 6,
  }),
);
function setupLevel(g) {
  const cfg = levelConfig(g.level);
  g.cfg = cfg;
  g.shells = makeShells(cfg);
  g.bursts = [];
  g.popped = 0;
  g.levelScore = 0;
  g.fired = false;
  g.resolved = false;
}

function newGame() {
  const g = {
    level: 1,
    score: 0,
    lanterns: 3,
    particles: [],
    cursor: {
      x: W / 2,
      y: WATER_Y / 2,
    },
    showCursor: false,
  } as GameState;
  setupLevel(g);
  return g;
}

function spawnBurst(g, x, y, color, depth) {
  g.bursts.push({
    x,
    y,
    r: 0,
    maxR: g.cfg.radius,
    age: 0,
    color,
    depth,
  });
  const count = 34;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + Math.random() * 0.2;
    // With drag k, a spark released at v0 travels about v0 / k, so the sparks fill the burst circle.
    const v = g.cfg.radius * 2.2 * (0.75 + Math.random() * 0.3);
    g.particles.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 1.8 + Math.random() * 0.6,
      max: 2.4,
      color: Math.random() < 0.15 ? '#fff4e0' : color,
    });
  }
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Chain Fireworks');

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
  const game = useRef(newGame());
  const keys = useRef({} as KeyboardState);
  const aiming = useRef(false);
  const [hud, setHud] = useState({
    level: 1,
    popped: 0,
    need: 0,
    total: 0,
    lanterns: 3,
    score: 0,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  });
  const saveBest = (score) => {
    setBest((b) => {
      const next = Math.max(b, score);
      try {
        localStorage.setItem(BEST_KEY, String(next));
      } catch (e) {
        /* storage unavailable */
      }
      return next;
    });
  };
  const start = () => {
    game.current = newGame();
    setResult(null);
    setPhase('playing');
    playTone(440, 0.2, 'sine', 0.04);
  };

  // After a show: move on if it was cleared, otherwise replay the same level.
  const continueShow = () => {
    const g = game.current;
    if (result && result.cleared) g.level++;
    const keepParticles = g.particles;
    setupLevel(g);
    g.particles = keepParticles;
    setResult(null);
    setPhase('playing');
  };

  // Your one match for this level.
  const fire = (x, y) => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.fired) return;
    g.fired = true;
    spawnBurst(g, x, y, '#fff4e0', 0);
    playTone(180, 0.3, 'sawtooth', 0.04);
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
    const resolveShow = (g) => {
      g.resolved = true;
      const cleared = g.popped >= g.cfg.need;
      if (cleared) {
        g.score += g.levelScore + (g.popped - g.cfg.need) * 25; // extra pops beyond the target pay a bonus
        saveBest(g.score);
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.18, 'sine', 0.04), k * 110),
        );
      } else {
        g.lanterns--;
        playTone(200, 0.5, 'sine', 0.04);
      }
      const info = {
        cleared,
        popped: g.popped,
        need: g.cfg.need,
        level: g.level,
        score: g.score,
        lanterns: g.lanterns,
      };
      setHud({
        level: g.level,
        popped: g.popped,
        need: g.cfg.need,
        total: g.cfg.total,
        lanterns: g.lanterns,
        score: g.score,
      });
      setTimeout(() => {
        setResult(info);
        if (!cleared && g.lanterns <= 0) {
          saveBest(g.score);
          setPhase('over');
        } else {
          setPhase('result');
        }
      }, 500);
    };
    const update = (dt) => {
      const g = game.current;
      const playing = phaseRef.current === 'playing';

      // Drift and bounce inside the sky.
      for (const s of g.shells) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 12) {
          s.x = 12;
          s.vx = Math.abs(s.vx);
        }
        if (s.x > W - 12) {
          s.x = W - 12;
          s.vx = -Math.abs(s.vx);
        }
        if (s.y < 30) {
          s.y = 30;
          s.vy = Math.abs(s.vy);
        }
        if (s.y > WATER_Y - 30) {
          s.y = WATER_Y - 30;
          s.vy = -Math.abs(s.vy);
        }
      }

      // Bursts swell, hold, then fade. Any shell they touch catches and bursts in turn.
      const fresh = [];
      for (const b of g.bursts) {
        b.age += dt;
        if (b.age < GROW) b.r = b.maxR * (1 - (1 - b.age / GROW) ** 2);
        else if (b.age < HOLD) b.r = b.maxR;
        else b.r = b.maxR * Math.max(0, 1 - (b.age - HOLD) / (LIFE - HOLD));
        if (b.r < 2) continue;
        for (const s of g.shells) {
          if (s.lit) continue;
          if (Math.hypot(s.x - b.x, s.y - b.y) < b.r + SHELL_R) {
            s.lit = true;
            fresh.push({
              s,
              depth: b.depth + 1,
            });
          }
        }
      }
      g.bursts = g.bursts.filter((b) => b.age < LIFE);
      for (const { s, depth } of fresh) {
        spawnBurst(g, s.x, s.y, s.color, depth);
        g.popped++;
        g.levelScore += 10 * depth; // the deeper in the chain, the more it is worth
        crackle(depth);
      }
      g.shells = g.shells.filter((s) => !s.lit);

      // Sparks
      const drag = Math.exp(-2.2 * dt);
      for (const p of g.particles) {
        p.px = p.x;
        p.py = p.y;
        p.vx *= drag;
        p.vy = p.vy * drag + 40 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      g.particles = g.particles.filter((p) => p.life > 0);
      if (!playing) return;

      // Keyboard crosshair
      const k = keys.current;
      const mx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const my = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (mx || my) {
        g.showCursor = true;
        g.cursor.x = Math.max(0, Math.min(W, g.cursor.x + mx * 260 * dt));
        g.cursor.y = Math.max(0, Math.min(WATER_Y, g.cursor.y + my * 260 * dt));
      }
      if (g.fired && !g.resolved && g.bursts.length === 0) resolveShow(g);
      const hudKey = `${g.level}|${g.popped}|${g.lanterns}|${g.score}|${g.levelScore}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          level: g.level,
          popped: g.popped,
          need: g.cfg.need,
          total: g.cfg.total,
          lanterns: g.lanterns,
          score: g.score + g.levelScore,
        });
      }
    };

    // ---------- Drawing ----------

    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      const t = now / 1000;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // Night sky, warmer toward the harbour lights
      const sky = ctx.createLinearGradient(0, 0, 0, WATER_Y);
      sky.addColorStop(0, '#03080d');
      sky.addColorStop(0.7, '#0a1d26');
      sky.addColorStop(1, '#2a2620');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, WATER_Y);
      for (const s of STARS) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.tw);
        ctx.fillStyle = '#f6ecd9';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      // A thin moon
      ctx.fillStyle = '#f3e3bd';
      ctx.beginPath();
      ctx.arc(408, 70, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#05101a';
      ctx.beginPath();
      ctx.arc(416, 64, 16, 0, Math.PI * 2);
      ctx.fill();

      // Bursts and sparks glow additively.
      ctx.globalCompositeOperation = 'lighter';
      for (const b of g.bursts) {
        const fade = b.age < HOLD ? 1 : Math.max(0, 1 - (b.age - HOLD) / (LIFE - HOLD));
        const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, Math.max(1, b.r));
        glow.addColorStop(0, `${b.color}55`);
        glow.addColorStop(1, `${b.color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35 * fade;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.lineCap = 'round';
      for (const p of g.particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.px - (p.x - p.px) * 2, p.py - (p.y - p.py) * 2);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Unlit shells with a flickering fuse
      for (const s of g.shells) {
        ctx.fillStyle = '#3a3f44';
        ctx.beginPath();
        ctx.arc(s.x, s.y, SHELL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 9 + s.flicker);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Harbour skyline: hills, a pagoda roof and warehouse windows
      ctx.fillStyle = '#05090c';
      ctx.beginPath();
      ctx.moveTo(0, WATER_Y);
      ctx.lineTo(0, WATER_Y - 30);
      ctx.quadraticCurveTo(70, WATER_Y - 60, 140, WATER_Y - 28);
      ctx.lineTo(170, WATER_Y - 28);
      ctx.lineTo(170, WATER_Y - 46);
      ctx.lineTo(230, WATER_Y - 46);
      ctx.lineTo(230, WATER_Y - 22);
      ctx.lineTo(300, WATER_Y - 22);
      ctx.lineTo(300, WATER_Y - 40);
      ctx.lineTo(318, WATER_Y - 62);
      ctx.lineTo(306, WATER_Y - 62);
      ctx.lineTo(326, WATER_Y - 82);
      ctx.lineTo(346, WATER_Y - 62);
      ctx.lineTo(334, WATER_Y - 62);
      ctx.lineTo(352, WATER_Y - 40);
      ctx.lineTo(352, WATER_Y - 26);
      ctx.quadraticCurveTo(420, WATER_Y - 56, W, WATER_Y - 34);
      ctx.lineTo(W, WATER_Y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffcc4d';
      for (let i = 0; i < 14; i++) {
        if (Math.sin(i * 12.3) > 0.1)
          ctx.fillRect(176 + (i % 7) * 8, WATER_Y - 40 + Math.floor(i / 7) * 10, 3, 4);
      }

      // Water and reflections of everything bright
      const water = ctx.createLinearGradient(0, WATER_Y, 0, H);
      water.addColorStop(0, '#0b1a20');
      water.addColorStop(1, '#03080b');
      ctx.fillStyle = water;
      ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of g.particles) {
        const ry = WATER_Y + (WATER_Y - p.y) * 0.3;
        if (ry < WATER_Y || ry > H) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.3;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x + Math.sin(t * 6 + ry) * 2, ry, 3, 1.5);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(246, 236, 217, 0.08)';
      ctx.lineWidth = 1;
      for (let row = 0; row < 6; row++) {
        const y = WATER_Y + 8 + row * 16;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const yy = y + Math.sin(x * 0.06 + t * 1.5 + row) * 1.5;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }

      // Pier with a string of paper lanterns
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, WATER_Y + 32, 200, 6);
      for (let x = 10; x < 200; x += 38) ctx.fillRect(x, WATER_Y + 38, 4, 30);
      ctx.strokeStyle = '#2a2620';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, WATER_Y + 4);
      ctx.quadraticCurveTo(100, WATER_Y + 26, 200, WATER_Y + 6);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const x = 14 + i * 29;
        // Hang each lantern 8 units under the same curve as the string.
        const u = x / 200;
        const y =
          (1 - u) ** 2 * (WATER_Y + 4) +
          2 * (1 - u) * u * (WATER_Y + 26) +
          u * u * (WATER_Y + 6) +
          8;
        const sway = Math.sin(t * 1.4 + i) * 1.5;
        ctx.fillStyle = i % 2 ? '#ff5a36' : '#ffcc4d';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(x + sway, y, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc(x + sway, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Where your match will go
      if (phaseRef.current === 'playing' && !g.fired && g.showCursor) {
        const c = g.cursor;
        ctx.strokeStyle = 'rgba(255, 244, 224, 0.55)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, g.cfg.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff4e0';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---------- Keyboard ----------

    const DIR_KEYS = {
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowUp: 'up',
      w: 'up',
      W: 'up',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
    };
    const onKeyDown = (e) => {
      if (DIR_KEYS[e.key]) {
        e.preventDefault();
        keys.current[DIR_KEYS[e.key]] = true;
      }
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        if (phaseRef.current === 'playing') {
          const c = game.current.cursor;
          fire(c.x, c.y);
        } else {
          document.querySelector<HTMLElement>('[data-primary]')?.click();
        }
      }
    };
    const onKeyUp = (e) => {
      if (DIR_KEYS[e.key]) keys.current[DIR_KEYS[e.key]] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ---------- Pointer and touch ----------
  // Mouse: the ring follows the pointer, click to fire. Touch: press, slide to adjust, lift to fire.

  const toSky = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: Math.min(WATER_Y, ((e.clientY - rect.top) / rect.height) * H),
    };
  };
  const onPointerDown = (e) => {
    if (phaseRef.current !== 'playing') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture not supported */
    }
    aiming.current = true;
    game.current.cursor = toSky(e);
    game.current.showCursor = true;
  };
  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse' || aiming.current) {
      game.current.cursor = toSky(e);
      game.current.showCursor = true;
    }
  };
  const onPointerUp = (e) => {
    if (!aiming.current) return;
    aiming.current = false;
    const p = toSky(e);
    fire(p.x, p.y);
  };
  const lanternDots = (n) => (
    <span className="inline-flex gap-1 align-middle" aria-label={`${n} lanterns left`}>
      {[0, 1, 2].map((i) => (
        <span
          key={String(String(i))}
          className={`inline-block w-2.5 h-3.5 rounded-full ${i < n ? 'bg-lantern' : 'bg-white/15'}`}
        />
      ))}
    </span>
  );
  return (
    <main className="font-body max-w-[560px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-x-3 gap-y-1 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(30px,8.5vw,46px)] leading-none text-gold">
            Chain Fireworks
          </h1>
          <p className="text-xs text-muted mt-1">Harbour festival · show {hud.level}</p>
        </div>
        <div className="text-right text-sm">
          <div>
            Score <b className="font-display text-xl">{hud.score}</b>
          </div>
          <div className="text-muted">
            Best {Math.max(best, hud.score)} · {lanternDots(hud.lanterns)}
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between text-sm rounded-full bg-white/5 px-4 py-1.5">
        <span>
          Popped <b className={hud.popped >= hud.need ? 'text-gold' : ''}>{hud.popped}</b>{' '}
          of {hud.need} needed
        </span>
        <span className="text-muted">{hud.total} shells in the sky</span>
      </div>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: `min(100%, calc((100dvh - 200px) * ${W / H}))`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            aiming.current = false;
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') game.current.showCursor = false;
          }}
          aria-label="Night sky over the harbour. Click or tap once to set off a firework."
          className="w-full block rounded-2xl touch-none select-none cursor-crosshair"
          style={{
            aspectRatio: `${W} / ${H}`,
            boxShadow: '0 0 0 1px rgba(255,204,77,.25), 0 24px 60px rgba(0,0,0,.6)',
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-2xl bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            {phase === 'ready' && (
              <>
                <p className="font-display text-4xl text-gold">Tonight's show</p>
                <p className="text-muted max-w-[34ch]">
                  Unlit fireworks drift over the harbour. You get one match per show.
                  Click or tap the sky to set off a burst. Any firework the burst touches
                  explodes too, and so on down the chain. Pop enough to clear the show.
                </p>
                <p className="text-sm text-muted">
                  Three lanterns: a failed show costs one and is replayed. Keys: arrows
                  aim, Space fires.
                </p>
              </>
            )}
            {phase === 'result' && result && (
              <>
                <p className="font-display text-4xl text-gold">
                  {result.cleared ? 'What a show!' : 'The crowd waits'}
                </p>
                <p className="text-muted max-w-[32ch]">
                  {result.cleared
                    ? `You popped ${result.popped} of the ${result.need} needed. Score ${result.score}.`
                    : `Only ${result.popped} of ${result.need} went up. ${result.lanterns} ${result.lanterns === 1 ? 'lantern' : 'lanterns'} left.`}
                </p>
              </>
            )}
            {phase === 'over' && result && (
              <>
                <p className="font-display text-4xl text-lantern">Lanterns out</p>
                <p className="text-muted max-w-[32ch]">
                  The festival ends at show {result.level}. Final score {result.score}.
                  Best {Math.max(best, result.score)}.
                </p>
              </>
            )}
            <button
              type="button"
              data-primary
              onClick={phase === 'result' ? continueShow : start}
              className="font-display text-2xl px-7 py-2 rounded-full bg-lantern text-white shadow-[0_5px_0_#a8331b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              {phase === 'ready' && 'Light the first show'}
              {phase === 'result' &&
                (result && result.cleared ? 'Next show' : 'Try again')}
              {phase === 'over' && 'Play again'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
