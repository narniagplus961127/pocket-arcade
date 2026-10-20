import type { KeyboardState } from '../../shared/input';
import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.05, type = 'triangle', volume = 0.03) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
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

// ---------- World ----------
// Everything is simulated in a fixed 400 x 520 world and scaled to the canvas.

const W = 400;
const H = 520;
const GRAVITY = 820;
const MAX_MISSES = 3;
const BEST_KEY = 'melon-slash-best';
const FRUITS = [
  {
    name: 'watermelon',
    r: 34,
    rind: '#2f7d32',
    stripe: '#1d5420',
    flesh: '#ef3b4a',
    seed: '#2a1a12',
    juice: '#f0465a',
  },
  {
    name: 'orange',
    r: 24,
    rind: '#f28c18',
    stripe: '#e07a0c',
    flesh: '#ffb347',
    seed: '#fff2c2',
    juice: '#ffa62b',
  },
  {
    name: 'lemon',
    r: 22,
    rind: '#f2cf1d',
    stripe: '#e3bd10',
    flesh: '#fff07a',
    seed: '#fffbe0',
    juice: '#ffe94a',
  },
  {
    name: 'apple',
    r: 23,
    rind: '#d7262e',
    stripe: '#b81d24',
    flesh: '#fff1d0',
    seed: '#5b3416',
    juice: '#fff1c0',
  },
  {
    name: 'plum',
    r: 19,
    rind: '#6b2a73',
    stripe: '#561f5d',
    flesh: '#f2b33d',
    seed: '#7a3c12',
    juice: '#b2458f',
  },
  {
    name: 'kiwi',
    r: 21,
    rind: '#8a6a3a',
    stripe: '#735630',
    flesh: '#7dbb2f',
    seed: '#1c1c10',
    juice: '#9bd043',
  },
];
const rand = (a, b) => a + Math.random() * (b - a);

// Wood grain for the board, generated once.
const GRAIN = Array.from(
  {
    length: 26,
  },
  () => ({
    y: rand(40, H),
    amp: rand(2, 7),
    freq: rand(0.01, 0.03),
    phase: rand(0, 6),
    dark: Math.random() < 0.5,
  }),
);

// Distance from point (px, py) to the segment a-b.
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function newGame() {
  return {
    items: [],
    halves: [],
    particles: [],
    splats: [],
    texts: [],
    trail: [],
    pending: [],
    score: 0,
    misses: 0,
    time: 0,
    waveTimer: 0.8,
    stroke: {
      count: 0,
      lastSlice: 0,
    },
    blade: {
      x: W / 2,
      y: H / 2,
      visible: false,
    },
    dying: 0,
    flash: 0,
  };
}

// Tosses one fruit (or bomb) up from below the board.
function toss(g, isBomb) {
  const type = isBomb ? null : FRUITS[Math.floor(Math.random() * FRUITS.length)];
  const r = isBomb ? 22 : type.r;
  const x = rand(60, W - 60);
  const landX = rand(60, W - 60);
  const height = rand(240, H - 70);
  const vy = -Math.sqrt(2 * GRAVITY * height);
  const flight = (2 * -vy) / GRAVITY;
  g.items.push({
    bomb: isBomb,
    type,
    r,
    x,
    y: H + r,
    vx: (landX - x) / flight,
    vy,
    rot: rand(0, 6),
    spin: rand(-3, 3),
  });
  playTone(rand(180, 240), 0.08, 'sine', 0.02);
}
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
};

// ---------- Drawing helpers ----------

