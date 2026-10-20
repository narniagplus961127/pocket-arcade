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

// ---------- Board ----------
// Board units are millimetres from the bullseye, using regulation ring sizes.

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const R_BULL = 6.35;
const R_OUTER_BULL = 15.9;
const R_TREBLE_IN = 99;
const R_TREBLE_OUT = 107;
const R_DOUBLE_IN = 162;
const R_DOUBLE_OUT = 170;
const VIEW = 480;
const START_SCORE = 301;
const STORAGE_KEY = 'pub-darts-records';
const LEVELS = {
  easy: {
    label: 'Pub regular',
    sigma: 28,
  },
  medium: {
    label: 'Club player',
    sigma: 16,
  },
  hard: {
    label: 'Champion',
    sigma: 8,
  },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Angle in degrees, clockwise from straight up.
const boardAngle = (x, y) => ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r <= R_BULL)
    return {
      value: 50,
      isDouble: true,
      label: 'Bull',
    };
  if (r <= R_OUTER_BULL)
    return {
      value: 25,
      isDouble: false,
      label: '25',
    };
  if (r > R_DOUBLE_OUT)
    return {
      value: 0,
      isDouble: false,
      label: 'Miss',
    };
  const n = ORDER[Math.floor(((boardAngle(x, y) + 9) % 360) / 18)];
  if (r >= R_DOUBLE_IN)
    return {
      value: n * 2,
      isDouble: true,
      label: `D${n}`,
    };
  if (r >= R_TREBLE_IN && r <= R_TREBLE_OUT)
    return {
      value: n * 3,
      isDouble: false,
      label: `T${n}`,
    };
  return {
    value: n,
    isDouble: false,
    label: String(n),
  };
}

// Centre point of a bed: ring is 'S' (fat outer single), 'D', 'T', 'BULL' or '25'.
function bedPoint(ring, n) {
  if (ring === 'BULL')
    return {
      x: 0,
      y: 0,
    };
  if (ring === '25')
    return {
      x: 0,
      y: -11,
    };
  const radius = {
    S: 135,
    D: 166,
    T: 103,
  }[ring];
  const a = (ORDER.indexOf(n) * 18 * Math.PI) / 180;
  return {
    x: Math.sin(a) * radius,
    y: -Math.cos(a) * radius,
  };
}

// ---------- Computer opponent ----------
// Score heavily on treble 20, then set up a friendly double and go for it.

const LEAVES = [
  32, 40, 16, 24, 36, 20, 8, 12, 28, 4, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38,
];
function chooseTarget(remaining) {
  if (remaining === 50)
    return {
      ring: 'BULL',
      n: 0,
    };
  if (remaining <= 40 && remaining % 2 === 0)
    return {
      ring: 'D',
      n: remaining / 2,
    };
  if (remaining <= 60) {
    for (const leave of LEAVES) {
      const single = remaining - leave;
      if (single >= 1 && single <= 20)
        return {
          ring: 'S',
          n: single,
        };
    }
  }
  for (const n of [20, 19, 18]) {
    if (remaining - n * 3 >= 2)
      return {
        ring: 'T',
        n,
      };
  }
  return {
    ring: 'S',
    n: 1,
  };
}

function checkoutHint(remaining) {
  if (remaining === 50) return 'Bull to finish';
  if (remaining <= 40 && remaining % 2 === 0) return `D${remaining / 2} to finish`;
  if (remaining <= 60) {
    for (const leave of LEAVES) {
      const single = remaining - leave;
      if (single >= 1 && single <= 20) return `${single}, then D${leave / 2}`;
    }
  }
  return '';
}

function readRecords() {
  try {
    return (
      JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
        wins: {},
        fewest: null,
      }
    );
  } catch (e) {
    return {
      wins: {},
      fewest: null,
    };
  }
}

function newGame(level) {
  return {
    level,
    scores: {
      you: START_SCORE,
      cpu: START_SCORE,
    },
    turn: 'you',
    turnStart: START_SCORE,
    thrown: [],
    darts: [],
    flying: null,
    stage: 'aiming',
    timer: 0,
    aim: {
      x: 0,
      y: -40,
    },
    cpuAim: {
      x: 0,
      y: 60,
    },
    cpuTarget: null,
    steadyT: 0,
    time: 0,
    keys: {},
    message: '',
    lastTurn: {
      you: '',
      cpu: '',
    },
    dartsUsed: 0,
    winner: null,
    hudKey: '',
  };
}

