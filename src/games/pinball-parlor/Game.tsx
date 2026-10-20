import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  walls: any[];
  bumpers: {
    x: number;
    y: number;
    r: number;
    flash: number;
  }[];
  targets: {
    x: number;
    y: number;
    r: number;
    lit: boolean;
  }[];
  lanes: boolean[];
  flippers: {
    side: number;
    x: number;
    y: number;
    angle: number;
    omega: number;
  }[];
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  balls: number;
  score: number;
  mult: number;
  charge: number;
  nextBallTimer: number;
  stillTime: number;
  message: any;
  over: boolean;
  hudKey?: string;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.05, type = 'square', volume = 0.03) {
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

// ---------- Table geometry (logical units; the canvas scales to fit) ----------

const W = 360;
const H = 640;
const BALL_R = 8;
const GRAVITY = 900; // the pull down a tilted table
const SUBSTEPS = 10; // small physics steps so a fast ball can't pass through a flipper or wall
const MAX_SPEED = 1700;
const LANE_X = 322; // inner wall of the plunger lane
const OUTER_X = 348;
const PLUNGER_Y = 600;
const FLIPPER_LEN = 52;
const FLIPPER_R = 7;
const FLIPPER_REST = 0.52; // radians below horizontal
const FLIPPER_UP = -0.42;
const BUMPER_KICK = 520;
const SLING_KICK = 420;
const BEST_KEY = 'pinball-parlor-best';
const seg = (x1, y1, x2, y2, extra = {}) => ({
  x1,
  y1,
  x2,
  y2,
  r: 0,
  ...extra,
});
function buildWalls() {
  const walls = [];

  // Rounded top of the cabinet, as a chain of short segments
  const cx = 180;
  const cy = 140;
  const rx = 168;
  const ry = 112;
  const parts = 22;
  for (let i = 0; i < parts; i++) {
    const a1 = Math.PI + (i / parts) * Math.PI;
    const a2 = Math.PI + ((i + 1) / parts) * Math.PI;
    walls.push(
      seg(
        cx + Math.cos(a1) * rx,
        cy + Math.sin(a1) * ry,
        cx + Math.cos(a2) * rx,
        cy + Math.sin(a2) * ry,
      ),
    );
  }
  walls.push(seg(12, 140, 12, 460)); // left wall
  walls.push(seg(12, 460, 93, 534)); // left funnel down to the flipper
  walls.push(seg(LANE_X, 460, 241, 534)); // right funnel
  walls.push(seg(LANE_X, 180, LANE_X, H)); // plunger lane, inner wall
  walls.push(seg(OUTER_X, 140, OUTER_X, H)); // plunger lane, outer wall
  walls.push(
    seg(OUTER_X, 148, LANE_X + 1, 180, {
      r: 2,
      oneWay: true,
    }),
  ); // gate: lets the ball out, never back in

  // Top rollover lane dividers
  [96, 143, 190, 237].forEach((x) =>
    walls.push(
      seg(x, 78, x, 110, {
        r: 2.5,
      }),
    ),
  );

  // Slingshots: two static edges and one rubber kicker face each
  const slings = [
    [
      [44, 378],
      [44, 452],
      [86, 480],
    ],
    [
      [290, 378],
      [290, 452],
      [248, 480],
    ],
  ];
  slings.forEach(([p1, p2, p3]) => {
    walls.push(
      seg(p1[0], p1[1], p2[0], p2[1], {
        r: 2,
      }),
    );
    walls.push(
      seg(p2[0], p2[1], p3[0], p3[1], {
        r: 2,
      }),
    );
    walls.push(
      seg(p1[0], p1[1], p3[0], p3[1], {
        r: 3,
        kicker: true,
        flash: 0,
      }),
    );
  });
  return walls;
}
const LANES = [119.5, 166.5, 213.5];
function newGame() {
  return {
    walls: buildWalls(),
    bumpers: [
      {
        x: 115,
        y: 215,
        r: 19,
        flash: 0,
      },
      {
        x: 220,
        y: 215,
        r: 19,
        flash: 0,
      },
      {
        x: 167,
        y: 295,
        r: 19,
        flash: 0,
      },
    ],
    targets: [
      {
        x: 44,
        y: 250,
        r: 8,
        lit: false,
      },
      {
        x: 44,
        y: 290,
        r: 8,
        lit: false,
      },
      {
        x: 44,
        y: 330,
        r: 8,
        lit: false,
      },
    ],
    lanes: [false, false, false],
    flippers: [
      {
        side: 1,
        x: 101,
        y: 540,
        angle: FLIPPER_REST,
        omega: 0,
      },
      {
        side: -1,
        x: 233,
        y: 540,
        angle: FLIPPER_REST,
        omega: 0,
      },
    ],
    ball: {
      x: 335,
      y: PLUNGER_Y - BALL_R,
      vx: 0,
      vy: 0,
    },
    balls: 3,
    score: 0,
    mult: 1,
    charge: 0,
    nextBallTimer: 0,
    stillTime: 0,
    message: null,
    over: false,
  } as GameState;
}

// Flipper tip. side 1 points right from a left pivot, side -1 points left from a right pivot.
const flipperTip = (f) => ({
  x: f.x + f.side * Math.cos(f.angle) * FLIPPER_LEN,
  y: f.y + Math.sin(f.angle) * FLIPPER_LEN,
});
function closestOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return {
    x: x1 + dx * t,
    y: y1 + dy * t,
  };
}

