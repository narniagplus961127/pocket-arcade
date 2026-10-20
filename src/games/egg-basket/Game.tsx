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
// A fixed 400 x 560 world, scaled to fit the canvas.

const W = 400;
const H = 560;
const PERCH_Y = 96;
const GROUND_Y = H - 50;
const RIM_Y = H - 96;
const BASKET_W = 86;
const MAX_CRACKS = 3;
const HEN_X = [62, 154, 246, 338];
const BEST_KEY = 'egg-basket-best';
const rand = (a, b) => a + Math.random() * (b - a);
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
};
function newGame() {
  return {
    hens: HEN_X.map((x, i) => ({
      x,
      warn: 0,
      brown: i % 2 === 1,
      bob: rand(0, 6),
    })),
    eggs: [],
    splats: [],
    sparks: [],
    texts: [],
    basket: {
      x: W / 2,
      target: null,
      caught: [],
    },
    score: 0,
    cracks: 0,
    layTimer: 1,
    lastHen: -1,
    time: 0,
  };
}

// Later eggs fall faster and hens lay more often.
const speedOf = (g) => 1 + Math.min(1.3, g.score * 0.012);
function pickEggType(g) {
  const roll = Math.random();
  if (roll < 0.08) return 'gold';
  if (roll < 0.08 + Math.min(0.25, 0.06 + g.score * 0.004)) return 'rotten';
  return 'white';
}

// ---------- Drawing ----------

function drawScene(ctx, now) {
  // Sunrise sky
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#6d8fc4');
  sky.addColorStop(0.45, '#f4a3a0');
  sky.addColorStop(0.8, '#ffc98a');
  sky.addColorStop(1, '#ffe2a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // The sun, slowly rising over the game.
  const sunY = 400 - Math.min(80, (now / 1000) * 0.6);
  const glow = ctx.createRadialGradient(285, sunY, 20, 285, sunY, 150);
  glow.addColorStop(0, 'rgba(255,240,180,0.9)');
  glow.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, GROUND_Y);
  ctx.fillStyle = '#fff1b8';
  ctx.beginPath();
  ctx.arc(285, sunY, 48, 0, Math.PI * 2);
  ctx.fill();

  // Rolling hills
  ctx.fillStyle = '#c98b6b';
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.quadraticCurveTo(120, 370, 230, 410);
  ctx.quadraticCurveTo(330, 440, W, 395);
  ctx.lineTo(W, GROUND_Y);
  ctx.lineTo(0, GROUND_Y);
  ctx.fill();
  ctx.fillStyle = '#8f9b55';
  ctx.beginPath();
  ctx.moveTo(0, 455);
  ctx.quadraticCurveTo(160, 425, 260, 450);
  ctx.quadraticCurveTo(340, 470, W, 445);
  ctx.lineTo(W, GROUND_Y);
  ctx.lineTo(0, GROUND_Y);
  ctx.fill();

  // Barn
  ctx.fillStyle = '#9e2c24';
  ctx.fillRect(14, 372, 92, 88);
  ctx.fillStyle = '#7d211b';
  ctx.beginPath();
  ctx.moveTo(6, 376);
  ctx.lineTo(60, 336);
  ctx.lineTo(114, 376);
  ctx.fill();
  ctx.strokeStyle = '#f6e3cf';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 410, 40, 50);
  ctx.beginPath();
  ctx.moveTo(40, 410);
  ctx.lineTo(80, 460);
  ctx.moveTo(80, 410);
  ctx.lineTo(40, 460);
  ctx.stroke();
  ctx.fillStyle = '#f6e3cf';
  ctx.fillRect(53, 382, 14, 14);

  // Fence
  ctx.fillStyle = '#e9cfa8';
  for (let x = 130; x < W; x += 26) ctx.fillRect(x, 448, 6, 30);
  ctx.fillRect(120, 455, W - 120, 5);
  ctx.fillRect(120, 467, W - 120, 5);

  // Grass
  ctx.fillStyle = '#6d8c3e';
  ctx.fillRect(0, GROUND_Y - 20, W, H - GROUND_Y + 20);
  ctx.fillStyle = '#5c7a33';
  for (let x = 4; x < W; x += 11) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y - 20);
    ctx.lineTo(x + 3, GROUND_Y - 28);
    ctx.lineTo(x + 6, GROUND_Y - 20);
    ctx.fill();
  }

  // Perch beam with posts
  ctx.fillStyle = '#7a4e2c';
  ctx.fillRect(18, PERCH_Y, 8, 40);
  ctx.fillRect(W - 26, PERCH_Y, 8, 40);
  ctx.fillStyle = '#9a6538';
  ctx.fillRect(8, PERCH_Y - 4, W - 16, 12);
  ctx.fillStyle = '#b97c47';
  ctx.fillRect(8, PERCH_Y - 4, W - 16, 3);
}

