import type { KeyboardState } from '../../shared/input';
import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

type GameState = {
  frames: any[][];
  frameIdx: number;
  standing: any[];
  pins: {
    id: number;
    r: number;
    x: any;
    y: any;
    vx: number;
    vy: number;
    angle: number;
    down: boolean;
    gone: boolean;
    wasStanding: any;
  }[];
  ballX: number;
  ball: any;
  stage: string;
  stageT: number;
  aim: number;
  power: number;
  spin: number;
  keys: Record<string, boolean>;
  message: string;
  resultT: number;
  settleT: number;
  over: boolean;
  hudKey: string;
  gameOver?: boolean;
};

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

// ---------- Lane geometry ----------
// Top-down view in lane units (roughly 3.6 units per inch). Pins at the top, the bowler at the bottom.

const W = 200;
const H = 520;
const LANE_L = 25;
const LANE_R = 175;
const GUTTER_L_X = 13;
const GUTTER_R_X = 187;
const BALL_R = 15;
const PIN_R = 8.5;
const PIN_GAP = 43;
const HEAD_PIN_Y = 150;
const FOUL_Y = 462;
const BALL_START_Y = 490;
const HOOK_START_Y = 300;
const HOOK_ACCEL = 260;
const AIM_MAX = 0.14;
const BALL_MASS = 4.5;
const STORAGE_KEY = 'lane-ten-best';

// Pins 1-10: the head pin, then rows of 2, 3 and 4 behind it.
const PIN_SPOTS = [];
for (let row = 0; row < 4; row++) {
  for (let i = 0; i <= row; i++) {
    PIN_SPOTS.push({
      x: W / 2 + (i - row / 2) * PIN_GAP,
      y: HEAD_PIN_Y - row * PIN_GAP * 0.866,
    });
  }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- Scoring ----------

// Running totals for each frame; null while a frame still waits for bonus balls.
function frameScores(frames) {
  const rolls = frames.flat();
  const out = [];
  let total = 0;
  let idx = 0;
  let known = true;
  for (let f = 0; f < 10; f++) {
    const fr = frames[f];
    let value = null;
    if (f < 9) {
      if (fr.length >= 1 && fr[0] === 10) {
        // Strike: ten plus the next two balls.
        if (rolls[idx + 1] !== undefined && rolls[idx + 2] !== undefined)
          value = 10 + rolls[idx + 1] + rolls[idx + 2];
        idx += 1;
      } else if (fr.length === 2) {
        if (fr[0] + fr[1] === 10) {
          // Spare: ten plus the next ball.
          if (rolls[idx + 2] !== undefined) value = 10 + rolls[idx + 2];
        } else {
          value = fr[0] + fr[1];
        }
        idx += 2;
      } else {
        idx += fr.length;
      }
    } else {
      // The tenth frame simply adds up its own two or three balls.
      const done = fr.length === 3 || (fr.length === 2 && fr[0] + fr[1] < 10);
      if (done) value = fr.reduce((a, b) => a + b, 0);
    }
    if (value === null) known = false;
    if (known) {
      total += value;
      out.push(total);
    } else {
      out.push(null);
    }
  }
  return out;
}

// Scoresheet marks: X strike, / spare, - a miss.
function frameMarks(fr, f) {
  const m = ['', '', ''];
  const digit = (n) => (n === 0 ? '-' : String(n));
  if (f < 9) {
    if (fr[0] === 10) {
      m[1] = 'X';
      return m;
    }
    if (fr.length >= 1) m[0] = digit(fr[0]);
    if (fr.length >= 2) m[1] = fr[0] + fr[1] === 10 ? '/' : digit(fr[1]);
    return m;
  }
  const [a, b, c] = fr;
  if (a !== undefined) m[0] = a === 10 ? 'X' : digit(a);
  if (b !== undefined) {
    if (a === 10) m[1] = b === 10 ? 'X' : digit(b);
    else m[1] = a + b === 10 ? '/' : digit(b);
  }
  if (c !== undefined) {
    // After a strike then a non-strike, the third ball can make a spare.
    if (a === 10 && b !== 10) m[2] = b + c === 10 ? '/' : digit(c);
    else m[2] = c === 10 ? 'X' : digit(c);
  }
  return m;
}

// ---------- Game state ----------

function rackPins(standing) {
  return PIN_SPOTS.map((spot, i) => ({
    id: i,
    r: PIN_R,
    x: spot.x,
    y: spot.y,
    vx: 0,
    vy: 0,
    angle: 0,
    down: false,
    gone: !standing[i],
    wasStanding: standing[i],
  }));
}

function newGame() {
  const standing = Array(10).fill(true);
  return {
    frames: [[], [], [], [], [], [], [], [], [], []],
    frameIdx: 0,
    standing,
    pins: rackPins(standing),
    ballX: W / 2,
    ball: null,
    stage: 'position',
    stageT: 0,
    aim: 0,
    power: 0,
    spin: 0,
    keys: {} as KeyboardState,
    message: '',
    resultT: 0,
    settleT: 0,
    over: false,
    hudKey: '',
  } as GameState;
}

function setStage(g, stage) {
  g.stage = stage;
  g.stageT = 0;
}

// Elastic circle collision. Returns the closing speed, or -1 when the circles are not touching.
function resolve(a, b, ma, mb, e) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;
  if (d >= minD || d === 0) return -1;
  const nx = dx / d;
  const ny = dy / d;

  // Push apart in proportion to mass.
  const overlap = minD - d;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return 0;
  const j = (-(1 + e) * vn) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vy -= (j / ma) * ny;
  b.vx += (j / mb) * nx;
  b.vy += (j / mb) * ny;
  return -vn;
}

