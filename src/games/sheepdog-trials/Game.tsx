import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  regroup?: () => void;
  scatter?: () => void;
  startLevel?: (n: any) => void;
  level?: number;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.1, type = 'sine', volume = 0.04) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// A shepherd's whistle: a quick pitch bend made from a few short tones.
function whistle(rising) {
  const notes = rising ? [1400, 1800, 2300] : [2300, 1700, 2200, 1500];
  notes.forEach((f, k) => setTimeout(() => playTone(f, 0.09, 'sine', 0.05), k * 70));
}

// ---------- Field and levels ----------
// The world is 800×560 units. Walls are line segments of dry stone; trees are round; gates are pairs of posts.

const WW = 800;
const WH = 560;
const SHEEP_R = 9;
const DOG_R = 10;
const WALL_HALF = 7;
const DOG_SPEED = 300;
const BEST_KEY = 'sheepdog-trials-best';
const P = (x, y) => ({
  x,
  y,
});
const LEVELS = [
  {
    sheep: 8,
    stubborn: 0,
    time: 150,
    start: {
      x: 140,
      y: 280,
      r: 70,
    },
    gates: [[P(400, 220), P(400, 340)]],
    walls: [],
    trees: [],
    pen: {
      x: 640,
      y: 210,
      w: 120,
      h: 140,
      side: 'left',
      gap: [250, 310],
    },
  },
  {
    sheep: 10,
    stubborn: 0,
    time: 160,
    start: {
      x: 130,
      y: 430,
      r: 70,
    },
    gates: [[P(330, 170), P(430, 170)]],
    walls: [],
    trees: [
      {
        x: 250,
        y: 300,
        r: 26,
      },
      {
        x: 520,
        y: 260,
        r: 30,
      },
      {
        x: 560,
        y: 450,
        r: 24,
      },
      {
        x: 150,
        y: 150,
        r: 22,
      },
    ],
    pen: {
      x: 620,
      y: 380,
      w: 140,
      h: 140,
      side: 'top',
      gap: [660, 720],
    },
  },
  {
    sheep: 12,
    stubborn: 1,
    time: 180,
    start: {
      x: 120,
      y: 120,
      r: 60,
    },
    gates: [
      [P(300, 330), P(300, 430)],
      [P(560, 120), P(560, 220)],
    ],
    walls: [
      [P(180, 250), P(420, 250)],
      [P(440, 300), P(440, 545)],
    ],
    trees: [
      {
        x: 380,
        y: 150,
        r: 24,
      },
      {
        x: 700,
        y: 260,
        r: 22,
      },
    ],
    pen: {
      x: 620,
      y: 380,
      w: 140,
      h: 140,
      side: 'top',
      gap: [660, 720],
    },
  },
  {
    sheep: 14,
    stubborn: 1,
    time: 190,
    start: {
      x: 680,
      y: 110,
      r: 60,
    },
    gates: [
      [P(520, 300), P(620, 300)],
      [P(200, 180), P(200, 280)],
    ],
    walls: [
      [P(420, 15), P(420, 240)],
      [P(260, 380), P(560, 380)],
    ],
    trees: [
      {
        x: 330,
        y: 470,
        r: 28,
      },
      {
        x: 420,
        y: 480,
        r: 22,
      },
      {
        x: 700,
        y: 420,
        r: 26,
      },
      {
        x: 300,
        y: 110,
        r: 22,
      },
    ],
    pen: {
      x: 40,
      y: 390,
      w: 140,
      h: 140,
      side: 'right',
      gap: [430, 490],
    },
  },
  {
    sheep: 16,
    stubborn: 2,
    time: 200,
    start: {
      x: 400,
      y: 280,
      r: 55,
    },
    gates: [
      [P(120, 80), P(120, 180)],
      [P(680, 380), P(680, 480)],
    ],
    walls: [
      [P(250, 150), P(550, 150)],
      [P(250, 410), P(550, 410)],
      [P(250, 150), P(250, 230)],
      [P(550, 330), P(550, 410)],
    ],
    trees: [
      {
        x: 120,
        y: 400,
        r: 26,
      },
      {
        x: 700,
        y: 260,
        r: 26,
      },
      {
        x: 400,
        y: 60,
        r: 22,
      },
      {
        x: 400,
        y: 500,
        r: 22,
      },
    ],
    pen: {
      x: 620,
      y: 30,
      w: 150,
      h: 120,
      side: 'bottom',
      gap: [665, 725],
    },
  },
];

