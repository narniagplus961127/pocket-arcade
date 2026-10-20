import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  level: number;
  score: number;
  rows: any[];
  shift: number;
  angle: number;
  flying: any;
  effects: any[];
  shotsLeft: number;
  pushAnim: number;
  turn: number;
  over: boolean;
  current?:
    | unknown
    | string
    | {
        level: number;
        score: number;
        rows: any[];
        shift: number;
        angle: number;
        flying: any;
        effects: any[];
        shotsLeft: number;
        pushAnim: number;
        turn: number;
        over: boolean;
      }
    | any
    | boolean;
  next?: unknown | any;
  hudKey?: string;
};
type ProjectileState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounced?: boolean;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.06, type = 'sine', volume = 0.04) {
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

// ---------- Board geometry (logical units; the canvas scales to fit) ----------
// Rows alternate between 9 bubbles and 8 bubbles nudged half a bubble right, like a honeycomb.

const R = 20;
const COLS = 9;
const W = COLS * R * 2;
const H = 540;
const ROW_H = R * Math.sqrt(3);
const DEAD_ROW = 12; // a bubble in this row (or lower) ends the game
const DEAD_Y = R * 2 + (DEAD_ROW - 1) * ROW_H + 2;
const SHOOT_X = W / 2;
const SHOOT_Y = H - 50;
const NEXT_X = 58;
const NEXT_Y = H - 36;
const SHOT_SPEED = 900;
const STEP = 4; // shots move in small steps so they never skip past a bubble
const HIT_DIST = R * 2 - 6; // a little forgiving, so shots can slip through narrow gaps
const MIN_ANGLE = -Math.PI + 0.15;
const MAX_ANGLE = -0.15;
const BEST_KEY = 'bubble-lagoon-best';

// Coral, sea glass, cobalt, sunshine, shell pink, urchin violet
const COLORS = ['#ff6b5e', '#5fcf98', '#2f6fd1', '#ffc94d', '#ff9fcb', '#8d5bd8'];

// ---------- Grid helpers ----------

const isShifted = (g, r) => ((r + g.shift) & 1) === 1;
const rowLen = (g, r) => (isShifted(g, r) ? COLS - 1 : COLS);
const cellPos = (g, r, c) => ({
  x: R + c * R * 2 + (isShifted(g, r) ? R : 0),
  y: R + r * ROW_H,
});
const getCell = (g, r, c) => {
  if (r < 0 || r >= g.rows.length) return null;
  if (c < 0 || c >= rowLen(g, r)) return null;
  const v = g.rows[r][c];
  return v === undefined ? null : v;
};
function neighbors(g, r, c) {
  // Shifted rows touch the cells at c and c+1 above and below; unshifted rows touch c-1 and c.
  const [d0, d1] = isShifted(g, r) ? [0, 1] : [-1, 0];
  const list = [
    [r, c - 1],
    [r, c + 1],
    [r - 1, c + d0],
    [r - 1, c + d1],
    [r + 1, c + d0],
    [r + 1, c + d1],
  ];
  return list.filter(([nr, nc]) => nr >= 0 && nc >= 0 && nc < rowLen(g, nr));
}

function levelConfig(level) {
  return {
    colors: Math.min(6, 3 + level),
    startRows: Math.min(8, 4 + level),
    shotsPerDrop: Math.max(4, 9 - level),
  };
}

// Random row; often repeats its left neighbour so the reef has natural clusters.
function randomRow(g, r, colorCount) {
  const row = Array(COLS).fill(null);
  for (let c = 0; c < rowLen(g, r); c++) {
    if (c > 0 && Math.random() < 0.4) row[c] = row[c - 1];
    else row[c] = Math.floor(Math.random() * colorCount);
  }
  return row;
}

function colorsInPlay(g) {
  const set = new Set();
  g.rows.forEach((row) =>
    row.forEach((v) => {
      if (v !== null) set.add(v);
    }),
  );
  return [...set];
}

function pickColor(g) {
  const live = colorsInPlay(g);
  if (live.length) return live[Math.floor(Math.random() * live.length)];
  return Math.floor(Math.random() * levelConfig(g.level).colors);
}

function fillBoard(g) {
  const cfg = levelConfig(g.level);
  g.rows = [];
  g.shift = 0;
  for (let r = 0; r < cfg.startRows; r++) g.rows.push(randomRow(g, r, cfg.colors));
  g.shotsLeft = cfg.shotsPerDrop;
}

function newGame() {
  const g = {
    level: 1,
    score: 0,
    rows: [],
    shift: 0,
    angle: -Math.PI / 2,
    flying: null,
    effects: [],
    shotsLeft: 0,
    pushAnim: 0,
    turn: 0,
    over: false,
  } as GameState;
  fillBoard(g);
  g.current = pickColor(g);
  g.next = pickColor(g);
  return g;
}

// ---------- Shot tracing ----------

// Moves a shot one small step, bouncing off the side walls. Returns true when it should stick.
function stepShot(g, s) {
  s.x += s.vx * STEP;
  s.y += s.vy * STEP;
  if (s.x < R) {
    s.x = R;
    s.vx = Math.abs(s.vx);
    s.bounced = true;
  }
  if (s.x > W - R) {
    s.x = W - R;
    s.vx = -Math.abs(s.vx);
    s.bounced = true;
  }
  if (s.y <= R) return true;
  const approxRow = Math.round((s.y - R) / ROW_H);
  for (let r = Math.max(0, approxRow - 1); r <= approxRow + 1 && r < g.rows.length; r++) {
    for (let c = 0; c < rowLen(g, r); c++) {
      if (g.rows[r][c] === null) continue;
      const p = cellPos(g, r, c);
      if (Math.hypot(p.x - s.x, p.y - s.y) < HIT_DIST) return true;
    }
  }
  return false;
}

// Nearest empty cell that is touching the ceiling or another bubble.
function findSnapCell(g, x, y) {
  const approxRow = Math.max(0, Math.round((y - R) / ROW_H));
  let best = null;
  let bestDist = Infinity;
  for (let r = Math.max(0, approxRow - 1); r <= approxRow + 1; r++) {
    for (let c = 0; c < rowLen(g, r); c++) {
      if (getCell(g, r, c) !== null) continue;
      const attached =
        r === 0 || neighbors(g, r, c).some(([nr, nc]) => getCell(g, nr, nc) !== null);
      if (!attached) continue;
      const p = cellPos(g, r, c);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = {
          r,
          c,
        };
      }
    }
  }
  return best;
}