function simulate(g, dt) {
  const steps = 6;
  const h = dt / steps;
  const b = g.ball;
  const live = g.pins.filter((p) => !p.gone);
  let clatter = 0;
  for (let s = 0; s < steps; s++) {
    if (b && b.active) {
      // Oil runs out on the back end, so the spin only bites in the last stretch.
      if (!b.inGutter && b.y < HOOK_START_Y) b.vx += b.spin * HOOK_ACCEL * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.rot += (Math.hypot(b.vx, b.vy) * h) / BALL_R;
      if (!b.inGutter && (b.x < LANE_L || b.x > LANE_R)) {
        b.inGutter = true;
        b.x = b.x < LANE_L ? GUTTER_L_X : GUTTER_R_X;
        b.vx = 0;
        playTone(110, 0.4, 'sawtooth', 0.02);
      }
      if (b.y < -BALL_R * 2) b.active = false;
    }
    for (const p of live) {
      p.x += p.vx * h;
      p.y += p.vy * h;
      const drag = Math.exp((p.down ? -1.1 : -12) * h);
      p.vx *= drag;
      p.vy *= drag;
      if (p.down && Math.hypot(p.vx, p.vy) > 5) p.angle = Math.atan2(p.vy, p.vx);

      // Side kickbacks bounce flying pins back onto the deck.
      if (p.y < HEAD_PIN_Y + 40) {
        if (p.x < 1 + PIN_R) {
          p.x = 1 + PIN_R;
          p.vx = Math.abs(p.vx) * 0.5;
        }
        if (p.x > W - 1 - PIN_R) {
          p.x = W - 1 - PIN_R;
          p.vx = -Math.abs(p.vx) * 0.5;
        }
      }
      if (p.x < LANE_L || p.x > LANE_R) p.down = true;
      if (p.y < -PIN_R || p.y > H || p.x < -PIN_R || p.x > W + PIN_R) {
        p.down = true;
        p.gone = true;
      }
    }

    // Ball against pins: any touch from the heavy ball knocks a pin down.
    if (b && b.active && !b.inGutter) {
      for (const p of live) {
        if (p.gone) continue;
        const impact = resolve(b, p, BALL_MASS, 1, 0.7);
        if (impact >= 0) {
          if (!p.down) clatter = Math.max(clatter, 2);
          p.down = true;
        }
      }
    }

    // Pins against pins: a hard enough knock topples the other pin too.
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const p = live[i];
        const q = live[j];
        if (p.gone || q.gone) continue;
        const impact = resolve(p, q, 1, 1, 0.8);
        if (impact > 25) {
          if (!p.down || !q.down) clatter = Math.max(clatter, 1);
          p.down = true;
          q.down = true;
        }
      }
    }
  }
  if (clatter)
    playTone(
      clatter === 2 ? 340 + Math.random() * 80 : 600 + Math.random() * 300,
      0.05,
      'square',
      0.03,
    );
}

