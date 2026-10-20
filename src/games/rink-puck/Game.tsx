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

// ---------- Table ----------
// All physics runs in table units: the table is W x H, the player defends the bottom goal.

const W = 300;
const H = 500;
const GOAL_W = 110;
const PUCK_R = 13;
const MALLET_R = 24;
const WIN_SCORE = 7;
const MAX_PUCK_SPEED = 1100;
const PLAYER_MAX_SPEED = 1600;
const KEY_SPEED = 520;
const STORAGE_KEY = 'rink-puck-records';

// The computer's three levels: top speed, how often it re-plans, how far it reads ahead, and how sloppy its aim is.
const LEVELS = {
  easy: {
    label: 'Skater',
    speed: 300,
    reaction: 0.22,
    lookahead: 0,
    jitter: 50,
  },
  medium: {
    label: 'Racer',
    speed: 480,
    reaction: 0.12,
    lookahead: 0.08,
    jitter: 22,
  },
  hard: {
    label: 'Rink Legend',
    speed: 720,
    reaction: 0.04,
    lookahead: 0.16,
    jitter: 6,
  },
};
const POSTS = [
  {
    x: W / 2 - GOAL_W / 2,
    y: 0,
  },
  {
    x: W / 2 + GOAL_W / 2,
    y: 0,
  },
  {
    x: W / 2 - GOAL_W / 2,
    y: H,
  },
  {
    x: W / 2 + GOAL_W / 2,
    y: H,
  },
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function readRecords() {
  try {
    return (
      JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        easy: 0,
        medium: 0,
        hard: 0,
      }
    );
  } catch (e) {
    return {
      easy: 0,
      medium: 0,
      hard: 0,
    };
  }
}

function newMatch(level) {
  return {
    level,
    you: 0,
    cpu: 0,
    puck: {
      x: W / 2,
      y: H * 0.68,
      vx: 0,
      vy: 0,
    },
    player: {
      x: W / 2,
      y: H - 60,
      vx: 0,
      vy: 0,
    },
    ai: {
      x: W / 2,
      y: 60,
      vx: 0,
      vy: 0,
    },
    target: {
      x: W / 2,
      y: H - 60,
    },
    aiTarget: {
      x: W / 2,
      y: 60,
    },
    aiTimer: 0,
    aiStrike: 0,
    aiRecover: 0,
    aiAimX: null,
    over: false,
    keys: {},
    pause: 1,
    flash: null,
    hudKey: '',
  };
}

// Put the puck back in the half of whoever just conceded.
function serve(g, conceder) {
  g.puck = {
    x: W / 2,
    y: conceder === 'you' ? H * 0.68 : H * 0.32,
    vx: 0,
    vy: 0,
  };
  g.player.x = W / 2;
  g.player.y = H - 60;
  g.target = {
    x: W / 2,
    y: H - 60,
  };
  g.ai.x = W / 2;
  g.ai.y = 60;
  g.pause = 1.1;
}

// ---------- Physics ----------

function capSpeed(p) {
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > MAX_PUCK_SPEED) {
    p.vx *= MAX_PUCK_SPEED / speed;
    p.vy *= MAX_PUCK_SPEED / speed;
  }
}

