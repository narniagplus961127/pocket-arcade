import type { KeyboardState } from '../../shared/input';
import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

type GameState = {
  dive?: (col: any, row: any) => void;
  press?: () => void;
  start?: () => void;
};
type GameState2 = {
  kicks: {
    you: any[];
    cpu: any[];
  };
  shooter: string;
  stage: string;
  message: string;
  dived?: boolean;
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

// ---------- Pitch and goal ----------
// Shots are worked out in metres on the goal plane (x across from the centre, y up from the ground),
// then drawn on a W x H canvas.

const W = 640;
const H = 420;
const GOAL_HALF = 3.66;
const GOAL_HEIGHT = 2.44;
const BALL_M = 0.11;
const PXM = 420 / (GOAL_HALF * 2);
const GOAL_LINE_Y = 300;
const SPOT = {
  x: W / 2,
  y: 392,
};
const FLIGHT_TIME = 0.5;
const RUNUP_TIME = 1.1;
const ZONE_X = [-2.3, 0, 2.3];
const ZONE_Y = [0.5, 1.5];
const STORAGE_KEY = 'spot-kick-records';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toScreen = (p) => ({
  x: W / 2 + p.x * PXM,
  y: GOAL_LINE_Y - p.y * PXM,
});
const toGoal = (sx, sy) => ({
  x: (sx - W / 2) / PXM,
  y: (GOAL_LINE_Y - sy) / PXM,
});
function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Harder shots are less accurate, and a full-blooded one tends to rise.
function strike(aim, power) {
  const sigma = 0.1 + power * 0.22;
  let x = aim.x + gaussian() * sigma;
  let y = aim.y + gaussian() * sigma * 0.8;
  if (power > 0.85) y += (power - 0.85) * 6;
  y = Math.max(BALL_M, y);
  return {
    x,
    y,
  };
}

// Wide, over, woodwork or on target.
function classify(p) {
  const ax = Math.abs(p.x);
  const nearPost = Math.abs(ax - GOAL_HALF) <= BALL_M;
  const nearBar = Math.abs(p.y - GOAL_HEIGHT) <= BALL_M;
  if (nearPost && p.y <= GOAL_HEIGHT + BALL_M)
    return {
      onTarget: false,
      text: 'Off the post!',
    };
  if (nearBar && ax <= GOAL_HALF + BALL_M)
    return {
      onTarget: false,
      text: 'Off the bar!',
    };
  if (ax > GOAL_HALF)
    return {
      onTarget: false,
      text: 'Wide!',
    };
  if (p.y > GOAL_HEIGHT)
    return {
      onTarget: false,
      text: 'Over the bar!',
    };
  return {
    onTarget: true,
    text: '',
  };
}

// A keeper in the right zone saves anything within reach. Softer shots are easier to reach.
function reachFor(power) {
  return 0.85 + (1 - power) * 0.7;
}

function isSaved(p, zone, reach) {
  return Math.hypot(p.x - ZONE_X[zone.col], p.y - ZONE_Y[zone.row]) < reach;
}
const zoneOf = (p) => ({
  col: p.x < -1.2 ? 0 : p.x > 1.2 ? 2 : 1,
  row: p.y > 1.3 ? 1 : 0,
});
const randomZone = () => ({
  col: Math.floor(Math.random() * 3),
  row: Math.random() < 0.5 ? 0 : 1,
});

// ---------- Shootout rules ----------
// Five kicks each, alternating. It ends early once one side cannot be caught.
// After five each it is sudden death: a round is decided when one scores and the other does not.

function decide(kicks) {
  const yt = kicks.you.length;
  const ct = kicks.cpu.length;
  const yg = kicks.you.filter(Boolean).length;
  const cg = kicks.cpu.filter(Boolean).length;
  if (yt <= 5 && ct <= 5) {
    if (yg > cg + (5 - ct)) return 'you';
    if (cg > yg + (5 - yt)) return 'cpu';
  }
  if (yt >= 5 && yt === ct && yg !== cg) return yg > cg ? 'you' : 'cpu';
  return null;
}

function readRecords() {
  try {
    return (
      JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        won: 0,
        played: 0,
      }
    );
  } catch (e) {
    return {
      won: 0,
      played: 0,
    };
  }
}

