import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  anchors: {
    x: number;
    y: number;
    id: number;
  }[];
  bananas: any[];
  particles: any[];
  nextId: number;
  lastX: number;
  cam: number;
  monkey: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  attached: {
    x: number;
    y: number;
    id: number;
  };
  ropeLen: number;
  holding: boolean;
  released: any;
  releaseTimer: number;
  maxX: number;
  bananasEaten: number;
  dying: number;
  time: number;
  done?: boolean;
  hudKey?: string;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.06, type = 'triangle', volume = 0.035) {
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

// ---------- World constants (logical units; the canvas scales to fit) ----------

const W = 480;
const H = 360;
const GRAVITY = 980;
const REACH = 165; // how far the monkey can stretch to grab a vine knot
const PUMP = 260; // a gentle kick along the swing so arcs can grow, like pumping a playground swing
const MAX_SPEED = 820;
const WATER_Y = H - 34;
const SUBSTEPS = 6;
const START_X = 140;
const BEST_KEY = 'vine-swing-best';

// Deterministic pseudo-random number in [0, 1) so scenery stays put as the camera scrolls.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- World generation ----------

function makeAnchor(x, index) {
  return {
    x,
    y: 44 + hash(index * 3.1) * 72,
    id: index,
  };
}

// Adds anchors and bananas ahead of the camera, and forgets the ones far behind.
function extendWorld(g) {
  while (g.lastX < g.cam + W + 400) {
    const i = g.nextId;
    // Gaps start comfortable and stretch as you travel.
    const gap = 150 + Math.min(170, i * 7) + hash(i * 7.7) * 50;
    const x = g.lastX + gap;
    g.anchors.push(makeAnchor(x, i));
    if (hash(i * 5.3) < 0.8) {
      g.bananas.push({
        x: g.lastX + gap * (0.42 + hash(i * 2.2) * 0.25),
        y: 140 + hash(i * 9.1) * 120,
        phase: hash(i) * 6.28,
      });
    }
    g.lastX = x;
    g.nextId++;
  }
  g.anchors = g.anchors.filter((a) => a.x > g.cam - 300);
  g.bananas = g.bananas.filter((b) => b.x > g.cam - 100);
}

function newGame() {
  const first = {
    x: START_X,
    y: 60,
    id: 0,
  };
  const g = {
    anchors: [first],
    bananas: [],
    particles: [],
    nextId: 1,
    lastX: START_X,
    cam: 0,
    // The monkey starts hanging from the first knot, already swinging forward.
    monkey: {
      x: START_X,
      y: 60 + 125,
      vx: 330,
      vy: 0,
    },
    attached: first,
    ropeLen: 125,
    holding: false,
    released: null,
    releaseTimer: 0,
    maxX: START_X,
    bananasEaten: 0,
    dying: 0,
    time: 0,
  } as GameState;
  extendWorld(g);
  return g;
}

// Nearest knot within reach, skipping the one just let go of for a moment.
function findAnchor(g) {
  const m = g.monkey;
  let best = null;
  let bestDist = REACH;
  for (const a of g.anchors) {
    if (a === g.released && g.releaseTimer > 0) continue;
    const d = Math.hypot(a.x - m.x, a.y - m.y);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}
const distanceOf = (g) => Math.max(0, Math.floor((g.maxX - START_X) / 10));
const scoreOf = (g) => distanceOf(g) + g.bananasEaten * 10;
function burst(g, x, y, color, count, speed) {
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.4,
      life: 0.7,
      max: 0.7,
      color,
      size: 2 + Math.random() * 2.5,
    });
  }
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Vine Swing');

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
  const [hud, setHud] = useState({
    score: 0,
    distance: 0,
    bananas: 0,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  });
  const start = () => {
    game.current = newGame();
    setHud({
      score: 0,
      distance: 0,
      bananas: 0,
    });
    setPhase('playing');
    playTone(520, 0.1, 'sine', 0.04);
  };

  // Grabbing is checked every physics step while held, so holding early catches the next knot as it comes in reach.
  const press = () => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.dying > 0) return;
    g.holding = true;
  };
  const release = () => {
    const g = game.current;
    if (!g.holding) return;
    g.holding = false;
    if (g.attached) {
      g.released = g.attached;
      g.releaseTimer = 0.25;
      g.attached = null;
      playTone(330, 0.08, 'sine', 0.03);
    }
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
    const finish = (g) => {
      g.done = true;
      setPhase('over');
      const score = scoreOf(g);
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

    // ---------- Physics ----------

    const physicsStep = (g, h) => {
      const m = g.monkey;
      if (g.holding && !g.attached) {
        const a = findAnchor(g);
        if (a) {
          g.attached = a;
          g.ropeLen = Math.max(50, Math.hypot(m.x - a.x, m.y - a.y));
          burst(g, a.x, a.y, '#7fc65a', 8, 120);
          playTone(660, 0.07, 'triangle', 0.04);
        }
      }

      // Pumping only works below the knot, pushing along the current direction of swing.
      if (g.attached) {
        const a = g.attached;
        const dx = m.x - a.x;
        const dy = m.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        if (dy > 0) {
          const tx = -dy / d;
          const ty = dx / d;
          const vt = m.vx * tx + m.vy * ty;
          const dir = vt >= 0 ? 1 : -1;
          m.vx += tx * dir * PUMP * h;
          m.vy += ty * dir * PUMP * h;
        }
      }
      m.vy += GRAVITY * h;
      m.x += m.vx * h;
      m.y += m.vy * h;

      // Rope constraint: a vine can go slack but never stretch. When taut, pull the monkey back onto
      // the circle and remove the outward part of its velocity.
      if (g.attached) {
        const a = g.attached;
        const dx = m.x - a.x;
        const dy = m.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > g.ropeLen) {
          const nx = dx / d;
          const ny = dy / d;
          m.x = a.x + nx * g.ropeLen;
          m.y = a.y + ny * g.ropeLen;
          const vr = m.vx * nx + m.vy * ny;
          if (vr > 0) {
            m.vx -= vr * nx;
            m.vy -= vr * ny;
          }
        }
      }

      // The canopy roof: bump into the leaves rather than flying off the top of the view.
      if (m.y < 18) {
        m.y = 18;
        m.vy = Math.max(0, m.vy);
      }
      const speed = Math.hypot(m.vx, m.vy);
      if (speed > MAX_SPEED) {
        m.vx *= MAX_SPEED / speed;
        m.vy *= MAX_SPEED / speed;
      }
    };
    const update = (dt) => {
      const g = game.current;
      g.time += dt;

      // Particles drift even on the menus.
      for (const p of g.particles) {
        p.vy += 500 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      g.particles = g.particles.filter((p) => p.life > 0);
      if (phaseRef.current !== 'playing' || g.done) return;

      // Splashed down: let the ripples play out, then show the result.
      if (g.dying > 0) {
        g.dying -= dt;
        g.monkey.y += 30 * dt;
        if (g.dying <= 0) finish(g);
        return;
      }
      g.releaseTimer = Math.max(0, g.releaseTimer - dt);
      for (let s = 0; s < SUBSTEPS; s++) physicsStep(g, dt / SUBSTEPS);
      const m = g.monkey;
      g.maxX = Math.max(g.maxX, m.x);

      // Bananas
      for (const b of g.bananas) {
        if (b.taken) continue;
        if (Math.hypot(b.x - m.x, b.y - m.y) < 22) {
          b.taken = true;
          g.bananasEaten++;
          burst(g, b.x, b.y, '#ffd447', 12, 160);
          playTone(880, 0.06, 'square', 0.025);
          setTimeout(() => playTone(1175, 0.08, 'square', 0.025), 60);
        }
      }

      // The river
      if (m.y > WATER_Y - 6) {
        g.dying = 0.9;
        g.attached = null;
        g.holding = false;
        burst(g, m.x, WATER_Y, '#9fe8dc', 26, 260);
        playTone(140, 0.5, 'sawtooth', 0.04);
      }

      // Camera keeps the monkey a little left of centre so you can see what's coming.
      const target = m.x - W * 0.36;
      g.cam += (target - g.cam) * Math.min(1, dt * 4);
      extendWorld(g);
      const hudKey = `${scoreOf(g)}|${g.bananasEaten}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: scoreOf(g),
          distance: distanceOf(g),
          bananas: g.bananasEaten,
        });
      }
    };

    // ---------- Drawing ----------

    // Calls fn(index, screenX) for every repeat of a parallax layer that is on screen.
    const forEachInLayer = (g, factor, spacing, fn) => {
      const offset = g.cam * factor;
      const first = Math.floor(offset / spacing) - 1;
      const count = Math.ceil(W / spacing) + 3;
      for (let i = first; i < first + count; i++) fn(i, i * spacing - offset);
    };
    const drawBanana = (x, y, rot) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = '#ffd447';
      ctx.beginPath();
      ctx.arc(0, -4, 11, Math.PI * 0.15, Math.PI * 0.85);
      ctx.arc(0, -10, 12, Math.PI * 0.8, Math.PI * 0.2, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6b4a1f';
      ctx.fillRect(8, 0, 3, 3);
      ctx.restore();
    };
    const drawMonkey = (g) => {
      const m = g.monkey;
      let angle = Math.max(-0.6, Math.min(0.6, m.vx / 900));
      if (g.attached)
        angle = Math.atan2(g.attached.y - m.y, g.attached.x - m.x) + Math.PI / 2;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(angle);

      // Tail
      ctx.strokeStyle = '#5e3518';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, 8);
      ctx.quadraticCurveTo(-20, 16, -16, 2);
      ctx.arc(-12, 2, 4, Math.PI, Math.PI * 2.2);
      ctx.stroke();

      // Arms reach up to the vine
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-5, -4);
      ctx.lineTo(g.attached ? -1 : -11, g.attached ? -20 : -12);
      ctx.moveTo(5, -4);
      ctx.lineTo(g.attached ? 1 : 11, g.attached ? -20 : -12);
      ctx.stroke();

      // Body and belly
      ctx.fillStyle = '#7a4520';
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9a86c';
      ctx.beginPath();
      ctx.ellipse(0, 6, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = '#7a4520';
      ctx.beginPath();
      ctx.arc(-8, -9, 3.5, 0, Math.PI * 2);
      ctx.arc(8, -9, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -9, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8bf87';
      ctx.beginPath();
      ctx.ellipse(0, -7.5, 5.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b120a';
      ctx.beginPath();
      ctx.arc(-2.3, -9, 1.3, 0, Math.PI * 2);
      ctx.arc(2.3, -9, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      const t = now / 1000;

      // Shade beneath the canopy
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a2014');
      sky.addColorStop(0.55, '#1b4a2b');
      sky.addColorStop(1, '#2d6a3b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Shafts of sunlight
      ctx.fillStyle = 'rgba(235, 255, 170, 0.05)';
      forEachInLayer(g, 0.1, 210, (i, x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 50, 0);
        ctx.lineTo(x + 150, WATER_Y);
        ctx.lineTo(x + 80, WATER_Y);
        ctx.fill();
      });

      // Far trunks
      forEachInLayer(g, 0.25, 95, (i, x) => {
        const w = 14 + hash(i * 1.7) * 16;
        ctx.fillStyle = hash(i) > 0.5 ? '#163b24' : '#13341f';
        ctx.fillRect(x + hash(i * 3.3) * 40, 0, w, WATER_Y);
      });

      // Middle layer: hanging lianas
      ctx.strokeStyle = '#2c6236';
      ctx.lineWidth = 2;
      forEachInLayer(g, 0.55, 60, (i, x) => {
        const len = 60 + hash(i * 4.4) * 140;
        const sway = Math.sin(t * 0.8 + i) * 6;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + sway, len / 2, x + sway * 1.5, len);
        ctx.stroke();
        ctx.fillStyle = '#3d7d3f';
        ctx.beginPath();
        ctx.ellipse(x + sway * 1.5, len, 4, 7, 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // ---------- World layer ----------
      ctx.setTransform(scale, 0, 0, scale, -g.cam * scale, 0);

      // Branches and knots
      const target = !g.attached && phaseRef.current === 'playing' ? findAnchor(g) : null;
      for (const a of g.anchors) {
        ctx.strokeStyle = '#5a3a1e';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x - 45, -6);
        ctx.quadraticCurveTo(a.x - 12, a.y * 0.35, a.x, a.y);
        ctx.stroke();

        // A short idle vine dangles from every knot nobody is holding.
        if (a !== g.attached) {
          const sway = Math.sin(t * 1.6 + a.id) * 5;
          ctx.strokeStyle = '#4f8f3a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(a.x + sway, a.y + 18, a.x + sway * 1.6, a.y + 32);
          ctx.stroke();
        }
        ctx.fillStyle = '#3f7f37';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(
            a.x - 14 + k * 12,
            a.y - 9 - (k % 2) * 5,
            9,
            5,
            -0.5 + k * 0.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.fillStyle = '#8a5a2b';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
        ctx.fill();
        if (a === target) {
          const pulse = 1 + Math.sin(t * 8) * 0.15;
          ctx.strokeStyle = g.holding ? '#ffd447' : 'rgba(255, 212, 71, 0.65)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(a.x, a.y, 13 * pulse, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // The vine in use
      if (g.attached) {
        const a = g.attached;
        const m = g.monkey;
        ctx.strokeStyle = '#5fa944';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(m.x, m.y - 6);
        ctx.stroke();
        ctx.fillStyle = '#7cc45a';
        for (let k = 1; k < 4; k++) {
          const px = a.x + ((m.x - a.x) * k) / 4;
          const py = a.y + ((m.y - 6 - a.y) * k) / 4;
          ctx.beginPath();
          ctx.ellipse(px + 3, py, 4, 2, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Bananas bob in place
      for (const b of g.bananas) {
        if (b.taken) continue;
        drawBanana(
          b.x,
          b.y + Math.sin(t * 3 + b.phase) * 3,
          Math.sin(t * 2 + b.phase) * 0.3,
        );
      }
      if (g.dying <= 0 || g.monkey.y < WATER_Y + 10) drawMonkey(g);
      for (const p of g.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ---------- River (screen layer) ----------
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const water = ctx.createLinearGradient(0, WATER_Y, 0, H);
      water.addColorStop(0, '#2a9c8b');
      water.addColorStop(1, '#0f4a43');
      ctx.fillStyle = water;
      ctx.fillRect(0, WATER_Y, W, H - WATER_Y);
      ctx.strokeStyle = 'rgba(200, 255, 240, 0.35)';
      ctx.lineWidth = 1.5;
      for (let row = 0; row < 3; row++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const y =
            WATER_Y + 6 + row * 9 + Math.sin(x * 0.05 + t * 2 + row + g.cam * 0.05) * 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Lily pads and a lurking crocodile or two
      forEachInLayer(g, 1, 140, (i, x) => {
        const px = x + hash(i * 6.1) * 80;
        ctx.fillStyle = '#3f8f45';
        ctx.beginPath();
        ctx.ellipse(px, WATER_Y + 14, 14, 5, 0, 0.3, Math.PI * 2);
        ctx.lineTo(px, WATER_Y + 14);
        ctx.fill();
        if (hash(i * 8.8) < 0.3) {
          const cx = x + 60;
          const bob = Math.sin(t * 1.5 + i) * 1.5;
          ctx.fillStyle = '#365e2a';
          ctx.beginPath();
          ctx.ellipse(cx, WATER_Y + 3 + bob, 18, 4, 0, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#e9e36a';
          ctx.beginPath();
          ctx.arc(cx - 6, WATER_Y + bob, 2, 0, Math.PI * 2);
          ctx.arc(cx + 6, WATER_Y + bob, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Canopy fringe along the top edge
      forEachInLayer(g, 1, 30, (i, x) => {
        ctx.fillStyle = hash(i * 2.9) > 0.5 ? '#245a2e' : '#1d4b27';
        ctx.beginPath();
        ctx.ellipse(x, 6 + hash(i) * 8, 22, 14, hash(i * 5) - 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
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

    const GRAB_KEYS = [' ', 'ArrowUp', 'w', 'W'];
    const onKeyDown = (e) => {
      if (!GRAB_KEYS.includes(e.key) && e.key !== 'Enter') return;
      e.preventDefault();
      if (phaseRef.current !== 'playing') {
        if (!e.repeat) start();
        return;
      }
      if (!e.repeat) press();
    };
    const onKeyUp = (e) => {
      if (GRAB_KEYS.includes(e.key)) release();
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

  const onPointerDown = (e) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture not supported */
    }
    press();
  };
  return (
    <main className="font-body max-w-[760px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="font-display text-[clamp(34px,10vw,56px)] leading-none text-banana">
          Vine Swing
        </h1>
        <div className="text-right text-sm">
          <div>
            Score <b className="font-display text-2xl">{hud.score}</b>
          </div>
          <div className="text-muted">
            {hud.distance} m · {hud.bananas} bananas · Best {Math.max(best, hud.score)}
          </div>
        </div>
      </header>

      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          boxShadow: '0 0 0 4px #2b5a35, 0 24px 50px rgba(0,0,0,.45)',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Rainforest canopy. Press and hold to grab a vine, release to let go."
          className="w-full block touch-none select-none cursor-pointer"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 bg-card flex flex-col items-center justify-center gap-3 text-center p-5">
            <p className="font-display text-[clamp(26px,7vw,40px)] leading-none text-banana">
              {phase === 'over' ? 'Splash!' : 'Into the canopy'}
            </p>
            <p className="text-muted max-w-[38ch] text-sm sm:text-base">
              {phase === 'over'
                ? `You swung ${hud.distance} m and grabbed ${hud.bananas} bananas. Score ${hud.score}. Best ${Math.max(best, hud.score)}.`
                : 'Hold to grab the nearest vine knot in reach. Let go to fly. Keep clear of the river. Each banana is worth 10 metres. The knots drift farther apart as you go.'}
            </p>
            <p className="text-xs text-muted">
              Space, or press and hold anywhere on the jungle.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-7 py-2 rounded-full bg-banana text-bg shadow-[0_5px_0_#a6801c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Swing again' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted">
        Tip: let go on the upswing, as the monkey rises ahead of the knot. Grab early and
        keep holding, and the monkey catches the next knot as soon as it comes in reach.
      </p>
    </main>
  );
}
export default App;