// Pushes the ball out of contact and bounces it. Returns the contact normal, or null if not touching.
function resolveContact(b, px, py, radius, restitution, surfaceVx = 0, surfaceVy = 0) {
  let nx = b.x - px;
  let ny = b.y - py;
  const d = Math.hypot(nx, ny);
  if (d >= BALL_R + radius || d === 0) return null;
  nx /= d;
  ny /= d;
  b.x = px + nx * (BALL_R + radius);
  b.y = py + ny * (BALL_R + radius);

  // Bounce relative to the moving surface, so a swinging flipper hands its speed to the ball.
  const rvx = b.vx - surfaceVx;
  const rvy = b.vy - surfaceVy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
  }
  return {
    nx,
    ny,
    vn,
  };
}

// Makes sure the ball leaves along the normal at least this fast.
function kick(b, n, speed) {
  const out = b.vx * n.nx + b.vy * n.ny;
  if (out < speed) {
    b.vx += (speed - out) * n.nx;
    b.vy += (speed - out) * n.ny;
  }
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Pinball Parlor');

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
  const input = useRef({
    leftKey: false,
    rightKey: false,
    plungerKey: false,
    pointers: new Map(),
  });
  const [hud, setHud] = useState({
    score: 0,
    balls: 3,
    mult: 1,
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
    input.current.pointers.clear();
    setHud({
      score: 0,
      balls: 3,
      mult: 1,
    });
    setPhase('playing');
    playTone(660, 0.1, 'triangle', 0.04);
  };
  const held = (name) => {
    const inp = input.current;
    if (name === 'left' && inp.leftKey) return true;
    if (name === 'right' && inp.rightKey) return true;
    if (name === 'plunger' && inp.plungerKey) return true;
    return [...inp.pointers.values()].includes(name);
  };
  const ballInLane = (g) => g.ball && g.ball.x > LANE_X && g.ball.y > 520;

  // Fires the plunger when it is let go of.
  const releasePlunger = () => {
    const g = game.current;
    if (phaseRef.current === 'playing' && ballInLane(g) && g.charge > 0.05) {
      // The plunger springs back to rest, carrying the ball with it.
      g.ball.y = Math.min(g.ball.y, PLUNGER_Y - BALL_R);
      g.ball.vy = -(450 + 1050 * g.charge);
      playTone(220 + g.charge * 300, 0.12, 'sawtooth', 0.03);
    }
    g.charge = 0;
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
    const addScore = (g, points) => {
      g.score += points * g.mult;
    };
    const flash = (g, text) => {
      g.message = {
        text,
        t: 1.6,
      };
    };
    const raiseMultiplier = (g, bonus) => {
      g.mult = Math.min(5, g.mult + 1);
      addScore(g, bonus);
      flash(g, `Multiplier ×${g.mult}`);
      [784, 988, 1175, 1568].forEach((f, k) =>
        setTimeout(() => playTone(f, 0.09, 'square', 0.03), k * 80),
      );
    };

    // ---------- Physics ----------

    const physicsStep = (g, h) => {
      // Flippers swing toward their target angle; their angular speed is kept for the ball contact.
      g.flippers.forEach((f) => {
        const up = held(f.side === 1 ? 'left' : 'right');
        const target = up ? FLIPPER_UP : FLIPPER_REST;
        const speed = up ? 24 : 14;
        const prev = f.angle;
        if (f.angle > target) f.angle = Math.max(target, f.angle - speed * h);
        else f.angle = Math.min(target, f.angle + speed * h);
        f.omega = (f.angle - prev) / h;
      });
      const b = g.ball;
      if (!b) return;
      b.vy += GRAVITY * h;
      b.x += b.vx * h;
      b.y += b.vy * h;

      // Walls, rails and slingshots
      for (const s of g.walls) {
        // The lane gate only stops a ball that is falling back toward the plunger.
        if (s.oneWay && b.vy <= 0) continue;
        const p = closestOnSegment(b.x, b.y, s.x1, s.y1, s.x2, s.y2);
        const n = resolveContact(b, p.x, p.y, s.r, s.kicker ? 0.5 : 0.45);
        if (n && s.kicker && n.vn < -40) {
          kick(b, n, SLING_KICK);
          s.flash = 1;
          addScore(g, 25);
          playTone(520, 0.05, 'square', 0.03);
        }
      }

      // Plunger top
      const plungerTop = PLUNGER_Y + g.charge * 28;
      const pp = closestOnSegment(b.x, b.y, LANE_X, plungerTop, OUTER_X, plungerTop);
      resolveContact(b, pp.x, pp.y, 0, 0.2);

      // Pop bumpers
      for (const bump of g.bumpers) {
        const n = resolveContact(b, bump.x, bump.y, bump.r, 0.6);
        if (n) {
          kick(b, n, BUMPER_KICK);
          bump.flash = 1;
          addScore(g, 100);
          playTone(880 + Math.random() * 120, 0.06, 'square', 0.035);
        }
      }

      // Stand-up targets
      for (const tg of g.targets) {
        const n = resolveContact(b, tg.x, tg.y, tg.r, 0.5);
        if (n && !tg.lit) {
          tg.lit = true;
          addScore(g, 75);
          playTone(1320, 0.05, 'triangle', 0.04);
          if (g.targets.every((x) => x.lit)) {
            g.targets.forEach((x) => {
              x.lit = false;
            });
            raiseMultiplier(g, 750);
          }
        }
      }

      // Flippers: a capsule from pivot to tip, moving with the flipper's angular speed.
      for (const f of g.flippers) {
        const tip = flipperTip(f);
        const p = closestOnSegment(b.x, b.y, f.x, f.y, tip.x, tip.y);
        const rx = p.x - f.x;
        const ry = p.y - f.y;
        const svx = f.side * f.omega * -ry;
        const svy = f.side * f.omega * rx;
        resolveContact(b, p.x, p.y, FLIPPER_R, 0.25, svx, svy);
      }

      // Top rollover lanes light as the ball passes through.
      if (b.y > 86 && b.y < 104) {
        LANES.forEach((lx, i) => {
          if (!g.lanes[i] && Math.abs(b.x - lx) < 14) {
            g.lanes[i] = true;
            addScore(g, 50);
            playTone(1047, 0.06, 'triangle', 0.035);
            if (g.lanes.every(Boolean)) {
              g.lanes = [false, false, false];
              raiseMultiplier(g, 500);
            }
          }
        });
      }
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) {
        b.vx *= MAX_SPEED / speed;
        b.vy *= MAX_SPEED / speed;
      }
    };
    const update = (dt) => {
      const g = game.current;
      g.walls.forEach((s) => {
        if (s.kicker) s.flash = Math.max(0, s.flash - dt * 5);
      });
      g.bumpers.forEach((bump) => {
        bump.flash = Math.max(0, bump.flash - dt * 5);
      });
      if (g.message) {
        g.message.t -= dt;
        if (g.message.t <= 0) g.message = null;
      }
      if (phaseRef.current !== 'playing' || g.over) {
        // Keep the flippers relaxed behind the menus.
        return;
      }

      // Plunger charges while held with the ball resting on it.
      if (held('plunger') && ballInLane(g)) g.charge = Math.min(1, g.charge + dt / 1.1);
      for (let s = 0; s < SUBSTEPS; s++) physicsStep(g, dt / SUBSTEPS);
      const b = g.ball;
      if (b) {
        // A ball that has come to rest somewhere odd gets a little shake.
        const resting =
          Math.hypot(b.vx, b.vy) < 15 &&
          !ballInLane(g) &&
          !held('left') &&
          !held('right');
        g.stillTime = resting ? g.stillTime + dt : 0;
        if (g.stillTime > 2.5) {
          b.vy -= 300;
          b.vx += (Math.random() - 0.5) * 200;
          g.stillTime = 0;
        }

        // Drained
        if (b.y > H + 20) {
          g.ball = null;
          g.balls--;
          g.mult = 1;
          g.lanes = [false, false, false];
          playTone(150, 0.5, 'sawtooth', 0.04);
          if (g.balls <= 0) {
            g.over = true;
            setHud({
              score: g.score,
              balls: 0,
              mult: 1,
            });
            setTimeout(() => {
              setPhase('over');
              setBest((prev) => {
                const next = Math.max(prev, g.score);
                try {
                  localStorage.setItem(BEST_KEY, String(next));
                } catch (e) {
                  /* storage unavailable */
                }
                return next;
              });
            }, 900);
          } else {
            g.nextBallTimer = 1.2;
            flash(g, `Ball ${4 - g.balls}`);
          }
        }
      } else if (g.nextBallTimer > 0) {
        g.nextBallTimer -= dt;
        if (g.nextBallTimer <= 0)
          g.ball = {
            x: 335,
            y: PLUNGER_Y - BALL_R,
            vx: 0,
            vy: 0,
          };
      }
      const hudKey = `${g.score}|${g.balls}|${g.mult}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.score,
          balls: g.balls,
          mult: g.mult,
        });
      }
    };

    // ---------- Drawing ----------

    const drawStar = (x, y, outer, inner, points) => {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer;
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      const t = now / 1000;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Cabinet surround and cherry playfield
      ctx.fillStyle = '#2b0c12';
      ctx.fillRect(0, 0, W, H);
      const field = ctx.createRadialGradient(170, 300, 40, 170, 300, 420);
      field.addColorStop(0, '#c41f35');
      field.addColorStop(1, '#6e0e1c');
      ctx.fillStyle = field;
      ctx.beginPath();
      ctx.ellipse(180, 140, 168, 112, 0, Math.PI, 0);
      ctx.lineTo(OUTER_X, H);
      ctx.lineTo(12, H);
      ctx.closePath();
      ctx.fill();

      // Atomic-age starbursts printed on the playfield
      ctx.strokeStyle = 'rgba(205, 238, 226, 0.22)';
      ctx.lineWidth = 1.5;
      [
        [70, 170],
        [270, 330],
        [120, 420],
        [250, 140],
      ].forEach(([x, y], i) => {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + i;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
          ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
          ctx.stroke();
        }
      });

      // Checkerboard apron below the funnels
      const apron = (points) => {
        ctx.save();
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.clip();
        for (let y = 440; y < H; y += 12) {
          for (let x = 0; x < W; x += 12) {
            ctx.fillStyle = ((x + y) / 12) % 2 ? '#1c1c1c' : '#f4efe3';
            ctx.fillRect(x, y, 12, 12);
          }
        }
        ctx.restore();
      };
      apron([
        [12, 460],
        [93, 534],
        [93, H],
        [12, H],
      ]);
      apron([
        [LANE_X, 460],
        [241, 534],
        [241, H],
        [LANE_X, H],
      ]);

      // Plunger lane floor
      ctx.fillStyle = '#4a0a15';
      ctx.fillRect(LANE_X, 180, OUTER_X - LANE_X, H - 180);

      // Rollover lanes
      LANES.forEach((lx, i) => {
        ctx.fillStyle = g.lanes[i] ? '#ffe9a8' : 'rgba(255, 246, 226, 0.25)';
        ctx.beginPath();
        ctx.moveTo(lx, 88);
        ctx.lineTo(lx + 7, 100);
        ctx.lineTo(lx - 7, 100);
        ctx.closePath();
        ctx.fill();
        if (g.lanes[i]) {
          ctx.fillStyle = 'rgba(255, 233, 168, 0.25)';
          ctx.beginPath();
          ctx.arc(lx, 96, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Walls in chrome; slingshot kickers in white rubber
      ctx.lineCap = 'round';
      for (const s of g.walls) {
        if (s.kicker) {
          ctx.strokeStyle = s.flash > 0 ? '#ffffff' : '#f4efe3';
          ctx.lineWidth = 6 + s.flash * 3;
        } else {
          ctx.strokeStyle = '#c7d1d6';
          ctx.lineWidth = Math.max(4, s.r * 2);
        }
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      // Slingshot bodies
      ctx.fillStyle = 'rgba(255, 246, 226, 0.18)';
      [
        [
          [44, 378],
          [44, 452],
          [86, 480],
        ],
        [
          [290, 378],
          [290, 452],
          [248, 480],
        ],
      ].forEach((tri) => {
        ctx.beginPath();
        tri.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.fill();
      });

      // Stand-up targets
      for (const tg of g.targets) {
        ctx.fillStyle = tg.lit ? '#8ff0c9' : '#2f6b5a';
        ctx.strokeStyle = '#c7d1d6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Pop bumpers: chrome skirt, cherry cap, cream star
      for (const bump of g.bumpers) {
        const chrome = ctx.createRadialGradient(
          bump.x - 6,
          bump.y - 6,
          2,
          bump.x,
          bump.y,
          bump.r + 4,
        );
        chrome.addColorStop(0, '#ffffff');
        chrome.addColorStop(1, '#8c979d');
        ctx.fillStyle = chrome;
        ctx.beginPath();
        ctx.arc(bump.x, bump.y, bump.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bump.flash > 0 ? '#ff8a99' : '#e8344d';
        ctx.beginPath();
        ctx.arc(bump.x, bump.y, bump.r - 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff6e2';
        drawStar(bump.x, bump.y, 9, 4, 5);
        ctx.fill();
        if (bump.flash > 0) {
          ctx.strokeStyle = `rgba(255, 246, 226, ${bump.flash})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(bump.x, bump.y, bump.r + 8 + (1 - bump.flash) * 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Flippers
      for (const f of g.flippers) {
        const tip = flipperTip(f);
        ctx.strokeStyle = '#d7263d';
        ctx.lineWidth = FLIPPER_R * 2 + 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.strokeStyle = '#fff6e2';
        ctx.lineWidth = FLIPPER_R * 2 - 4;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.fillStyle = '#c7d1d6';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Plunger rod and knob
      const plungerTop = PLUNGER_Y + g.charge * 28;
      ctx.fillStyle = '#c7d1d6';
      ctx.fillRect(LANE_X + 3, plungerTop, OUTER_X - LANE_X - 6, 6);
      ctx.fillRect(335 - 3, plungerTop + 6, 6, H - plungerTop);
      if (g.charge > 0) {
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(LANE_X + 4, PLUNGER_Y - 60, 4, -g.charge * 80);
      }

      // Ball in polished chrome
      if (g.ball) {
        const b = g.ball;
        const grad = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#c7d1d6');
        grad.addColorStop(1, '#5b666c');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Launch hint while the ball waits on the plunger
      if (phaseRef.current === 'playing' && ballInLane(g) && g.charge === 0) {
        ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.4;
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.moveTo(335, 520);
        ctx.lineTo(342, 532);
        ctx.lineTo(328, 532);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (g.message) {
        ctx.globalAlpha = Math.min(1, g.message.t * 2);
        ctx.fillStyle = '#fff6e2';
        ctx.font = '34px Yellowtail, cursive';
        ctx.textAlign = 'center';
        ctx.fillText(g.message.text, 167, 380);
        ctx.globalAlpha = 1;
      }
    };
    const frame = (now) => {
      const dt = Math.min(0.025, (now - last) / 1000);
      last = now;
      update(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---------- Keyboard ----------

    const LEFT_KEYS = ['ArrowLeft', 'z', 'Z', 'a', 'A'];
    const RIGHT_KEYS = ['ArrowRight', '/', 'm', 'M', 'd', 'D'];
    const PLUNGER_KEYS = [' ', 'ArrowDown', 's', 'S'];
    const onKeyDown = (e) => {
      if (phaseRef.current !== 'playing') {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
        return;
      }
      const inp = input.current;
      if (LEFT_KEYS.includes(e.key) || e.code === 'ShiftLeft') {
        e.preventDefault();
        if (!inp.leftKey) playTone(140, 0.03, 'square', 0.02);
        inp.leftKey = true;
      }
      if (RIGHT_KEYS.includes(e.key) || e.code === 'ShiftRight') {
        e.preventDefault();
        if (!inp.rightKey) playTone(150, 0.03, 'square', 0.02);
        inp.rightKey = true;
      }
      if (PLUNGER_KEYS.includes(e.key)) {
        e.preventDefault();
        if (!e.repeat) inp.plungerKey = true;
      }
    };
    const onKeyUp = (e) => {
      const inp = input.current;
      if (LEFT_KEYS.includes(e.key) || e.code === 'ShiftLeft') inp.leftKey = false;
      if (RIGHT_KEYS.includes(e.key) || e.code === 'ShiftRight') inp.rightKey = false;
      if (PLUNGER_KEYS.includes(e.key) && inp.plungerKey) {
        inp.plungerKey = false;
        releasePlunger();
      }
    };
    const onBlur = () => {
      input.current.leftKey = false;
      input.current.rightKey = false;
      input.current.plungerKey = false;
      input.current.pointers.clear();
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

  // ---------- Pointer and touch ----------
  // While the ball waits on the plunger, press and hold anywhere to pull it back. Otherwise the left half of the
  // table works the left flipper and the right half the right one. Several fingers at once are fine.

  const onPointerDown = (e) => {
    if (phaseRef.current !== 'playing') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture not supported */
    }
    const g = game.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let role = x < W / 2 ? 'left' : 'right';
    if (ballInLane(g)) role = 'plunger';
    if (role !== 'plunger') playTone(140, 0.03, 'square', 0.02);
    input.current.pointers.set(e.pointerId, role);
  };
  const onPointerUp = (e) => {
    const role = input.current.pointers.get(e.pointerId);
    input.current.pointers.delete(e.pointerId);
    if (role === 'plunger') releasePlunger();
  };
  return (
    <main className="font-body max-w-[520px] mx-auto py-4 flex flex-col gap-3">
      <header
        className="rounded-2xl bg-cream px-4 py-2 flex items-center justify-between gap-x-3 gap-y-1 flex-wrap"
        style={{
          boxShadow: 'inset 0 0 0 3px #c7d1d6, 0 4px 0 #8c979d',
        }}
      >
        <h1 className="font-display text-[clamp(32px,9vw,46px)] leading-none text-cherry">
          Pinball Parlor
        </h1>
        <div className="text-right uppercase tracking-wider">
          <div className="text-2xl font-bold leading-none tabular-nums">{hud.score}</div>
          <div className="text-xs text-muted">
            Ball {Math.min(3, 4 - Math.max(1, hud.balls))} of 3 · ×{hud.mult} · Best{' '}
            {Math.max(best, hud.score)}
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: `min(100%, calc((100dvh - 160px) * ${W / H}))`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Pinball table. Left and right halves work the flippers; hold to pull the plunger."
          className="w-full block rounded-[28px] touch-none select-none"
          style={{
            aspectRatio: `${W} / ${H}`,
            boxShadow:
              '0 0 0 6px #c7d1d6, 0 0 0 9px #8c979d, 0 24px 50px rgba(43,12,18,.4)',
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-[28px] bg-card text-cream flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="font-display text-5xl">
              {phase === 'over' ? 'Game over' : 'Insert a dime'}
            </p>
            <p className="max-w-[30ch] opacity-90 text-lg">
              {phase === 'over'
                ? `Final score ${hud.score}. Best ${Math.max(best, hud.score)}.`
                : 'Pull back the plunger and let it go to launch. Keep the ball alive with the flippers. Light all three top lanes, or all three green targets, to raise the multiplier. You have three balls.'}
            </p>
            <p className="text-sm opacity-75 max-w-[32ch]">
              Keys: Left and Right arrows (or Z and M) flip, hold Space to pull the
              plunger. Touch: tap the left or right half.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-3xl px-8 py-1 rounded-full bg-cream text-cherry shadow-[0_5px_0_#8c979d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cream"
            >
              {phase === 'over' ? 'Play again' : 'Play'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