// After the fifth field the courses repeat with bigger flocks, more stubborn sheep and less time.
function levelSpec(n) {
  const base = LEVELS[(n - 1) % LEVELS.length];
  const lap = Math.floor((n - 1) / LEVELS.length);
  return {
    ...base,
    sheep: base.sheep + lap * 3,
    stubborn: base.stubborn + lap,
    time: Math.max(120, base.time - lap * 10),
  };
}
const rnd = (a, b) => a + Math.random() * (b - a);
function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

// The pen is four hurdle walls; the gap in one side gets a "hurdle" segment that only lets marked sheep in.
function penWalls(pen) {
  const { x, y, w, h, side, gap } = pen;
  const sides = {
    top: [P(x, y), P(x + w, y)],
    bottom: [P(x, y + h), P(x + w, y + h)],
    left: [P(x, y), P(x, y + h)],
    right: [P(x + w, y), P(x + w, y + h)],
  };
  const walls = [];
  let hurdle = null;
  Object.entries(sides).forEach(([name, [a, b]]) => {
    if (name !== side) {
      walls.push([a, b]);
      return;
    }
    const horizontal = a.y === b.y;
    const g0 = horizontal ? P(gap[0], a.y) : P(a.x, gap[0]);
    const g1 = horizontal ? P(gap[1], a.y) : P(a.x, gap[1]);
    walls.push([a, g0], [g1, b]);
    hurdle = [g0, g1];
  });
  return {
    walls,
    hurdle,
  };
}

function newLevel(n) {
  const spec = levelSpec(n);
  const { walls: penSegs, hurdle } = penWalls(spec.pen);

  // Stones along each dry-stone wall, fixed for the level so they don't flicker.
  const stones = spec.walls.map(([a, b]) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return Array.from(
      {
        length: Math.ceil(len / 7),
      },
      (_, k) => ({
        t: Math.min(1, (k * 7) / len),
        off: rnd(-3.5, 3.5),
        r: rnd(3.2, 5.2),
        shade: Math.floor(rnd(0, 3)),
      }),
    );
  });
  const patches = Array.from(
    {
      length: 40,
    },
    () => ({
      x: rnd(0, WW),
      y: rnd(0, WH),
      rx: rnd(20, 70),
      ry: rnd(10, 30),
      light: Math.random() < 0.5,
    }),
  );
  const level = {
    n,
    spec,
    walls: spec.walls,
    penSegs,
    hurdle,
    stones,
    patches,
    trees: spec.trees,
    gates: spec.gates,
    pen: spec.pen,
    sheep: [],
    dog: {
      x: spec.start.x + 150 > WW - 40 ? spec.start.x - 150 : spec.start.x + 150,
      y: spec.start.y,
      vx: 0,
      vy: 0,
      heading: 0,
    },
    timeLeft: spec.time,
    regroupT: 0,
    scatterT: 0,
    regroupCool: 0,
    scatterCool: 0,
    events: [],
  };

  // Scatter the flock around the start, clear of trees and walls.
  for (let i = 0; i < spec.sheep; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rnd(0, Math.PI * 2);
      const r = rnd(0, spec.start.r);
      const s = {
        x: spec.start.x + Math.cos(a) * r,
        y: spec.start.y + Math.sin(a) * r,
        vx: 0,
        vy: 0,
        heading: rnd(0, Math.PI * 2),
        wander: rnd(0, Math.PI * 2),
        stubborn: i < spec.stubborn,
        standoff: 0,
        gates: [],
        penned: false,
      };
      const blocked =
        spec.trees.some((t) => Math.hypot(s.x - t.x, s.y - t.y) < t.r + SHEEP_R + 4) ||
        spec.walls.some(([wa, wb]) => segDist(s, wa, wb).d < WALL_HALF + SHEEP_R + 4) ||
        s.x < 20 ||
        s.y < 20 ||
        s.x > WW - 20 ||
        s.y > WH - 20;
      if (!blocked || tries === 59) {
        level.sheep.push(s);
        break;
      }
    }
  }
  return level;
}

// ---------- Geometry ----------

function segDist(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return {
    d: Math.hypot(p.x - cx, p.y - cy),
    cx,
    cy,
  };
}