function drawWholeFruit(ctx, f) {
  const t = f.type;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.fillStyle = t.rind;
  ctx.beginPath();
  if (t.name === 'watermelon')
    ctx.ellipse(0, 0, t.r * 1.12, t.r * 0.92, 0, 0, Math.PI * 2);
  else if (t.name === 'lemon')
    ctx.ellipse(0, 0, t.r * 1.15, t.r * 0.88, 0, 0, Math.PI * 2);
  else ctx.arc(0, 0, t.r, 0, Math.PI * 2);
  ctx.fill();

  // Watermelon stripes
  if (t.name === 'watermelon') {
    ctx.strokeStyle = t.stripe;
    ctx.lineWidth = 4;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, t.r * 1.1, Math.abs(k) * 7 + 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Lemon tips and apple / plum stalks
  if (t.name === 'lemon') {
    ctx.fillStyle = t.stripe;
    ctx.beginPath();
    ctx.arc(t.r * 1.12, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (t.name === 'apple' || t.name === 'plum' || t.name === 'orange') {
    ctx.strokeStyle = '#5b3a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -t.r + 2);
    ctx.lineTo(2, -t.r - 7);
    ctx.stroke();
    ctx.fillStyle = '#4c9a3a';
    ctx.beginPath();
    ctx.ellipse(8, -t.r - 4, 7, 3.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sunny highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-t.r * 0.35, -t.r * 0.4, t.r * 0.3, t.r * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBomb(ctx, b, now) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = '#26262e';
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#44444f';
  ctx.fillRect(-6, -b.r - 6, 12, 8);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -b.r - 6);
  ctx.quadraticCurveTo(8, -b.r - 16, 14, -b.r - 12);
  ctx.stroke();

  // Fizzing spark
  const flicker = 4 + Math.sin(now / 40) * 2;
  ctx.fillStyle = '#ffdb4d';
  ctx.beginPath();
  ctx.arc(14, -b.r - 12, flicker, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff6a2a';
  ctx.beginPath();
  ctx.arc(14, -b.r - 12, flicker * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Warning cross so bombs read clearly
  ctx.strokeStyle = '#e8e2d0';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -8);
  ctx.lineTo(8, 8);
  ctx.moveTo(8, -8);
  ctx.lineTo(-8, 8);
  ctx.stroke();
  ctx.restore();
}

// A cut half: the cut runs along the local x axis; `side` picks the upper or lower half.
function drawHalf(ctx, h) {
  const t = h.type;
  const start = h.side > 0 ? 0 : Math.PI;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle + h.rot);
  ctx.fillStyle = t.rind;
  ctx.beginPath();
  ctx.arc(0, 0, t.r, start, start + Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = t.name === 'watermelon' ? '#f4f1d0' : t.flesh;
  ctx.beginPath();
  ctx.arc(0, 0, t.r * 0.86, start, start + Math.PI);
  ctx.closePath();
  ctx.fill();
  if (t.name === 'watermelon') {
    ctx.fillStyle = t.flesh;
    ctx.beginPath();
    ctx.arc(0, 0, t.r * 0.76, start, start + Math.PI);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = t.seed;
  for (let k = 0; k < 5; k++) {
    const a = start + (k + 0.5) * (Math.PI / 5);
    ctx.beginPath();
    ctx.ellipse(
      Math.cos(a) * t.r * 0.45,
      Math.sin(a) * t.r * 0.45,
      2.2,
      3.4,
      a,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawBoard(ctx, now) {
  // Wooden board
  ctx.fillStyle = '#d9a066';
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? 'rgba(120,70,25,0.07)' : 'rgba(255,230,180,0.08)';
    ctx.fillRect(0, 40 + k * 62, W, 62);
  }
  GRAIN.forEach((line) => {
    ctx.strokeStyle = line.dark ? 'rgba(110,62,22,0.22)' : 'rgba(255,225,170,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) {
      const y = line.y + Math.sin(x * line.freq + line.phase) * line.amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  // Knife marks
  ctx.strokeStyle = 'rgba(90,50,20,0.18)';
  ctx.lineWidth = 1;
  [
    [60, 300, 140, 280],
    [250, 420, 330, 390],
    [180, 180, 230, 205],
  ].forEach(([a, b, c, d]) => {
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  });

  // Striped awning with a scalloped edge, swaying a touch in the breeze.
  const sway = Math.sin(now / 900) * 1.5;
  const stripe = 40;
  for (let k = 0; k < W / stripe; k++) {
    ctx.fillStyle = k % 2 ? '#fff6e0' : '#d9382b';
    ctx.fillRect(k * stripe, 0, stripe, 26);
    ctx.beginPath();
    ctx.arc(k * stripe + stripe / 2, 26 + sway, stripe / 2, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(80,40,10,0.12)';
  ctx.fillRect(0, 0, W, 4);
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Melon Slash');

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
  const game = useRef(null);
  const [hud, setHud] = useState({
    score: 0,
    misses: 0,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [best, setBest] = useState(readBest);
  const [ending, setEnding] = useState('');
  const pointer = useRef({
    down: false,
    x: 0,
    y: 0,
  });
  const keys = useRef({} as KeyboardState);
  const start = () => {
    game.current = newGame();
    setHud({
      score: 0,
      misses: 0,
    });
    setPhase('playing');
    playTone(660, 0.08);
  };

  // ---------- Slicing ----------

  // Cuts everything the blade segment a-b passes through.
  const sliceSegment = (ax, ay, bx, by) => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing' || g.dying > 0) return;
    if (Math.hypot(bx - ax, by - ay) < 2) return;
    const angle = Math.atan2(by - ay, bx - ax);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    g.items = g.items.filter((it) => {
      if (segmentDistance(it.x, it.y, ax, ay, bx, by) > it.r) return true;
      if (it.bomb) {
        g.dying = 0.9;
        g.flash = 1;
        for (let k = 0; k < 40; k++) {
          const a = rand(0, Math.PI * 2);
          const s = rand(100, 420);
          g.particles.push({
            x: it.x,
            y: it.y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: rand(0.5, 1),
            color: k % 2 ? '#ffb02e' : '#3a3a40',
            size: rand(3, 7),
          });
        }
        playTone(70, 0.7, 'sawtooth', 0.08);
        playTone(110, 0.5, 'square', 0.05);
        return false;
      }

      // Two halves fly apart, perpendicular to the cut.
      [1, -1].forEach((side) => {
        g.halves.push({
          type: it.type,
          side,
          angle,
          rot: 0,
          spin: side * rand(1.5, 4),
          x: it.x + nx * side * 4,
          y: it.y + ny * side * 4,
          vx: it.vx * 0.6 + nx * side * 90,
          vy: Math.min(it.vy, 0) * 0.4 + ny * side * 90 - 60,
          life: 2.5,
        });
      });

      // Juice spray and a stain left on the board.
      for (let k = 0; k < 16; k++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(60, 260);
        g.particles.push({
          x: it.x,
          y: it.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 80,
          life: rand(0.35, 0.8),
          color: it.type.juice,
          size: rand(2, 5),
        });
      }
      g.splats.push({
        x: it.x,
        y: it.y,
        r: it.r * rand(1, 1.5),
        color: it.type.juice,
        alpha: 0.5,
        seed: rand(0, 6),
      });
      if (g.splats.length > 30) g.splats.shift();
      g.score += 1;
      g.stroke.count += 1;
      g.stroke.lastSlice = g.time;
      g.stroke.x = it.x;
      g.stroke.y = it.y;
      playTone(500 + g.stroke.count * 90, 0.07, 'square', 0.025);
      return false;
    });
  };

  // Several fruits in one swipe earn a bonus: one extra point per fruit.
  const endStroke = () => {
    const g = game.current;
    if (!g) return;
    if (g.stroke.count >= 3) {
      const bonus = g.stroke.count;
      g.score += bonus;
      g.texts.push({
        x: g.stroke.x,
        y: g.stroke.y,
        text: `COMBO ×${g.stroke.count}  +${bonus}`,
        life: 1.2,
      });
      [784, 988, 1175].forEach((f, k) => setTimeout(() => playTone(f, 0.1), k * 60));
    }
    g.stroke.count = 0;
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
    const gameOver = (g, reason) => {
      // Flip the ref at once so the next frame does not end the game twice.
      phaseRef.current = 'over';
      setEnding(reason);
      setPhase('over');
      setBest((b) => {
        const next = Math.max(b, g.score);
        try {
          localStorage.setItem(BEST_KEY, String(next));
        } catch (e) {
          // Storage unavailable.
        }
        return next;
      });
    };
    const update = (dt) => {
      const g = game.current;
      if (!g) return;

      // Effects keep animating even after the game ends.
      g.halves.forEach((h) => {
        h.vy += GRAVITY * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.spin * dt;
        h.life -= dt;
      });
      g.halves = g.halves.filter((h) => h.life > 0 && h.y < H + 60);
      g.particles.forEach((p) => {
        p.vy += GRAVITY * 0.6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      });
      g.particles = g.particles.filter((p) => p.life > 0);
      g.splats.forEach((s) => {
        s.alpha = Math.max(0, s.alpha - dt * 0.05);
      });
      g.texts.forEach((t) => {
        t.y -= 40 * dt;
        t.life -= dt;
      });
      g.texts = g.texts.filter((t) => t.life > 0);
      g.flash = Math.max(0, g.flash - dt * 1.5);
      if (phaseRef.current !== 'playing') return;
      g.time += dt;

      // A sliced bomb: let the blast play out, then end.
      if (g.dying > 0) {
        g.dying -= dt;
        if (g.dying <= 0) gameOver(g, 'bomb');
        return;
      }

      // Waves get faster, bigger and bomb-ier over time.
      g.waveTimer -= dt;
      if (g.waveTimer <= 0) {
        const maxCount = Math.min(6, 1 + Math.floor(g.time / 14));
        const count = 1 + Math.floor(Math.random() * maxCount);
        const bombChance = Math.min(0.3, 0.08 + g.time * 0.003);
        for (let k = 0; k < count; k++) {
          g.pending.push({
            at: g.time + k * rand(0.12, 0.3),
            bomb: Math.random() < bombChance,
          });
        }
        g.waveTimer = Math.max(1, 2.4 - g.time * 0.015) + count * 0.15;
      }
      g.pending = g.pending.filter((p) => {
        if (p.at > g.time) return true;
        toss(g, p.bomb);
        return false;
      });

      // Flight; whole fruit falling off the bottom counts as a miss.
      g.items = g.items.filter((it) => {
        it.vy += GRAVITY * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.spin * dt;
        if (it.vy > 0 && it.y - it.r > H) {
          if (!it.bomb) {
            g.misses += 1;
            g.texts.push({
              x: Math.max(30, Math.min(W - 30, it.x)),
              y: H - 30,
              text: '✕ dropped',
              life: 1,
            });
            playTone(150, 0.25, 'triangle', 0.05);
          }
          return false;
        }
        return true;
      });
      if (g.misses >= MAX_MISSES) {
        gameOver(g, 'dropped');
        return;
      }

      // Keyboard blade: arrows / WASD move it, holding Space cuts.
      const k = keys.current;
      const bx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const by = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (bx || by || k.cut) {
        const blade = g.blade;
        const len = Math.hypot(bx, by) || 1;
        const ox = blade.x;
        const oy = blade.y;
        blade.visible = true;
        blade.x = Math.max(0, Math.min(W, blade.x + (bx / len) * 640 * dt));
        blade.y = Math.max(0, Math.min(H, blade.y + (by / len) * 640 * dt));
        if (k.cut) {
          sliceSegment(ox, oy, blade.x, blade.y);
          g.trail.push({
            x: blade.x,
            y: blade.y,
            t: g.time,
          });
        }
      }

      // Combo window closes 0.35 s after the last cut, even mid-swipe.
      if (g.stroke.count > 0 && g.time - g.stroke.lastSlice > 0.35) endStroke();
      g.trail = g.trail.filter((p) => g.time - p.t < 0.18);
      const hudKey = `${g.score}|${g.misses}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.score,
          misses: g.misses,
        });
      }
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawBoard(ctx, now);
      if (!g) return;

      // Juice stains
      g.splats.forEach((s) => {
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const rr = s.r * (0.7 + 0.3 * Math.sin(a * 3 + s.seed));
          if (k === 0) ctx.moveTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
          else ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      g.halves.forEach((h) => drawHalf(ctx, h));
      g.items.forEach((it) =>
        it.bomb ? drawBomb(ctx, it, now) : drawWholeFruit(ctx, it),
      );
      g.particles.forEach((p) => {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Swipe trail: a tapering white streak.
      const trail = g.trail;
      for (let k = 1; k < trail.length; k++) {
        const a = trail[k - 1];
        const b = trail[k];
        const age = (g.time - b.t) / 0.18;
        ctx.strokeStyle = `rgba(255,255,240,${0.95 * (1 - age)})`;
        ctx.lineWidth = 2 + (k / trail.length) * 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Keyboard blade cursor
      if (g.blade.visible && phaseRef.current === 'playing') {
        ctx.strokeStyle = keys.current.cut ? '#ffffff' : 'rgba(59,36,18,0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(g.blade.x, g.blade.y, 9, 0, Math.PI * 2);
        ctx.moveTo(g.blade.x - 14, g.blade.y);
        ctx.lineTo(g.blade.x + 14, g.blade.y);
        ctx.stroke();
      }

      // Floating labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      g.texts.forEach((t) => {
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.font = '20px Lemon, serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#3b2412';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = '#fff6e0';
        ctx.fillText(t.text, t.x, t.y);
      });
      ctx.globalAlpha = 1;
      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,250,235,${g.flash * 0.8})`;
        ctx.fillRect(0, 0, W, H);
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
    const KEYMAP = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
      W: 'up',
      S: 'down',
      A: 'left',
      D: 'right',
      ' ': 'cut',
    };
    const onKeyDown = (e) => {
      if (phaseRef.current !== 'playing') {
        // Ignore auto-repeat so a held Space does not instantly restart.
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          keys.current = {};
          start();
        }
        return;
      }
      const name = KEYMAP[e.key];
      if (!name) return;
      e.preventDefault();
      keys.current[name] = true;
    };
    const onKeyUp = (e) => {
      const name = KEYMAP[e.key];
      if (!name) return;
      keys.current[name] = false;
      if (name === 'cut') endStroke();
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

  // ---------- Pointer swipes ----------

  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };
  const onPointerDown = (e) => {
    if (phaseRef.current !== 'playing') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    pointer.current = {
      down: true,
      x: p.x,
      y: p.y,
    };
    if (game.current) {
      game.current.blade.visible = false;
      game.current.trail.push({
        x: p.x,
        y: p.y,
        t: game.current.time,
      });
    }
  };
  const onPointerMove = (e) => {
    if (!pointer.current.down || !game.current) return;
    const p = toWorld(e);
    sliceSegment(pointer.current.x, pointer.current.y, p.x, p.y);
    game.current.trail.push({
      x: p.x,
      y: p.y,
      t: game.current.time,
    });
    pointer.current.x = p.x;
    pointer.current.y = p.y;
  };
  const onPointerUp = () => {
    pointer.current.down = false;
    endStroke();
  };
  return (
    <main className="font-body max-w-[520px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(30px,9vw,46px)] leading-none text-awning">
            Melon Slash
          </h1>
          <p className="text-sm text-muted">Fresh from the stall, sliced to order.</p>
        </div>
        <div className="text-right">
          <div className="text-sm">
            Score <b className="font-display text-2xl">{hud.score}</b>
          </div>
          <div className="text-sm text-muted">
            Best {Math.max(best, hud.score)} ·
            <span aria-label={`${hud.misses} of ${MAX_MISSES} fruit dropped`}>
              {Array.from(
                {
                  length: MAX_MISSES,
                },
                (_, i) => (
                  <span
                    key={String(String(i))}
                    className={i < hud.misses ? 'text-awning font-bold' : 'opacity-30'}
                  >
                    ✕
                  </span>
                ),
              )}
            </span>
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: `calc(72vh * ${W / H})`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Chopping board"
          className="w-full block rounded-2xl touch-none shadow-[0_10px_0_#9c6a3a] cursor-crosshair"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-2xl bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="font-display text-3xl text-awning">
              {phase === 'over'
                ? ending === 'bomb'
                  ? 'Kaboom!'
                  : 'Too many dropped'
                : 'Market day'}
            </p>
            <p className="max-w-[34ch]">
              {phase === 'over'
                ? `You sliced ${hud.score} points of fruit. Best: ${Math.max(best, hud.score)}.`
                : 'Fruit gets tossed over the board. Drag across it to slice it. Cut three or more in one swipe for a combo bonus.'}
            </p>
            <p className="text-sm text-muted max-w-[34ch]">
              Never slice a bomb. Let 3 fruits fall and the stall closes. Keyboard: arrows
              move the blade, hold Space to cut.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-7 py-2 rounded-full bg-leaf text-white shadow-[0_4px_0_#245a22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Play again' : 'Start'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