function drawHen(ctx, hen, now) {
  // A hen about to lay puffs up and wobbles.
  const warn = hen.warn > 0;
  const wobble = warn ? Math.sin(now / 30) * 2.5 : Math.sin(now / 600 + hen.bob) * 0.8;
  const puff = warn ? 1.12 : 1;
  const body = hen.brown ? '#b5713d' : '#fbf6ee';
  const wing = hen.brown ? '#93572b' : '#e5dccd';
  ctx.save();
  ctx.translate(hen.x + wobble, PERCH_Y - 18);
  ctx.scale(puff, puff);

  // Straw nest
  ctx.fillStyle = '#e2b860';
  ctx.beginPath();
  ctx.ellipse(0, 16, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-18, -2);
  ctx.lineTo(-32, -18);
  ctx.lineTo(-26, 6);
  ctx.fill();

  // Body and wing
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 2, 24, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.ellipse(-3, 4, 13, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Head, comb, wattle, beak, eye
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(17, -14, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8342a';
  [
    [12, -24],
    [17, -26],
    [22, -24],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.ellipse(24, -6, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2a33a';
  ctx.beginPath();
  ctx.moveTo(26, -16);
  ctx.lineTo(34, -12);
  ctx.lineTo(26, -10);
  ctx.fill();
  ctx.fillStyle = '#2a1a12';
  ctx.beginPath();
  ctx.arc(20, -16, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (warn) {
    ctx.fillStyle = '#3a1f17';
    ctx.font = '18px Chicle, serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', hen.x + 28, PERCH_Y - 50);
  }
}

function drawEgg(ctx, x, y, type, rot = 0, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  const shell = ctx.createRadialGradient(-3, -5, 1, 0, 0, 14);
  if (type === 'gold') {
    shell.addColorStop(0, '#fff6c2');
    shell.addColorStop(1, '#e0a412');
  } else if (type === 'rotten') {
    shell.addColorStop(0, '#c7d98a');
    shell.addColorStop(1, '#6c8a2a');
  } else {
    shell.addColorStop(0, '#ffffff');
    shell.addColorStop(1, '#e8dccb');
  }
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (type === 'rotten') {
    ctx.fillStyle = '#4c6420';
    [
      [-3, -3],
      [3, 2],
      [-1, 6],
    ].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();

  // Stink lines float above rotten eggs.
  if (type === 'rotten') {
    ctx.strokeStyle = 'rgba(90,120,30,0.7)';
    ctx.lineWidth = 1.5;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 6, y - 16);
      ctx.quadraticCurveTo(x + k * 6 + 4, y - 22, x + k * 6, y - 28);
      ctx.stroke();
    }
  }
}

function drawBasket(ctx, basket) {
  const x = basket.x;
  const half = BASKET_W / 2;

  // Eggs peeking out of the basket (last few caught)
  basket.caught.slice(-5).forEach((type, k) => {
    drawEgg(ctx, x - 26 + k * 13, RIM_Y + 2 - (k % 2) * 3, type, (k - 2) * 0.2, 0.8);
  });

  // Woven basket body
  ctx.fillStyle = '#c48a3f';
  ctx.beginPath();
  ctx.moveTo(x - half, RIM_Y);
  ctx.lineTo(x + half, RIM_Y);
  ctx.lineTo(x + half - 10, RIM_Y + 40);
  ctx.lineTo(x - half + 10, RIM_Y + 40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#94612a';
  ctx.lineWidth = 2;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x - half + k * 2.5, RIM_Y + k * 10);
    ctx.lineTo(x + half - k * 2.5, RIM_Y + k * 10);
    ctx.stroke();
  }
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * 12, RIM_Y);
    ctx.lineTo(x + k * 10, RIM_Y + 40);
    ctx.stroke();
  }
  ctx.fillStyle = '#a8712f';
  ctx.fillRect(x - half - 3, RIM_Y - 4, BASKET_W + 6, 7);

  // Handle
  ctx.strokeStyle = '#94612a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, RIM_Y, half - 6, 26, 0, Math.PI, 0);
  ctx.stroke();
}

