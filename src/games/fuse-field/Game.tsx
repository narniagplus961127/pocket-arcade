import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  nextRound?: () => void;
  startMatch?: () => void;
};

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

// ---------- Arena ----------
// Grid cells: 0 grass path, 1 stone block or hedge (solid), 2 seed crate (breakable).

const COLS = 13;
const ROWS = 11;
const FUSE = 2.4; // seconds before a pea pod pops
const FLAME_TIME = 0.55; // how long the pea splat lingers
const ROUND_LIMIT = 120; // a round with no winner by then is a draw
const WINS_NEEDED = 2; // best of three
const STORE_KEY = 'fuse-field-matches-won';
const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};
const SPAWNS = [
  [1, 1],
  [COLS - 2, ROWS - 2],
  [COLS - 2, 1],
  [1, ROWS - 2],
];
const POWERS = ['bomb', 'range', 'speed'];
const GARDENERS = [
  {
    name: 'You',
    color: '#e63946',
    hat: '#ffe08a',
  },
  {
    name: 'Bramble',
    color: '#3a7bd5',
    hat: '#f1e3b3',
  },
  {
    name: 'Clover',
    color: '#ff9f1c',
    hat: '#a8dc6f',
  },
  {
    name: 'Parsnip',
    color: '#1fae9f',
    hat: '#f7b2cc',
  },
];
const keyOf = (x, y) => x + y * COLS;
const xyOf = (k) => [k % COLS, Math.floor(k / COLS)];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function readWins() {
  try {
    return Number(localStorage.getItem(STORE_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function newRound() {
  const grid = [];
  const hidden = new Map();
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      row.push(edge || (x % 2 === 0 && y % 2 === 0) ? 1 : 0);
    }
    grid.push(row);
  }

  // Crates everywhere except the little clearings around each starting corner.
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (grid[y][x] !== 0) continue;
      if (SPAWNS.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 2)) continue;
      if (Math.random() < 0.72) {
        grid[y][x] = 2;
        if (Math.random() < 0.32) hidden.set(keyOf(x, y), pick(POWERS));
      }
    }
  }
  const fighters = GARDENERS.map((g, i) => ({
    ...g,
    id: i,
    isBot: i > 0,
    x: SPAWNS[i][0],
    y: SPAWNS[i][1],
    tx: SPAWNS[i][0],
    ty: SPAWNS[i][1],
    p: 0,
    moving: false,
    dir: 'down',
    speed: 3.4,
    maxBombs: 1,
    range: 2,
    alive: true,
    think: 0.3 + i * 0.15,
  }));
  return {
    grid,
    hidden,
    powerups: new Map(),
    bombs: [],
    flames: new Map(),
    fighters,
    time: 0,
    pause: 1.6,
    over: false,
    endDelay: 0,
    events: [],
  };
}

// ---------- Rules ----------

const bombAt = (g, x, y) => g.bombs.find((b) => b.x === x && b.y === y);
const bombsOf = (g, f) => g.bombs.filter((b) => b.owner === f.id).length;
const isOpen = (g, x, y) =>
  x >= 0 && y >= 0 && x < COLS && y < ROWS && g.grid[y][x] === 0 && !bombAt(g, x, y);

// The tile a gardener counts as standing on: whichever one they are mostly over.
const tileOf = (f) => (f.moving && f.p >= 0.5 ? [f.tx, f.ty] : [f.x, f.y]);
const tileKeyOf = (f) => keyOf(...(tileOf(f) as [number, number]));

// A pop covers its own tile and spreads in a cross. Stone stops it; a crate catches it and breaks.
function blastTiles(g, bx, by, range) {
  const tiles = [keyOf(bx, by)];
  Object.values(DIRS).forEach(([dx, dy]) => {
    for (let k = 1; k <= range; k++) {
      const x = bx + dx * k;
      const y = by + dy * k;
      const cell = g.grid[y][x];
      if (cell === 1) break;
      tiles.push(keyOf(x, y));
      if (cell === 2) break;
    }
  });
  return tiles;
}

function placeBomb(g, f) {
  const [x, y] = tileOf(f);
  if (bombAt(g, x, y) || bombsOf(g, f) >= f.maxBombs) return false;
  g.bombs.push({
    x,
    y,
    timer: FUSE,
    range: f.range,
    owner: f.id,
  });
  g.events.push({
    type: 'plant',
    id: f.id,
  });
  return true;
}