// ---------- App ----------

const INSTRUCTIONS = {
  position: 'Step 1 · Slide to where you stand, then tap to set.',
  aim: 'Step 2 · Tap to lock the swinging aim arrow.',
  power: 'Step 3 · Tap to lock your power.',
  spin: 'Step 4 · Tap to lock the hook. Left or right curls the ball late.',
  rolling: 'Rolling…',
  settle: 'Rolling…',
  result: '',
};
const BUTTON_LABEL = {
  position: 'Set position',
  aim: 'Lock aim',
  power: 'Lock power',
  spin: 'Bowl!',
};
function readBest() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function App() {
  usePageStyles(styles, 'Lane Ten');

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
  const [phase, setPhase] = useState('menu');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [hud, setHud] = useState({
    frames: game.current.frames,
    frameIdx: 0,
    stage: 'position',
    message: '',
  });
  const [best, setBest] = useState(readBest);
  const start = () => {
    game.current = newGame();
    setPhase('playing');
    playTone(440, 0.1, 'sine', 0.04);
  };

  // One tap/keypress moves the current step forward.
  const advance = () => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing') return;
    if (g.stage === 'position') {
      setStage(g, 'aim');
      playTone(500, 0.05);
    } else if (g.stage === 'aim') {
      setStage(g, 'power');
      playTone(600, 0.05);
    } else if (g.stage === 'power') {
      setStage(g, 'spin');
      playTone(700, 0.05);
    } else if (g.stage === 'spin') {
      const speed = 220 + g.power * 260;
      g.ball = {
        x: g.ballX,
        y: BALL_START_Y,
        r: BALL_R,
        vx: Math.sin(g.aim) * speed,
        vy: -Math.cos(g.aim) * speed,
        spin: g.spin,
        rot: 0,
        active: true,
        inGutter: false,
      };
      setStage(g, 'rolling');
      playTone(90, 0.6, 'sine', 0.05);
    }
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
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

    // Count the pins, write the ball on the sheet and decide what gets re-racked.
    const finishRoll = (g) => {
      const knocked = g.pins.filter((p) => p.wasStanding && p.down).length;
      const freshRack = g.standing.every(Boolean);
      const newStanding = g.standing.map((st, i) => st && !g.pins[i].down);
      const f = g.frameIdx;
      const rolls = g.frames[f];
      rolls.push(knocked);
      let frameDone = false;
      let reset = false;
      if (f < 9) {
        frameDone = (rolls.length === 1 && knocked === 10) || rolls.length === 2;
        reset = frameDone;
      } else if (rolls.length === 1) {
        reset = knocked === 10;
      } else if (rolls.length === 2) {
        const [a, b] = rolls;
        if (a === 10) reset = b === 10;
        else if (a + b === 10) reset = true;
        else frameDone = true;
      } else {
        frameDone = true;
      }
      if (freshRack && knocked === 10) {
        g.message = 'STRIKE!';
        [523, 659, 784, 1047].forEach((fq, k) =>
          setTimeout(() => playTone(fq, 0.15, 'square', 0.035), k * 90),
        );
      } else if (!freshRack && newStanding.every((st) => !st)) {
        g.message = 'SPARE!';
        [659, 880].forEach((fq, k) =>
          setTimeout(() => playTone(fq, 0.15, 'square', 0.035), k * 110),
        );
      } else if (knocked === 0) {
        g.message = g.ball && g.ball.inGutter ? 'Gutter ball' : 'Missed';
      } else {
        g.message = `${knocked} pin${knocked === 1 ? '' : 's'}`;
      }
      if (frameDone && f === 9) {
        g.gameOver = true;
      } else if (frameDone) {
        g.frameIdx += 1;
        g.standing = Array(10).fill(true);
      } else if (reset) {
        g.standing = Array(10).fill(true);
      } else {
        g.standing = newStanding;
      }
      g.resultT = 1.5;
      setStage(g, 'result');
    };
    const endGame = (g) => {
      g.over = true;
      const total = frameScores(g.frames)[9] || 0;
      setBest((b) => {
        const next = Math.max(b, total);
        try {
          localStorage.setItem(STORAGE_KEY, String(next));
        } catch (e) {
          /* storage unavailable */
        }
        return next;
      });
      setPhase('over');
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || g.over || phaseRef.current !== 'playing') return;
      g.stageT += dt;
      if (g.stage === 'position') {
        const dir = (g.keys.right ? 1 : 0) - (g.keys.left ? 1 : 0);
        g.ballX = clamp(g.ballX + dir * 70 * dt, LANE_L + BALL_R, LANE_R - BALL_R);
      } else if (g.stage === 'aim') {
        g.aim = AIM_MAX * Math.sin(g.stageT * 2.2);
      } else if (g.stage === 'power') {
        g.power = 0.5 - 0.5 * Math.cos(g.stageT * 3.2);
      } else if (g.stage === 'spin') {
        g.spin = Math.sin(g.stageT * 2.6);
      } else if (g.stage === 'rolling' || g.stage === 'settle') {
        simulate(g, dt);
        // Safety net: a ball that somehow stalls on the lane is taken away after a few seconds.
        if (g.stage === 'rolling' && g.stageT > 6) g.ball.active = false;
        if (g.stage === 'rolling' && !g.ball.active) {
          setStage(g, 'settle');
        }
        if (g.stage === 'settle') {
          const moving = g.pins.some((p) => !p.gone && Math.hypot(p.vx, p.vy) > 3);
          if ((!moving && g.stageT > 0.4) || g.stageT > 2.5) finishRoll(g);
        }
      } else if (g.stage === 'result') {
        g.resultT -= dt;
        if (g.resultT <= 0) {
          if (g.gameOver) {
            endGame(g);
          } else {
            g.pins = rackPins(g.standing);
            g.ball = null;
            g.message = '';
            setStage(g, 'position');
          }
        }
      }
      const hudKey = `${g.stage}|${g.frameIdx}|${g.message}|${JSON.stringify(g.frames)}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          frames: g.frames.map((fr) => [...fr]),
          frameIdx: g.frameIdx,
          stage: g.stage,
          message: g.message,
        });
      }
    };

    // ---------- Drawing ----------

    const drawLane = () => {
      // Outer caps and gutters
      ctx.fillStyle = '#1b1410';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(1, 0, LANE_L - 1, FOUL_Y);
      ctx.fillRect(LANE_R, 0, W - 1 - LANE_R, FOUL_Y);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(GUTTER_L_X - 3, 0, 6, FOUL_Y);
      ctx.fillRect(GUTTER_R_X - 3, 0, 6, FOUL_Y);

      // Maple boards
      const boards = 20;
      const bw = (LANE_R - LANE_L) / boards;
      for (let i = 0; i < boards; i++) {
        ctx.fillStyle = i % 2 ? '#d9a764' : '#e3b574';
        ctx.fillRect(LANE_L + i * bw, 0, bw + 0.5, FOUL_Y);
      }
      // Pin deck is a touch lighter.
      ctx.fillStyle = 'rgba(255,240,210,0.18)';
      ctx.fillRect(LANE_L, 0, LANE_R - LANE_L, HEAD_PIN_Y + 30);
      // Polished sheen
      const sheen = ctx.createLinearGradient(LANE_L, 0, LANE_R, 0);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.45, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(0.55, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(LANE_L, 0, LANE_R - LANE_L, FOUL_Y);

      // Target arrows and dots
      ctx.fillStyle = '#3a2412';
      for (let i = 0; i < 7; i++) {
        const x = LANE_L + (i + 0.5) * ((LANE_R - LANE_L) / 7);
        const y = 372 + Math.abs(i - 3) * 9;
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x - 3.5, y + 4);
        ctx.lineTo(x + 3.5, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, 430, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Approach and foul line
      ctx.fillStyle = '#c99858';
      ctx.fillRect(1, FOUL_Y, W - 2, H - FOUL_Y);
      ctx.fillStyle = '#d6334a';
      ctx.fillRect(1, FOUL_Y - 1.5, W - 2, 3);

      // Pit at the back
      ctx.fillStyle = '#120d0a';
      ctx.fillRect(0, 0, W, 6);
    };
    const drawPin = (p) => {
      if (p.gone) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.down) {
        // A toppled pin lies on its side.
        ctx.rotate(p.angle);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(1.5, 2, PIN_R * 1.9, PIN_R * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbfaf5';
        ctx.beginPath();
        ctx.ellipse(0, 0, PIN_R * 1.8, PIN_R * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d6334a';
        ctx.fillRect(PIN_R * 0.6, -PIN_R * 0.55, 2.2, PIN_R * 1.1);
        ctx.fillRect(PIN_R * 0.95, -PIN_R * 0.45, 2.2, PIN_R * 0.9);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.arc(1.5, 2.5, PIN_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbfaf5';
        ctx.beginPath();
        ctx.arc(0, 0, PIN_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d6334a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, PIN_R * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-1, -1, PIN_R * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    const drawBall = (x, y, rot) => {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(x + 2, y + 3, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, BALL_R);
      grad.addColorStop(0, '#3fb3b0');
      grad.addColorStop(1, '#0b4a52');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      // Finger holes roll around with the ball.
      ctx.fillStyle = '#062327';
      const holes = [
        [0, -6],
        [-3.5, 1],
        [3.5, 1],
      ];
      const cy = Math.cos(rot);
      holes.forEach(([hx, hy]) => {
        const yy = hy * cy + 4 * Math.sin(rot);
        if (cy > -0.2) {
          ctx.beginPath();
          ctx.arc(x + hx, y + yy, 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };
    const draw = () => {
      const g = game.current;
      const s = canvas.width / W;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      drawLane();
      g.pins.forEach(drawPin);
      if (g.ball) {
        drawBall(g.ball.x, g.ball.y, g.ball.rot);
      } else {
        drawBall(g.ballX, BALL_START_Y, 0);
      }

      // Aim arrow
      if (g.stage === 'aim' || g.stage === 'power' || g.stage === 'spin') {
        const len = 110;
        const ex = g.ballX + Math.sin(g.aim) * len;
        const ey = BALL_START_Y - Math.cos(g.aim) * len;
        ctx.strokeStyle = '#f2b134';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(g.ballX, BALL_START_Y - BALL_R);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f2b134';
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(g.aim);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-6, 3);
        ctx.lineTo(6, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Position guide
      if (g.stage === 'position') {
        ctx.fillStyle = 'rgba(242,177,52,0.9)';
        ctx.beginPath();
        ctx.moveTo(g.ballX - 22, BALL_START_Y);
        ctx.lineTo(g.ballX - 30, BALL_START_Y - 6);
        ctx.lineTo(g.ballX - 30, BALL_START_Y + 6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(g.ballX + 22, BALL_START_Y);
        ctx.lineTo(g.ballX + 30, BALL_START_Y - 6);
        ctx.lineTo(g.ballX + 30, BALL_START_Y + 6);
        ctx.closePath();
        ctx.fill();
      }

      // Power meter (vertical, right side)
      if (g.stage === 'power' || g.stage === 'spin') {
        const mx = W - 18;
        const top = 250;
        const hgt = 160;
        ctx.fillStyle = 'rgba(15,43,47,0.85)';
        ctx.fillRect(mx - 7, top - 4, 14, hgt + 8);
        const fill = ctx.createLinearGradient(0, top + hgt, 0, top);
        fill.addColorStop(0, '#3fb3b0');
        fill.addColorStop(0.7, '#f2b134');
        fill.addColorStop(1, '#d6334a');
        ctx.fillStyle = fill;
        ctx.fillRect(mx - 4, top + hgt * (1 - g.power), 8, hgt * g.power);
      }

      // Spin meter (horizontal, above the foul line)
      if (g.stage === 'spin') {
        const cx = W / 2;
        const y = 445;
        const half = 70;
        ctx.fillStyle = 'rgba(15,43,47,0.85)';
        ctx.fillRect(cx - half - 6, y - 8, half * 2 + 12, 16);
        ctx.fillStyle = 'rgba(246,239,224,0.5)';
        ctx.fillRect(cx - 1, y - 6, 2, 12);
        ctx.fillStyle = '#f2b134';
        ctx.beginPath();
        ctx.arc(cx + g.spin * half, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Result banner
      if (g.stage === 'result' && g.message) {
        ctx.fillStyle = 'rgba(15,43,47,0.88)';
        ctx.fillRect(10, 220, W - 20, 54);
        ctx.fillStyle = g.message.endsWith('!') ? '#f2b134' : '#f6efe0';
        ctx.font = '34px Yellowtail, cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.message, W / 2, 248);
      }
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const KEYS = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      a: 'left',
      d: 'right',
    };
    const onKeyDown = (e) => {
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        game.current.keys[dir] = true;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (phaseRef.current === 'playing') advanceRef.current();
        else startRef.current();
      }
    };
    const onKeyUp = (e) => {
      const dir = KEYS[e.key];
      if (dir) game.current.keys[dir] = false;
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

  // ---------- Pointer ----------
  // While positioning, the ball follows the pointer and releasing sets it. Later steps lock on press.

  const pressedInPosition = useRef(false);
  const slideTo = (e) => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.stage !== 'position') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    g.ballX = clamp(x, LANE_L + BALL_R, LANE_R - BALL_R);
  };
  const onPointerDown = (e) => {
    const g = game.current;
    if (g.stage === 'position') {
      pressedInPosition.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      slideTo(e);
    } else {
      pressedInPosition.current = false;
      advance();
    }
  };
  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse' || pressedInPosition.current) slideTo(e);
  };
  const onPointerUp = () => {
    if (pressedInPosition.current && game.current.stage === 'position') advance();
    pressedInPosition.current = false;
  };

  // ---------- Render ----------

  const scores = frameScores(hud.frames);
  const running = scores.filter((v) => v !== null).pop() || 0;
  const canLock = phase === 'playing' && BUTTON_LABEL[hud.stage];
  return (
    <main className="font-body max-w-[720px] mx-auto py-4 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <h1
          className="font-display text-[clamp(40px,11vw,60px)] leading-none text-mustard"
          style={{
            textShadow: '2px 2px 0 #d6334a',
          }}
        >
          Lane Ten
        </h1>
        <div className="text-right text-sm uppercase tracking-wider text-muted">
          <div>
            Frame <b className="text-ink text-xl">{Math.min(hud.frameIdx + 1, 10)}</b>
          </div>
          <div>Best {best}</div>
        </div>
      </header>

      {/* Classic scoresheet */}
      <div
        className="grid bg-sheet text-sheetInk rounded-md overflow-hidden border-2 border-sheetInk"
        style={{
          gridTemplateColumns: 'repeat(9, minmax(0, 1fr)) minmax(0, 1.45fr)',
        }}
        aria-label="Scoresheet"
      >
        {hud.frames.map((fr, f) => {
          const m = frameMarks(fr, f);
          const boxes = f < 9 ? [m[0], m[1]] : m;
          const current = phase === 'playing' && f === hud.frameIdx;
          return (
            <div
              key={String(String(f))}
              className={`border-r border-sheetInk last:border-r-0 flex flex-col ${current ? 'bg-mustard' : ''}`}
            >
              <div className="text-[9px] text-center border-b border-sheetInk leading-4">
                {f + 1}
              </div>
              <div className="flex justify-end">
                {boxes.map((mark, k) => (
                  <div
                    key={String(String(k))}
                    className={`${f < 9 ? 'w-[45%]' : 'w-1/3'} max-w-[18px] h-4 text-[11px] leading-4 text-center font-bold border-l border-b border-sheetInk ${mark === 'X' || mark === '/' ? 'text-cherry' : ''}`}
                  >
                    {mark}
                  </div>
                ))}
              </div>
              <div className="h-6 text-center text-[13px] leading-6 font-bold tabular-nums">
                {scores[f] ?? ''}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative flex flex-col md:flex-row gap-4 items-center md:items-start justify-center">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Bowling lane"
          className="block rounded-md touch-none shadow-2xl"
          style={{
            aspectRatio: `${W} / ${H}`,
            width: 'min(100%, calc((100dvh - 250px) * 0.385), 300px)',
            minWidth: '170px',
          }}
        />

        <div className="flex flex-col gap-3 w-full md:w-60 text-center md:text-left">
          <div className="text-muted uppercase text-xs tracking-widest">Score</div>
          <div className="text-5xl font-bold tabular-nums leading-none -mt-2">
            {running}
          </div>
          <p className="min-h-[3em] text-ink" aria-live="polite">
            {hud.stage === 'result' ? hud.message : INSTRUCTIONS[hud.stage]}
          </p>
          <button
            type="button"
            onClick={advance}
            disabled={!canLock}
            className="text-lg uppercase tracking-wider font-bold px-5 py-3 rounded-md bg-cherry text-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mustard"
          >
            {BUTTON_LABEL[hud.stage] || 'Wait…'}
          </button>
          <p className="text-xs text-muted hidden md:block">
            Keys: ← → to slide, Space to lock each step.
          </p>
        </div>

        {phase !== 'playing' && (
          <div className="absolute inset-0 bg-card rounded-xl flex flex-col items-center justify-center gap-4 text-center p-6">
            {phase === 'over' ? (
              <>
                <p className="font-display text-[clamp(40px,11vw,60px)] leading-tight text-mustard">
                  That's a game!
                </p>
                <p className="text-2xl">
                  Final score <b className="text-mustard">{running}</b>
                </p>
                <p className="text-muted">
                  Best {best}
                  {running === best && running > 0 ? ' · a new house record' : ''}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[clamp(40px,11vw,60px)] leading-tight text-mustard">
                  Ten frames
                </p>
                <ul className="text-muted max-w-[34ch] space-y-1 leading-relaxed">
                  <li>Each bowl takes four taps.</li>
                  <li>Slide the ball to where you stand.</li>
                  <li>Lock the swinging aim arrow.</li>
                  <li>Lock the power, then the hook.</li>
                  <li>
                    A strike scores 10 plus your next two balls. A spare scores 10 plus
                    your next ball.
                  </li>
                  <li>Strike or spare in frame ten and you earn bonus balls.</li>
                </ul>
                <p className="text-xs text-muted">Mouse, touch, or ← → and Space.</p>
              </>
            )}
            <button
              type="button"
              onClick={start}
              className="text-xl uppercase tracking-wider font-bold px-8 py-3 rounded-md bg-cherry text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mustard"
            >
              {phase === 'over' ? 'Play again' : 'Bowl'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