// The hand never keeps still, and it gets shakier the longer you hold your aim.
function wobble(g) {
  const amp = 6 + Math.min(18, g.steadyT * 3);
  const t = g.time;
  return {
    x: amp * (0.6 * Math.sin(t * 1.9) + 0.4 * Math.sin(t * 3.3 + 1.3)),
    y: amp * (0.6 * Math.cos(t * 1.5 + 0.4) + 0.4 * Math.sin(t * 2.7 + 2.1)),
  };
}

function reticle(g) {
  const w = wobble(g);
  return {
    x: g.aim.x + w.x,
    y: g.aim.y + w.y,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Pub Darts');

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
  const [records, setRecords] = useState(readRecords);
  const [hud, setHud] = useState({
    scores: {
      you: START_SCORE,
      cpu: START_SCORE,
    },
    turn: 'you',
    thrown: [],
    message: '',
    lastTurn: {
      you: '',
      cpu: '',
    },
    stage: 'aiming',
  });
  const [result, setResult] = useState(null);
  const start = (lv = level) => {
    game.current = newGame(lv);
    setResult(null);
    setPhase('playing');
    playTone(660, 0.08, 'sine', 0.04);
  };
  const throwDart = (who, x, y) => {
    const g = game.current;
    g.flying = {
      who,
      x,
      y,
      t: 0,
    };
    g.stage = 'flying';
    g.steadyT = 0;
    playTone(900, 0.04, 'sine', 0.02);
  };

  // The player's throw: wherever the wobbling reticle is right now, plus a little release error.
  const playerThrow = () => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing' || g.turn !== 'you' || g.stage !== 'aiming')
      return;
    const r = reticle(g);
    throwDart('you', r.x + gaussian() * 2.5, r.y + gaussian() * 2.5);
  };
  const playerThrowRef = useRef(playerThrow);
  playerThrowRef.current = playerThrow;
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
    const endTurn = (g, message) => {
      g.message = message;
      g.lastTurn[g.turn] = message;
      g.stage = 'turnEnd';
      g.timer = 1.4;
    };
    const finishGame = (g) => {
      g.stage = 'done';
      const won = g.winner === 'you';
      setResult({
        won,
        dartsUsed: g.dartsUsed,
        level: g.level,
        cpuLeft: g.scores.cpu,
      });
      if (won) {
        setRecords((r) => {
          const next = {
            wins: {
              ...r.wins,
              [g.level]: (r.wins[g.level] || 0) + 1,
            },
            fewest: r.fewest ? Math.min(r.fewest, g.dartsUsed) : g.dartsUsed,
          };
          try {
            localStorage.setItem(STORAGE_KEY, String(JSON.stringify(next)));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
      }
      setPhase('over');
    };

    // Apply 301 double-out rules to a dart that just landed.
    const land = (g, dart) => {
      const who = dart.who;
      const hit = scoreAt(dart.x, dart.y);
      g.darts.push({
        x: dart.x,
        y: dart.y,
        who,
      });
      g.thrown.push(hit.label);
      if (who === 'you') g.dartsUsed += 1;
      const remaining = g.scores[who] - hit.value;
      playTone(hit.value === 0 ? 140 : 300 + hit.value * 6, 0.07, 'square', 0.03);

      // Bust: below zero, stuck on 1, or reaching zero without a double. The turn's score is wiped.
      if (remaining < 0 || remaining === 1 || (remaining === 0 && !hit.isDouble)) {
        g.scores[who] = g.turnStart;
        playTone(110, 0.35, 'sawtooth', 0.04);
        endTurn(g, 'Bust!');
        return;
      }
      g.scores[who] = remaining;
      if (remaining === 0) {
        g.winner = who;
        g.message = `Game shot on ${hit.label}!`;
        g.stage = 'won';
        g.timer = 1.6;
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.16, 'sine', 0.05), k * 110),
        );
        return;
      }
      if (g.thrown.length === 3) {
        endTurn(g, `${g.turnStart - remaining} scored`);
      } else if (who === 'you') {
        g.stage = 'aiming';
      } else {
        g.stage = 'cpuThink';
        g.timer = 0.8;
        g.cpuTarget = null;
      }
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || phaseRef.current !== 'playing') return;
      g.time += dt;
      if (g.stage === 'aiming') {
        g.steadyT += dt;
        const kx = (g.keys.right ? 1 : 0) - (g.keys.left ? 1 : 0);
        const ky = (g.keys.down ? 1 : 0) - (g.keys.up ? 1 : 0);
        g.aim.x = clamp(g.aim.x + kx * 150 * dt, -220, 220);
        g.aim.y = clamp(g.aim.y + ky * 150 * dt, -220, 220);
      } else if (g.stage === 'flying') {
        g.flying.t += dt / 0.22;
        if (g.flying.t >= 1) {
          const dart = g.flying;
          g.flying = null;
          land(g, dart);
        }
      } else if (g.stage === 'turnEnd') {
        g.timer -= dt;
        if (g.timer <= 0) {
          g.turn = g.turn === 'you' ? 'cpu' : 'you';
          g.turnStart = g.scores[g.turn];
          g.thrown = [];
          g.darts = [];
          g.message = '';
          g.steadyT = 0;
          if (g.turn === 'you') {
            g.stage = 'aiming';
          } else {
            g.stage = 'cpuThink';
            g.timer = 0.9;
            g.cpuTarget = null;
          }
        }
      } else if (g.stage === 'cpuThink') {
        // The computer picks a bed, glides its aim there, then throws with its skill's scatter.
        if (!g.cpuTarget) {
          const choice = chooseTarget(g.scores.cpu);
          g.cpuTarget = bedPoint(choice.ring, choice.n);
        }
        const ease = 1 - Math.exp(-6 * dt);
        g.cpuAim.x += (g.cpuTarget.x - g.cpuAim.x) * ease;
        g.cpuAim.y += (g.cpuTarget.y - g.cpuAim.y) * ease;
        g.timer -= dt;
        if (g.timer <= 0) {
          const sigma = LEVELS[g.level].sigma;
          throwDart(
            'cpu',
            g.cpuTarget.x + gaussian() * sigma,
            g.cpuTarget.y + gaussian() * sigma,
          );
        }
      } else if (g.stage === 'won') {
        g.timer -= dt;
        if (g.timer <= 0) finishGame(g);
      }
      const hudKey = `${g.scores.you}|${g.scores.cpu}|${g.turn}|${g.thrown.join(',')}|${g.message}|${g.stage}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          scores: {
            ...g.scores,
          },
          turn: g.turn,
          thrown: [...g.thrown],
          message: g.message,
          lastTurn: {
            ...g.lastTurn,
          },
          stage: g.stage,
        });
      }
    };

    // ---------- Drawing ----------

    const drawBoard = () => {
      // Cork surround
      ctx.fillStyle = '#b68a5c';
      ctx.beginPath();
      ctx.arc(0, 0, 236, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,50,20,0.25)';
      for (let i = 0; i < 160; i++) {
        const a = i * 2.39996;
        const r = 228 * Math.sqrt((i + 0.5) / 160);
        ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2);
      }

      // Black number ring
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(0, 0, 214, 0, Math.PI * 2);
      ctx.fill();
      const wedge = (r0, r1, i, color) => {
        const mid = (i * 18 * Math.PI) / 180 - Math.PI / 2;
        const half = (9 * Math.PI) / 180;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, r1, mid - half, mid + half);
        ctx.arc(0, 0, r0, mid + half, mid - half, true);
        ctx.closePath();
        ctx.fill();
      };
      for (let i = 0; i < 20; i++) {
        const dark = i % 2 === 0;
        wedge(R_OUTER_BULL, R_TREBLE_IN, i, dark ? '#1b1b1b' : '#efe2c2');
        wedge(R_TREBLE_IN, R_TREBLE_OUT, i, dark ? '#c4303a' : '#2c8a4b');
        wedge(R_TREBLE_OUT, R_DOUBLE_IN, i, dark ? '#1b1b1b' : '#efe2c2');
        wedge(R_DOUBLE_IN, R_DOUBLE_OUT, i, dark ? '#c4303a' : '#2c8a4b');
      }
      ctx.fillStyle = '#2c8a4b';
      ctx.beginPath();
      ctx.arc(0, 0, R_OUTER_BULL, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c4303a';
      ctx.beginPath();
      ctx.arc(0, 0, R_BULL, 0, Math.PI * 2);
      ctx.fill();

      // Wire spider
      ctx.strokeStyle = 'rgba(210,210,200,0.75)';
      ctx.lineWidth = 1;
      [
        R_BULL,
        R_OUTER_BULL,
        R_TREBLE_IN,
        R_TREBLE_OUT,
        R_DOUBLE_IN,
        R_DOUBLE_OUT,
      ].forEach((r) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      for (let i = 0; i < 20; i++) {
        const a = ((i * 18 + 9) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * R_OUTER_BULL, -Math.cos(a) * R_OUTER_BULL);
        ctx.lineTo(Math.sin(a) * R_DOUBLE_OUT, -Math.cos(a) * R_DOUBLE_OUT);
        ctx.stroke();
      }

      // Numbers
      ctx.fillStyle = '#f3ead7';
      ctx.font = '600 24px Fraunces, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ORDER.forEach((n, i) => {
        const a = (i * 18 * Math.PI) / 180;
        ctx.fillText(String(n), Math.sin(a) * 192, -Math.cos(a) * 192);
      });
    };
    const drawDart = (x, y, scale, who) => {
      const flight = who === 'you' ? '#d9b45a' : '#5fb3d9';
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      // Shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(24, 30);
      ctx.stroke();
      // Barrel and shaft, angled toward the thrower
      ctx.strokeStyle = '#c9c9c9';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 14);
      ctx.stroke();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 14);
      ctx.lineTo(20, 24);
      ctx.stroke();
      // Flights
      ctx.fillStyle = flight;
      ctx.beginPath();
      ctx.moveTo(18, 21);
      ctx.lineTo(30, 22);
      ctx.lineTo(25, 32);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(18, 21);
      ctx.lineTo(17, 34);
      ctx.lineTo(25, 32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const drawReticle = (p, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 15, p.y);
      ctx.lineTo(p.x - 4, p.y);
      ctx.moveTo(p.x + 4, p.y);
      ctx.lineTo(p.x + 15, p.y);
      ctx.moveTo(p.x, p.y - 15);
      ctx.lineTo(p.x, p.y - 4);
      ctx.moveTo(p.x, p.y + 4);
      ctx.lineTo(p.x, p.y + 15);
      ctx.stroke();
    };
    const draw = () => {
      const g = game.current;
      const s = canvas.width / VIEW;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(s, 0, 0, s, (VIEW / 2) * s, (VIEW / 2) * s);
      drawBoard();
      if (!g) return;
      g.darts.forEach((d) => drawDart(d.x, d.y, 1, d.who));
      if (g.flying) {
        // Darts fly in from below and shrink as they reach the board.
        const t = g.flying.t;
        const sx = g.flying.x;
        const sy = g.flying.y + (1 - t) * 260;
        drawDart(sx, sy, 1 + (1 - t) * 1.6, g.flying.who);
      }
      if (phaseRef.current === 'playing') {
        if (g.turn === 'you' && g.stage === 'aiming') drawReticle(reticle(g), '#f1efe6');
        if (g.turn === 'cpu' && g.stage === 'cpuThink') drawReticle(g.cpuAim, '#5fb3d9');
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
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (phaseRef.current === 'playing') playerThrowRef.current();
        else startRef.current();
      }
    };
    const onKeyUp = (e) => {
      const dir = KEYS[e.key];
      if (dir && game.current) game.current.keys[dir] = false;
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
  // Mouse: the aim follows the cursor and a click throws.
  // Touch: drag anywhere to nudge the aim (your finger never hides it), lift after a quick tap to throw.

  const press = useRef(null);
  const toBoard = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW - VIEW / 2,
      y: ((e.clientY - rect.top) / rect.height) * VIEW - VIEW / 2,
      scale: VIEW / rect.width,
    };
  };
  const onPointerDown = (e) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is optional */
    }
    press.current = {
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      time: performance.now(),
      moved: 0,
    };
  };
  const onPointerMove = (e) => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing') return;
    if (e.pointerType === 'mouse') {
      const p = toBoard(e);
      g.aim.x = clamp(p.x, -220, 220);
      g.aim.y = clamp(p.y, -220, 220);
    } else if (press.current) {
      const p = toBoard(e);
      g.aim.x = clamp(g.aim.x + (e.clientX - press.current.lastX) * p.scale, -220, 220);
      g.aim.y = clamp(g.aim.y + (e.clientY - press.current.lastY) * p.scale, -220, 220);
    }
    if (press.current) {
      press.current.moved += Math.hypot(
        e.clientX - press.current.lastX,
        e.clientY - press.current.lastY,
      );
      press.current.lastX = e.clientX;
      press.current.lastY = e.clientY;
    }
  };
  const onPointerUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    const quick = performance.now() - p.time < 400;
    if (p.moved < 8 && (quick || e.pointerType === 'mouse')) playerThrow();
  };

  // ---------- Render ----------

  const yourTurn = hud.turn === 'you';
  const hint = phase === 'playing' && yourTurn ? checkoutHint(hud.scores.you) : '';
  const scoreColumn = (who, name) => {
    const active = phase === 'playing' && hud.turn === who;
    return (
      <div className={`flex-1 rounded-md p-2 ${active ? 'ring-2 ring-brass' : ''}`}>
        <div className="font-display text-sm uppercase tracking-widest text-muted">
          {name}
        </div>
        <div className="font-chalk text-5xl leading-none text-chalk tabular-nums">
          {hud.scores[who]}
        </div>
        <div className="font-chalk text-sm text-muted min-h-[1.25rem]">
          {active ? hud.thrown.join(' · ') || '…' : hud.lastTurn[who]}
        </div>
      </div>
    );
  };
  return (
    <main className="font-display max-w-[900px] mx-auto py-4 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3 pb-1">
        <h1 className="font-display font-black text-[clamp(34px,9vw,52px)] leading-none text-brass">
          Pub Darts
        </h1>
        <div className="text-right text-xs text-muted font-chalk">
          <div>301 · double out</div>
          <div>Best leg: {records.fewest ? `${records.fewest} darts` : '—'}</div>
        </div>
      </header>

      <div className="relative flex flex-col md:flex-row-reverse gap-4 items-center md:items-start">
        <section className="w-full md:w-72 flex flex-col gap-3">
          <div className="bg-slate rounded-lg p-3 border-4 border-[#5a3d22] shadow-inner">
            <div className="flex gap-2">
              {scoreColumn('you', 'You')}
              {scoreColumn(
                'cpu',
                LEVELS[game.current ? game.current.level : level].label,
              )}
            </div>
            <p
              className="font-chalk text-lg text-brass text-center min-h-[1.75rem]"
              aria-live="polite"
            >
              {hud.message ||
                hint ||
                (phase === 'playing' && !yourTurn ? 'Their throw…' : '')}
            </p>
          </div>
          <button
            type="button"
            onClick={playerThrow}
            disabled={phase !== 'playing' || !yourTurn || hud.stage !== 'aiming'}
            className="hidden md:block font-display font-black text-xl px-5 py-3 rounded-md bg-brass text-bg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-chalk"
          >
            Throw
          </button>
          <p className="hidden md:block text-sm text-muted font-chalk leading-snug">
            Mouse: aim and click. Keys: arrows to aim, Space to throw. Hold too long and
            your hand starts to shake.
          </p>
        </section>

        <div
          className="flex flex-col items-center gap-2"
          style={{
            width: 'min(100%, calc(100dvh - 250px), 560px)',
            minWidth: 'min(100%, 260px)',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              press.current = null;
            }}
            aria-label="Dartboard"
            className="w-full block touch-none"
            style={{
              aspectRatio: '1 / 1',
            }}
          />
          <button
            type="button"
            onClick={playerThrow}
            disabled={phase !== 'playing' || !yourTurn || hud.stage !== 'aiming'}
            className="md:hidden w-full font-display font-black text-xl px-5 py-3 rounded-md bg-brass text-bg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-chalk"
          >
            Throw
          </button>
        </div>

        {phase !== 'playing' && (
          <div className="absolute inset-0 bg-card rounded-xl flex flex-col items-center justify-center gap-3 text-center p-5">
            {phase === 'over' && result ? (
              <>
                <p className="font-display font-black text-4xl text-brass">
                  {result.won ? 'Game shot!' : 'Beaten at the oche'}
                </p>
                <p className="font-chalk text-lg text-chalk">
                  {result.won
                    ? `You checked out in ${result.dartsUsed} darts against the ${LEVELS[result.level].label}.`
                    : `The ${LEVELS[result.level].label} got there first.`}
                </p>
              </>
            ) : (
              <>
                <p className="font-display font-black text-4xl text-brass">
                  Step up to the oche
                </p>
                <ul className="font-chalk text-chalk max-w-[36ch] leading-snug space-y-1">
                  <li>You both start on 301. Three darts a turn.</li>
                  <li>Each dart takes its score off your total.</li>
                  <li>You must finish on exactly zero with a double, or the bull.</li>
                  <li>
                    Go below zero, land on 1, or finish without a double, and it's a bust:
                    the turn scores nothing.
                  </li>
                  <li>Your aim drifts. Throw when it passes over your target.</li>
                </ul>
              </>
            )}
            <div
              className="flex flex-wrap justify-center gap-2"
              role="group"
              aria-label="Opponent"
            >
              {Object.keys(LEVELS).map((key) => (
                <button
                  key={String(String(key))}
                  type="button"
                  onClick={() => setLevel(key)}
                  className={`px-3 py-1.5 rounded-full border-2 border-brass text-sm font-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-chalk
                      ${level === key ? 'bg-brass text-bg' : 'text-brass'}`}
                >
                  {LEVELS[key].label} · {records.wins[key] || 0} won
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => start()}
              className="font-display font-black text-2xl px-8 py-2.5 rounded-md bg-brass text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-chalk"
            >
              {phase === 'over' ? 'Play again' : 'Game on'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