function explode(g, bomb) {
  g.bombs = g.bombs.filter((b) => b !== bomb);
  blastTiles(g, bomb.x, bomb.y, bomb.range).forEach((k) => {
    const [x, y] = xyOf(k);
    if (g.grid[y][x] === 2) {
      g.grid[y][x] = 0;
      if (g.hidden.has(k)) {
        g.powerups.set(k, g.hidden.get(k));
        g.hidden.delete(k);
      }
    }
    g.flames.set(k, FLAME_TIME);
    // Chain reaction: any pod caught in the splat pops a moment later.
    const other = bombAt(g, x, y);
    if (other) other.timer = Math.min(other.timer, 0.08);
  });
  g.events.push({
    type: 'pop',
  });
}

function tryMove(g, f, dir) {
  const [dx, dy] = DIRS[dir];
  f.dir = dir;
  if (!isOpen(g, f.x + dx, f.y + dy)) return false;
  f.tx = f.x + dx;
  f.ty = f.y + dy;
  f.p = 0;
  f.moving = true;
  return true;
}

function tryMoveTo(g, f, k) {
  const [x, y] = xyOf(k);
  const dir = Object.keys(DIRS).find(
    (d) => f.x + DIRS[d][0] === x && f.y + DIRS[d][1] === y,
  );
  return dir ? tryMove(g, f, dir) : false;
}

function collect(g, f) {
  const k = keyOf(f.x, f.y);
  const type = g.powerups.get(k);
  if (!type) return;
  g.powerups.delete(k);
  if (type === 'bomb') f.maxBombs = Math.min(6, f.maxBombs + 1);
  if (type === 'range') f.range = Math.min(8, f.range + 1);
  if (type === 'speed') f.speed = Math.min(6.2, f.speed + 0.6);
  g.events.push({
    type: 'power',
    id: f.id,
  });
}

// Moves along the grid one tile at a time. At each tile `decide` may start the next step.
function stepFighter(g, f, dt, decide) {
  if (f.moving) {
    f.p += f.speed * dt;
    if (f.p < 1) return;
    const extra = f.p - 1;
    f.x = f.tx;
    f.y = f.ty;
    f.moving = false;
    f.p = 0;
    collect(g, f);
    decide(g, f, 0);
    if (f.moving) f.p = Math.min(0.9, extra);
  } else {
    decide(g, f, dt);
  }
}

// ---------- Bot brains ----------

// For every tile that will be splatted soon: how many seconds until it is. Current splats count as 0.
function dangerMap(g) {
  const timers = g.bombs.map((b) => b.timer);
  const blasts = g.bombs.map((b) => blastTiles(g, b.x, b.y, b.range));

  // Pods inside another pod's cross pop early, so pass the shorter fuse along.
  for (let pass = 0; pass < 3; pass++) {
    g.bombs.forEach((b, i) => {
      blasts[i].forEach((k) => {
        const j = g.bombs.findIndex((o) => keyOf(o.x, o.y) === k);
        if (j >= 0 && timers[j] > timers[i]) timers[j] = timers[i];
      });
    });
  }
  const danger = new Map();
  blasts.forEach((tiles, i) =>
    tiles.forEach((k) => {
      danger.set(k, Math.min(danger.has(k) ? danger.get(k) : Infinity, timers[i]));
    }),
  );
  g.flames.forEach((_, k) => danger.set(k, 0));
  return danger;
}

// Breadth-first search for the nearest tile that passes `isGoal`. Returns the steps to get there.
// While fleeing, a bot may cross a doomed tile if it will be long gone before the pop.
function bfs(g, sx, sy, isGoal, danger, speed, fleeing, maxSteps = 60) {
  const start = keyOf(sx, sy);
  if (!fleeing && isGoal(start)) return [];
  const prev = new Int16Array(COLS * ROWS).fill(-2);
  const dist = new Int16Array(COLS * ROWS);
  prev[start] = -1;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    if (k !== start && isGoal(k)) {
      const path = [];
      let c = k;
      while (c !== start) {
        path.unshift(c);
        c = prev[c];
      }
      return path;
    }
    if (dist[k] >= maxSteps) continue;
    const [x, y] = xyOf(k);
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = keyOf(nx, ny);
      if (prev[nk] !== -2 || !isOpen(g, nx, ny)) continue;
      if (danger.has(nk)) {
        if (!fleeing) continue;
        const arrive = (dist[k] + 1) / speed;
        if (danger.get(nk) <= arrive + 0.35) continue;
      }
      prev[nk] = k;
      dist[nk] = dist[k] + 1;
      queue.push(nk);
    }
  }
  return null;
}

