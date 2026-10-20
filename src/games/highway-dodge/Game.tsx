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
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- World ----------
// A fixed 360 x 600 world, scaled to the canvas. Down the screen is "behind you".

const W = 360;
const H = 600;
const ROAD_L = 40;
const ROAD_R = 320;
const LANES = 4;
const LANE_W = (ROAD_R - ROAD_L) / LANES;
const PLAYER_Y = H - 120;
const CAR_W = 34;
const CAR_H = 60;
const PX_PER_METRE = 8;
const COIN_VALUE = 20;
const BEST_KEY = 'highway-dodge-best';
const TRAFFIC_COLORS = ['#b8432f', '#e8dcc4', '#6f7a3a', '#5d86a8', '#8a4a6a', '#d98a2b'];
const rand = (a, b) => a + Math.random() * (b - a);
const laneX = (lane) => ROAD_L + LANE_W * (lane + 0.5);
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
};

// Roadside scenery that scrolls past: cacti, rocks and dry scrub on both shoulders.
function makeScenery() {
  const items = [];
  for (let k = 0; k < 14; k++) {
    const left = k % 2 === 0;
    items.push({
      x: left ? rand(6, ROAD_L - 12) : rand(ROAD_R + 12, W - 6),
      y: rand(0, H + 200),
      kind: ['cactus', 'rock', 'scrub'][Math.floor(Math.random() * 3)],
      size: rand(0.7, 1.2),
    });
  }
  return items;
}

function newGame() {
  return {
    player: {
      lane: 1,
      x: laneX(1),
      tilt: 0,
    },
    cars: [],
    pickups: [],
    sparks: [],
    scenery: makeScenery(),
    speed: 300,
    time: 0,
    travelled: 0,
    coins: 0,
    fuel: 100,
    trafficTimer: 0.6,
    coinTimer: 2,
    fuelTimer: 5,
    roadOffset: 0,
    ending: 0,
    reason: '',
    shake: 0,
  };
}
const scoreOf = (g) => Math.floor(g.travelled / PX_PER_METRE) + g.coins * COIN_VALUE;

// Is a lane clear of cars near the top of the screen?
const laneClearAtTop = (g, lane, depth) =>
  !g.cars.some((c) => c.lane === lane && c.y < depth);

// ---------- Drawing ----------

function drawCar(ctx, x, y, color, isPlayer, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Long golden-hour shadow, cast down and to the right.
  ctx.fillStyle = 'rgba(70,30,10,0.35)';
  ctx.beginPath();
  ctx.roundRect(-CAR_W / 2 + 9, -CAR_H / 2 + 7, CAR_W, CAR_H, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 8);
  ctx.fill();

  // Windscreen, roof, rear window
  ctx.fillStyle = 'rgba(30,25,35,0.85)';
  ctx.beginPath();
  ctx.roundRect(-CAR_W / 2 + 4, -CAR_H / 2 + 12, CAR_W - 8, 12, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-CAR_W / 2 + 5, CAR_H / 2 - 18, CAR_W - 10, 8, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-CAR_W / 2 + 5, -CAR_H / 2 + 26, CAR_W - 10, 14);

  // Sunlight catching the left edge
  ctx.fillStyle = 'rgba(255,220,150,0.35)';
  ctx.fillRect(-CAR_W / 2, -CAR_H / 2 + 6, 3, CAR_H - 12);
  if (isPlayer) {
    ctx.fillStyle = '#fbe3c0';
    ctx.fillRect(-4, -CAR_H / 2 + 1, 3, 11);
    ctx.fillRect(1, -CAR_H / 2 + 1, 3, 11);
    ctx.fillRect(-4, -CAR_H / 2 + 40, 3, 18);
    ctx.fillRect(1, -CAR_H / 2 + 40, 3, 18);
    // Headlights
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2, 6, 3);
    ctx.fillRect(CAR_W / 2 - 9, -CAR_H / 2, 6, 3);
  } else {
    // Brake lights face you
    ctx.fillStyle = '#ff4a2a';
    ctx.fillRect(-CAR_W / 2 + 3, CAR_H / 2 - 3, 7, 3);
    ctx.fillRect(CAR_W / 2 - 10, CAR_H / 2 - 3, 7, 3);
  }
  ctx.restore();
}