// Pushes a moving body out of a thick segment and cancels its velocity into the wall.
function pushOut(body, a, b, r) {
  const { d, cx, cy } = segDist(body, a, b);
  if (d >= r || d < 1e-6) return;
  const nx = (body.x - cx) / d;
  const ny = (body.y - cy) / d;
  body.x = cx + nx * r;
  body.y = cy + ny * r;
  const vn = body.vx * nx + body.vy * ny;
  if (vn < 0) {
    body.vx -= vn * nx;
    body.vy -= vn * ny;
  }
}

function pushOutCircle(body, c, r) {
  const dx = body.x - c.x;
  const dy = body.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d >= r || d < 1e-6) return;
  body.x = c.x + (dx / d) * r;
  body.y = c.y + (dy / d) * r;
  const vn = (body.vx * dx + body.vy * dy) / d;
  if (vn < 0) {
    body.vx -= (vn * dx) / d;
    body.vy -= (vn * dy) / d;
  }
}

// Did the step from p0 to p1 cross the segment a–b?
function crosses(p0, p1, a, b) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(a, b, p0);
  const d2 = side(a, b, p1);
  const d3 = side(p0, p1, a);
  const d4 = side(p0, p1, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
const insidePen = (s, pen) =>
  s.x > pen.x + 3 &&
  s.x < pen.x + pen.w - 3 &&
  s.y > pen.y + 3 &&
  s.y < pen.y + pen.h - 3;
function keepInField(body, r) {
  if (body.x < r) {
    body.x = r;
    body.vx = Math.abs(body.vx) * 0.3;
  }
  if (body.y < r) {
    body.y = r;
    body.vy = Math.abs(body.vy) * 0.3;
  }
  if (body.x > WW - r) {
    body.x = WW - r;
    body.vx = -Math.abs(body.vx) * 0.3;
  }
  if (body.y > WH - r) {
    body.y = WH - r;
    body.vy = -Math.abs(body.vy) * 0.3;
  }
}

// ---------- Flock behaviour (boids) ----------

const NEIGHBOUR_R = 70;
const SEPARATE_R = 22;
function updateSheep(g, dt) {
  const dog = g.dog;
  const free = g.sheep.filter((s) => !s.penned);
  const centre = free.reduce(
    (acc, s) => ({
      x: acc.x + s.x / free.length,
      y: acc.y + s.y / free.length,
    }),
    {
      x: 0,
      y: 0,
    },
  );
  g.sheep.forEach((s) => {
    const prev = {
      x: s.x,
      y: s.y,
    };
    let ax = 0;
    let ay = 0;
    let fleeing = false;

    // Wandering: a slowly turning random nudge, like grazing.
    s.wander += rnd(-1, 1) * dt * 3;
    ax += Math.cos(s.wander) * 18;
    ay += Math.sin(s.wander) * 18;
    if (!s.penned) {
      // Neighbours: cohesion pulls together, alignment matches heading, separation keeps personal space.
      let cx = 0;
      let cy = 0;
      let avx = 0;
      let avy = 0;
      let n = 0;
      g.sheep.forEach((o) => {
        if (o === s || o.penned) return;
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        const d = Math.hypot(dx, dy);
        if (d < NEIGHBOUR_R) {
          n++;
          cx += o.x;
          cy += o.y;
          avx += o.vx;
          avy += o.vy;
        }
        if (d < SEPARATE_R && d > 0.01) {
          const push = (1 - d / SEPARATE_R) * 260;
          ax -= (dx / d) * push;
          ay -= (dy / d) * push;
        }
      });
      const herdiness = s.stubborn ? 0.3 : 1;
      if (n) {
        ax += (cx / n - s.x) * 0.9 * herdiness;
        ay += (cy / n - s.y) * 0.9 * herdiness;
        ax += (avx / n - s.vx) * 1.2 * herdiness;
        ay += (avy / n - s.vy) * 1.2 * herdiness;
      }

      // Regroup whistle: everyone (bar the stubborn) heads for the middle of the flock.
      if (g.regroupT > 0 && !s.stubborn) {
        ax += (centre.x - s.x) * 1.6;
        ay += (centre.y - s.y) * 1.6;
      }

      // Scatter whistle: bolt away from the middle of the flock.
      if (g.scatterT > 0) {
        const dx = s.x - centre.x;
        const dy = s.y - centre.y;
        const d = Math.hypot(dx, dy) || 1;
        ax += (dx / d) * 420;
        ay += (dy / d) * 420;
        fleeing = true;
      }

      // The dog: sheep run from it. Stubborn sheep sometimes stand their ground and stare it down.
      const ddx = s.x - dog.x;
      const ddy = s.y - dog.y;
      const dd = Math.hypot(ddx, ddy) || 1;
      const fleeR = s.stubborn ? 95 : 150;
      if (s.standoff > 0) {
        s.standoff -= dt;
        s.vx *= 0.8;
        s.vy *= 0.8;
        s.heading = Math.atan2(-ddy, -ddx);
      } else if (dd < fleeR) {
        if (s.stubborn && dd < 90 && Math.random() < dt * 0.5) {
          s.standoff = rnd(0.8, 1.6);
          g.events.push('baa-low');
        }
        const f = 1 - dd / fleeR;
        const strength = s.stubborn ? 330 : 520;
        ax += (ddx / dd) * f * strength;
        ay += (ddy / dd) * f * strength;
        fleeing = true;
      }

      // Trees, walls and the fence: a soft push away before the hard collision.
      g.trees.forEach((t) => {
        const dx = s.x - t.x;
        const dy = s.y - t.y;
        const d = Math.hypot(dx, dy) || 1;
        const reach = t.r + SHEEP_R + 20;
        if (d < reach) {
          ax += (dx / d) * (1 - d / reach) * 300;
          ay += (dy / d) * (1 - d / reach) * 300;
        }
      });
      g.walls.forEach(([a, b]) => {
        const { d, cx, cy } = segDist(s, a, b);
        const reach = WALL_HALF + SHEEP_R + 16;
        if (d < reach && d > 0.01) {
          ax += ((s.x - cx) / d) * (1 - d / reach) * 260;
          ay += ((s.y - cy) / d) * (1 - d / reach) * 260;
        }
      });
      const edge = 28;
      if (s.x < edge) ax += (1 - s.x / edge) * 240;
      if (s.y < edge) ay += (1 - s.y / edge) * 240;
      if (s.x > WW - edge) ax -= (1 - (WW - s.x) / edge) * 240;
      if (s.y > WH - edge) ay -= (1 - (WH - s.y) / edge) * 240;
    } else {
      // Penned sheep just mill about gently.
      ax *= 0.5;
      ay *= 0.5;
    }

    // Integrate, with drag and a speed limit that depends on whether the sheep is spooked.
    s.vx += ax * dt;
    s.vy += ay * dt;
    const drag = Math.exp(-dt * 1.6);
    s.vx *= drag;
    s.vy *= drag;
    const max = s.penned ? 18 : fleeing ? 140 : 40;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > max) {
      s.vx = (s.vx / speed) * max;
      s.vy = (s.vy / speed) * max;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (speed > 6 && s.standoff <= 0) s.heading = Math.atan2(s.vy, s.vx);

    // Hard collisions
    g.trees.forEach((t) => pushOutCircle(s, t, t.r + SHEEP_R));
    g.walls.forEach(([a, b]) => pushOut(s, a, b, WALL_HALF + SHEEP_R));
    g.penSegs.forEach(([a, b]) => pushOut(s, a, b, 3 + SHEEP_R));
    const allMarked = s.gates.length === g.gates.length;
    if (!allMarked || s.penned) pushOut(s, g.hurdle[0], g.hurdle[1], 3 + SHEEP_R);
    keepInField(s, SHEEP_R);

    // Passing between gate posts earns a raddle mark.
    g.gates.forEach(([a, b], i) => {
      if (!s.gates.includes(i) && crosses(prev, s, a, b)) {
        s.gates.push(i);
        g.events.push('gate');
      }
    });
    if (!s.penned && allMarked && insidePen(s, g.pen)) {
      s.penned = true;
      g.events.push('penned');
    }
  });
}

function updateDog(g, dt, input) {
  const dog = g.dog;
  const k = input.keys;
  const kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
  const ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
  let tvx = 0;
  let tvy = 0;
  if (kx || ky) {
    const len = Math.hypot(kx, ky);
    tvx = (kx / len) * DOG_SPEED;
    tvy = (ky / len) * DOG_SPEED;
  } else if (input.target) {
    // Run towards the pointer, easing off as the dog arrives.
    const dx = input.target.x - dog.x;
    const dy = input.target.y - dog.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      const sp = Math.min(DOG_SPEED, d * 5);
      tvx = (dx / d) * sp;
      tvy = (dy / d) * sp;
    }
  }
  const blend = 1 - Math.exp(-dt * 12);
  dog.vx += (tvx - dog.vx) * blend;
  dog.vy += (tvy - dog.vy) * blend;
  dog.x += dog.vx * dt;
  dog.y += dog.vy * dt;
  if (Math.hypot(dog.vx, dog.vy) > 10) dog.heading = Math.atan2(dog.vy, dog.vx);
  g.trees.forEach((t) => pushOutCircle(dog, t, t.r + DOG_R));
  g.walls.forEach(([a, b]) => pushOut(dog, a, b, WALL_HALF + DOG_R));
  g.penSegs.forEach(([a, b]) => pushOut(dog, a, b, 3 + DOG_R));
  pushOut(dog, g.hurdle[0], g.hurdle[1], 3 + DOG_R);
  keepInField(dog, DOG_R);
}