// Would there still be a safe tile to run to after dropping a pod here?
function canEscape(g, f, blast, danger) {
  const hyp = new Map<number, number>(danger);
  blast.forEach((k) => hyp.set(k, Math.min(hyp.has(k) ? hyp.get(k) : Infinity, FUSE)));
  const path = bfs(g, f.x, f.y, (k) => !hyp.has(k), hyp, f.speed, true, 8);
  return path && path.length / f.speed < FUSE - 0.45;
}

function botDecide(g, f, dt) {
  f.think -= dt;
  if (f.think > 0) return;
  const danger = dangerMap(g);
  const here = keyOf(f.x, f.y);

  // 1. Standing in a blast line? Run.
  if (danger.has(here)) {
    const path = bfs(g, f.x, f.y, (k) => !danger.has(k), danger, f.speed, true);
    if (path && path.length) {
      tryMoveTo(g, f, path[0]);
    } else {
      const dirs = Object.keys(DIRS).filter((d) => {
        const nk = keyOf(f.x + DIRS[d][0], f.y + DIRS[d][1]);
        return isOpen(g, f.x + DIRS[d][0], f.y + DIRS[d][1]) && danger.get(nk) !== 0;
      });
      if (dirs.length) tryMove(g, f, pick(dirs));
    }
    return;
  }
  const foes = g.fighters.filter((o) => o.alive && o.id !== f.id);
  const foeTiles = foes.map(tileKeyOf);
  const canBomb = bombsOf(g, f) < f.maxBombs;
  const usefulFrom = (k) => {
    const [x, y] = xyOf(k);
    const blast = blastTiles(g, x, y, f.range);
    return blast.some((t) => {
      const [tx, ty] = xyOf(t);
      return g.grid[ty][tx] === 2 || foeTiles.includes(t);
    });
  };

  // 2. A crate or a rival in reach? Drop a pea pod, but only with an escape route.
  if (canBomb && !bombAt(g, f.x, f.y) && usefulFrom(here) && Math.random() < 0.85) {
    const blast = blastTiles(g, f.x, f.y, f.range);
    if (canEscape(g, f, blast, danger)) {
      placeBomb(g, f);
      f.think = 0.05;
      return;
    }
  }

  // 3. Head for a seed packet, a good popping spot, or the nearest rival (the player first).
  let path = bfs(g, f.x, f.y, (k) => g.powerups.has(k), danger, f.speed, false, 7);
  if (!path && canBomb) path = bfs(g, f.x, f.y, usefulFrom, danger, f.speed, false, 30);
  if (!path) {
    const quarry = foes.find((o) => o.id === 0) || foes[0];
    if (quarry) {
      const qk = tileKeyOf(quarry);
      path = bfs(
        g,
        f.x,
        f.y,
        (k) => k === qk || Math.abs(k - qk) === 1 || Math.abs(k - qk) === COLS,
        danger,
        f.speed,
        false,
      );
    }
  }
  if (path && path.length) {
    tryMoveTo(g, f, path[0]);
  } else {
    // Nothing to do (or waiting for pods): dawdle on a safe neighbour now and then.
    f.think = rnd(0.15, 0.4);
    if (Math.random() < 0.4) {
      const dirs = Object.keys(DIRS).filter((d) => {
        const nx = f.x + DIRS[d][0];
        const ny = f.y + DIRS[d][1];
        return isOpen(g, nx, ny) && !danger.has(keyOf(nx, ny));
      });
      if (dirs.length) tryMove(g, f, pick(dirs));
    }
  }
}

// ---------- Drawing ----------