function drawSplat(ctx, s) {
  ctx.globalAlpha = Math.min(1, s.life);
  if (s.type === 'rotten') {
    ctx.fillStyle = '#7f9a35';
    ctx.beginPath();
    ctx.ellipse(s.x, GROUND_Y - 6, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = (k % 2 ? 12 : 20) * (0.8 + 0.2 * Math.sin(k + s.seed));
      const px = s.x + Math.cos(a) * r;
      const py = GROUND_Y - 6 + Math.sin(a) * r * 0.35;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = s.type === 'gold' ? '#ffcf1f' : '#f5a623';
    ctx.beginPath();
    ctx.ellipse(s.x + 2, GROUND_Y - 7, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shell shards
    ctx.fillStyle = '#e8dccb';
    ctx.fillRect(s.x - 20, GROUND_Y - 12, 6, 4);
    ctx.fillRect(s.x + 16, GROUND_Y - 10, 5, 4);
  }
  ctx.globalAlpha = 1;
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Egg Basket');

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
  const keys = useRef({
    left: false,
    right: false,
  });
  const [hud, setHud] = useState({
    score: 0,
    cracks: 0,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [best, setBest] = useState(readBest);
  const start = () => {
    game.current = newGame();
    setHud({
      score: 0,
      cracks: 0,
    });
    setPhase('playing');
    playTone(784, 0.1);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const idleHens = newGame().hens;
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
      setPhase('over');
      [392, 330, 262].forEach((f, k) =>
        setTimeout(() => playTone(f, 0.2, 'triangle', 0.05), k * 140),
      );
      setBest((b) => {
        const next = Math.max(b, g.score);
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

      // Effects keep fading even on the game-over screen.
      g.splats.forEach((s) => {
        s.life -= dt * 0.5;
      });
      g.splats = g.splats.filter((s) => s.life > 0);
      g.sparks.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
        p.life -= dt;
      });
      g.sparks = g.sparks.filter((p) => p.life > 0);
      g.texts.forEach((t) => {
        t.y -= 36 * dt;
        t.life -= dt;
      });
      g.texts = g.texts.filter((t) => t.life > 0);
      if (phaseRef.current !== 'playing') return;
      g.time += dt;
      const speed = speedOf(g);

      // Basket: keys move it at a steady pace, the pointer pulls it towards the finger or cursor.
      const b = g.basket;
      const dir = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
      if (dir) {
        b.target = null;
        b.x += dir * (430 + speed * 90) * dt;
      } else if (b.target !== null) {
        b.x += (b.target - b.x) * Math.min(1, dt * 18);
      }
      b.x = Math.max(BASKET_W / 2, Math.min(W - BASKET_W / 2, b.x));

      // Laying: a hen warns briefly, then drops an egg.
      g.layTimer -= dt;
      if (g.layTimer <= 0) {
        let pick = Math.floor(Math.random() * g.hens.length);
        if (pick === g.lastHen)
          pick = (pick + 1 + Math.floor(Math.random() * 3)) % g.hens.length;
        g.lastHen = pick;
        g.hens[pick].warn = Math.max(0.28, 0.5 / speed);
        g.layTimer = Math.max(0.45, 1.35 / speed);
      }
      g.hens.forEach((hen) => {
        if (hen.warn <= 0) return;
        hen.warn -= dt;
        if (hen.warn <= 0) {
          g.eggs.push({
            x: hen.x + rand(-4, 4),
            y: PERCH_Y + 6,
            vy: 30,
            type: pickEggType(g),
            rot: 0,
            spin: rand(-2, 2),
          });
          playTone(520, 0.05, 'square', 0.015);
        }
      });

      // Falling eggs
      g.eggs = g.eggs.filter((egg) => {
        const prevBottom = egg.y + 12;
        egg.vy = Math.min(egg.vy + 360 * speed * dt, 560 * speed);
        egg.y += egg.vy * dt;
        egg.rot += egg.spin * dt;
        const bottom = egg.y + 12;

        // Caught when the egg crosses the rim inside the basket.
        if (
          prevBottom < RIM_Y &&
          bottom >= RIM_Y &&
          Math.abs(egg.x - b.x) <= BASKET_W / 2
        ) {
          if (egg.type === 'rotten') {
            g.cracks += 1;
            g.texts.push({
              x: egg.x,
              y: RIM_Y - 30,
              text: 'Yuck! Rotten',
              life: 1.1,
              color: '#5f7a22',
            });
            playTone(110, 0.35, 'sawtooth', 0.05);
          } else {
            const points = egg.type === 'gold' ? 5 : 1;
            g.score += points;
            b.caught.push(egg.type);
            if (b.caught.length > 5) b.caught.shift();
            if (egg.type === 'gold') {
              g.texts.push({
                x: egg.x,
                y: RIM_Y - 30,
                text: '+5 golden!',
                life: 1.1,
                color: '#b47a00',
              });
              for (let k = 0; k < 14; k++) {
                const a = rand(Math.PI, Math.PI * 2);
                g.sparks.push({
                  x: egg.x,
                  y: RIM_Y,
                  vx: Math.cos(a) * rand(60, 180),
                  vy: Math.sin(a) * rand(80, 220),
                  life: rand(0.4, 0.8),
                });
              }
              [988, 1319].forEach((f, k) => setTimeout(() => playTone(f, 0.12), k * 70));
            } else {
              playTone(660 + (g.score % 5) * 40, 0.07);
            }
          }
          return false;
        }

        // Hit the grass
        if (bottom >= GROUND_Y) {
          g.splats.push({
            x: egg.x,
            type: egg.type,
            life: 2,
            seed: rand(0, 6),
          });
          if (egg.type !== 'rotten') {
            g.cracks += 1;
            playTone(180, 0.18, 'square', 0.04);
          } else {
            playTone(90, 0.1, 'sine', 0.03);
          }
          return false;
        }
        return true;
      });
      if (g.cracks >= MAX_CRACKS) {
        gameOver(g);
        return;
      }
      const hudKey = `${g.score}|${g.cracks}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.score,
          cracks: g.cracks,
        });
      }
    };
    const draw = (now) => {
      const g = game.current;
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, now);
      const hens = g ? g.hens : idleHens;
      hens.forEach((hen) => drawHen(ctx, hen, now));
      if (!g) {
        drawBasket(ctx, {
          x: W / 2,
          caught: [],
        });
        return;
      }
      g.splats.forEach((s) => drawSplat(ctx, s));
      g.eggs.forEach((egg) => drawEgg(ctx, egg.x, egg.y, egg.type, egg.rot));
      drawBasket(ctx, g.basket);
      ctx.fillStyle = '#ffe36b';
      g.sparks.forEach((p) => {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = '22px Chicle, serif';
      g.texts.forEach((t) => {
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff3df';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      });
      ctx.globalAlpha = 1;
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const KEYMAP = {
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
    };
    const onKeyDown = (e) => {
      const name = KEYMAP[e.key];
      if (name) {
        e.preventDefault();
        keys.current[name] = true;
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
    const onKeyUp = (e) => {
      const name = KEYMAP[e.key];
      if (name) keys.current[name] = false;
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

  // The basket follows the mouse or a dragging finger anywhere on the scene.
  const onPointer = (e) => {
    const g = game.current;
    if (!g) return;
    if (e.pointerType !== 'mouse' && e.type === 'pointermove' && e.buttons === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    g.basket.target = ((e.clientX - rect.left) / rect.width) * W;
  };
  return (
    <main className="font-body max-w-[500px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(36px,11vw,56px)] leading-none text-barn">
            Egg Basket
          </h1>
          <p className="text-sm text-muted">The hens are up before you are.</p>
        </div>
        <div className="text-right">
          <div className="text-sm">
            Eggs <b className="font-display text-3xl">{hud.score}</b>
          </div>
          <div className="text-sm text-muted">
            Best {Math.max(best, hud.score)} ·
            <span aria-label={`${hud.cracks} of ${MAX_CRACKS} cracked`}>
              {Array.from(
                {
                  length: MAX_CRACKS,
                },
                (_, i) => (
                  <svg
                    key={String(String(i))}
                    viewBox="0 0 20 24"
                    className="inline-block w-4 h-5 align-[-3px] ml-0.5"
                    aria-hidden="true"
                  >
                    <ellipse
                      cx="10"
                      cy="13"
                      rx="8"
                      ry="10"
                      fill={i < hud.cracks ? '#f5a623' : '#fffaf0'}
                      stroke="#7b4c3a"
                      strokeWidth="1.5"
                    />
                    {i < hud.cracks && (
                      <path
                        d="M3 11 L7 14 L10 10 L13 14 L17 11"
                        fill="none"
                        stroke="#7b4c3a"
                        strokeWidth="1.5"
                      />
                    )}
                  </svg>
                ),
              )}
            </span>
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto w-full"
        style={{
          maxWidth: `calc(72vh * ${W / H})`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          aria-label="Farmyard"
          className="w-full block rounded-2xl touch-none shadow-[0_8px_24px_rgba(122,60,40,0.25)]"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-2xl bg-card flex flex-col items-center justify-center gap-2 text-center p-4">
            <p className="font-display text-4xl text-barn">
              {phase === 'over' ? 'Scrambled!' : 'Morning rounds'}
            </p>
            <p className="max-w-[34ch]">
              {phase === 'over'
                ? `You gathered ${hud.score} eggs. Best: ${Math.max(best, hud.score)}.`
                : 'The hens lay eggs from the perch. Catch them in your basket. A hen puffs up just before she lays.'}
            </p>
            <ul className="text-sm text-muted text-left list-disc pl-5 max-w-[34ch]">
              <li>White eggs are 1 point. Golden eggs are 5.</li>
              <li>Green eggs are rotten. Catching one costs a crack.</li>
              <li>
                Every white or golden egg that hits the grass cracks. Three cracks and it
                is over.
              </li>
            </ul>
            <p className="text-sm text-muted">
              Move with the mouse, drag a finger, or use the arrow keys.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-7 py-2 rounded-full bg-barn text-white shadow-[0_4px_0_#7d211b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Play again' : 'Start'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