// Mallets act like immovable circles with their own velocity, so a moving mallet adds its speed to the puck.
function collideMallet(puck, m) {
  let dx = puck.x - m.x;
  let dy = puck.y - m.y;
  let d = Math.hypot(dx, dy);
  const minD = PUCK_R + MALLET_R;
  if (d >= minD) return 0;
  if (d === 0) {
    dx = 0;
    dy = m.y < H / 2 ? 1 : -1;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  puck.x = m.x + nx * minD;
  puck.y = m.y + ny * minD;
  const rvx = puck.vx - m.vx;
  const rvy = puck.vy - m.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  puck.vx -= 1.9 * vn * nx;
  puck.vy -= 1.9 * vn * ny;
  capSpeed(puck);
  return -vn;
}

// Walls, goal-mouth posts and the goal slots themselves.
function collideWalls(puck) {
  let bump = 0;
  const inMouth = Math.abs(puck.x - W / 2) < GOAL_W / 2;
  if (puck.x < PUCK_R) {
    puck.x = PUCK_R;
    bump = Math.max(bump, Math.abs(puck.vx));
    puck.vx = Math.abs(puck.vx) * 0.9;
  }
  if (puck.x > W - PUCK_R) {
    puck.x = W - PUCK_R;
    bump = Math.max(bump, Math.abs(puck.vx));
    puck.vx = -Math.abs(puck.vx) * 0.9;
  }
  if (!inMouth && puck.y < PUCK_R) {
    puck.y = PUCK_R;
    bump = Math.max(bump, Math.abs(puck.vy));
    puck.vy = Math.abs(puck.vy) * 0.9;
  }
  if (!inMouth && puck.y > H - PUCK_R) {
    puck.y = H - PUCK_R;
    bump = Math.max(bump, Math.abs(puck.vy));
    puck.vy = -Math.abs(puck.vy) * 0.9;
  }

  // Once inside a slot the puck is guided straight in.
  if (puck.y < 0 || puck.y > H) {
    const lo = W / 2 - GOAL_W / 2 + PUCK_R;
    const hi = W / 2 + GOAL_W / 2 - PUCK_R;
    if (puck.x < lo) {
      puck.x = lo;
      puck.vx = Math.abs(puck.vx);
    }
    if (puck.x > hi) {
      puck.x = hi;
      puck.vx = -Math.abs(puck.vx);
    }
  }
  for (const post of POSTS) {
    const dx = puck.x - post.x;
    const dy = puck.y - post.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < PUCK_R) {
      const nx = dx / d;
      const ny = dy / d;
      puck.x = post.x + nx * PUCK_R;
      puck.y = post.y + ny * PUCK_R;
      const vn = puck.vx * nx + puck.vy * ny;
      if (vn < 0) {
        puck.vx -= 1.8 * vn * nx;
        puck.vy -= 1.8 * vn * ny;
        bump = Math.max(bump, -vn);
      }
    }
  }
  return bump;
}

// Move a mallet toward a point at no more than maxSpeed, keeping it in its own half.
function moveMallet(m, tx, ty, maxSpeed, dt, isPlayer) {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.min(dist, maxSpeed * dt);
  let nx = dist > 0 ? m.x + (dx / dist) * step : m.x;
  let ny = dist > 0 ? m.y + (dy / dist) * step : m.y;
  nx = clamp(nx, MALLET_R, W - MALLET_R);
  ny = isPlayer
    ? clamp(ny, H / 2 + MALLET_R, H - MALLET_R)
    : clamp(ny, MALLET_R, H / 2 - MALLET_R);
  return {
    x: nx,
    y: ny,
  };
}

// If something pushed the puck into a mallet (a wall, or a serve), move the mallet out instead.
function separateMallets(g) {
  const p = g.puck;
  for (const m of [g.player, g.ai]) {
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < PUCK_R + MALLET_R) {
      m.x = p.x + (dx / d) * (PUCK_R + MALLET_R);
      m.y = p.y + (dy / d) * (PUCK_R + MALLET_R);
      m.x = clamp(m.x, MALLET_R, W - MALLET_R);
      m.y =
        m === g.player
          ? clamp(m.y, H / 2 + MALLET_R, H - MALLET_R)
          : clamp(m.y, MALLET_R, H / 2 - MALLET_R);
    }
  }
}

// A puck jammed in a corner can never be hit cleanly, so after a moment the corner's air jet puffs it back out.
function freeTrappedPuck(g, dt) {
  const p = g.puck;
  const nearX = p.x < 45 || p.x > W - 45;
  const nearY = p.y < 45 || p.y > H - 45;
  g.trapT = nearX && nearY ? (g.trapT || 0) + dt : 0;
  if (g.trapT > 1.2) {
    g.trapT = 0;
    const dx = W / 2 - p.x;
    const dy = H / 2 - p.y;
    const len = Math.hypot(dx, dy);
    p.vx = (dx / len) * 260;
    p.vy = (dy / len) * 260;
    playTone(700, 0.12, 'sine', 0.02);
  }
}

// ---------- Computer opponent ----------
// It defends near its goal while the puck is away, and when the puck is in its half it lines up
// behind the puck (on the line from your goal) and then drives straight through it.