// Simulates a shot to draw the aim guide: the bounce points and where the bubble will land.
function traceShot(g, angle) {
  const s = {
    x: SHOOT_X,
    y: SHOOT_Y,
    vx: Math.cos(angle),
    vy: Math.sin(angle),
  } as ProjectileState;
  const points = [
    {
      x: s.x,
      y: s.y,
    },
  ];
  for (let i = 0; i < 2000; i++) {
    s.bounced = false;
    const stuck = stepShot(g, s);
    if (s.bounced)
      points.push({
        x: s.x,
        y: s.y,
      });
    if (stuck) break;
  }
  points.push({
    x: s.x,
    y: s.y,
  });
  return {
    points,
    cell: findSnapCell(g, s.x, s.y),
  };
}

// ---------- Matching ----------

function floodSame(g, r, c) {
  const color = getCell(g, r, c);
  const seen = new Set([`${r},${c}`]);
  const stack = [[r, c]];
  const group = [];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    group.push([cr, cc]);
    for (const [nr, nc] of neighbors(g, cr, cc)) {
      const key = `${nr},${nc}`;
      if (seen.has(key) || getCell(g, nr, nc) !== color) continue;
      seen.add(key);
      stack.push([nr, nc]);
    }
  }
  return group;
}

// Every bubble not connected to the ceiling through other bubbles.
function findFloating(g) {
  const seen = new Set();
  const stack = [];
  for (let c = 0; c < rowLen(g, 0); c++) {
    if (getCell(g, 0, c) !== null) {
      seen.add(`0,${c}`);
      stack.push([0, c]);
    }
  }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(g, r, c)) {
      const key = `${nr},${nc}`;
      if (seen.has(key) || getCell(g, nr, nc) === null) continue;
      seen.add(key);
      stack.push([nr, nc]);
    }
  }
  const floating = [];
  g.rows.forEach((row, r) => {
    for (let c = 0; c < rowLen(g, r); c++) {
      if (row[c] !== null && !seen.has(`${r},${c}`)) floating.push([r, c]);
    }
  });
  return floating;
}
const reachedBottom = (g) =>
  g.rows.some((row, r) => r >= DEAD_ROW && row.some((v) => v !== null));

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Bubble Lagoon');

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
    level: 1,
    shotsLeft: 0,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const keys = useRef({
    left: false,
    right: false,
  });
  const aiming = useRef(false);
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
      level: 1,
      shotsLeft: game.current.shotsLeft,
    });
    setPhase('playing');
    playTone(520, 0.12);
  };
  const shoot = () => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.flying || g.over) return;
    g.flying = {
      x: SHOOT_X,
      y: SHOOT_Y,
      vx: Math.cos(g.angle),
      vy: Math.sin(g.angle),
      color: g.current,
      travel: 0,
    };
    g.current = g.next;
    g.next = pickColor(g);
    playTone(300, 0.08, 'triangle', 0.04);
  };
  const swap = () => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.over) return;
    const tmp = g.current;
    g.current = g.next;
    g.next = tmp;
    playTone(700, 0.05, 'sine', 0.03);
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
      g.over = true;
      setHud({
        score: g.score,
        level: g.level,
        shotsLeft: g.shotsLeft,
      });
      playTone(160, 0.6, 'sawtooth', 0.04);
      setTimeout(() => {
        setPhase('over');
        setBest((b) => {
          const next = Math.max(b, g.score);
          try {
            localStorage.setItem(BEST_KEY, String(next));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
      }, 700);
    };

    // ---------- Game rules ----------

    const pushRow = (g) => {
      // A new row slides in at the top, so every existing row shifts down and flips its offset.
      g.shift ^= 1;
      g.rows.unshift(randomRow(g, 0, levelConfig(g.level).colors));
      g.pushAnim = 1;
      playTone(180, 0.2, 'triangle', 0.05);
    };
    const land = (g, s) => {
      const cell = findSnapCell(g, s.x, s.y);
      g.flying = null;
      if (!cell) return;
      while (g.rows.length <= cell.r) g.rows.push(Array(COLS).fill(null));
      g.rows[cell.r][cell.c] = s.color;
      const group = floodSame(g, cell.r, cell.c);
      if (group.length >= 3) {
        group.forEach(([r, c]) => {
          const p = cellPos(g, r, c);
          g.effects.push({
            type: 'pop',
            x: p.x,
            y: p.y,
            color: g.rows[r][c],
            t: 0,
          });
          g.rows[r][c] = null;
        });
        g.score += group.length * 10;
        playTone(620 + group.length * 40, 0.12, 'sine', 0.05);

        // Clusters cut loose from the reef sink for a bonus.
        const floating = findFloating(g);
        floating.forEach(([r, c], i) => {
          const p = cellPos(g, r, c);
          g.effects.push({
            type: 'drop',
            x: p.x,
            y: p.y,
            vx: (Math.random() - 0.5) * 80,
            vy: -60 - Math.random() * 60,
            color: g.rows[r][c],
            t: 0,
          });
          g.rows[r][c] = null;
          g.score += 20 + i * 5;
        });
        if (floating.length) {
          [880, 1047, 1319].forEach((f, k) =>
            setTimeout(() => playTone(f, 0.08), k * 70),
          );
        }
      } else {
        playTone(240, 0.05, 'triangle', 0.03);
      }
      while (g.rows.length && g.rows[g.rows.length - 1].every((v) => v === null))
        g.rows.pop();

      // Cleared the lagoon: next level with a fresh reef.
      if (g.rows.length === 0) {
        g.score += 250 * g.level;
        g.level++;
        fillBoard(g);
        g.current = pickColor(g);
        g.next = pickColor(g);
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.15), k * 100),
        );
        return;
      }
      g.shotsLeft--;
      if (g.shotsLeft <= 0) {
        pushRow(g);
        g.shotsLeft = levelConfig(g.level).shotsPerDrop;
      }

      // Keep the loaded bubbles to colours that still exist on the reef.
      const live = colorsInPlay(g);
      if (!live.includes(g.current)) g.current = pickColor(g);
      if (!live.includes(g.next)) g.next = pickColor(g);
      if (reachedBottom(g)) finish(g);
    };
    const update = (dt) => {
      const g = game.current;
      g.pushAnim = Math.max(0, g.pushAnim - dt * 5);
      for (const e of g.effects) {
        e.t += dt;
        if (e.type === 'drop') {
          e.vy += 900 * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        }
      }
      g.effects = g.effects.filter((e) => (e.type === 'pop' ? e.t < 0.3 : e.y < H + R));
      if (phaseRef.current !== 'playing' || g.over) return;
      const turn = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
      if (turn)
        g.angle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, g.angle + turn * 1.6 * dt));
      if (g.flying) {
        const steps = Math.ceil((SHOT_SPEED * dt) / STEP);
        for (let i = 0; i < steps; i++) {
          if (stepShot(g, g.flying)) {
            land(g, g.flying);
            break;
          }
        }
      }
      const hudKey = `${g.score}|${g.level}|${g.shotsLeft}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.score,
          level: g.level,
          shotsLeft: g.shotsLeft,
        });
      }
    };

    // ---------- Drawing ----------

    // Each colour also gets a small frosted mark, so colours are told apart by shape too.
    const drawMark = (x, y, color, size) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = size * 0.12;
      const s = size * 0.32;
      ctx.beginPath();
      if (color === 0) {
        ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (color === 1) {
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.fill();
      } else if (color === 2) {
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y + s * 0.8);
        ctx.lineTo(x - s, y + s * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (color === 3) {
        ctx.rect(x - s * 0.75, y - s * 0.75, s * 1.5, s * 1.5);
        ctx.fill();
      } else if (color === 4) {
        ctx.moveTo(x - s, y);
        ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s);
        ctx.lineTo(x, y + s);
        ctx.stroke();
      } else {
        ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    const drawBubble = (x, y, color, radius = R - 1, alpha = 1) => {
      ctx.globalAlpha = alpha;
      const base = COLORS[color];
      const grad = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.4,
        radius * 0.1,
        x,
        y,
        radius,
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, base);
      grad.addColorStop(1, base);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 50, 60, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawMark(x, y + radius * 0.1, color, radius);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.ellipse(
        x - radius * 0.38,
        y - radius * 0.45,
        radius * 0.25,
        radius * 0.13,
        -0.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      const t = now / 1000;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Water
      const water = ctx.createLinearGradient(0, 0, 0, H);
      water.addColorStop(0, '#7fdcd3');
      water.addColorStop(0.6, '#36b2bd');
      water.addColorStop(1, '#2496a8');
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, W, H);

      // Sunlight caustics rippling across the floor
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 10) {
          const y =
            30 +
            k * 58 +
            Math.sin(x * 0.04 + t * 1.2 + k) * 7 +
            Math.sin(x * 0.11 - t * 0.7) * 3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Sand bank and a few coral sprigs
      ctx.fillStyle = '#f2dcaa';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H - 46);
      ctx.quadraticCurveTo(W * 0.25, H - 70, W * 0.5, H - 52);
      ctx.quadraticCurveTo(W * 0.75, H - 36, W, H - 60);
      ctx.lineTo(W, H);
      ctx.fill();
      ctx.strokeStyle = '#ff8f7a';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      [
        [300, H - 50],
        [326, H - 44],
        [20, H - 42],
      ].forEach(([cx, cy], i) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 24);
        ctx.moveTo(cx, cy - 10);
        ctx.lineTo(cx + (i % 2 ? -9 : 9), cy - 20);
        ctx.moveTo(cx, cy - 16);
        ctx.lineTo(cx + (i % 2 ? 8 : -8), cy - 28);
        ctx.stroke();
      });

      // Danger depth
      ctx.strokeStyle = 'rgba(255, 107, 94, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(0, DEAD_Y);
      ctx.lineTo(W, DEAD_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Reef bubbles (slide down while a new row is pushed in)
      const slide = -g.pushAnim * ROW_H;
      g.rows.forEach((row, r) => {
        for (let c = 0; c < rowLen(g, r); c++) {
          if (row[c] === null) continue;
          const p = cellPos(g, r, c);
          drawBubble(p.x, p.y + slide, row[c]);
        }
      });

      // Aim guide with wall bounce preview and a ghost where the bubble will settle
      const playing = phaseRef.current === 'playing' && !g.over;
      if (playing && !g.flying) {
        const trace = traceShot(g, g.angle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([2, 9]);
        ctx.lineDashOffset = -t * 30;
        ctx.beginPath();
        trace.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        if (trace.cell) {
          const p = cellPos(g, trace.cell.r, trace.cell.c);
          ctx.strokeStyle = COLORS[g.current];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, R - 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Effects
      for (const e of g.effects) {
        if (e.type === 'pop') {
          const k = e.t / 0.3;
          ctx.strokeStyle = COLORS[e.color];
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, R * (0.8 + k), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          drawBubble(e.x, e.y, e.color, R - 1, 0.85);
        }
      }
      if (g.flying) drawBubble(g.flying.x, g.flying.y, g.flying.color);

      // Shell launcher
      ctx.save();
      ctx.translate(SHOOT_X, SHOOT_Y);
      ctx.rotate(g.angle + Math.PI / 2);
      ctx.fillStyle = '#e9f7f3';
      ctx.strokeStyle = '#146f86';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-9, -46, 18, 34, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffd7c9';
      ctx.strokeStyle = '#e07e6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(SHOOT_X, SHOOT_Y + 6, 30, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (let k = 1; k < 6; k++) {
        const a = Math.PI + (k / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(SHOOT_X, SHOOT_Y + 6);
        ctx.lineTo(SHOOT_X + Math.cos(a) * 30, SHOOT_Y + 6 + Math.sin(a) * 30);
        ctx.stroke();
      }
      if (!g.over) drawBubble(SHOOT_X, SHOOT_Y, g.current);

      // Next bubble, tap it to swap
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(NEXT_X, NEXT_Y, 22, 0, Math.PI * 2);
      ctx.fill();
      drawBubble(NEXT_X, NEXT_Y, g.next, 15);
      ctx.fillStyle = '#0c4250';
      ctx.font = '12px "Varela Round", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('next', NEXT_X, NEXT_Y - 27);
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

    const onKeyDown = (e) => {
      const k = e.key;
      if (phaseRef.current !== 'playing') {
        if ((k === ' ' || k === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
        return;
      }
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        keys.current.left = true;
        e.preventDefault();
      }
      if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        keys.current.right = true;
        e.preventDefault();
      }
      if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && !e.repeat) {
        e.preventDefault();
        shoot();
      }
      if (
        (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'x' || k === 'X') &&
        !e.repeat
      ) {
        e.preventDefault();
        swap();
      }
    };
    const onKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A')
        keys.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D')
        keys.current.right = false;
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
  // Mouse: move to aim, click to shoot. Touch: drag to aim, lift to shoot. Tap the next bubble to swap.

  const toBoard = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };
  const aimAt = (p) => {
    let angle = Math.atan2(p.y - SHOOT_Y, p.x - SHOOT_X);
    if (angle > 0) angle = angle > Math.PI / 2 ? MIN_ANGLE : MAX_ANGLE;
    game.current.angle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
  };
  const onPointerDown = (e) => {
    if (phaseRef.current !== 'playing') return;
    const p = toBoard(e);
    if (Math.hypot(p.x - NEXT_X, p.y - NEXT_Y) < 28) {
      swap();
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture not supported */
    }
    aiming.current = true;
    aimAt(p);
  };
  const onPointerMove = (e) => {
    if (phaseRef.current !== 'playing') return;
    if (e.pointerType === 'mouse' || aiming.current) aimAt(toBoard(e));
  };
  const onPointerUp = () => {
    if (!aiming.current) return;
    aiming.current = false;
    shoot();
  };
  return (
    <main className="font-body max-w-[460px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-x-3 gap-y-1 flex-wrap">
        <h1 className="font-display text-[clamp(32px,9vw,46px)] leading-none text-deep">
          Bubble Lagoon
        </h1>
        <div className="text-right text-sm">
          <div>
            Score <b className="text-xl">{hud.score}</b>
          </div>
          <div className="text-muted">
            Lagoon {hud.level} · Best {Math.max(best, hud.score)}
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: `min(100%, calc((100dvh - 190px) * ${W / H}))`,
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
          aria-label="Bubble lagoon. Aim with the pointer, release to shoot."
          className="w-full block rounded-2xl touch-none select-none cursor-crosshair"
          style={{
            aspectRatio: `${W} / ${H}`,
            boxShadow: '0 0 0 4px #ffffff, 0 18px 40px rgba(20, 111, 134, .3)',
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-2xl bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="font-display text-4xl text-coral">
              {phase === 'over' ? 'The tide got in' : 'Pop the reef'}
            </p>
            <p className="text-muted max-w-[34ch]">
              {phase === 'over'
                ? `Bubbles crossed the coral line. You reached lagoon ${hud.level} with ${hud.score} points. Best: ${Math.max(best, hud.score)}.`
                : 'Shoot bubbles at the reef. Join three or more of one colour to pop them. Bubbles left hanging sink for a bonus. Every few shots the reef grows down a row. Keep it above the coral line.'}
            </p>
            <p className="text-sm text-muted">
              Aim with the mouse or a finger and release to shoot. Arrows aim, Space
              shoots, Down swaps.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-7 py-2 rounded-full bg-coral text-white shadow-[0_5px_0_#c94b40] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Play again' : 'Dive in'}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">
          Reef grows in <b className="text-ink">{hud.shotsLeft}</b>{' '}
          {hud.shotsLeft === 1 ? 'shot' : 'shots'}
        </span>
        <button
          type="button"
          onClick={swap}
          className="px-4 py-2 rounded-full bg-white text-deep border-2 border-glass focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Swap bubble
        </button>
      </div>
    </main>
  );
}
export default App;