function drawScenery(ctx, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(s.size, s.size);
  if (s.kind === 'cactus') {
    ctx.fillStyle = 'rgba(70,30,10,0.3)';
    ctx.fillRect(2, -2, 22, 6);
    ctx.fillStyle = '#4f6b34';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-8, -6, 4, 0, Math.PI * 2);
    ctx.arc(8, 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6f8e45';
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.kind === 'rock') {
    ctx.fillStyle = 'rgba(70,30,10,0.3)';
    ctx.beginPath();
    ctx.ellipse(10, 5, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8603c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d08a5a';
    ctx.beginPath();
    ctx.ellipse(-3, -2, 5, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#8c7a45';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPickup(ctx, p, now) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.kind === 'coin') {
    const squash = Math.abs(Math.cos(now / 220 + p.x));
    ctx.fillStyle = 'rgba(70,30,10,0.3)';
    ctx.beginPath();
    ctx.ellipse(6, 5, 9 * squash + 1, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6c544';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * squash + 1, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff1b0';
    ctx.fillRect(-1.5 * squash, -5, 3 * squash, 10);
  } else {
    // Jerry can
    ctx.fillStyle = 'rgba(70,30,10,0.35)';
    ctx.fillRect(-9, -9, 24, 26);
    ctx.fillStyle = '#c8321f';
    ctx.beginPath();
    ctx.roundRect(-12, -13, 24, 26, 4);
    ctx.fill();
    ctx.fillStyle = '#8f2214';
    ctx.fillRect(-4, -18, 8, 6);
    ctx.strokeStyle = '#fbe3c0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.lineTo(8, 9);
    ctx.moveTo(8, -9);
    ctx.lineTo(-8, 9);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Highway Dodge');

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
  const [hud, setHud] = useState({
    metres: 0,
    coins: 0,
    fuel: 100,
    score: 0,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [reason, setReason] = useState('');
  const [best, setBest] = useState(readBest);
  const start = () => {
    game.current = newGame();
    setHud({
      metres: 0,
      coins: 0,
      fuel: 100,
      score: 0,
    });
    setPhase('playing');
    playTone(330, 0.15, 'sawtooth', 0.025);
  };
  const changeLane = (delta) => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing' || g.ending > 0) return;
    const lane = Math.max(0, Math.min(LANES - 1, g.player.lane + delta));
    if (lane === g.player.lane) return;
    g.player.lane = lane;
    playTone(440 + lane * 60, 0.05, 'triangle', 0.02);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const idleScenery = makeScenery();
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    const gameOver = (g) => {
      phaseRef.current = 'over';
      setReason(g.reason);
      setPhase('over');
      const score = scoreOf(g);
      setBest((b) => {
        const next = Math.max(b, score);
        try {
          localStorage.setItem(BEST_KEY, String(next));
        } catch (e) {
          // Storage unavailable.
        }
        return next;
      });
    };
    const update = (dt) => {
      const g = game.current;
      if (!g) return;
      g.sparks.forEach((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
      });
      g.sparks = g.sparks.filter((s) => s.life > 0);
      g.shake = Math.max(0, g.shake - dt * 2);
      if (phaseRef.current !== 'playing') return;

      // After a crash or an empty tank, a short pause before the results.
      if (g.ending > 0) {
        g.ending -= dt;
        if (g.reason === 'fuel') g.speed = Math.max(0, g.speed - 260 * dt);
        else g.speed = 0;
        if (g.ending <= 0) {
          gameOver(g);
          return;
        }
      } else {
        g.time += dt;
        g.speed = 300 + Math.min(320, g.time * 6);

        // Fuel drains a little faster at higher speed.
        g.fuel -= (4.2 + g.speed / 300) * dt;
        if (g.fuel <= 0) {
          g.fuel = 0;
          g.reason = 'fuel';
          g.ending = 1.6;
          playTone(160, 0.8, 'sawtooth', 0.03);
        }
      }
      const move = g.speed * dt;
      g.travelled += g.ending > 0 && g.reason !== 'fuel' ? 0 : move;
      g.roadOffset = (g.roadOffset + move) % 48;
      g.scenery.forEach((s) => {
        s.y += move;
        if (s.y > H + 30) {
          s.y -= H + 80;
          s.kind = ['cactus', 'rock', 'scrub'][Math.floor(Math.random() * 3)];
        }
      });

      // Player eases into the chosen lane and leans into the turn.
      const p = g.player;
      const target = laneX(p.lane);
      const before = p.x;
      p.x += (target - p.x) * Math.min(1, dt * 14);
      p.tilt = Math.max(-0.25, Math.min(0.25, (p.x - before) * 0.04));
      if (g.ending <= 0) {
        // Traffic: never fill all four lanes near the top, so there is always a way through.
        g.trafficTimer -= dt;
        if (g.trafficTimer <= 0) {
          g.trafficTimer = Math.max(0.42, 1.15 - g.time * 0.008) * rand(0.8, 1.2);
          const lane = Math.floor(Math.random() * LANES);
          const busyLanes = new Set(g.cars.filter((c) => c.y < 240).map((c) => c.lane));
          busyLanes.add(lane);
          if (laneClearAtTop(g, lane, 120) && busyLanes.size < LANES) {
            g.cars.push({
              lane,
              x: laneX(lane),
              y: -CAR_H,
              // Fraction of your speed the car drives at: higher means it drifts down the screen more slowly.
              frac: rand(0.3, 0.72),
              color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
            });
          }
        }

        // A line of coins down one lane
        g.coinTimer -= dt;
        if (g.coinTimer <= 0) {
          g.coinTimer = rand(2.2, 3.6);
          const lane = Math.floor(Math.random() * LANES);
          if (laneClearAtTop(g, lane, 200)) {
            const count = 3 + Math.floor(Math.random() * 3);
            for (let k = 0; k < count; k++)
              g.pickups.push({
                kind: 'coin',
                x: laneX(lane),
                y: -20 - k * 36,
              });
          }
        }

        // Fuel cans, a bit more often when the tank is low
        g.fuelTimer -= dt;
        if (g.fuelTimer <= 0) {
          g.fuelTimer = g.fuel < 35 ? rand(2.5, 3.5) : rand(4.5, 6.5);
          const lane = Math.floor(Math.random() * LANES);
          if (laneClearAtTop(g, lane, 160))
            g.pickups.push({
              kind: 'fuel',
              x: laneX(lane),
              y: -24,
            });
          else g.fuelTimer = 0.4;
        }
      }

      // Cars drift down at the difference between your speed and theirs.
      // A car never drives into the back of a slower car in its lane: it matches speed instead.
      g.cars.forEach((a) => {
        g.cars.forEach((b) => {
          if (a !== b && a.lane === b.lane && a.y < b.y && b.y - a.y < CAR_H + 26)
            a.frac = Math.max(a.frac, b.frac);
        });
      });
      g.cars.forEach((c) => {
        c.y += g.speed * (1 - c.frac) * dt;
      });
      g.cars = g.cars.filter((c) => c.y < H + CAR_H);
      g.pickups.forEach((pk) => {
        pk.y += move;
      });
      g.pickups = g.pickups.filter((pk) => pk.y < H + 30 && !pk.taken);
      if (g.ending <= 0) {
        // Crashes, with a little forgiveness on the bounding boxes.
        const hitCar = g.cars.find(
          (c) => Math.abs(c.x - p.x) < CAR_W - 6 && Math.abs(c.y - PLAYER_Y) < CAR_H - 8,
        );
        if (hitCar) {
          g.reason = 'crash';
          g.ending = 1;
          g.shake = 1;
          for (let k = 0; k < 30; k++) {
            const a = rand(0, Math.PI * 2);
            const s = rand(60, 260);
            g.sparks.push({
              x: (p.x + hitCar.x) / 2,
              y: (PLAYER_Y + hitCar.y) / 2,
              vx: Math.cos(a) * s,
              vy: Math.sin(a) * s,
              life: rand(0.3, 0.8),
            });
          }
          playTone(90, 0.6, 'sawtooth', 0.07);
          playTone(60, 0.8, 'square', 0.05);
        }
        g.pickups.forEach((pk) => {
          if (
            Math.abs(pk.x - p.x) < CAR_W / 2 + 10 &&
            Math.abs(pk.y - PLAYER_Y) < CAR_H / 2 + 10
          ) {
            pk.taken = true;
            if (pk.kind === 'coin') {
              g.coins += 1;
              playTone(1320, 0.06, 'square', 0.02);
            } else {
              g.fuel = Math.min(100, g.fuel + 32);
              playTone(520, 0.1);
              setTimeout(() => playTone(780, 0.12), 80);
            }
          }
        });
      }
      const metres = Math.floor(g.travelled / PX_PER_METRE);
      const fuel = Math.ceil(g.fuel);
      const hudKey = `${metres}|${g.coins}|${fuel}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          metres,
          coins: g.coins,
          fuel,
          score: scoreOf(g),
        });
      }
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      const shake = g ? g.shake * 6 : 0;
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        rand(-shake, shake) * scale,
        rand(-shake, shake) * scale,
      );

      // Sand, with dune ripples on both shoulders
      const sand = ctx.createLinearGradient(0, 0, W, 0);
      sand.addColorStop(0, '#f0b26a');
      sand.addColorStop(1, '#d88a4a');
      ctx.fillStyle = sand;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      const offset = g ? g.roadOffset : 0;
      ctx.strokeStyle = 'rgba(160,80,30,0.25)';
      ctx.lineWidth = 1.5;
      for (let y = -48 + offset; y < H + 48; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(ROAD_L / 2, y - 8, ROAD_L, y);
        ctx.moveTo(ROAD_R, y + 10);
        ctx.quadraticCurveTo((ROAD_R + W) / 2, y + 2, W, y + 10);
        ctx.stroke();
      }
      (g ? g.scenery : idleScenery).forEach((s) => drawScenery(ctx, s));

      // Asphalt, edge lines, lane dashes
      ctx.fillStyle = '#463734';
      ctx.fillRect(ROAD_L - 6, -10, ROAD_R - ROAD_L + 12, H + 20);
      ctx.fillStyle = '#f2d39a';
      ctx.fillRect(ROAD_L - 2, -10, 3, H + 20);
      ctx.fillRect(ROAD_R - 1, -10, 3, H + 20);
      ctx.fillStyle = 'rgba(251,227,192,0.75)';
      for (let lane = 1; lane < LANES; lane++) {
        const x = ROAD_L + lane * LANE_W - 1.5;
        for (let y = -48 + offset; y < H; y += 48) ctx.fillRect(x, y, 3, 24);
      }
      if (g) {
        g.pickups.forEach((pk) => drawPickup(ctx, pk, now));
        g.cars.forEach((c) => drawCar(ctx, c.x, c.y, c.color, false));
        drawCar(ctx, g.player.x, PLAYER_Y, '#1aa6a0', true, g.player.tilt);
        ctx.fillStyle = '#ffd36b';
        g.sparks.forEach((s) => {
          ctx.globalAlpha = Math.min(1, s.life * 2);
          ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
        });
        ctx.globalAlpha = 1;
      } else {
        drawCar(ctx, laneX(1), PLAYER_Y, '#1aa6a0', true);
      }

      // Golden-hour haze from the low sun at the top left
      const haze = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.5);
      haze.addColorStop(0, 'rgba(255,190,90,0.35)');
      haze.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(-10, -10, W + 20, H + 20);

      // Low fuel warning blinks on the road
      if (g && g.fuel < 25 && g.ending <= 0 && Math.floor(now / 300) % 2 === 0) {
        ctx.fillStyle = 'rgba(200,50,31,0.9)';
        ctx.font = '700 18px Goldman, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LOW FUEL', W / 2, 34);
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
    const onKey = (e) => {
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        changeLane(-1);
      }
      if (['ArrowRight', 'd', 'D'].includes(e.key)) {
        e.preventDefault();
        changeLane(1);
      }
      if (
        (e.key === ' ' || e.key === 'Enter') &&
        phaseRef.current !== 'playing' &&
        !e.repeat
      ) {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Swipe left / right, or tap the left or right half of the road.
  const touch = useRef(null);
  const onPointerDown = (e) => {
    touch.current = {
      x: e.clientX,
      y: e.clientY,
      swiped: false,
    };
  };
  const onPointerMove = (e) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.clientX - t.x;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(e.clientY - t.y)) {
      changeLane(dx > 0 ? 1 : -1);
      t.x = e.clientX;
      t.y = e.clientY;
      t.swiped = true;
    }
  };
  const onPointerUp = (e) => {
    const t = touch.current;
    touch.current = null;
    if (!t || t.swiped) return;
    const rect = canvasRef.current.getBoundingClientRect();
    changeLane(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
  };
  const fuelColor = hud.fuel < 25 ? 'bg-[#c8321f]' : hud.fuel < 50 ? 'bg-sun' : 'bg-teal';
  return (
    <main className="font-body max-w-[460px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-[clamp(28px,8.5vw,42px)] leading-none text-sun uppercase">
            Highway Dodge
          </h1>
          <p className="text-sm text-muted">Two hundred miles of sand and a low sun.</p>
        </div>
        <div className="text-right text-sm text-muted">
          <div>
            Score{' '}
            <b className="font-display text-xl text-ink tabular-nums">{hud.score}</b>
          </div>
          <div>Best {Math.max(best, hud.score)}</div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-black/30 py-1">
          <div className="text-[11px] uppercase tracking-widest text-muted">Distance</div>
          <div className="font-display text-xl tabular-nums">{hud.metres} m</div>
        </div>
        <div className="rounded-md bg-black/30 py-1">
          <div className="text-[11px] uppercase tracking-widest text-muted">Coins</div>
          <div className="font-display text-xl tabular-nums text-sun">{hud.coins}</div>
        </div>
        <div className="rounded-md bg-black/30 py-1 px-2">
          <div className="text-[11px] uppercase tracking-widest text-muted">Fuel</div>
          <div
            className="h-3 mt-1.5 rounded-full bg-black/40 overflow-hidden"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hud.fuel}
            aria-label="Fuel"
          >
            <div
              className={`h-full ${fuelColor}`}
              style={{
                width: `${hud.fuel}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: 'calc(68vh * 0.6)',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            touch.current = null;
          }}
          aria-label="Desert highway"
          className="w-full block rounded-xl touch-none select-none"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-xl bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="font-display font-bold text-3xl text-sun uppercase">
              {phase === 'over'
                ? reason === 'fuel'
                  ? 'Out of gas'
                  : 'Wrecked'
                : 'Hit the road'}
            </p>
            <p className="max-w-[32ch]">
              {phase === 'over'
                ? `${hud.metres} m and ${hud.coins} coins: ${hud.score} points. Best: ${Math.max(best, hud.score)}.`
                : 'Weave through the traffic on a four-lane desert highway. One touch of another car ends the run.'}
            </p>
            <p className="text-sm text-muted max-w-[32ch]">
              Your fuel keeps dropping, so grab the red cans. Coins add {COIN_VALUE}{' '}
              points each. The road gets faster the longer you last.
            </p>
            <p className="text-sm text-muted">
              Arrow keys or A / D. Swipe, or tap the left or right half.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display font-bold text-xl uppercase px-7 py-2 rounded-md bg-sun text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Play again' : 'Drive'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