// ---------- Drawing ----------

const GATE_COLOURS = ['#2f6fd6', '#d63a3a', '#e8a317'];
function drawField(ctx, g, s, now, target) {
  // Grass with mottled patches
  ctx.fillStyle = '#76ab52';
  ctx.fillRect(0, 0, WW * s, WH * s);
  g.patches.forEach((p) => {
    ctx.fillStyle = p.light ? 'rgba(170, 210, 110, 0.25)' : 'rgba(40, 90, 40, 0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x * s, p.y * s, p.rx * s, p.ry * s, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Field fence
  ctx.strokeStyle = '#6b4e2e';
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(1.5 * s, 1.5 * s, WW * s - 3 * s, WH * s - 3 * s);

  // Pen: straw floor and hurdles
  const pen = g.pen;
  ctx.fillStyle = 'rgba(233, 205, 120, 0.55)';
  ctx.fillRect(pen.x * s, pen.y * s, pen.w * s, pen.h * s);
  ctx.strokeStyle = '#8a6236';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5 * s;
  g.penSegs.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
    ctx.stroke();
  });
  const [ha, hb] = g.hurdle;
  ctx.setLineDash([6 * s, 6 * s]);
  ctx.strokeStyle = 'rgba(138, 98, 54, 0.75)';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(ha.x * s, ha.y * s);
  ctx.lineTo(hb.x * s, hb.y * s);
  ctx.stroke();
  ctx.setLineDash([]);

  // Gates: two posts with flags and a faint line between
  g.gates.forEach(([a, b], i) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 * s;
    ctx.setLineDash([4 * s, 5 * s]);
    ctx.beginPath();
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
    ctx.stroke();
    ctx.setLineDash([]);
    [a, b].forEach((p) => {
      ctx.fillStyle = '#f2efe4';
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GATE_COLOURS[i % GATE_COLOURS.length];
      ctx.beginPath();
      ctx.moveTo(p.x * s, p.y * s - 4 * s);
      ctx.lineTo(p.x * s + 14 * s, p.y * s - 9 * s + Math.sin(now / 200 + i) * 2 * s);
      ctx.lineTo(p.x * s, p.y * s - 14 * s);
      ctx.closePath();
      ctx.fill();
    });
  });

  // Dry-stone walls
  g.walls.forEach(([a, b], wi) => {
    ctx.strokeStyle = '#6f7470';
    ctx.lineWidth = WALL_HALF * 2 * s;
    ctx.beginPath();
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
    ctx.stroke();
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    g.stones[wi].forEach((st) => {
      ctx.fillStyle = ['#a3a69e', '#8d918a', '#b9bab1'][st.shade];
      ctx.beginPath();
      ctx.arc(
        (a.x + (b.x - a.x) * st.t + nx * st.off) * s,
        (a.y + (b.y - a.y) * st.t + ny * st.off) * s,
        st.r * s,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  });

  // Trees: shadow, canopy, highlights
  g.trees.forEach((t) => {
    ctx.fillStyle = 'rgba(20, 50, 20, 0.3)';
    ctx.beginPath();
    ctx.arc((t.x + 6) * s, (t.y + 7) * s, t.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6b33';
    ctx.beginPath();
    ctx.arc(t.x * s, t.y * s, t.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4b8c45';
    ctx.beginPath();
    ctx.arc((t.x - t.r * 0.3) * s, (t.y - t.r * 0.3) * s, t.r * 0.55 * s, 0, Math.PI * 2);
    ctx.arc((t.x + t.r * 0.35) * s, (t.y - t.r * 0.1) * s, t.r * 0.4 * s, 0, Math.PI * 2);
    ctx.fill();
  });

  // Sheep: woolly puffs with a dark face, and a coloured mark for every gate passed
  g.sheep.forEach((sh) => {
    ctx.save();
    ctx.translate(sh.x * s, sh.y * s);
    ctx.rotate(sh.heading);
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath();
    ctx.ellipse(2 * s, 3 * s, 11 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sh.stubborn ? '#4a4540' : '#f4f1e6';
    [
      [-4, -3],
      [-4, 3],
      [2, -3.5],
      [2, 3.5],
      [-1, 0],
    ].forEach(([ox, oy]) => {
      ctx.beginPath();
      ctx.arc(ox * s, oy * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#26221f';
    ctx.beginPath();
    ctx.ellipse(8 * s, 0, 4 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (sh.stubborn) {
      ctx.strokeStyle = '#d8c79a';
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.arc(7 * s, -3 * s, 2.4 * s, Math.PI, Math.PI * 2);
      ctx.arc(7 * s, 3 * s, 2.4 * s, 0, Math.PI);
      ctx.stroke();
    }
    sh.gates.forEach((gi, k) => {
      ctx.fillStyle = GATE_COLOURS[gi % GATE_COLOURS.length];
      ctx.beginPath();
      ctx.arc((-4 + k * 4) * s, 0, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    if (sh.standoff > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${14 * s}px Overlock, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', sh.x * s, (sh.y - 13) * s);
    }
  });

  // Pointer target
  if (target) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(target.x * s, target.y * s, 8 * s, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The dog: a black-and-white collie
  const dog = g.dog;
  ctx.save();
  ctx.translate(dog.x * s, dog.y * s);
  ctx.rotate(dog.heading);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath();
  ctx.ellipse(2 * s, 3 * s, 13 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1d1d1d';
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10 * s, 0);
  ctx.quadraticCurveTo(
    -16 * s,
    Math.sin(now / 90) * 5 * s,
    -19 * s,
    Math.sin(now / 90 + 1) * 4 * s,
  );
  ctx.stroke();
  ctx.fillStyle = '#1d1d1d';
  ctx.beginPath();
  ctx.ellipse(-1 * s, 0, 11 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f1e6';
  ctx.beginPath();
  ctx.ellipse(5 * s, 0, 3 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1d1d';
  ctx.beginPath();
  ctx.arc(10 * s, 0, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f1e6';
  ctx.fillRect(9 * s, -1 * s, 6 * s, 2 * s);
  ctx.fillStyle = '#1d1d1d';
  ctx.beginPath();
  ctx.ellipse(8 * s, -4.5 * s, 2.4 * s, 1.6 * s, 0.5, 0, Math.PI * 2);
  ctx.ellipse(8 * s, 4.5 * s, 2.4 * s, 1.6 * s, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Sheepdog Trials');

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
    keys: {},
    target: null,
  });
  const [phase, setPhase] = useState('intro');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [level, setLevel] = useState(1);
  const [hud, setHud] = useState({
    time: 0,
    penned: 0,
    marked: 0,
    total: 0,
    regroupCool: 0,
    scatterCool: 0,
  });
  const [best, setBest] = useState(readBest);
  const startLevel = (n) => {
    game.current = newLevel(n);
    input.current.target = null;
    setLevel(n);
    setPhase('playing');
  };
  const regroup = () => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing' || g.regroupCool > 0) return;
    g.regroupT = 3;
    g.regroupCool = 6;
    whistle(true);
  };
  const scatter = () => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing' || g.scatterCool > 0) return;
    g.scatterT = 0.7;
    g.scatterCool = 6;
    whistle(false);
  };
  const actions = useRef({} as GameState);
  actions.current = {
    startLevel,
    regroup,
    scatter,
    level,
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
    const update = (dt) => {
      const g = game.current;
      if (!g || g.done || phaseRef.current !== 'playing') return;
      g.timeLeft -= dt;
      g.regroupT = Math.max(0, g.regroupT - dt);
      g.scatterT = Math.max(0, g.scatterT - dt);
      g.regroupCool = Math.max(0, g.regroupCool - dt);
      g.scatterCool = Math.max(0, g.scatterCool - dt);
      updateDog(g, dt, input.current);
      updateSheep(g, dt);

      // Sounds
      g.events.forEach((ev) => {
        if (ev === 'gate') playTone(660, 0.08, 'triangle', 0.03);
        if (ev === 'penned') {
          playTone(320, 0.18, 'sawtooth', 0.025);
          setTimeout(() => playTone(300, 0.22, 'sawtooth', 0.02), 120);
        }
        if (ev === 'baa-low') playTone(180, 0.3, 'sawtooth', 0.025);
      });
      g.events = [];
      const penned = g.sheep.filter((s) => s.penned).length;
      const marked = g.sheep.filter((s) => s.gates.length === g.gates.length).length;
      if (penned === g.sheep.length) {
        g.done = true;
        setPhase('cleared');
        setBest((b) => {
          const next = Math.max(b, g.n);
          try {
            localStorage.setItem(BEST_KEY, String(String(next)));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.18, 'triangle', 0.05), k * 110),
        );
      } else if (g.timeLeft <= 0) {
        g.timeLeft = 0;
        g.done = true;
        setPhase('failed');
        [392, 330, 262].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.25, 'triangle', 0.05), k * 160),
        );
      }
      const key = `${Math.ceil(g.timeLeft)}|${penned}|${marked}|${Math.ceil(g.regroupCool)}|${Math.ceil(g.scatterCool)}`;
      if (key !== g.hudKey) {
        g.hudKey = key;
        setHud({
          time: Math.ceil(g.timeLeft),
          penned,
          marked,
          total: g.sheep.length,
          regroupCool: Math.ceil(g.regroupCool),
          scatterCool: Math.ceil(g.scatterCool),
        });
      }
    };
    const draw = (now) => {
      const g = game.current || (game.current = newLevel(1));
      const s = canvas.width / WW;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawField(
        ctx,
        g,
        s,
        now,
        phaseRef.current === 'playing' ? input.current.target : null,
      );
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- Keyboard: arrows/WASD run the dog, Q or Space regroup, E scatter ----
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
      const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        input.current.keys[dir] = true;
        input.current.target = null;
        return;
      }
      const a = actions.current;
      if (phaseRef.current === 'playing') {
        if (e.key === ' ' || e.key === 'q' || e.key === 'Q') {
          e.preventDefault();
          a.regroup();
        }
        if (e.key === 'e' || e.key === 'E') a.scatter();
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        if (phaseRef.current === 'cleared') a.startLevel(a.level + 1);
        else if (phaseRef.current === 'failed') a.startLevel(a.level);
        else a.startLevel(1);
      }
    };
    const onKeyUp = (e) => {
      const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
      if (dir) input.current.keys[dir] = false;
    };
    const onBlur = () => {
      input.current.keys = {};
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

  // ---- Pointer: the dog follows the mouse, or your finger while it touches the field ----

  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WW,
      y: ((e.clientY - rect.top) / rect.height) * WH,
    };
  };
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    input.current.target = toWorld(e);
  };
  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse' || e.buttons) input.current.target = toWorld(e);
  };
  const onPointerEnd = (e) => {
    if (e.pointerType !== 'mouse') input.current.target = null;
  };
  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse') input.current.target = null;
  };

  // ---- Render ----

  const spec = levelSpec(level);
  const gateCount = spec.gates.length;
  return (
    <main className="font-body max-w-[900px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(30px,8.5vw,52px)] leading-none text-moss">
            Sheepdog Trials
          </h1>
          <p className="text-sm text-muted mt-1">
            Treialon Cŵn Defaid · a hill farm above the valley
          </p>
        </div>
        <div className="text-right text-sm">
          <div>
            Field <b className="font-display text-2xl">{level}</b>
          </div>
          <div className="text-muted">Best field cleared: {best || '—'}</div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-card px-2 py-1.5">
          <div className="text-xs uppercase tracking-wider text-muted">Time</div>
          <div
            className={`text-2xl font-black tabular-nums ${phase === 'playing' && hud.time <= 15 ? 'text-heather' : ''}`}
          >
            {phase === 'playing'
              ? `${Math.floor(hud.time / 60)}:${String(hud.time % 60).padStart(2, '0')}`
              : '—'}
          </div>
        </div>
        <div className="rounded-xl bg-card px-2 py-1.5">
          <div className="text-xs uppercase tracking-wider text-muted">Through gates</div>
          <div className="text-2xl font-black tabular-nums">
            {phase === 'intro' ? '—' : `${hud.marked}/${hud.total}`}
          </div>
        </div>
        <div className="rounded-xl bg-card px-2 py-1.5">
          <div className="text-xs uppercase tracking-wider text-muted">Penned</div>
          <div className="text-2xl font-black tabular-nums text-moss">
            {phase === 'intro' ? '—' : `${hud.penned}/${hud.total}`}
          </div>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label="Trial field seen from above"
          className="w-full block rounded-2xl touch-none cursor-none border-4 border-[#6b4e2e]"
          style={{
            aspectRatio: `${WW} / ${WH}`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerLeave}
        />

        {phase !== 'playing' && (
          <div
            className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2 text-center p-4 overflow-y-auto"
            style={{
              background: 'rgba(24, 36, 28, 0.82)',
              color: '#eef2e8',
            }}
          >
            {phase === 'intro' && (
              <>
                <p className="font-display text-3xl">Come by, Fly!</p>
                <ul className="text-sm max-w-[44ch] text-left list-disc pl-5 flex flex-col gap-0.5">
                  <li>
                    Your collie runs to the pointer, or to your finger. Arrow keys work
                    too.
                  </li>
                  <li>Sheep run from the dog and like to stay together.</li>
                  <li>
                    Drive every sheep between the flagged gate posts. Each gate leaves a
                    coloured mark.
                  </li>
                  <li>Then pen them. The pen only lets in sheep with every mark.</li>
                  <li>
                    Whistles: Regroup pulls the flock together. Scatter breaks up a jam.
                  </li>
                  <li>The dark, horned sheep is stubborn and may stare your dog down.</li>
                </ul>
              </>
            )}
            {phase === 'cleared' && (
              <>
                <p className="font-display text-3xl">Field {level} penned!</p>
                <p className="text-sm opacity-80">
                  All {hud.total} sheep safely in, with {hud.time} seconds to spare.
                </p>
              </>
            )}
            {phase === 'failed' && (
              <>
                <p className="font-display text-3xl">Time, shepherd!</p>
                <p className="text-sm opacity-80">
                  {hud.penned} of {hud.total} sheep penned on field {level}.
                </p>
              </>
            )}
            <div className="flex gap-2 flex-wrap justify-center mt-1">
              {phase === 'failed' && (
                <button
                  type="button"
                  onClick={() => startLevel(level)}
                  className="px-5 py-2 rounded-full bg-[#7cc073] text-[#13200f] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  Try field {level} again
                </button>
              )}
              <button
                type="button"
                onClick={() => startLevel(phase === 'cleared' ? level + 1 : 1)}
                className={`px-5 py-2 rounded-full font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white
                    ${phase === 'failed' ? 'border-2 border-[#eef2e8]' : 'bg-[#7cc073] text-[#13200f]'}`}
              >
                {phase === 'intro'
                  ? 'Start the trial'
                  : phase === 'cleared'
                    ? `On to field ${level + 1}`
                    : 'Play again from field 1'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={regroup}
          disabled={phase !== 'playing' || hud.regroupCool > 0}
          className="flex-1 rounded-xl bg-[#3f7a3a] text-white px-3 py-3 font-black disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Regroup whistle
          {hud.regroupCool > 0 && phase === 'playing' ? ` (${hud.regroupCool})` : ''}
        </button>
        <button
          type="button"
          onClick={scatter}
          disabled={phase !== 'playing' || hud.scatterCool > 0}
          className="flex-1 rounded-xl bg-[#4b5966] text-white px-3 py-3 font-black disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Scatter whistle
          {hud.scatterCool > 0 && phase === 'playing' ? ` (${hud.scatterCool})` : ''}
        </button>
      </div>

      <p className="text-xs text-muted">
        This field: {spec.sheep} sheep, {gateCount} {gateCount === 1 ? 'gate' : 'gates'}
        {spec.stubborn ? `, ${spec.stubborn} stubborn` : ''}. Keyboard: arrows or WASD to
        run, Space or Q to regroup, E to scatter.
      </p>
    </main>
  );
}
export default App;