function drawArena(ctx, g, cell, now) {
  // Grass
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#93d16a' : '#8ac962';
      ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1);
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = g.grid[y][x];
      const px = x * cell;
      const py = y * cell;
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      if (c === 1 && edge) {
        // Hedge border
        ctx.fillStyle = '#4b8a36';
        ctx.fillRect(px, py, cell + 1, cell + 1);
        ctx.fillStyle = '#5fa246';
        ctx.beginPath();
        ctx.arc(px + cell * 0.3, py + cell * 0.35, cell * 0.24, 0, Math.PI * 2);
        ctx.arc(px + cell * 0.7, py + cell * 0.6, cell * 0.26, 0, Math.PI * 2);
        ctx.fill();
      } else if (c === 1) {
        // Stone block with a dab of moss
        ctx.fillStyle = '#8f8a7b';
        ctx.beginPath();
        ctx.roundRect(
          px + cell * 0.06,
          py + cell * 0.1,
          cell * 0.88,
          cell * 0.86,
          cell * 0.18,
        );
        ctx.fill();
        ctx.fillStyle = '#c4bfae';
        ctx.beginPath();
        ctx.roundRect(
          px + cell * 0.06,
          py + cell * 0.04,
          cell * 0.88,
          cell * 0.74,
          cell * 0.18,
        );
        ctx.fill();
        ctx.fillStyle = '#7fa35a';
        ctx.beginPath();
        ctx.ellipse(
          px + cell * 0.32,
          py + cell * 0.2,
          cell * 0.16,
          cell * 0.08,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else if (c === 2) {
        // Wooden seed crate
        ctx.fillStyle = '#9a6633';
        ctx.fillRect(px + cell * 0.08, py + cell * 0.08, cell * 0.84, cell * 0.84);
        ctx.fillStyle = '#c98f52';
        for (let s = 0; s < 3; s++) {
          ctx.fillRect(
            px + cell * 0.12,
            py + cell * (0.13 + s * 0.27),
            cell * 0.76,
            cell * 0.2,
          );
        }
        ctx.strokeStyle = '#7a4f26';
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.beginPath();
        ctx.moveTo(px + cell * 0.14, py + cell * 0.14);
        ctx.lineTo(px + cell * 0.86, py + cell * 0.86);
        ctx.stroke();
      }
    }
  }

  // Seed packet power-ups
  g.powerups.forEach((type, k) => {
    const [x, y] = xyOf(k);
    const bob = Math.sin(now / 250 + k) * cell * 0.04;
    const px = x * cell + cell * 0.2;
    const py = y * cell + cell * 0.12 + bob;
    ctx.fillStyle = {
      bomb: '#6cbf3f',
      range: '#f4a259',
      speed: '#4fb3e8',
    }[type];
    ctx.beginPath();
    ctx.roundRect(px, py, cell * 0.6, cell * 0.74, cell * 0.08);
    ctx.fill();
    ctx.fillStyle = '#fffbe6';
    ctx.fillRect(px + cell * 0.06, py + cell * 0.16, cell * 0.48, cell * 0.42);
    ctx.fillStyle = '#2b3416';
    ctx.strokeStyle = '#2b3416';
    ctx.lineWidth = Math.max(1, cell * 0.06);
    const cx = px + cell * 0.3;
    const cy = py + cell * 0.37;
    if (type === 'bomb') {
      ctx.fillStyle = '#4f9d2c';
      ctx.beginPath();
      ctx.arc(cx - cell * 0.1, cy, cell * 0.08, 0, Math.PI * 2);
      ctx.arc(cx + cell * 0.1, cy, cell * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'range') {
      ctx.beginPath();
      ctx.moveTo(cx - cell * 0.16, cy);
      ctx.lineTo(cx + cell * 0.16, cy);
      ctx.moveTo(cx, cy - cell * 0.16);
      ctx.lineTo(cx, cy + cell * 0.16);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + cell * 0.06, cy - cell * 0.17);
      ctx.lineTo(cx - cell * 0.1, cy + cell * 0.02);
      ctx.lineTo(cx + cell * 0.03, cy + cell * 0.02);
      ctx.lineTo(cx - cell * 0.06, cy + cell * 0.17);
      ctx.lineTo(cx + cell * 0.12, cy - cell * 0.04);
      ctx.lineTo(cx, cy - cell * 0.04);
      ctx.closePath();
      ctx.fill();
    }
  });

  // Pea pods: they swell faster as the fuse runs down
  g.bombs.forEach((b) => {
    const cx = (b.x + 0.5) * cell;
    const cy = (b.y + 0.55) * cell;
    const urgency = 1 - b.timer / FUSE;
    const pulse = 1 + Math.sin(now / (120 - urgency * 80)) * 0.07;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#3f8a25';
    ctx.beginPath();
    ctx.ellipse(0, 0, cell * 0.36, cell * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7cd14a';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.arc(k * cell * 0.17, -cell * 0.02, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    // Curly stem with a twinkling fuse spark
    ctx.strokeStyle = '#3f8a25';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.beginPath();
    ctx.moveTo(cell * 0.32, -cell * 0.05);
    ctx.quadraticCurveTo(cell * 0.5, -cell * 0.3, cell * 0.36, -cell * 0.36);
    ctx.stroke();
    ctx.fillStyle = Math.floor(now / 80) % 2 ? '#fff38a' : '#ffb347';
    ctx.beginPath();
    ctx.arc(cell * 0.36, -cell * 0.36, cell * (0.06 + urgency * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Pea splats
  g.flames.forEach((life, k) => {
    const [x, y] = xyOf(k);
    const t = life / FLAME_TIME;
    const cx = (x + 0.5) * cell;
    const cy = (y + 0.5) * cell;
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.fillStyle = '#d9f56b';
    ctx.beginPath();
    ctx.roundRect(
      x * cell + cell * 0.05,
      y * cell + cell * 0.05,
      cell * 0.9,
      cell * 0.9,
      cell * 0.35,
    );
    ctx.fill();
    ctx.fillStyle = '#9fdc45';
    [
      [-0.2, -0.15],
      [0.18, 0.12],
      [-0.1, 0.22],
      [0.22, -0.2],
    ].forEach(([ox, oy]) => {
      ctx.beginPath();
      ctx.arc(
        cx + ox * cell,
        cy + oy * cell,
        cell * 0.12 * (0.6 + t * 0.6),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - cell * 0.08, cy - cell * 0.1, cell * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // Gardeners in sun hats
  g.fighters.forEach((f) => {
    if (!f.alive) return;
    const fx = f.moving ? f.x + (f.tx - f.x) * f.p : f.x;
    const fy = f.moving ? f.y + (f.ty - f.y) * f.p : f.y;
    const cx = (fx + 0.5) * cell;
    const cy = (fy + 0.5) * cell;
    const hop = f.moving ? Math.abs(Math.sin(f.p * Math.PI)) * cell * 0.06 : 0;
    const [lx, ly] = DIRS[f.dir];
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + cell * 0.32, cell * 0.28, cell * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + cell * 0.12 - hop, cell * 0.27, cell * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffdcb4';
    ctx.beginPath();
    ctx.arc(cx, cy - cell * 0.08 - hop, cell * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.arc(
      cx - cell * 0.07 + lx * cell * 0.05,
      cy - cell * 0.07 - hop + ly * cell * 0.04,
      cell * 0.035,
      0,
      Math.PI * 2,
    );
    ctx.arc(
      cx + cell * 0.07 + lx * cell * 0.05,
      cy - cell * 0.07 - hop + ly * cell * 0.04,
      cell * 0.035,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = f.hat;
    ctx.beginPath();
    ctx.ellipse(cx, cy - cell * 0.2 - hop, cell * 0.36, cell * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - cell * 0.22 - hop, cell * 0.16, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.fillRect(cx - cell * 0.16, cy - cell * 0.26 - hop, cell * 0.32, cell * 0.05);
  });
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Fuse Field');

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
  const input = useRef({
    held: [],
    pad: null,
    bomb: false,
  });
  const winsRef = useRef([0, 0, 0, 0]);
  const [phase, setPhase] = useState('intro');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [round, setRound] = useState(1);
  const [wins, setWins] = useState([0, 0, 0, 0]);
  const [result, setResult] = useState(null);
  const [hud, setHud] = useState({
    alive: [true, true, true, true],
    bombs: 1,
    range: 2,
    speed: 3.4,
  });
  const [matchesWon, setMatchesWon] = useState(readWins);
  const startMatch = () => {
    winsRef.current = [0, 0, 0, 0];
    setWins([0, 0, 0, 0]);
    setRound(1);
    setResult(null);
    game.current = newRound();
    setPhase('playing');
  };
  const nextRound = () => {
    setRound((r) => r + 1);
    setResult(null);
    game.current = newRound();
    setPhase('playing');
  };
  const actions = useRef({} as GameState);
  actions.current = {
    startMatch,
    nextRound,
  };

  // Called once when a round is decided.
  const endRound = (winner) => {
    const next = [...winsRef.current];
    if (winner !== null) next[winner]++;
    winsRef.current = next;
    setWins(next);
    setResult({
      winner,
    });
    if (winner !== null && next[winner] >= WINS_NEEDED) {
      setPhase('matchOver');
      if (winner === 0) {
        setMatchesWon((m) => {
          const total = m + 1;
          try {
            localStorage.setItem(STORE_KEY, String(String(total)));
          } catch (e) {
            /* storage unavailable */
          }
          return total;
        });
        [523, 659, 784, 1047, 1319].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.16, 'triangle', 0.05), k * 100),
        );
      }
    } else {
      setPhase('roundOver');
    }
  };
  const endRoundRef = useRef(endRound);
  endRoundRef.current = endRound;
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
    const wantedDir = () => {
      const inp = input.current;
      return inp.pad || inp.held[inp.held.length - 1] || null;
    };
    const playerDecide = (g, f) => {
      const want = wantedDir();
      if (want) tryMove(g, f, want);
    };
    const tick = (g, dt) => {
      g.time += dt;
      g.bombs.forEach((b) => {
        b.timer -= dt;
      });
      let popping = g.bombs.find((b) => b.timer <= 0);
      while (popping) {
        explode(g, popping);
        popping = g.bombs.find((b) => b.timer <= 0);
      }
      g.flames.forEach((life, k) => {
        if (life - dt <= 0) g.flames.delete(k);
        else g.flames.set(k, life - dt);
      });
      const player = g.fighters[0];
      if (player.alive) {
        // Turning back mid-step is always allowed, unless a pod now sits behind you.
        const want = wantedDir();
        if (
          player.moving &&
          want === OPPOSITE[player.dir] &&
          (player.p < 0.5 || !bombAt(g, player.x, player.y))
        ) {
          [player.x, player.tx] = [player.tx, player.x];
          [player.y, player.ty] = [player.ty, player.y];
          player.p = 1 - player.p;
          player.dir = want;
        }
        if (input.current.bomb) placeBomb(g, player);
      }
      input.current.bomb = false;
      g.fighters.forEach((f) => {
        if (f.alive) stepFighter(g, f, dt, f.isBot ? botDecide : playerDecide);
      });

      // Anyone standing in a splat is out of the round.
      g.fighters.forEach((f) => {
        if (f.alive && g.flames.has(tileKeyOf(f))) {
          f.alive = false;
          g.events.push({
            type: 'out',
            id: f.id,
          });
        }
      });
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || phaseRef.current !== 'playing') return;
      if (g.pause > 0) {
        g.pause -= dt;
        input.current.bomb = false;
        return;
      }
      if (!g.over) {
        // Once you are out, the bots finish the round at triple speed.
        const steps = g.fighters[0].alive ? 1 : 3;
        for (let s = 0; s < steps && !g.over; s++) {
          tick(g, dt);
          const alive = g.fighters.filter((f) => f.alive);
          if (alive.length <= 1 || g.time > ROUND_LIMIT) {
            g.over = true;
            g.endDelay = 1.1;
            g.winner = alive.length === 1 ? alive[0].id : null;
          }
        }
      } else {
        // Let the last splat settle before showing the result.
        g.flames.forEach((life, k) => {
          if (life - dt <= 0) g.flames.delete(k);
          else g.flames.set(k, life - dt);
        });
        g.endDelay -= dt;
        if (g.endDelay <= 0 && !g.reported) {
          g.reported = true;
          endRoundRef.current(g.winner);
        }
      }

      // Sounds for what happened this frame
      g.events.forEach((ev) => {
        if (ev.type === 'pop') {
          playTone(110 + Math.random() * 40, 0.25, 'sine', 0.08);
          playTone(520 + Math.random() * 120, 0.06, 'square', 0.02);
        }
        if (ev.type === 'plant' && ev.id === 0) playTone(330, 0.06);
        if (ev.type === 'power' && ev.id === 0) {
          playTone(880, 0.08);
          setTimeout(() => playTone(1320, 0.1), 70);
        }
        if (ev.type === 'out') playTone(ev.id === 0 ? 180 : 440, 0.35, 'triangle', 0.05);
      });
      g.events = [];
      const p = g.fighters[0];
      const alive = g.fighters.map((f) => f.alive);
      const key = `${alive.join()}|${p.maxBombs}|${p.range}|${p.speed}`;
      if (key !== g.hudKey) {
        g.hudKey = key;
        setHud({
          alive,
          bombs: p.maxBombs,
          range: p.range,
          speed: p.speed,
        });
      }
    };
    const draw = (now) => {
      const cell = canvas.width / COLS;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = game.current || (game.current = newRound());
      drawArena(ctx, g, cell, now);
      if (phaseRef.current === 'playing' && !g.fighters[0].alive && !g.over) {
        ctx.fillStyle = 'rgba(43,52,22,.55)';
        ctx.fillRect(0, canvas.height - cell * 1.1, canvas.width, cell * 1.1);
        ctx.fillStyle = '#fff4c4';
        ctx.font = `${cell * 0.6}px Boogaloo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          'Splat! You’re out. Fast-forwarding…',
          canvas.width / 2,
          canvas.height - cell * 0.55,
        );
      }
      if (phaseRef.current === 'playing' && g.pause > 0) {
        ctx.fillStyle = 'rgba(43,52,22,.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff4c4';
        ctx.font = `${cell * 1.6}px Boogaloo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          g.pause > 0.5 ? 'Ready…' : 'Grow!',
          canvas.width / 2,
          canvas.height / 2,
        );
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

    // ---- Keyboard ----
    const KEYS = {
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
    };
    const onKeyDown = (e) => {
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        const held = input.current.held.filter((d) => d !== dir);
        input.current.held = [...held, dir];
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (phaseRef.current === 'playing') {
          e.preventDefault();
          if (!e.repeat) input.current.bomb = true;
          return;
        }
        // Outside play, let a focused button handle its own key.
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        if (phaseRef.current === 'roundOver') {
          actions.current.nextRound();
        } else {
          actions.current.startMatch();
        }
      }
    };
    const onKeyUp = (e) => {
      const dir = KEYS[e.key];
      if (dir) input.current.held = input.current.held.filter((d) => d !== dir);
    };
    const onBlur = () => {
      input.current.held = [];
      input.current.pad = null;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // ---- On-screen d-pad: press and slide; works with a finger or a mouse ----
  const padRef = useRef(null);
  const [padDir, setPadDir] = useState(null);
  const readPad = (e) => {
    const rect = padRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let dir = null;
    if (Math.hypot(dx, dy) > rect.width * 0.12) {
      dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? 'right'
            : 'left'
          : dy > 0
            ? 'down'
            : 'up';
    }
    input.current.pad = dir;
    setPadDir(dir);
  };
  const onPadDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    readPad(e);
  };
  const onPadMove = (e) => {
    if (e.buttons) readPad(e);
  };
  const onPadUp = () => {
    input.current.pad = null;
    setPadDir(null);
  };
  const dropPod = (e) => {
    e.preventDefault();
    if (phaseRef.current === 'playing') input.current.bomb = true;
  };

  // ---- Render ----

  const winnerName =
    result && result.winner !== null ? GARDENERS[result.winner].name : null;
  const arrow = (dir, rotate) => (
    <svg
      viewBox="0 0 24 24"
      className={`absolute w-9 h-9 ${padDir === dir ? 'text-sun' : 'text-muted'}`}
      style={{
        transform: `rotate(${rotate}deg)`,
      }}
      aria-hidden="true"
    >
      <path d="M12 5 L19 14 H5 Z" fill="currentColor" />
    </svg>
  );
  return (
    <main className="font-body max-w-[620px] mx-auto py-5 flex flex-col gap-3 select-none">
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[clamp(40px,12vw,64px)] leading-none">
          Fuse Field
        </h1>
        <div className="text-right text-sm leading-tight">
          <div className="font-display text-2xl">Round {round}</div>
          <div className="text-muted">Matches won: {matchesWon}</div>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-1.5" aria-label="Scoreboard">
        {GARDENERS.map((g, i) => (
          <div
            key={String(String(g.name))}
            className={`rounded-xl bg-card px-2 py-1.5 border-2 ${hud.alive[i] ? '' : 'opacity-50'}`}
            style={{
              borderColor: g.color,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{
                  background: g.color,
                }}
              />
              <span className="font-extrabold text-sm truncate">{g.name}</span>
            </div>
            <div className="flex gap-1 mt-1" aria-label={`${wins[i]} rounds won`}>
              {Array.from(
                {
                  length: WINS_NEEDED,
                },
                (_, k) => (
                  <span
                    key={String(String(k))}
                    className={`w-3.5 h-3.5 rounded-full border-2 border-pea ${k < wins[i] ? 'bg-pea' : ''}`}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label="Allotment arena"
          className="w-full block rounded-2xl shadow-[0_6px_0_#7a5230] touch-none"
          style={{
            aspectRatio: `${COLS} / ${ROWS}`,
          }}
        />

        {phase !== 'playing' && (
          <div
            className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2 text-center p-4 overflow-y-auto"
            style={{
              background: 'rgba(255, 244, 196, 0.94)',
            }}
          >
            {phase === 'intro' && (
              <>
                <p className="font-display text-4xl leading-none">Pea-pod showdown</p>
                <ul className="text-sm max-w-[40ch] text-left list-disc pl-5 flex flex-col gap-0.5">
                  <li>Drop pea pods. After a moment they pop in a cross.</li>
                  <li>
                    Pops break seed crates and splat any gardener they reach, you
                    included.
                  </li>
                  <li>
                    Crates hide seed packets: more pods, a bigger pop, or faster feet.
                  </li>
                  <li>
                    Last gardener standing wins the round. First to two rounds wins.
                  </li>
                </ul>
                <p className="text-xs text-muted">
                  Arrows or WASD to move, Space to drop a pod. Or use the pad below.
                </p>
              </>
            )}
            {phase === 'roundOver' && (
              <>
                <p className="font-display text-4xl leading-none">
                  {winnerName === 'You'
                    ? 'You won the round!'
                    : winnerName
                      ? `${winnerName} takes the round`
                      : 'A draw!'}
                </p>
                <p className="text-sm text-muted">
                  {winnerName === 'You'
                    ? 'One more and the trophy marrow is yours.'
                    : 'Dust off your hat and go again.'}
                </p>
              </>
            )}
            {phase === 'matchOver' && (
              <>
                <p className="font-display text-4xl leading-none">
                  {winnerName === 'You'
                    ? 'Champion of the allotment!'
                    : `${winnerName} wins the match`}
                </p>
                <p className="text-sm text-muted">Final score {wins.join(' · ')}</p>
              </>
            )}
            <button
              type="button"
              onClick={phase === 'roundOver' ? nextRound : startMatch}
              className="mt-1 font-display text-2xl px-7 py-1.5 rounded-full bg-pea text-white shadow-[0_4px_0_#2f6a18] active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'intro'
                ? 'Start'
                : phase === 'roundOver'
                  ? 'Next round'
                  : 'Play again'}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div
          ref={padRef}
          role="group"
          aria-label="Direction pad"
          onPointerDown={onPadDown}
          onPointerMove={onPadMove}
          onPointerUp={onPadUp}
          onPointerCancel={onPadUp}
          onLostPointerCapture={onPadUp}
          className="relative w-[132px] h-[132px] shrink-0 rounded-full bg-card border-4 border-soil touch-none flex items-center justify-center cursor-pointer"
        >
          <span className="absolute top-1 left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center">
            {arrow('up', 0)}
          </span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-9 h-9 flex items-center justify-center">
            {arrow('down', 180)}
          </span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center">
            {arrow('left', -90)}
          </span>
          <span className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center">
            {arrow('right', 90)}
          </span>
          <span
            className="w-8 h-8 rounded-full"
            style={{
              background: 'var(--soil)',
            }}
          />
        </div>

        <div className="text-xs text-muted text-center leading-snug flex-1 min-w-0">
          <div>
            Pods <b className="text-ink">{hud.bombs}</b> · Reach{' '}
            <b className="text-ink">{hud.range}</b> · Speed{' '}
            <b className="text-ink">{hud.speed.toFixed(1)}</b>
          </div>
          <div className="hidden sm:block mt-1">Keyboard: arrows/WASD and Space</div>
        </div>

        <button
          type="button"
          onPointerDown={dropPod}
          aria-label="Drop a pea pod"
          className="w-[104px] h-[104px] shrink-0 rounded-full bg-pea text-white font-display text-2xl shadow-[0_6px_0_#2f6a18] active:translate-y-1 active:shadow-[0_2px_0_#2f6a18] touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Pod!
        </button>
      </div>
    </main>
  );
}
export default App;
