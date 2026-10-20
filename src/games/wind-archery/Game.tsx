import type { KeyboardState } from '../../shared/input';
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

// ---------- Field ----------
// Side view in pixels of a W x H scene. The target face is drawn larger than life so it can be seen.

const W = 800;
const H = 450;
const GROUND_Y = 400;
const ARCHER_X = 70;
const LAUNCH = {
  x: ARCHER_X + 20,
  y: 330,
};
const PX_PER_M = 7.6;
const FACE_Y = GROUND_Y - 80;
const FACE_R = 46;
const GRAVITY = 380;
const MAX_SPEED = 600;
const WIND_ACCEL = 9;
const ARROWS = 10;
const MIN_ANGLE = -10;
const MAX_ANGLE = 60;
const STORAGE_KEY = 'wind-archery-best';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const targetX = (metres) => ARCHER_X + metres * PX_PER_M;

// Distances creep further away through the round; the wind is new every arrow.
function setupArrow(index) {
  const base = 30 + index * 6;
  const metres = clamp(Math.round((base + Math.random() * 12) / 5) * 5, 30, 90);
  const wind = Math.round((Math.random() * 2 - 1) * (3 + index * 0.5));
  return {
    metres,
    wind,
  };
}

function newRound() {
  return {
    index: 0,
    scores: [],
    ...setupArrow(0),
    angle: 20,
    power: 0.75,
    drawing: false,
    arrow: null,
    stuck: null,
    stage: 'aim',
    timer: 0,
    time: 0,
    keys: {} as KeyboardState,
    lastScore: null,
    over: false,
    hudKey: '',
  };
}

