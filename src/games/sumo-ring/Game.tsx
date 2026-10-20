import type { KeyboardState } from '../../shared/input';
import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameState = {
  level: number;
  score: number;
  chargeSources: Set<unknown>;
  pointer: {
    x: number;
    y: number;
    active: boolean;
    pressed: boolean;
  };
  player?: any;
  stage?: string;
  opp?: any;
  dust?: undefined[] | any;
  stageTimer?: number;
  banner?: string;
  wins?: number;
  losses?: number;
  hudKey?: string;
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

// ---------- Ring and bodies (logical units; the canvas scales to fit) ----------

const W = 400;
const H = 400;
const CX = 200;
const CY = 200;
const RING = 150; // step past the straw with your centre and you lose the bout
const BODY_R = 24;
const FRICTION = 2.8; // clay drag, per second
const RESTITUTION = 0.3;
const SUBSTEPS = 4;
const CHARGE_TIME = 0.9; // seconds to a full charge
const STAGGER_HIT = 220; // a shove that changes your speed by more than this knocks you off balance
const STAGGER_TIME = 0.45;
const BEST_KEY = 'sumo-ring-best';
const RANKS = [
  'Jonokuchi',
  'Jonidan',
  'Sandanme',
  'Makushita',
  'Juryo',
  'Maegashira',
  'Komusubi',
  'Sekiwake',
  'Ozeki',
  'Yokozuna',
];
const NAMES = [
  'Kumoyama',
  'Hayatesho',
  'Iwanami',
  'Kirinofuji',
  'Takaarashi',
  'Umikaze',
  'Raidennada',
  'Shiranami',
  'Kongozan',
  'Tenryuho',
];
const opponentFor = (level) => ({
  name: NAMES[level % NAMES.length] + (level >= NAMES.length ? ' II' : ''),
  rank: RANKS[Math.min(level, RANKS.length - 1)],
});
function makeBody(x, facing, opts) {
  return {
    x,
    y: CY,
    vx: 0,
    vy: 0,
    facing,
    charge: 0,
    charging: false,
    cooldown: 0,
    stagger: 0,
    dashId: 0,
    ...opts,
  };
}

function newBout(g) {
  const L = g.level;
  g.player = makeBody(CX - 42, 0, {
    mass: 1,
    accel: 540,
    maxWalk: 150,
    power: 1,
    skin: '#e8b48c',
    belt: '#2b3a67',
  });
  g.opp = makeBody(CX + 42, Math.PI, {
    mass: 1 + 0.06 * L,
    accel: Math.min(740, 480 + 32 * L),
    maxWalk: Math.min(180, 130 + 6 * L),
    power: 0.92 + 0.04 * L,
    skin: '#c98f66',
    belt: '#7a2a2a',
  });
  g.ai = {
    state: 'stalk',
    timer: 0.3,
    chargeGoal: 0,
    feint: false,
    seenDash: 0,
    henkaIn: -1,
    cool: 0,
  };
  g.stage = 'ready';
  g.stageTimer = 1.4;
  g.banner = 'Hakkeyoi!';
  g.dust = [];
}

function newMatch(g) {
  g.wins = 0;
  g.losses = 0;
  newBout(g);
}

function newGame() {
  const g = {
    level: 0,
    score: 0,
    chargeSources: new Set(),
    pointer: {
      x: 0,
      y: 0,
      active: false,
      pressed: false,
    },
  } as GameState;
  newMatch(g);
  return g;
}

// Sand specks scattered once, so the clay has texture.
const SPECKS = Array.from(
  {
    length: 260,
  },
  () => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (RING + 30);
    return {
      x: CX + Math.cos(a) * r,
      y: CY + Math.sin(a) * r,
      s: Math.random() < 0.5 ? 1 : 1.6,
    };
  },
);
const edgeDist = (b) => Math.hypot(b.x - CX, b.y - CY);

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Sumo Ring');

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
  const keys = useRef({} as KeyboardState);
  const [hud, setHud] = useState({
    wins: 0,
    losses: 0,
    level: 0,
    score: 0,
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
  const saveBest = (score) => {
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
  const start = () => {
    game.current = newGame();
    setHud({
      wins: 0,
      losses: 0,
      level: 0,
      score: 0,
    });
    setPhase('playing');
    playTone(196, 0.3, 'sine', 0.05);
  };
  const nextOpponent = () => {
    const g = game.current;
    g.level++;
    g.chargeSources.clear();
    newMatch(g);
    setHud({
      wins: 0,
      losses: 0,
      level: g.level,
      score: g.score,
    });
    setPhase('playing');
    playTone(196, 0.3, 'sine', 0.05);
  };

  // A dash always drives straight at the other wrestler; the longer the charge, the harder the shove.
  const dash = (body, target) => {
    const dx = target.x - body.x;
    const dy = target.y - body.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = (220 + 460 * body.charge) * body.power;
    body.vx += (dx / d) * speed;
    body.vy += (dy / d) * speed;
    body.facing = Math.atan2(dy, dx);
    body.charge = 0;
    body.charging = false;
    body.cooldown = 0.6;
    body.dashId++;
    playTone(110 + speed * 0.2, 0.12, 'sawtooth', 0.04);
  };
  const chargeStart = (source) => {
    if (phaseRef.current !== 'playing') return;
    game.current.chargeSources.add(source);
  };
  const chargeRelease = (source) => {
    const g = game.current;
    if (!g.chargeSources.has(source)) return;
    g.chargeSources.delete(source);
    if (g.chargeSources.size > 0) return;
    const p = g.player;
    if (g.stage === 'fight' && p.charge > 0.05) dash(p, g.opp);
    else p.charge = 0;
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

    // ---------- Computer wrestler ----------
    // Stalks to the centre side of you, charges when close, and at higher ranks feints (starts a charge, then
    // backs off to bait yours) and sidesteps your dash when it is near the straw.

    const aiThink = (g, dt) => {
      const ai = g.ai;
      const me = g.opp;
      const foe = g.player;
      const L = g.level;
      const dx = foe.x - me.x;
      const dy = foe.y - me.y;
      const dist = Math.hypot(dx, dy) || 1;
      const myEdge = edgeDist(me);
      ai.timer -= dt;

      // Knocked off balance: any charge is lost and there is nothing to do but stagger.
      if (me.stagger > 0) {
        me.charging = false;
        if (ai.state === 'charge') {
          ai.state = 'recover';
          ai.timer = 0.15;
        }
        return null;
      }

      // Notice each new dash once, and maybe plan a sidestep (henka).
      if (foe.dashId !== ai.seenDash) {
        ai.seenDash = foe.dashId;
        const nearStraw = myEdge > RING - 70 ? 0.3 : 0;
        const chance = L >= 2 ? Math.min(0.65, 0.08 * L + nearStraw) : 0;
        if (dist < 140 && Math.random() < chance)
          ai.henkaIn = Math.max(0.03, 0.13 - 0.01 * L);
      }
      if (ai.henkaIn >= 0) {
        ai.henkaIn -= dt;
        if (ai.henkaIn < 0) {
          // Step sideways, toward the centre of the ring.
          let px = -dy / dist;
          let py = dx / dist;
          if (px * (CX - me.x) + py * (CY - me.y) < 0) {
            px = -px;
            py = -py;
          }
          const hop = 260 + 15 * L;
          me.vx += px * hop;
          me.vy += py * hop;
          me.charge = 0;
          ai.state = 'recover';
          ai.timer = 0.3;
          playTone(330, 0.06, 'triangle', 0.03);
        }
      }

      // Where to walk: right up to you at first; at higher ranks, round to your centre side so the push goes out.
      const fx = foe.x - CX;
      const fy = foe.y - CY;
      const fd = Math.hypot(fx, fy) || 1;
      const sideWeight = Math.min(1, 0.3 * L);
      let tx = foe.x - (fx / fd) * (BODY_R * 2 + 4) * sideWeight;
      let ty = foe.y - (fy / fd) * (BODY_R * 2 + 4) * sideWeight;
      const cornered = myEdge > RING - 45;
      if (cornered && L === 0) {
        // The first opponent just leans back toward the middle.
        tx = (tx + CX) / 2;
        ty = (ty + CY) / 2;
      } else if (cornered) {
        // Too close to the straw: slide round you, back toward the middle. Higher ranks do it more decisively.
        let px = -dy / dist;
        let py = dx / dist;
        if (px * (CX - me.x) + py * (CY - me.y) < 0) {
          px = -px;
          py = -py;
        }
        const slide = Math.min(70, 10 + 12 * L);
        tx = me.x + (CX - me.x) * 0.5 + px * slide;
        ty = me.y + (CY - me.y) * 0.5 + py * slide;
      }
      const holdsFire = cornered && L >= 2; // seasoned wrestlers don't charge with their heels on the straw

      let walk = null;
      me.charging = false;
      if (ai.state === 'stalk') {
        walk = [tx - me.x, ty - me.y];
        if (ai.timer <= 0) {
          ai.timer = Math.max(0.1, 0.4 - 0.03 * L);
          if (
            dist < 140 &&
            me.cooldown <= 0 &&
            !holdsFire &&
            Math.random() < 0.55 + 0.04 * L
          ) {
            ai.state = 'charge';
            ai.chargeGoal = 0.35 + Math.random() * 0.6;
            ai.feint = L >= 3 && Math.random() < Math.min(0.45, 0.1 + 0.05 * L);
          }
        }
      } else if (ai.state === 'charge') {
        walk = [tx - me.x, ty - me.y];
        me.charging = true;
        me.charge = Math.min(1, me.charge + dt / CHARGE_TIME);
        if (ai.feint && me.charge > ai.chargeGoal * 0.6) {
          me.charge = 0;
          ai.state = 'backoff';
          ai.timer = 0.35;
        } else if (me.charge >= ai.chargeGoal) {
          dash(me, foe);
          ai.state = 'recover';
          ai.timer = 0.5;
        }
      } else if (ai.state === 'backoff') {
        walk = [me.x - foe.x + (CX - me.x), me.y - foe.y + (CY - me.y)];
        if (ai.timer <= 0) {
          ai.state = 'stalk';
          ai.timer = 0.1;
        }
      } else {
        // Recovering from a dash or a sidestep: no new charge yet. From the second opponent on, they keep
        // their feet planted and pushing while they recover.
        if (L >= 1) walk = [tx - me.x, ty - me.y];
        if (ai.timer <= 0) {
          ai.state = 'stalk';
          ai.timer = 0.1;
        }
      }
      return walk;
    };

    // ---------- Physics ----------

    const walkBody = (b, dir, h) => {
      if (!dir || b.stagger > 0) return;
      const len = Math.hypot(dir[0], dir[1]);
      if (len < 1) return;
      // Ease off as the target gets close, so the wrestler doesn't jitter on the spot.
      const strength = Math.min(1, len / 30);
      const ux = dir[0] / len;
      const uy = dir[1] / len;
      const along = b.vx * ux + b.vy * uy;
      if (along < b.maxWalk) {
        const a = b.accel * strength * (b.charging ? 0.4 : 1);
        b.vx += ux * a * h;
        b.vy += uy * a * h;
      }
      b.facing = Math.atan2(uy, ux);
    };
    const physicsStep = (g, h, playerDir, oppDir) => {
      const bodies = [g.player, g.opp];
      walkBody(g.player, playerDir, h);
      walkBody(g.opp, oppDir, h);
      const drag = Math.exp(-FRICTION * h);
      for (const b of bodies) {
        b.vx *= drag;
        b.vy *= drag;
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.x = Math.max(BODY_R, Math.min(W - BODY_R, b.x));
        b.y = Math.max(BODY_R, Math.min(H - BODY_R, b.y));
      }

      // Two heavy circles colliding: separate them by mass, then exchange momentum along the contact line.
      const a = g.player;
      const b = g.opp;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d < BODY_R * 2) {
        const nx = dx / d;
        const ny = dy / d;
        const overlap = BODY_R * 2 - d;
        const total = a.mass + b.mass;
        a.x -= nx * overlap * (b.mass / total);
        a.y -= ny * overlap * (b.mass / total);
        b.x += nx * overlap * (a.mass / total);
        b.y += ny * overlap * (a.mass / total);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          // Whoever was moving harder into the contact is the attacker.
          const aInto = a.vx * nx + a.vy * ny;
          const bInto = -(b.vx * nx + b.vy * ny);
          const j = (-(1 + RESTITUTION) * vn) / (1 / a.mass + 1 / b.mass);
          a.vx -= (j / a.mass) * nx;
          a.vy -= (j / a.mass) * ny;
          b.vx += (j / b.mass) * nx;
          b.vy += (j / b.mass) * ny;

          // A hard hit knocks the defender off balance: for a moment they can't plant their feet or charge.
          const victim = aInto > bInto ? b : a;
          if (j / victim.mass > STAGGER_HIT) {
            victim.stagger = STAGGER_TIME;
            victim.charge = 0;
          }
          if (-vn > 180) {
            playTone(90, 0.15, 'square', 0.05);
            for (let k = 0; k < 6; k++) {
              g.dust.push({
                x: a.x + nx * BODY_R,
                y: a.y + ny * BODY_R,
                vx: (Math.random() - 0.5) * 120,
                vy: (Math.random() - 0.5) * 120,
                life: 0.5,
              });
            }
          }
        }
      }
    };

    // ---------- Bout flow ----------

    const endBout = (g, playerWon) => {
      g.stage = 'end';
      g.stageTimer = 1.6;
      g.chargeSources.clear();
      g.player.charging = false;
      if (playerWon) {
        g.wins++;
        g.score += 100;
        g.banner = 'Oshidashi! You win the bout';
        [392, 523, 659].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.18, 'sine', 0.05), k * 120),
        );
      } else {
        g.losses++;
        g.banner = 'Out of the ring';
        playTone(130, 0.5, 'sawtooth', 0.04);
      }
    };
    const update = (dt) => {
      const g = game.current;
      for (const p of g.dust) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      g.dust = g.dust.filter((p) => p.life > 0);
      if (phaseRef.current !== 'playing') return;
      const p = g.player;
      const o = g.opp;
      p.cooldown = Math.max(0, p.cooldown - dt);
      o.cooldown = Math.max(0, o.cooldown - dt);
      p.stagger = Math.max(0, p.stagger - dt);
      o.stagger = Math.max(0, o.stagger - dt);

      // Charging builds even during the countdown, ready for the tachiai.
      p.charging =
        g.chargeSources.size > 0 &&
        p.cooldown <= 0 &&
        p.stagger <= 0 &&
        g.stage !== 'end';
      if (p.charging) p.charge = Math.min(1, p.charge + dt / CHARGE_TIME);
      let playerDir = null;
      let oppDir = null;
      if (g.stage === 'fight') {
        const k = keys.current;
        const kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        const ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        if (kx || ky) playerDir = [kx * 100, ky * 100];
        else if (g.pointer.active) playerDir = [g.pointer.x - p.x, g.pointer.y - p.y];
        oppDir = aiThink(g, dt);
      }
      for (let s = 0; s < SUBSTEPS; s++) physicsStep(g, dt / SUBSTEPS, playerDir, oppDir);
      if (g.stage === 'ready') {
        g.stageTimer -= dt;
        if (g.stageTimer <= 0) {
          g.stage = 'fight';
          g.banner = '';
          playTone(392, 0.15, 'square', 0.04);
          // The computer may come out of the crouch already charged.
          if (Math.random() < 0.4 + 0.04 * g.level) {
            o.charge = 0.3 + Math.random() * 0.4;
            dash(o, p);
          }
        }
      } else if (g.stage === 'fight') {
        const pOut = edgeDist(p) > RING;
        const oOut = edgeDist(o) > RING;
        if (pOut || oOut) {
          // If both step out together, whoever went farther loses.
          const playerWon = oOut && (!pOut || edgeDist(o) > edgeDist(p));
          endBout(g, playerWon);
        }
      } else if (g.stage === 'end') {
        g.stageTimer -= dt;
        if (g.stageTimer <= 0) {
          // 'done' waits for the menu, so this only runs once even before React re-renders.
          if (g.wins >= 2 || g.losses >= 2) g.stage = 'done';
          if (g.wins >= 2) {
            g.score += 200;
            saveBest(g.score);
            setPhase('between');
          } else if (g.losses >= 2) {
            saveBest(g.score);
            setPhase('over');
          } else {
            newBout(g);
          }
        }
      }
      const hudKey = `${g.wins}|${g.losses}|${g.level}|${g.score}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          wins: g.wins,
          losses: g.losses,
          level: g.level,
          score: g.score,
        });
      }
    };

    // ---------- Drawing ----------

    const drawTassel = (x, y, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    const drawWrestler = (b, label) => {
      const crouch = b.charging ? 0.93 : 1;
      const r = BODY_R * crouch;
      const wobble = b.stagger > 0 ? Math.sin(performance.now() / 30) * 2.5 : 0;
      ctx.save();
      ctx.translate(b.x + wobble, b.y);

      // Shadow
      ctx.fillStyle = 'rgba(60, 35, 15, 0.35)';
      ctx.beginPath();
      ctx.ellipse(4, 6, r + 2, r, 0, 0, Math.PI * 2);
      ctx.fill();

      // Charge glow
      if (b.charge > 0) {
        ctx.strokeStyle = `rgba(255, 236, 170, ${0.3 + b.charge * 0.6})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + b.charge * Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(b.facing);

      // Hands reaching forward
      ctx.fillStyle = b.skin;
      [-0.75, 0.75].forEach((a) => {
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3), 7, 0, Math.PI * 2);
        ctx.fill();
      });

      // Body with the mawashi belt
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.belt;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
      ctx.stroke();

      // Head with the topknot
      ctx.fillStyle = b.skin;
      ctx.beginPath();
      ctx.arc(6, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1210';
      ctx.beginPath();
      ctx.arc(3, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f3e7d0';
      ctx.font = '700 11px "BIZ UDPGothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, b.x, b.y - BODY_R - 10);
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      const t = now / 1000;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Hall floor and the square clay mound
      ctx.fillStyle = '#2a1d14';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#a77a4c';
      ctx.fillRect(14, 14, W - 28, H - 28);
      ctx.fillStyle = '#c99a66';
      ctx.fillRect(24, 24, W - 48, H - 48);

      // Outer square of straw bales
      ctx.strokeStyle = '#cdb173';
      ctx.lineWidth = 7;
      ctx.strokeRect(30, 30, W - 60, H - 60);

      // Swept sand inside the ring
      ctx.fillStyle = '#ddb889';
      ctx.beginPath();
      ctx.arc(CX, CY, RING, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 80, 40, 0.18)';
      for (const s of SPECKS) ctx.fillRect(s.x, s.y, s.s, s.s);

      // The tawara: straw bales around the ring, with gaps at the four cardinal points
      const gap = 0.07;
      for (let q = 0; q < 4; q++) {
        const a0 = q * (Math.PI / 2) + gap;
        const a1 = (q + 1) * (Math.PI / 2) - gap;
        ctx.strokeStyle = '#dcc283';
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.arc(CX, CY, RING + 5, a0, a1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(110, 85, 35, 0.6)';
        ctx.lineWidth = 1;
        for (let a = a0; a < a1; a += 0.12) {
          ctx.beginPath();
          ctx.moveTo(CX + Math.cos(a) * (RING - 0.5), CY + Math.sin(a) * (RING - 0.5));
          ctx.lineTo(CX + Math.cos(a) * (RING + 10.5), CY + Math.sin(a) * (RING + 10.5));
          ctx.stroke();
        }
      }

      // White shikiri lines where the wrestlers crouch
      ctx.fillStyle = '#f6f1e6';
      ctx.fillRect(CX - 22, CY - 16, 4, 32);
      ctx.fillRect(CX + 18, CY - 16, 4, 32);

      // Dust kicked up by big hits
      for (const p of g.dust) {
        ctx.fillStyle = `rgba(230, 200, 150, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + (0.5 - p.life) * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      drawWrestler(g.opp, 'CPU');
      drawWrestler(g.player, 'YOU');

      // Where the pointer is leading you
      if (phaseRef.current === 'playing' && g.pointer.active && g.stage === 'fight') {
        ctx.strokeStyle = 'rgba(43, 58, 103, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.pointer.x, g.pointer.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Roof tassels at the corners: blue-green east, red south, white west, black north
      drawTassel(14, 14, '#1d1a18');
      drawTassel(W - 14, 14, '#2f8f7a');
      drawTassel(W - 14, H - 14, '#c33a2c');
      drawTassel(14, H - 14, '#f1ece2');

      // Curtain edge of the hanging roof along the top
      ctx.fillStyle = '#6a2c74';
      ctx.fillRect(40, 0, W - 80, 9);
      ctx.fillStyle = '#4e1f57';
      for (let x = 40; x < W - 40; x += 20) {
        ctx.beginPath();
        ctx.arc(x + 10, 9, 10, 0, Math.PI);
        ctx.fill();
      }

      // Banner text
      if (phaseRef.current === 'playing' && g.banner) {
        const pulse = 1 + Math.sin(t * 6) * 0.03;
        ctx.save();
        ctx.translate(CX, CY - 92);
        ctx.scale(pulse, pulse);
        ctx.font = '30px "Yuji Syuku", serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(29, 21, 16, 0.85)';
        ctx.strokeText(g.banner, 0, 0);
        ctx.fillStyle = '#f3e7d0';
        ctx.fillText(g.banner, 0, 0);
        ctx.restore();
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

    // ---------- Keyboard ----------

    const DIR_KEYS = {
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowUp: 'up',
      w: 'up',
      W: 'up',
      ArrowDown: 'down',
      s: 'down',
      S: 'down',
    };
    const onKeyDown = (e) => {
      if (DIR_KEYS[e.key]) {
        e.preventDefault();
        keys.current[DIR_KEYS[e.key]] = true;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (phaseRef.current === 'playing') {
          if (e.key === ' ') chargeStart('key');
        } else {
          document.querySelector<HTMLElement>('[data-primary]')?.click();
        }
      }
    };
    const onKeyUp = (e) => {
      if (DIR_KEYS[e.key]) keys.current[DIR_KEYS[e.key]] = false;
      if (e.key === ' ') chargeRelease('key');
    };
    const onBlur = () => {
      keys.current = {};
      game.current.chargeSources.clear();
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
  // Mouse: your wrestler walks toward the pointer; hold the button to charge, release to dash.
  // Touch: press and drag on the ring to walk; hold the charge button with the other thumb.

  const toRing = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };
  const onPointerDown = (e) => {
    if (phaseRef.current !== 'playing') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture not supported */
    }
    const ptr = game.current.pointer;
    Object.assign(ptr, toRing(e), {
      active: true,
      pressed: true,
    });
    if (e.pointerType === 'mouse') chargeStart('mouse');
  };
  const onPointerMove = (e) => {
    const ptr = game.current.pointer;
    if (e.pointerType === 'mouse' || ptr.pressed)
      Object.assign(ptr, toRing(e), {
        active: true,
      });
  };
  const onPointerUp = (e) => {
    const ptr = game.current.pointer;
    ptr.pressed = false;
    if (e.pointerType === 'mouse') chargeRelease('mouse');
    else ptr.active = false;
  };
  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse' && !game.current.pointer.pressed)
      game.current.pointer.active = false;
  };
  const opp = opponentFor(hud.level);
  const dots = (n, color) =>
    [0, 1].map((i) => (
      <span
        key={String(String(i))}
        className={`inline-block w-3 h-3 rounded-full border-2 ${i < n ? color : 'border-muted'}`}
      />
    ));
  return (
    <main className="font-body max-w-[560px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-x-3 gap-y-1 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(34px,10vw,52px)] leading-none text-straw">
            Sumo Ring
          </h1>
          <p className="text-xs text-muted mt-1">
            Score {hud.score} · Best {Math.max(best, hud.score)}
          </p>
        </div>
        <div className="text-right text-sm leading-snug">
          <div className="flex items-center justify-end gap-1.5">
            You {dots(hud.wins, 'bg-straw border-straw')}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-muted">
            {opp.name} {dots(hud.losses, 'bg-[#c33a2c] border-[#c33a2c]')}
          </div>
          <div className="text-xs text-muted">
            {opp.rank} · opponent {hud.level + 1}
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: 'min(100%, calc(100dvh - 230px))',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Sumo ring seen from above. Move toward the pointer; hold to charge, release to dash."
          className="w-full block rounded-xl touch-none select-none cursor-crosshair"
          style={{
            aspectRatio: '1 / 1',
            boxShadow: '0 0 0 3px #6a2c74, 0 24px 60px rgba(0,0,0,.55)',
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-xl bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            {phase === 'ready' && (
              <>
                <p className="font-display text-4xl text-straw">The basho begins</p>
                <p className="text-muted max-w-[34ch]">
                  Push the other wrestler out of the straw ring. Hold to crouch and
                  charge, then release to dash and shove. A bigger charge hits harder. Win
                  two bouts to beat each opponent; each one is stronger and craftier.
                </p>
              </>
            )}
            {phase === 'between' && (
              <>
                <p className="font-display text-4xl text-straw">Kachi-koshi!</p>
                <p className="text-muted max-w-[32ch]">
                  You beat {opp.name}. Next up: {opponentFor(hud.level + 1).name},{' '}
                  {opponentFor(hud.level + 1).rank}. Score {hud.score}.
                </p>
              </>
            )}
            {phase === 'over' && (
              <>
                <p className="font-display text-4xl text-straw">Make-koshi</p>
                <p className="text-muted max-w-[32ch]">
                  {opp.name} pushed you out twice. You beat {hud.level}{' '}
                  {hud.level === 1 ? 'opponent' : 'opponents'}. Score {hud.score}. Best{' '}
                  {Math.max(best, hud.score)}.
                </p>
              </>
            )}
            <p className="text-sm text-muted">
              Keys: arrows or WASD to move, hold Space to charge. Mouse: move to walk,
              hold the button to charge.
            </p>
            <button
              type="button"
              data-primary
              onClick={phase === 'between' ? nextOpponent : start}
              className="font-display text-2xl px-7 py-2 rounded-full bg-murasaki text-ink shadow-[0_5px_0_#3d1645] focus-visible:outline focus-visible:outline-2 focus-visible:outline-straw"
            >
              {phase === 'ready' && 'Step into the ring'}
              {phase === 'between' && 'Next opponent'}
              {phase === 'over' && 'Play again'}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted max-w-[30ch]">
          On touch screens, drag on the ring to walk and hold this button to charge.
        </p>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            chargeStart('button');
          }}
          onPointerUp={() => chargeRelease('button')}
          onPointerCancel={() => chargeRelease('button')}
          onPointerLeave={() => chargeRelease('button')}
          onContextMenu={(e) => e.preventDefault()}
          className="shrink-0 w-24 h-24 rounded-full bg-murasaki text-ink font-display text-xl touch-none select-none shadow-[0_6px_0_#3d1645] active:translate-y-1 active:shadow-[0_2px_0_#3d1645]"
        >
          Charge
        </button>
      </div>
    </main>
  );
}
export default App;