function newShootout() {
  return {
    kicks: {
      you: [],
      cpu: [],
    },
    shooter: 'you',
    stage: 'aim',
    stageT: 0,
    aim: {
      x: 0,
      y: 1.2,
    },
    power: 0,
    shot: null,
    keeper: {
      zone: null,
      startT: 0,
      lateness: 0,
    },
    lean: 0,
    message: '',
    keys: {} as KeyboardState,
    winner: null,
    over: false,
    hudKey: '',
  };
}

function setStage(g, stage) {
  g.stage = stage;
  g.stageT = 0;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Spot Kick');

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
  const game = useRef(newShootout());
  const [phase, setPhase] = useState('menu');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [hud, setHud] = useState({
    kicks: {
      you: [],
      cpu: [],
    },
    shooter: 'you',
    stage: 'aim',
    message: '',
  } as GameState2);
  const [records, setRecords] = useState(readRecords);
  const [winner, setWinner] = useState(null);
  const start = () => {
    game.current = newShootout();
    setWinner(null);
    setPhase('playing');
    playTone(1200, 0.25, 'sine', 0.04);
  };

  // ---------- Player actions ----------

  const lockAim = () => {
    const g = game.current;
    if (g.stage !== 'aim') return;
    setStage(g, 'power');
    playTone(520, 0.05);
  };

  // Shooting: the CPU keeper commits as you strike. Sometimes it reads you, sometimes it guesses.
  const lockPower = () => {
    const g = game.current;
    if (g.stage !== 'power') return;
    const target = strike(g.aim, g.power);
    const result = classify(target);
    const truth = zoneOf(target);
    const read = Math.random() < 0.38;
    const guess = randomZone();
    const zone = {
      col: read ? truth.col : guess.col,
      row: read && Math.random() < 0.7 ? truth.row : guess.row,
    };
    const saved = result.onTarget && isSaved(target, zone, reachFor(g.power));
    g.shot = {
      target,
      power: g.power,
      result,
      saved,
      t: 0,
    };
    g.keeper = {
      zone,
      startT: 0.05,
      lateness: 0,
    };
    setStage(g, 'flight');
    playTone(140, 0.12, 'square', 0.05);
  };

  // Saving: pick one of six zones. Diving during the run-up is a guess; diving after the kick is late.
  const dive = (col, row) => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.shooter !== 'cpu' || g.keeper.zone) return;
    if (g.stage === 'runup') {
      // An early guess launches the moment the ball is struck.
      g.keeper = {
        zone: {
          col,
          row,
        },
        startT: 0,
        lateness: 0,
      };
    } else if (g.stage === 'cpuFlight') {
      g.keeper = {
        zone: {
          col,
          row,
        },
        startT: g.stageT,
        lateness: g.stageT / FLIGHT_TIME,
      };
    } else {
      return;
    }
    playTone(300, 0.06, 'triangle', 0.04);
  };
  const press = () => {
    const g = game.current;
    if (phaseRef.current !== 'playing') return;
    if (g.stage === 'aim') lockAim();
    else if (g.stage === 'power') lockPower();
  };
  const refs = useRef({} as GameState);
  refs.current = {
    start,
    press,
    dive,
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
    const record = (g, scored) => {
      g.kicks[g.shooter].push(scored);
      setStage(g, 'outcome');
      if (scored) {
        [392, 523, 659].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.025), k * 80),
        );
      } else {
        playTone(150, 0.3, 'triangle', 0.05);
      }
    };

    // Start the computer's kick: choose a spot, a power and how honest the run-up lean is.
    const beginCpuKick = (g) => {
      g.shooter = 'cpu';
      const r = Math.random();
      const col = r < 0.4 ? 0 : r < 0.6 ? 1 : 2;
      const side = col === 0 ? -1 : 1;
      const x =
        col === 1 ? (Math.random() - 0.5) * 1.8 : side * (1.4 + Math.random() * 2);
      const aim = {
        x,
        y: 0.2 + Math.random() * 2.1,
      };
      const power = 0.55 + Math.random() * 0.37;
      const target = strike(aim, power);
      const honest = Math.random() < 0.65;
      g.lean = honest
        ? Math.sign(target.x) * (Math.abs(target.x) > 1.2 ? 1 : 0)
        : [-1, 0, 1][Math.floor(Math.random() * 3)];
      g.shot = {
        target,
        power,
        result: classify(target),
        saved: false,
        t: 0,
      };
      g.keeper = {
        zone: null,
        startT: 0,
        lateness: 0,
      };
      g.message = '';
      setStage(g, 'runup');
    };
    const nextKick = (g) => {
      const w = decide(g.kicks);
      if (w) {
        g.over = true;
        g.winner = w;
        setWinner(w);
        setRecords((r) => {
          const next = {
            won: r.won + (w === 'you' ? 1 : 0),
            played: r.played + 1,
          };
          try {
            localStorage.setItem(STORAGE_KEY, String(JSON.stringify(next)));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
        setPhase('over');
        return;
      }
      if (g.shooter === 'you') {
        beginCpuKick(g);
      } else {
        g.shooter = 'you';
        g.shot = null;
        g.keeper = {
          zone: null,
          startT: 0,
          lateness: 0,
        };
        g.message = '';
        g.lean = 0;
        setStage(g, 'aim');
      }
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || g.over || phaseRef.current !== 'playing') return;
      g.stageT += dt;
      if (g.stage === 'aim') {
        const kx = (g.keys.right ? 1 : 0) - (g.keys.left ? 1 : 0);
        const ky = (g.keys.up ? 1 : 0) - (g.keys.down ? 1 : 0);
        g.aim.x = clamp(g.aim.x + kx * 3 * dt, -4.6, 4.6);
        g.aim.y = clamp(g.aim.y + ky * 3 * dt, 0.1, 3.2);
      } else if (g.stage === 'power') {
        g.power = 0.5 - 0.5 * Math.cos(g.stageT * 3.4);
      } else if (g.stage === 'flight') {
        g.shot.t = Math.min(1, g.stageT / FLIGHT_TIME);
        if (g.shot.t >= 1) {
          const s = g.shot;
          const scored = s.result.onTarget && !s.saved;
          g.message = scored ? 'GOAL!' : s.saved ? 'Saved!' : s.result.text;
          record(g, scored);
        }
      } else if (g.stage === 'runup') {
        if (g.stageT >= RUNUP_TIME) {
          setStage(g, 'cpuFlight');
          playTone(140, 0.12, 'square', 0.05);
        }
      } else if (g.stage === 'cpuFlight') {
        g.shot.t = Math.min(1, g.stageT / FLIGHT_TIME);
        if (g.shot.t >= 1) {
          const s = g.shot;
          // Not choosing at all leaves you flat-footed in the middle.
          const keeper = g.keeper.zone
            ? g.keeper
            : {
                zone: {
                  col: 1,
                  row: 0,
                },
                startT: FLIGHT_TIME,
                lateness: 0.6,
              };
          if (!g.keeper.zone) g.keeper = keeper;
          const reach = reachFor(s.power) * (1 - 0.7 * keeper.lateness);
          s.saved = s.result.onTarget && isSaved(s.target, keeper.zone, reach);
          const scored = s.result.onTarget && !s.saved;
          g.message = scored ? 'They score' : s.saved ? 'What a save!' : s.result.text;
          record(g, scored);
        }
      } else if (g.stage === 'outcome') {
        if (g.stageT >= 1.5) nextKick(g);
      }
      const hudKey = `${g.stage}|${g.shooter}|${g.message}|${g.kicks.you.join()}|${g.kicks.cpu.join()}|${g.keeper.zone ? 1 : 0}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          kicks: {
            you: [...g.kicks.you],
            cpu: [...g.kicks.cpu],
          },
          shooter: g.shooter,
          stage: g.stage,
          message: g.message,
          dived: !!g.keeper.zone,
        });
      }
    };

    // ---------- Drawing ----------

    const drawStadium = (t) => {
      // Night sky
      const sky = ctx.createLinearGradient(0, 0, 0, 200);
      sky.addColorStop(0, '#04060d');
      sky.addColorStop(1, '#141d33');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Stands: rows of dim faces with the odd camera flash
      ctx.fillStyle = '#0d1426';
      ctx.fillRect(0, 70, W, 140);
      for (let row = 0; row < 7; row++) {
        for (let i = 0; i < 64; i++) {
          const seed = (row * 131 + i * 71) % 97;
          const x = i * 10 + (row % 2) * 5;
          const y = 80 + row * 18;
          ctx.fillStyle =
            seed % 7 === 0
              ? 'rgba(255,122,26,0.55)'
              : `rgba(200,210,235,${0.08 + (seed % 5) * 0.03})`;
          ctx.fillRect(x, y, 6, 6);
        }
      }
      const flash = Math.floor(t * 7) % 37;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect((flash * 97) % W, 84 + (flash % 6) * 18, 4, 4);

      // Advertising boards
      ctx.fillStyle = '#1a2440';
      ctx.fillRect(0, 210, W, 16);
      ctx.fillStyle = 'rgba(255,122,26,0.7)';
      for (let x = ((t * 30) % 160) - 160; x < W; x += 160) ctx.fillRect(x, 215, 70, 6);

      // Floodlight towers and glow
      [
        [40, 20],
        [W - 40, 20],
      ].forEach(([fx, fy]) => {
        const glow = ctx.createRadialGradient(fx, fy, 4, fx, fy, 260);
        glow.addColorStop(0, 'rgba(255,243,196,0.55)');
        glow.addColorStop(1, 'rgba(255,243,196,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff8dd';
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) ctx.fillRect(fx - 16 + i * 8, fy + j * 7, 6, 5);
        }
      });

      // Pitch with mowing stripes, in perspective
      for (let i = 0; i < 8; i++) {
        const y0 = 226 + i * 25;
        ctx.fillStyle = i % 2 ? '#1f7a43' : '#23864a';
        ctx.fillRect(0, y0, W, 25);
      }
      // Six-yard box and penalty spot
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GOAL_LINE_Y);
      ctx.lineTo(W, GOAL_LINE_Y);
      ctx.moveTo(40, GOAL_LINE_Y);
      ctx.lineTo(10, 345);
      ctx.lineTo(W - 10, 345);
      ctx.lineTo(W - 40, GOAL_LINE_Y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(SPOT.x, SPOT.y + 4, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const drawGoal = () => {
      const l = W / 2 - GOAL_HALF * PXM;
      const r = W / 2 + GOAL_HALF * PXM;
      const top = GOAL_LINE_Y - GOAL_HEIGHT * PXM;

      // Net
      ctx.fillStyle = 'rgba(10,15,30,0.35)';
      ctx.fillRect(l, top, r - l, GOAL_LINE_Y - top);
      ctx.strokeStyle = 'rgba(230,235,245,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = l; x <= r; x += 14) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, GOAL_LINE_Y);
      }
      for (let y = top; y <= GOAL_LINE_Y; y += 14) {
        ctx.moveTo(l, y);
        ctx.lineTo(r, y);
      }
      ctx.stroke();

      // Frame
      ctx.strokeStyle = '#f6f7fb';
      ctx.lineWidth = 6;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(l, GOAL_LINE_Y);
      ctx.lineTo(l, top);
      ctx.lineTo(r, top);
      ctx.lineTo(r, GOAL_LINE_Y);
      ctx.stroke();
    };

    // Keeper position eases from the centre toward the chosen zone once the dive starts.
    const keeperPose = (g, now) => {
      const k = g.keeper;
      if (!k.zone)
        return {
          x: 0,
          y: 0,
          tilt: 0,
        };
      const elapsed = now - k.startT;
      const f = clamp(elapsed / 0.35, 0, 1);
      const ease = 1 - (1 - f) * (1 - f);
      const reachScale = 1 - 0.7 * k.lateness;
      const dx = ZONE_X[k.zone.col] * ease * (0.55 + 0.45 * reachScale);
      const dy = (ZONE_Y[k.zone.row] - 0.5) * ease;
      const tilt = (k.zone.col - 1) * (k.zone.row ? 1.0 : 1.35) * ease;
      return {
        x: dx,
        y: dy,
        tilt,
      };
    };
    const drawKeeper = (g, kit) => {
      // Seconds since the ball was struck, on one clock for both kinds of kick.
      let now = 0;
      if (g.stage === 'flight' || g.stage === 'cpuFlight') now = g.stageT;
      else if (g.stage === 'outcome') now = 9;
      const pose = keeperPose(g, now);
      const base = toScreen({
        x: pose.x,
        y: pose.y,
      });
      ctx.save();
      ctx.translate(base.x, base.y);
      ctx.rotate(pose.tilt);
      // Legs
      ctx.fillStyle = '#111';
      ctx.fillRect(-9, -26, 7, 26);
      ctx.fillRect(2, -26, 7, 26);
      // Shirt
      ctx.fillStyle = kit;
      ctx.fillRect(-13, -62, 26, 38);
      // Arms up and out
      ctx.fillRect(-30, -78, 8, 34);
      ctx.fillRect(22, -78, 8, 34);
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.arc(-26, -80, 6, 0, Math.PI * 2);
      ctx.arc(26, -80, 6, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.fillStyle = '#c99a72';
      ctx.beginPath();
      ctx.arc(0, -72, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const drawTaker = (g) => {
      // Seen from behind as they run up, leaning toward (usually) the side they will pick.
      const f = g.stage === 'runup' ? clamp(g.stageT / RUNUP_TIME, 0, 1) : 1;
      const x = SPOT.x - 70 + f * 52;
      const y = H + 10 - f * 30;
      const lean = g.lean * 0.18 * f;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(lean);
      ctx.fillStyle = '#e8ecf5';
      ctx.fillRect(-16, -110, 32, 50);
      ctx.fillStyle = '#20304f';
      ctx.fillRect(-16, -62, 32, 18);
      ctx.fillStyle = '#c99a72';
      ctx.fillRect(-13, -44, 9, 40);
      ctx.fillRect(4, -44, 9, 40);
      ctx.fillStyle = '#2b1d14';
      ctx.beginPath();
      ctx.arc(0, -122, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20304f';
      ctx.font = '700 22px Teko, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('9', 0, -78);
      ctx.restore();
    };
    const drawBall = (g) => {
      let p = {
        x: SPOT.x,
        y: SPOT.y,
      };
      let r = 9;
      const s = g.shot;
      if (
        s &&
        (g.stage === 'flight' || g.stage === 'cpuFlight' || g.stage === 'outcome')
      ) {
        const t = g.stage === 'outcome' ? 1 : s.t;
        const end = toScreen(s.target);
        p = {
          x: SPOT.x + (end.x - SPOT.x) * t,
          y: SPOT.y + (end.y - SPOT.y) * t - Math.sin(Math.PI * t) * 18,
        };
        r = 9 - 4 * t;
        // A save parries the ball back out; a goal ripples the net behind it.
        if (g.stage === 'outcome' && s.saved) {
          const back = clamp(g.stageT / 0.5, 0, 1);
          p = {
            x: p.x + Math.sign(s.target.x || 1) * back * 50,
            y: p.y + back * 60,
          };
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(
        p.x,
        Math.max(p.y + r, GOAL_LINE_Y + 2),
        r,
        r * 0.35,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = '#fbfbfb';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };
    const draw = (now) => {
      const g = game.current;
      const s = canvas.width / W;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      drawStadium(now / 1000);
      drawGoal();
      const playing = phaseRef.current === 'playing';
      drawKeeper(g, g.shooter === 'you' ? '#3ad0e0' : '#ff7a1a');
      if (g.shooter === 'cpu') drawTaker(g);
      drawBall(g);

      // Aim reticle
      if (playing && (g.stage === 'aim' || g.stage === 'power')) {
        const p = toScreen(g.aim);
        ctx.strokeStyle = g.stage === 'aim' ? '#ff7a1a' : '#fff3c4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.moveTo(p.x - 20, p.y);
        ctx.lineTo(p.x + 20, p.y);
        ctx.moveTo(p.x, p.y - 20);
        ctx.lineTo(p.x, p.y + 20);
        ctx.stroke();
      }

      // Power meter
      if (playing && g.stage === 'power') {
        const x = W - 46;
        const top = 240;
        const hgt = 150;
        ctx.fillStyle = 'rgba(7,11,22,0.85)';
        ctx.fillRect(x - 4, top - 4, 24, hgt + 8);
        const grad = ctx.createLinearGradient(0, top + hgt, 0, top);
        grad.addColorStop(0, '#3ad0e0');
        grad.addColorStop(0.75, '#fff3c4');
        grad.addColorStop(0.86, '#ff7a1a');
        grad.addColorStop(1, '#e0303a');
        ctx.fillStyle = grad;
        ctx.fillRect(x, top + hgt * (1 - g.power), 16, hgt * g.power);
        // Above this line the shot starts to sky.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 6, top + hgt * 0.15, 28, 2);
      }

      // Reaction window while you are in goal
      if (
        playing &&
        g.shooter === 'cpu' &&
        (g.stage === 'runup' || g.stage === 'cpuFlight') &&
        !g.keeper.zone
      ) {
        const left = g.stage === 'runup' ? 1 : 1 - g.stageT / FLIGHT_TIME;
        ctx.fillStyle = 'rgba(7,11,22,0.8)';
        ctx.fillRect(W / 2 - 104, 40, 208, 14);
        ctx.fillStyle = g.stage === 'runup' ? '#fff3c4' : '#ff7a1a';
        ctx.fillRect(W / 2 - 100, 44, 200 * clamp(left, 0, 1), 6);
      }

      // Outcome banner
      if (playing && g.stage === 'outcome' && g.message) {
        const good =
          g.shooter === 'you' ? g.message === 'GOAL!' : g.message !== 'They score';
        ctx.font = '700 72px Teko, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(g.message, W / 2 + 3, 133);
        ctx.fillStyle = good ? '#ff7a1a' : '#eef3ff';
        ctx.fillText(g.message, W / 2, 130);
        ctx.textBaseline = 'alphabetic';
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

    // Keys: arrows aim; when diving, Q W E dive high and A S D dive low (left, centre, right).
    const DIVE_KEYS = {
      q: [0, 1],
      w: [1, 1],
      e: [2, 1],
      a: [0, 0],
      s: [1, 0],
      d: [2, 0],
    };
    const ARROW_DIVES = {
      ArrowLeft: [0, 0],
      ArrowRight: [2, 0],
      ArrowUp: [1, 1],
      ArrowDown: [1, 0],
    };
    const AIM_KEYS = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const onKeyDown = (e) => {
      const g = game.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (g.shooter === 'cpu' && phaseRef.current === 'playing') {
        const choice = DIVE_KEYS[key] || ARROW_DIVES[key];
        if (choice) {
          e.preventDefault();
          refs.current.dive(choice[0], choice[1]);
          return;
        }
      }
      if (AIM_KEYS[key]) {
        e.preventDefault();
        g.keys[AIM_KEYS[key]] = true;
      }
      if (key === ' ' || key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (phaseRef.current === 'playing') refs.current.press();
        else refs.current.start();
      }
    };
    const onKeyUp = (e) => {
      const dir = AIM_KEYS[e.key];
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
  // Shooting: point at (or drag to) a spot in the goal and release to pick it; tap again to stop the power meter.
  // Saving: tap the part of the goal you want to dive to.

  const pressing = useRef(false);
  const pointerGoal = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    return toGoal(sx, sy);
  };
  const aimTo = (e) => {
    const g = game.current;
    const p = pointerGoal(e);
    g.aim.x = clamp(p.x, -4.6, 4.6);
    g.aim.y = clamp(p.y, 0.1, 3.2);
  };
  const onPointerDown = (e) => {
    const g = game.current;
    if (phaseRef.current !== 'playing') return;
    if (g.shooter === 'cpu') {
      const p = pointerGoal(e);
      const col = p.x < -1.2 ? 0 : p.x > 1.2 ? 2 : 1;
      const row = p.y > 1.2 ? 1 : 0;
      dive(col, row);
      return;
    }
    if (g.stage === 'aim') {
      pressing.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      aimTo(e);
    } else if (g.stage === 'power') {
      lockPower();
    }
  };
  const onPointerMove = (e) => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.stage !== 'aim') return;
    if (e.pointerType === 'mouse' || pressing.current) aimTo(e);
  };
  const onPointerUp = () => {
    if (pressing.current && game.current.stage === 'aim') lockAim();
    pressing.current = false;
  };

  // ---------- Render ----------

  const kickDots = (list) => {
    const slots = Math.max(5, list.length, hud.kicks.you.length, hud.kicks.cpu.length);
    return Array.from(
      {
        length: slots,
      },
      (_, i) => {
        const v = list[i];
        const cls =
          v === undefined ? 'border-muted' : v ? 'bg-signal border-signal' : 'border-ink';
        return (
          <span
            key={String(String(i))}
            className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${cls}`}
          >
            {v === false ? '✕' : ''}
          </span>
        );
      },
    );
  };
  const yourGoals = hud.kicks.you.filter(Boolean).length;
  const cpuGoals = hud.kicks.cpu.filter(Boolean).length;
  const kickNumber =
    Math.max(hud.kicks.you.length, hud.kicks.cpu.length) +
    (hud.shooter === 'you' ? 1 : 0);
  const suddenDeath = hud.kicks.you.length >= 5 && hud.kicks.cpu.length >= 5;
  const prompts = {
    aim: 'Point at a spot in the goal, then tap or release to pick it.',
    power: 'Tap to strike. Too much power and it flies over.',
    flight: '',
    runup: hud.dived
      ? 'Committed!'
      : 'You are in goal. Tap where to dive, before the ball arrives.',
    cpuFlight: hud.dived ? 'Committed!' : 'Dive now!',
    outcome: '',
  };
  const diving =
    phase === 'playing' &&
    hud.shooter === 'cpu' &&
    (hud.stage === 'runup' || hud.stage === 'cpuFlight') &&
    !hud.dived;
  return (
    <main className="font-body max-w-[760px] mx-auto py-4 flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3 bg-panel rounded-lg px-3 py-2 border border-[#22304f]">
        <h1 className="font-display text-[clamp(34px,9vw,52px)] leading-[0.8] pt-1 text-flood uppercase">
          Spot Kick
        </h1>
        <div
          className="flex flex-col gap-1 text-xs sm:text-sm"
          aria-label="Shootout score"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-9 font-bold text-signal">YOU</span>
            {kickDots(hud.kicks.you)}
            <span className="font-display text-2xl leading-none ml-1 w-5 text-right">
              {yourGoals}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-9 font-bold text-muted">CPU</span>
            {kickDots(hud.kicks.cpu)}
            <span className="font-display text-2xl leading-none ml-1 w-5 text-right">
              {cpuGoals}
            </span>
          </div>
        </div>
      </header>

      {phase !== 'playing' && (
        <section className="bg-panel rounded-lg border border-[#22304f] p-5 flex flex-col items-center gap-3 text-center">
          {phase === 'over' ? (
            <>
              <p className="font-display text-5xl leading-none uppercase text-signal">
                {winner === 'you' ? 'You win the shootout!' : 'Heartbreak'}
              </p>
              <p className="text-muted">
                {yourGoals} – {cpuGoals}
                {winner === 'you' ? '. The stadium is yours.' : '. The visitors take it.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-5xl leading-none uppercase text-flood">
                Under the lights
              </p>
              <ul className="text-muted max-w-[46ch] space-y-1 text-sm sm:text-base">
                <li>
                  Five penalties each, taking turns. Most goals wins. Still level? Sudden
                  death.
                </li>
                <li>
                  Shooting: pick a spot in the goal, then stop the power meter. Corners
                  are hard to reach; too much power sends it over.
                </li>
                <li>
                  Saving: choose where to dive before the ball reaches you. Watch which
                  way the taker leans. Late dives cover less.
                </li>
              </ul>
              <p className="text-xs text-muted">
                Keys: arrows + Space to shoot. Q W E dive high, A S D dive low.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={start}
            className="font-display text-3xl leading-none uppercase px-8 pt-2.5 pb-1.5 rounded-md bg-signal text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-flood"
          >
            {phase === 'over' ? 'Play again' : 'Kick off'}
          </button>
        </section>
      )}

      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-display text-2xl leading-none text-flood uppercase">
          {phase === 'playing'
            ? suddenDeath
              ? 'Sudden death'
              : `Kick ${Math.min(kickNumber, 5)} of 5`
            : 'Penalty shootout'}
        </span>
        <span className="text-muted">
          Shootouts won {records.won} of {records.played}
        </span>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pressing.current = false;
          }}
          aria-label="Goal seen from the penalty spot"
          className="w-full block rounded-lg touch-none"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />
      </div>

      <p className="min-h-[1.5rem] text-center font-semibold" aria-live="polite">
        {phase === 'playing' ? prompts[hud.stage] : ''}
      </p>

      {diving && (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Dive">
          {[1, 0].map((row) =>
            [0, 1, 2].map((col) => (
              <button
                key={String(String(`${row}${col}`))}
                type="button"
                onClick={() => dive(col, row)}
                className="py-2.5 rounded-md bg-panel border border-[#22304f] font-display text-xl uppercase leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
              >
                {row ? 'High' : 'Low'} {['left', 'centre', 'right'][col]}
              </button>
            )),
          )}
        </div>
      )}
    </main>
  );
}
export default App;
