import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function boing(freq = 420, duration = 0.12) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.8, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- World (logical width 360; height follows the screen) ----------

const VW = 360;
const GRAVITY = 1500;
const JUMP = 720;
const SPRING = 1180;
function makePlatform(y, height) {
  const difficulty = Math.min(1, height / 12000);
  const roll = Math.random();
  const kind =
    roll < 0.12 + difficulty * 0.18
      ? 'moving'
      : roll < 0.2 + difficulty * 0.2
        ? 'fragile'
        : 'cloud';
  return {
    x: 20 + Math.random() * (VW - 100),
    y,
    w: 64 - difficulty * 14,
    kind,
    vx: kind === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (40 + difficulty * 60) : 0,
    spring: kind === 'cloud' && Math.random() < 0.08,
    broken: false,
  };
}

function newWorld(viewHeight) {
  const platforms = [
    {
      x: VW / 2 - 40,
      y: viewHeight - 60,
      w: 80,
      kind: 'cloud',
      vx: 0,
      spring: false,
      broken: false,
    },
  ];
  let y = viewHeight - 60;
  while (y > -200) {
    y -= 55 + Math.random() * 35;
    platforms.push(makePlatform(y, 0));
  }
  return {
    bird: {
      x: VW / 2,
      y: viewHeight - 90,
      vx: 0,
      vy: -JUMP,
      facing: 1,
    },
    platforms,
    cameraY: 0,
    topY: y,
    best: 0,
    stars: Array.from(
      {
        length: 60,
      },
      () => ({
        x: Math.random() * VW,
        y: Math.random() * 2000,
        r: Math.random() * 1.4 + 0.4,
      }),
    ),
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Cloud Hopper');

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
  const worldRef = useRef(null);
  const input = useRef({
    left: false,
    right: false,
    pointerX: null,
  });
  const startRef = useRef(() => {}); // set by the game loop effect
  const [phase, setPhase] = useState('ready');
  const [height, setHeight] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('cloud-hopper-best')) || 0;
    } catch (e) {
      return 0;
    }
  });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    let scale = 1;
    let viewHeight = 640;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      scale = Math.min(innerWidth / VW, 2.2) * dpr;
      viewHeight = canvas.height / scale;
    };
    fit();
    window.addEventListener('resize', fit);
    worldRef.current = newWorld(viewHeight);
    const update = (dt) => {
      const w = worldRef.current;
      const b = w.bird;
      if (phaseRef.current !== 'playing') {
        // Idle bounce on the title screen.
        b.vy += GRAVITY * dt;
        b.y += b.vy * dt;
        if (b.y > viewHeight - 90) {
          b.y = viewHeight - 90;
          b.vy = -JUMP * 0.8;
        }
        return;
      }

      // Horizontal control: keys, or steer towards the pointer.
      let target = 0;
      if (input.current.left) target -= 1;
      if (input.current.right) target += 1;
      if (input.current.pointerX !== null) {
        const diff = input.current.pointerX - b.x;
        target = Math.max(-1, Math.min(1, diff / 60));
      }
      b.vx += (target * 330 - b.vx) * Math.min(1, dt * 10);
      if (Math.abs(b.vx) > 10) b.facing = Math.sign(b.vx);
      b.x += b.vx * dt;
      if (b.x < -12) b.x = VW + 12;
      if (b.x > VW + 12) b.x = -12;
      b.vy += GRAVITY * dt;
      const prevY = b.y;
      b.y += b.vy * dt;

      // Land on platforms only while falling.
      if (b.vy > 0) {
        for (const p of w.platforms) {
          if (p.broken) continue;
          const feetBefore = prevY + 14;
          const feetNow = b.y + 14;
          if (
            feetBefore <= p.y &&
            feetNow >= p.y &&
            b.x > p.x - 10 &&
            b.x < p.x + p.w + 10
          ) {
            if (p.kind === 'fragile') {
              p.broken = true;
              boing(220, 0.15);
              continue;
            }
            b.y = p.y - 14;
            b.vy = p.spring ? -SPRING : -JUMP;
            boing(p.spring ? 600 : 420, p.spring ? 0.25 : 0.12);
            break;
          }
        }
      }

      // Moving platforms
      for (const p of w.platforms) {
        if (p.vx) {
          p.x += p.vx * dt;
          if (p.x < 5 || p.x + p.w > VW - 5) p.vx *= -1;
        }
        if (p.broken) p.y += 300 * dt;
      }

      // Camera follows upward only.
      const targetCam = b.y - viewHeight * 0.4;
      if (targetCam < w.cameraY) w.cameraY = targetCam;

      // Spawn new platforms above, remove ones far below.
      const climbed = Math.max(0, Math.round(-w.cameraY / 10));
      while (w.topY > w.cameraY - 200) {
        w.topY -= 55 + Math.random() * (40 + Math.min(40, climbed / 60));
        w.platforms.push(makePlatform(w.topY, climbed * 10));
      }
      w.platforms = w.platforms.filter((p) => p.y < w.cameraY + viewHeight + 100);
      if (climbed > w.best) {
        w.best = climbed;
        setHeight(climbed);
      }

      // Fell off the bottom.
      if (b.y > w.cameraY + viewHeight + 40) {
        setPhase('over');
        boing(160, 0.4);
        setBest((prev) => {
          const next = Math.max(prev, w.best);
          try {
            localStorage.setItem('cloud-hopper-best', String(next));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
      }
    };
    const drawCloud = (x, y, w, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + 6, w * 0.5, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.3, y, w * 0.22, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.65, y - 2, w * 0.26, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    const draw = () => {
      const w = worldRef.current;
      const climbed = Math.max(0, -w.cameraY);
      // The sky darkens towards space the higher you go.
      const t = Math.min(1, climbed / 15000);
      const top = `hsl(${205 + t * 40} ${80 - t * 40}% ${78 - t * 66}%)`;
      const bottom = `hsl(${330 - t * 80} ${85 - t * 30}% ${88 - t * 60}%)`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const offsetX = (canvas.width / scale - VW) / 2;
      ctx.setTransform(scale, 0, 0, scale, offsetX * scale, 0);

      // Stars appear as the sky darkens.
      if (t > 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${(t - 0.3) * 1.4})`;
        for (const s of w.stars) {
          const y = ((((s.y - w.cameraY * 0.2) % 2000) + 2000) % 2000) - 300;
          ctx.beginPath();
          ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(0, -w.cameraY);
      for (const p of w.platforms) {
        if (p.kind === 'fragile')
          ctx.fillStyle = p.broken ? 'rgba(200,190,230,.5)' : '#e2d6ff';
        else if (p.kind === 'moving') ctx.fillStyle = '#fff0b3';
        else ctx.fillStyle = '#ffffff';
        drawCloud(p.x, p.y, p.w, p.broken ? 0.5 : 1);
        if (p.kind === 'fragile' && !p.broken) {
          ctx.strokeStyle = '#9b8bd6';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x + p.w * 0.45, p.y - 6);
          ctx.lineTo(p.x + p.w * 0.55, p.y + 4);
          ctx.lineTo(p.x + p.w * 0.48, p.y + 10);
          ctx.stroke();
        }
        if (p.spring) {
          ctx.fillStyle = '#ff8fa3';
          ctx.fillRect(p.x + p.w / 2 - 7, p.y - 16, 14, 6);
          ctx.strokeStyle = '#2b2347';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x + p.w / 2 - 5, p.y - 10);
          ctx.lineTo(p.x + p.w / 2 + 5, p.y - 6);
          ctx.lineTo(p.x + p.w / 2 - 5, p.y - 2);
          ctx.stroke();
        }
      }

      // The bird
      const b = w.bird;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.facing, 1);
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd3dc';
      ctx.beginPath();
      ctx.ellipse(-3, 4, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      const flap = Math.sin(performance.now() / 60) * 0.5;
      ctx.fillStyle = '#ff6f8a';
      ctx.beginPath();
      ctx.ellipse(-9, -1, 8, 4, -0.6 + (b.vy < 0 ? flap : 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2347';
      ctx.beginPath();
      ctx.arc(6, -4, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(12, -1);
      ctx.lineTo(19, 1);
      ctx.lineTo(12, 4);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Keyboard and pointer input.
    const down = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') input.current.right = true;
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current !== 'playing') start();
    };
    const up = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') input.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const start = () => {
      worldRef.current = newWorld(viewHeight);
      setHeight(0);
      setPhase('playing');
    };
    startRef.current = start;
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const pointer = (e) => {
    if (phase !== 'playing') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / VW, 2.2);
    const offsetX = (rect.width / scale - VW) / 2;
    input.current.pointerX = (e.clientX - rect.left) / scale - offsetX;
  };
  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full touch-none"
        onPointerMove={pointer}
        onPointerDown={pointer}
        onPointerUp={() => {
          input.current.pointerX = null;
        }}
        onPointerLeave={() => {
          input.current.pointerX = null;
        }}
        aria-label="Sky with clouds"
      />

      <div className="fixed top-0 left-0 right-0 flex justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pointer-events-none font-display text-ink">
        <div>
          <div className="font-body font-extrabold text-[11px] tracking-[.16em] uppercase">
            Height
          </div>
          <div className="text-3xl">{height} m</div>
        </div>
        <div className="text-right">
          <div className="font-body font-extrabold text-[11px] tracking-[.16em] uppercase">
            Best
          </div>
          <div className="text-3xl">{best} m</div>
        </div>
      </div>

      {phase !== 'playing' && (
        <div className="fixed inset-0 grid place-items-center px-4">
          <div className="bg-card rounded-[32px] p-6 max-w-[380px] w-full font-body flex flex-col gap-3 shadow-2xl">
            <h1 className="font-display text-[clamp(36px,10vw,48px)] leading-none">
              Cloud Hopper
            </h1>
            {phase === 'over' ? (
              <p>
                Pip fell back to earth after climbing <b>{height} m</b>. Best: {best} m.
              </p>
            ) : (
              <p>
                Pip the bird bounces on every cloud. Steer left and right to land on the
                next one and climb as high as you can.
              </p>
            )}
            <ul className="text-sm text-muted list-disc pl-5 leading-relaxed">
              <li>Steer with the arrow keys, or hold and drag on the screen.</li>
              <li>
                Lilac clouds crumble, yellow clouds drift, and pink springs launch you
                high.
              </li>
              <li>Fly off one side of the sky and you'll wrap round to the other.</li>
            </ul>
            <button
              type="button"
              onClick={() => startRef.current()}
              className="self-start font-display text-xl px-6 py-3 rounded-full bg-sun text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Fly again' : 'Start hopping'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export default App;