function readBest() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Wind Archery');

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
  const game = useRef(newRound());
  const [phase, setPhase] = useState('menu');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [hud, setHud] = useState({
    index: 0,
    scores: [],
    metres: 30,
    wind: 0,
    angle: 20,
    power: 75,
    lastScore: null,
  });
  const [best, setBest] = useState(readBest);
  const start = () => {
    game.current = newRound();
    setPhase('playing');
    playTone(392, 0.12, 'sine', 0.04);
  };
  const loose = () => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.stage !== 'aim' || g.power < 0.08) return;
    const a = (g.angle * Math.PI) / 180;
    const speed = MAX_SPEED * g.power;
    g.arrow = {
      x: LAUNCH.x,
      y: LAUNCH.y,
      vx: Math.cos(a) * speed,
      vy: -Math.sin(a) * speed,
    };
    g.stuck = null;
    g.stage = 'flight';
    g.drawing = false;
    playTone(220, 0.12, 'triangle', 0.05);
    playTone(880, 0.08, 'sine', 0.015);
  };
  const looseRef = useRef(loose);
  looseRef.current = loose;
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
    const settle = (g, score, x, y, angle) => {
      g.stuck = {
        x,
        y,
        angle,
      };
      g.arrow = null;
      g.scores.push(score);
      g.lastScore = score;
      g.stage = 'result';
      g.timer = 1.6;
      if (score >= 9) {
        [784, 988, 1175].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.14, 'sine', 0.04), k * 90),
        );
      } else if (score > 0) {
        playTone(330 + score * 30, 0.12, 'square', 0.03);
      } else {
        playTone(130, 0.25, 'sawtooth', 0.03);
      }
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || g.over || phaseRef.current !== 'playing') return;
      g.time += dt;
      if (g.stage === 'aim') {
        const ka = (g.keys.up ? 1 : 0) - (g.keys.down ? 1 : 0);
        const kp = (g.keys.right ? 1 : 0) - (g.keys.left ? 1 : 0);
        g.angle = clamp(g.angle + ka * 15 * dt, MIN_ANGLE, MAX_ANGLE);
        g.power = clamp(g.power + kp * 0.4 * dt, 0, 1);
      } else if (g.stage === 'flight') {
        const steps = 4;
        const h = dt / steps;
        const tx = targetX(g.metres);
        const a = g.arrow;
        for (let i = 0; i < steps && g.stage === 'flight'; i++) {
          const px = a.x;
          const py = a.y;
          // Wind pushes along the line of flight: a tailwind carries the arrow further.
          a.vx += g.wind * WIND_ACCEL * h;
          a.vy += GRAVITY * h;
          a.x += a.vx * h;
          a.y += a.vy * h;
          const angle = Math.atan2(a.vy, a.vx);

          // Crossing the plane of the target face.
          if (px < tx && a.x >= tx) {
            const yAt = py + ((tx - px) / (a.x - px)) * (a.y - py);
            const off = Math.abs(yAt - FACE_Y);
            if (off <= FACE_R) {
              const score = Math.max(1, 10 - Math.floor((off / FACE_R) * 10));
              settle(g, score, tx, yAt, angle);
              break;
            }
          }
          if (a.y >= GROUND_Y) {
            settle(g, 0, a.x, GROUND_Y, angle);
            break;
          }
          if (a.x > W + 40 || a.x < -40) {
            settle(g, 0, null, null, 0);
            break;
          }
        }
      } else if (g.stage === 'result') {
        g.timer -= dt;
        if (g.timer <= 0) {
          if (g.scores.length >= ARROWS) {
            g.over = true;
            const total = g.scores.reduce((s, v) => s + v, 0);
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
          } else {
            g.index += 1;
            Object.assign(g, setupArrow(g.index));
            g.stuck = null;
            g.lastScore = null;
            g.stage = 'aim';
          }
        }
      }
      const hudKey = `${g.index}|${g.scores.length}|${g.metres}|${g.wind}|${g.angle.toFixed(1)}|${Math.round(g.power * 100)}|${g.lastScore}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          index: g.index,
          scores: [...g.scores],
          metres: g.metres,
          wind: g.wind,
          angle: g.angle,
          power: Math.round(g.power * 100),
          lastScore: g.lastScore,
        });
      }
    };

    // ---------- Drawing ----------

    const hills = (baseY, amp, seed, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 10) {
        const y =
          baseY -
          amp * (0.6 * Math.sin(x / 140 + seed) + 0.4 * Math.sin(x / 57 + seed * 2.3));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    };
    const drawFlag = (x, top, wind, t) => {
      ctx.strokeStyle = '#3b3027';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x, top);
      ctx.stroke();
      // The flag streams downwind; stronger wind, longer and flatter flag.
      const dir = wind === 0 ? 1 : Math.sign(wind);
      const len = 10 + Math.abs(wind) * 4;
      const droop = wind === 0 ? 14 : Math.max(0, 10 - Math.abs(wind) * 1.4);
      ctx.fillStyle = '#85527c';
      ctx.beginPath();
      ctx.moveTo(x, top);
      for (let i = 0; i <= 8; i++) {
        const f = i / 8;
        ctx.lineTo(
          x + dir * len * f,
          top + droop * f + Math.sin(t * (4 + Math.abs(wind)) + f * 5) * 2.5 * f,
        );
      }
      for (let i = 8; i >= 0; i--) {
        const f = i / 8;
        ctx.lineTo(
          x + dir * len * f,
          top + 12 + droop * f + Math.sin(t * (4 + Math.abs(wind)) + f * 5) * 2.5 * f,
        );
      }
      ctx.closePath();
      ctx.fill();
    };
    const drawTarget = (tx) => {
      // Easel legs
      ctx.strokeStyle = '#6b4f33';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tx + 4, FACE_Y);
      ctx.lineTo(tx - 10, GROUND_Y);
      ctx.moveTo(tx + 4, FACE_Y);
      ctx.lineTo(tx + 22, GROUND_Y);
      ctx.stroke();

      // Straw boss behind the face
      ctx.fillStyle = '#c8b27a';
      ctx.beginPath();
      ctx.ellipse(tx + 7, FACE_Y, FACE_R * 0.38, FACE_R + 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // The face, seen at an angle: gold, red, blue, black, white from the middle out.
      const colors = [
        '#f2f0e8',
        '#f2f0e8',
        '#1f1f1f',
        '#1f1f1f',
        '#3a78c2',
        '#3a78c2',
        '#d23b33',
        '#d23b33',
        '#e0b43a',
        '#e0b43a',
      ];
      for (let i = 0; i < 10; i++) {
        const r = FACE_R * (1 - i / 10);
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.ellipse(tx, FACE_Y, r * 0.32, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };
    const drawArrow = (x, y, angle, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#4a3624';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.fillStyle = '#7d8a8f';
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(-3, -2.5);
      ctx.lineTo(-3, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#85527c';
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-30, -5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-30, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    const drawArcher = (g) => {
      const a = (g.angle * Math.PI) / 180;
      const draw = g.stage === 'aim' ? g.power : 0;
      const ax = ARCHER_X;

      // Body
      ctx.fillStyle = '#2b3b33';
      ctx.fillRect(ax - 6, 312, 12, 52);
      ctx.fillRect(ax - 6, 362, 5, 38);
      ctx.fillRect(ax + 1, 362, 5, 38);
      ctx.beginPath();
      ctx.arc(ax, 302, 9, 0, Math.PI * 2);
      ctx.fill();
      // Tartan sash hint
      ctx.fillStyle = '#85527c';
      ctx.fillRect(ax - 6, 330, 12, 5);

      // Bow, rotated to the aim angle around the bow hand.
      ctx.save();
      ctx.translate(LAUNCH.x, LAUNCH.y);
      ctx.rotate(-a);
      ctx.strokeStyle = '#5a3a1e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-4, -34);
      ctx.quadraticCurveTo(12, 0, -4, 34);
      ctx.stroke();
      const pull = -4 - draw * 30;
      ctx.strokeStyle = '#e8e2d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, -34);
      ctx.lineTo(pull, 0);
      ctx.lineTo(-4, 34);
      ctx.stroke();
      // Nocked arrow and a short sight line
      if (g.stage === 'aim') {
        ctx.restore();
        drawArrow(
          LAUNCH.x + Math.cos(a) * (pull + 30),
          LAUNCH.y - Math.sin(a) * (pull + 30),
          -a,
        );
        ctx.save();
        ctx.translate(LAUNCH.x, LAUNCH.y);
        ctx.rotate(-a);
        ctx.strokeStyle = 'rgba(34,53,45,0.45)';
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(34, 0);
        ctx.lineTo(34 + 30 + g.power * 60, 0);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // Arms
      ctx.strokeStyle = '#2b3b33';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ax + 3, 318);
      ctx.lineTo(LAUNCH.x, LAUNCH.y);
      ctx.moveTo(ax - 2, 318);
      ctx.lineTo(
        LAUNCH.x + Math.cos(a) * (pull - 2),
        LAUNCH.y - Math.sin(a) * (pull - 2),
      );
      ctx.stroke();
    };
    const draw = () => {
      const g = game.current;
      const s = canvas.width / W;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      const t = g.time;

      // Sky and hills
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#c9d4d0');
      sky.addColorStop(1, '#eef1ec');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      hills(210, 50, 1.2, '#b3c2bd');
      hills(260, 40, 4.1, '#93a89f');
      hills(320, 26, 2.6, '#6f8a7c');

      // Mist bands drifting across the glen
      for (let i = 0; i < 4; i++) {
        const x = ((t * (6 + i * 3) + i * 260) % (W + 400)) - 200;
        const grad = ctx.createRadialGradient(x, 250 + i * 25, 10, x, 250 + i * 25, 220);
        grad.addColorStop(0, 'rgba(245,247,244,0.55)');
        grad.addColorStop(1, 'rgba(245,247,244,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 220, 150 + i * 25, 440, 200);
      }

      // Field
      ctx.fillStyle = '#5f7f55';
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      ctx.fillStyle = '#56744d';
      for (let x = 0; x < W; x += 40) ctx.fillRect(x, GROUND_Y, 20, H - GROUND_Y);

      // Distance markers
      ctx.fillStyle = '#f1f3ee';
      ctx.font = '600 13px "Crimson Pro", Georgia, serif';
      ctx.textAlign = 'center';
      [30, 50, 70, 90].forEach((m) => {
        const x = targetX(m);
        ctx.fillRect(x - 1, GROUND_Y, 2, 10);
        ctx.fillText(`${m}m`, x, GROUND_Y + 26);
      });
      const tx = targetX(g.metres);
      drawTarget(tx);
      drawFlag(ARCHER_X + 60, 300, g.wind, t);
      drawFlag(tx + 40, FACE_Y - 70, g.wind, t + 1.3);
      if (g.stuck && g.stuck.x !== null)
        drawArrow(g.stuck.x + 4, g.stuck.y, g.stuck.angle);
      if (g.arrow) drawArrow(g.arrow.x, g.arrow.y, Math.atan2(g.arrow.vy, g.arrow.vx));
      drawArcher(g);

      // Result call-out
      if (g.stage === 'result' && phaseRef.current === 'playing') {
        const sc = g.lastScore;
        ctx.font = '40px "Uncial Antiqua", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = sc >= 9 ? '#b8860b' : sc > 0 ? '#22352d' : '#85527c';
        ctx.fillText(sc > 0 ? `+${sc}` : 'Miss', W / 2, 120);
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
        game.current.keys[dir] = true;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (phaseRef.current === 'playing') looseRef.current();
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
  // Press anywhere and drag back, like pulling a bowstring: the direction sets the angle, the length sets the power.

  const dragStart = useRef(null);
  const onPointerDown = (e) => {
    const g = game.current;
    if (phaseRef.current !== 'playing' || g.stage !== 'aim') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is optional */
    }
    // Remember the last aim so a plain tap does not throw it away.
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      angle: g.angle,
      power: g.power,
    };
    g.drawing = true;
    g.power = 0;
  };
  const onPointerMove = (e) => {
    const g = game.current;
    if (!dragStart.current || g.stage !== 'aim') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const maxPull = Math.max(90, Math.min(170, rect.width * 0.4));
    const dx = dragStart.current.x - e.clientX;
    const dy = dragStart.current.y - e.clientY;
    const len = Math.hypot(dx, dy);
    g.power = clamp(len / maxPull, 0, 1);
    if (len > 6)
      g.angle = clamp((Math.atan2(-dy, dx) * 180) / Math.PI, MIN_ANGLE, MAX_ANGLE);
  };
  const onPointerUp = () => {
    const drag = dragStart.current;
    if (!drag) return;
    dragStart.current = null;
    const g = game.current;
    if (g.power < 0.08) {
      g.angle = drag.angle;
      g.power = drag.power;
      g.drawing = false;
      return;
    }
    loose();
  };

  // ---------- Render ----------

  const total = hud.scores.reduce((s, v) => s + v, 0);
  const windText =
    hud.wind === 0
      ? 'Calm'
      : `${hud.wind > 0 ? 'Tailwind →' : '← Headwind'} ${Math.abs(hud.wind)} m/s`;
  return (
    <main className="font-body max-w-[960px] mx-auto py-4 flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-[clamp(30px,8vw,48px)] leading-none">
          Wind Archery
        </h1>
        <div className="text-right text-lg leading-tight">
          <div>
            Score <b className="text-2xl">{total}</b>{' '}
            <span className="text-muted">/ {ARROWS * 10}</span>
          </div>
          <div className="text-muted text-base">Best {best}</div>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-lg">
        <span>
          Arrow <b>{Math.min(hud.index + 1, ARROWS)}</b> of {ARROWS}
        </span>
        <span>
          Distance <b>{hud.metres} m</b>
        </span>
        <span className="text-heather font-semibold">{windText}</span>
        <span className="text-muted">
          Angle {hud.angle.toFixed(1)}° · Power {hud.power}%
        </span>
      </div>

      <div className="relative">
        {phase !== 'playing' && (
          <div className="mb-3 sm:mb-0 sm:absolute sm:inset-0 z-10 rounded-lg bg-card border border-line sm:border-0 flex flex-col items-center justify-center gap-2 sm:gap-3 text-center p-4 overflow-auto">
            {phase === 'over' ? (
              <>
                <p className="font-display text-[clamp(26px,6vw,40px)]">
                  The round is shot
                </p>
                <p className="text-xl">
                  You scored <b>{total}</b> out of {ARROWS * 10}.
                </p>
                <p className="text-muted">
                  Best {best}
                  {total === best && total > 0 ? ' · a new record' : ''}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[clamp(26px,6vw,40px)]">Ten arrows</p>
                <p className="text-base sm:text-lg max-w-[46ch] leading-snug">
                  Press anywhere and drag back to draw the bow. Let go to shoot. Watch the
                  flags: a tailwind carries the arrow further, a headwind holds it back.
                  The gold scores 10, the outer white 1.
                </p>
                <p className="text-sm text-muted">
                  Keys: ↑ ↓ angle, ← → power, Space to shoot.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={start}
              className="font-display text-xl px-7 py-2 rounded-full bg-ink text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-heather"
            >
              {phase === 'over' ? 'Shoot again' : 'Take aim'}
            </button>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
          }}
          aria-label="Archery field"
          className="w-full block rounded-lg touch-none border border-line"
          style={{
            aspectRatio: `${W} / ${H}`,
          }}
        />
      </div>

      <ol className="grid grid-cols-10 gap-1" aria-label="Arrow scores">
        {Array.from(
          {
            length: ARROWS,
          },
          (_, i) => {
            const sc = hud.scores[i];
            const ring =
              sc === undefined
                ? 'bg-transparent border-line'
                : sc >= 9
                  ? 'bg-gold border-gold'
                  : sc >= 7
                    ? 'bg-[#d23b33] border-[#d23b33] text-white'
                    : sc >= 5
                      ? 'bg-[#3a78c2] border-[#3a78c2] text-white'
                      : sc >= 3
                        ? 'bg-[#1f1f1f] border-[#1f1f1f] text-white'
                        : sc >= 1
                          ? 'bg-white border-line'
                          : 'bg-transparent border-heather text-heather';
            return (
              <li
                key={String(String(i))}
                className={`aspect-square rounded-full border-2 flex items-center justify-center text-sm sm:text-lg font-bold ${ring}`}
              >
                {sc === undefined ? '' : sc === 0 ? 'M' : sc}
              </li>
            );
          },
        )}
      </ol>
    </main>
  );
}
export default App;