function planAI(g) {
  const lv = LEVELS[g.level];
  const p = g.puck;
  const ai = g.ai;
  const px = p.x + p.vx * lv.lookahead;
  const py = p.y + p.vy * lv.lookahead;
  if (g.aiRecover > 0) {
    g.aiStrike = 0;
    g.aiAimX = null;
    g.aiTarget = {
      x: ai.x,
      y: Math.max(MALLET_R, ai.y - 40),
    };
    return;
  }
  if (py > H / 2 + 20) {
    g.aiTarget = {
      x: W / 2 + (px - W / 2) * 0.35,
      y: 62,
    };
    return;
  }

  // Puck pinned against the AI's own end wall: there is no room behind it, so just knock it sideways.
  if (py < PUCK_R + MALLET_R + 4) {
    g.aiTarget = {
      x: px,
      y: py,
    };
    return;
  }

  // The puck is between the mallet and the AI goal: slide around it first.
  if (ai.y > py - 6) {
    const side = ai.x < px ? -1 : 1;
    g.aiTarget = {
      x: px + side * (PUCK_R + MALLET_R + 10),
      y: py - 26,
    };
    return;
  }

  // Each attack picks a spot across your goal mouth to shoot at, plus some wobble.
  if (g.aiAimX == null) g.aiAimX = W / 2 + (Math.random() - 0.5) * GOAL_W * 0.7;
  const aimX = g.aiAimX + (Math.random() - 0.5) * 2 * lv.jitter;
  const ux = px - aimX;
  const uy = py - H;
  const len = Math.hypot(ux, uy) || 1;
  const behind = {
    x: px + (ux / len) * (PUCK_R + MALLET_R + 8),
    y: py + (uy / len) * (PUCK_R + MALLET_R + 8),
  };

  // Once lined up, commit to the strike for a moment instead of backing off on the next re-plan.
  if (g.aiStrike > 0 || Math.hypot(ai.x - behind.x, ai.y - behind.y) < 16) {
    if (g.aiStrike <= 0) g.aiStrike = 0.3;
    g.aiTarget = {
      x: px - (ux / len) * 40,
      y: py - (uy / len) * 40,
    };
  } else {
    g.aiTarget = behind;
  }
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Rink Puck');

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
  const [phase, setPhase] = useState('menu');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [level, setLevel] = useState('medium');
  const levelRef = useRef(level);
  levelRef.current = level;
  const [hud, setHud] = useState({
    you: 0,
    cpu: 0,
  });
  const [records, setRecords] = useState(readRecords);
  const [result, setResult] = useState(null);
  const start = (lv = levelRef.current) => {
    game.current = newMatch(lv);
    setHud({
      you: 0,
      cpu: 0,
    });
    setResult(null);
    setPhase('playing');
    playTone(520, 0.12, 'sine', 0.04);
  };
  const startRef = useRef(start);
  startRef.current = start;
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
      const won = g.you > g.cpu;
      g.over = true;
      setResult({
        won,
        you: g.you,
        cpu: g.cpu,
        level: g.level,
      });
      setPhase('over');
      if (won) {
        setRecords((r) => {
          const next = {
            ...r,
            [g.level]: (r[g.level] || 0) + 1,
          };
          try {
            localStorage.setItem(STORAGE_KEY, String(JSON.stringify(next)));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.18, 'sine', 0.05), k * 110),
        );
      } else {
        [392, 330, 262].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.22, 'triangle', 0.05), k * 140),
        );
      }
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || g.over || phaseRef.current !== 'playing') return;

      // Arrow keys nudge the target point; the pointer sets it directly.
      const k = g.keys;
      const kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (kx || ky) {
        g.target.x = clamp(g.player.x + kx * KEY_SPEED * 0.08, MALLET_R, W - MALLET_R);
        g.target.y = clamp(
          g.player.y + ky * KEY_SPEED * 0.08,
          H / 2 + MALLET_R,
          H - MALLET_R,
        );
      }
      const oldPlayer = {
        x: g.player.x,
        y: g.player.y,
      };
      const keySpeed = kx || ky ? KEY_SPEED : PLAYER_MAX_SPEED;
      const newPlayer = moveMallet(g.player, g.target.x, g.target.y, keySpeed, dt, true);
      g.player.vx = (newPlayer.x - oldPlayer.x) / dt;
      g.player.vy = (newPlayer.y - oldPlayer.y) / dt;
      g.aiStrike -= dt;
      g.aiRecover -= dt;
      g.aiTimer -= dt;
      if (g.aiTimer <= 0) {
        g.aiTimer = LEVELS[g.level].reaction;
        planAI(g);
      }
      const oldAI = {
        x: g.ai.x,
        y: g.ai.y,
      };
      const newAI = moveMallet(
        g.ai,
        g.aiTarget.x,
        g.aiTarget.y,
        LEVELS[g.level].speed,
        dt,
        false,
      );
      g.ai.vx = (newAI.x - oldAI.x) / dt;
      g.ai.vy = (newAI.y - oldAI.y) / dt;
      if (g.pause > 0) {
        g.pause -= dt;
        g.player.x = newPlayer.x;
        g.player.y = newPlayer.y;
        g.ai.x = newAI.x;
        g.ai.y = newAI.y;
        separateMallets(g);
        return;
      }

      // Substeps stop a fast puck or mallet from tunnelling through each other.
      const steps = 5;
      const sdt = dt / steps;
      const p = g.puck;
      let hit = 0;
      let bump = 0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        g.player.x = oldPlayer.x + (newPlayer.x - oldPlayer.x) * t;
        g.player.y = oldPlayer.y + (newPlayer.y - oldPlayer.y) * t;
        g.ai.x = oldAI.x + (newAI.x - oldAI.x) * t;
        g.ai.y = oldAI.y + (newAI.y - oldAI.y) * t;
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        const playerHit = collideMallet(p, g.player);
        const aiHit = collideMallet(p, g.ai);
        // After striking, the computer pulls back for a moment instead of pinning the puck against a wall.
        if (aiHit > 0) g.aiRecover = 0.3;
        hit = Math.max(hit, playerHit, aiHit);
        bump = Math.max(bump, collideWalls(p));
      }
      separateMallets(g);

      // The air cushion lets the puck glide, with only a little drag.
      const drag = Math.exp(-0.28 * dt);
      p.vx *= drag;
      p.vy *= drag;
      freeTrappedPuck(g, dt);
      if (hit > 40) playTone(260 + Math.min(hit, 900) * 0.4, 0.05, 'square', 0.035);
      if (bump > 60) playTone(180, 0.04, 'triangle', 0.025);

      // Goals: the puck has to drop fully into a slot.
      if (p.y < -PUCK_R || p.y > H + PUCK_R) {
        const youScored = p.y < 0;
        if (youScored) g.you += 1;
        else g.cpu += 1;
        g.flash = {
          text: youScored ? 'GOAL!' : 'CPU SCORES',
          color: youScored ? '#3fe0d0' : '#ff5fa2',
          time: 1.1,
        };
        playTone(youScored ? 880 : 220, 0.3, 'sawtooth', 0.04);
        if (g.you >= WIN_SCORE || g.cpu >= WIN_SCORE) {
          finish(g);
        } else {
          serve(g, youScored ? 'cpu' : 'you');
        }
      }
      if (g.flash) {
        g.flash.time -= dt;
        if (g.flash.time <= 0) g.flash = null;
      }
      const hudKey = `${g.you}|${g.cpu}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          you: g.you,
          cpu: g.cpu,
        });
      }
    };
    const drawMallet = (m, color, glow) => {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, MALLET_R * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y - 1, MALLET_R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(m.x - 4, m.y - 5, MALLET_R * 0.18, 0, Math.PI * 2);
      ctx.fill();
    };
    const draw = (now) => {
      const g = game.current;
      const s = canvas.width / W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);

      // Playing surface
      ctx.fillStyle = '#16123a';
      ctx.fillRect(0, 0, W, H);

      // Air holes
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let y = 12; y < H; y += 16) {
        for (let x = 10 + ((y / 16) % 2) * 8; x < W; x += 16) {
          ctx.fillRect(x, y, 1.4, 1.4);
        }
      }

      // Markings
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff5fa2';
      ctx.strokeStyle = 'rgba(255,95,162,0.75)';
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.shadowColor = '#3fe0d0';
      ctx.strokeStyle = 'rgba(63,224,208,0.7)';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, 0, 72, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, H, 72, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Rails and goal slots
      ctx.save();
      ctx.lineWidth = 5;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#3fe0d0';
      ctx.strokeStyle = '#3fe0d0';
      ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
      ctx.restore();
      ctx.fillStyle = '#05040c';
      ctx.fillRect(W / 2 - GOAL_W / 2, 0, GOAL_W, 7);
      ctx.fillRect(W / 2 - GOAL_W / 2, H - 7, GOAL_W, 7);
      ctx.fillStyle = '#ff5fa2';
      POSTS.forEach((post) => {
        ctx.beginPath();
        ctx.arc(post.x, post.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      if (!g) return;
      drawMallet(g.ai, '#ff5fa2', '#ff5fa2');
      drawMallet(g.player, '#3fe0d0', '#3fe0d0');

      // Puck
      const p = g.puck;
      ctx.save();
      ctx.shadowColor = '#ffe9a8';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PUCK_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(80,50,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PUCK_R * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      if (g.flash && phaseRef.current === 'playing') {
        const pulse = 1 + Math.sin(now / 80) * 0.04;
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(pulse, pulse);
        ctx.font = '44px "Tilt Neon", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = g.flash.color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = g.flash.color;
        ctx.fillText(g.flash.text, 0, 0);
        ctx.restore();
      }
    };
    const frame = (now) => {
      const dt = Math.max(0.001, Math.min(0.033, (now - last) / 1000));
      last = now;
      update(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const KEYS = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    };
    const onKeyDown = (e) => {
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        if (game.current) game.current.keys[dir] = true;
      }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current !== 'playing') {
        e.preventDefault();
        startRef.current();
      }
    };
    const onKeyUp = (e) => {
      const dir = KEYS[e.key];
      if (dir && game.current) {
        const g = game.current;
        g.keys[dir] = false;
        // Stop where you are when the keys are released.
        if (!Object.values(g.keys).some(Boolean)) {
          g.target.x = g.player.x;
          g.target.y = g.player.y;
        }
      }
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

  // The mallet chases the pointer or finger anywhere on the table.
  const aimAt = (e) => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing') return;
    const rect = canvasRef.current.getBoundingClientRect();
    g.target.x = clamp(
      ((e.clientX - rect.left) / rect.width) * W,
      MALLET_R,
      W - MALLET_R,
    );
    g.target.y = clamp(
      ((e.clientY - rect.top) / rect.height) * H,
      H / 2 + MALLET_R,
      H - MALLET_R,
    );
  };
  const onPointerDown = (e) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is optional */
    }
    aimAt(e);
  };
  const levelButton = (key) => (
    <button
      key={String(String(key))}
      type="button"
      onClick={() => setLevel(key)}
      className={`px-3 py-1.5 rounded-full border-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink
          ${level === key ? 'border-teal bg-teal text-bg' : 'border-muted text-teal'}`}
    >
      {LEVELS[key].label}
    </button>
  );
  return (
    <main className="font-body max-w-[640px] mx-auto py-4 flex flex-col items-center gap-3">
      <header
        className="w-full flex items-end justify-between gap-3"
        style={{
          maxWidth: 'min(100%, calc((100dvh - 120px) * 0.6))',
          minWidth: 'min(100%, 280px)',
        }}
      >
        <h1
          className="font-display text-[clamp(30px,8vw,44px)] leading-none text-pink"
          style={{
            textShadow: '0 0 14px rgba(255,95,162,.55)',
          }}
        >
          Rink Puck
        </h1>
        <div
          className="flex items-center gap-2 font-display text-3xl tabular-nums"
          aria-live="polite"
        >
          <span className="text-pink">{hud.cpu}</span>
          <span className="text-muted text-lg">:</span>
          <span className="text-teal">{hud.you}</span>
        </div>
      </header>

      <div
        className="relative w-full"
        style={{
          maxWidth: 'min(100%, calc((100dvh - 120px) * 0.6))',
          minWidth: 'min(100%, 280px)',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={aimAt}
          aria-label="Air hockey table"
          className="w-full block rounded-2xl touch-none"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-2xl bg-card flex flex-col items-center justify-center gap-3 text-center p-5">
            {phase === 'over' && result ? (
              <>
                <p
                  className="font-display text-4xl"
                  style={{
                    color: result.won ? 'var(--teal)' : 'var(--pink)',
                  }}
                >
                  {result.won ? 'You win!' : 'CPU wins'}
                </p>
                <p className="text-muted">
                  {result.you} – {result.cpu} against the {LEVELS[result.level].label}.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-4xl text-teal">Skate night</p>
                <ul className="text-muted text-sm leading-relaxed max-w-[30ch] space-y-1">
                  <li>Your mallet is the teal one. It follows your finger or mouse.</li>
                  <li>Arrow keys or WASD work too.</li>
                  <li>Knock the puck into the pink slot at the top.</li>
                  <li>First to {WIN_SCORE} goals wins.</li>
                </ul>
              </>
            )}
            <div
              className="flex flex-wrap justify-center gap-2"
              role="group"
              aria-label="Opponent level"
            >
              {Object.keys(LEVELS).map(levelButton)}
            </div>
            <p className="text-xs text-muted">
              Wins: {LEVELS.easy.label} {records.easy || 0} · {LEVELS.medium.label}{' '}
              {records.medium || 0} · {LEVELS.hard.label} {records.hard || 0}
            </p>
            <button
              type="button"
              onClick={() => start()}
              className="font-display text-2xl px-7 py-2 rounded-full bg-pink text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              style={{
                boxShadow: '0 0 18px rgba(255,95,162,.5)',
              }}
            >
              {phase === 'over' ? 'Play again' : 'Face off'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
