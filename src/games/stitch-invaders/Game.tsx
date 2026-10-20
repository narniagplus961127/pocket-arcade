import type { KeyboardState } from '../../shared/input';
import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'square', volume = 0.03, slide = 1) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide !== 1)
      osc.frequency.exponentialRampToValueAtTime(freq * slide, now + duration);
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

// ---------- Patterns (each '#' is one cross-stitch) ----------

const PATTERNS = {
  squid: [
    ['..##..', '.####.', '##.#.#', '######', '.#..#.', '#....#'],
    ['..##..', '.####.', '##.#.#', '######', '#.##.#', '.#..#.'],
  ],
  crab: [
    ['.#...#.', '..###..', '.##.##.', '#######', '#.###.#', '.#...#.'],
    ['.#...#.', '#.###.#', '###.###', '#######', '..#.#..', '.#...#.'],
  ],
  blob: [
    ['.####.', '######', '#.##.#', '######', '.#..#.', '#.##.#'],
    ['.####.', '######', '#.##.#', '######', '.#..#.', '.#..#.'],
  ],
  ship: ['...#...', '..###..', '#######', '#######'],
  ufo: ['..####..', '.######.', '#.#.#.#.', '########', '..#..#..'],
};
const ROW_TYPES = ['squid', 'crab', 'crab', 'blob', 'blob'];
const ROW_COLORS = ['#7a4ea3', '#2f7fbf', '#2f7fbf', '#3f9a5a', '#3f9a5a'];
const POINTS = {
  squid: 30,
  crab: 20,
  blob: 10,
};
const W = 360;
const H = 480;
const S = 3.2; // size of one stitch in logical units

function drawStitches(ctx, pattern, x, y, color, size = S) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.38;
  ctx.lineCap = 'round';
  pattern.forEach((row, r) => {
    row.split('').forEach((ch, c) => {
      if (ch !== '#') return;
      const px = x + c * size;
      const py = y + r * size;
      const m = size * 0.15;
      ctx.beginPath();
      ctx.moveTo(px + m, py + m);
      ctx.lineTo(px + size - m, py + size - m);
      ctx.moveTo(px + size - m, py + m);
      ctx.lineTo(px + m, py + size - m);
      ctx.stroke();
    });
  });
}

function newWave(wave) {
  const invaders = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      invaders.push({
        type: ROW_TYPES[r],
        color: ROW_COLORS[r],
        x: 30 + c * 36,
        y: 50 + r * 28 + Math.min(wave, 5) * 8,
        alive: true,
      });
    }
  }
  // Shields are grids of individual stitches that wear away.
  const shields = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 9; c++) {
        const corner = (r === 0 && (c < 2 || c > 6)) || (r >= 3 && c >= 3 && c <= 5);
        if (!corner)
          shields.push({
            x: 36 + s * 82 + c * S,
            y: 390 + r * S,
          });
      }
    }
  }
  return {
    invaders,
    shields,
    dir: 1,
    speed: 14 + wave * 4,
    stepTimer: 0,
    frame: 0,
    enemyShots: [],
    ufo: null,
  };
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Stitch Invaders');

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
  const keys = useRef({} as KeyboardState);
  const [hud, setHud] = useState({
    score: 0,
    lives: 3,
    wave: 1,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('stitch-invaders-best')) || 0;
    } catch (e) {
      return 0;
    }
  });
  const start = () => {
    game.current = {
      ...newWave(1),
      wave: 1,
      score: 0,
      lives: 3,
      player: {
        x: W / 2,
        cooldown: 0,
        hit: 0,
      },
      shot: null,
      touchX: null,
    };
    setHud({
      score: 0,
      lives: 3,
      wave: 1,
    });
    setPhase('playing');
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

    // The weave of the cloth is a tiny repeating tile, drawn once.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = 'rgba(120,100,70,.18)';
    tctx.fillRect(0, 0, 4, 4);
    const clothPattern = ctx.createPattern(tile, 'repeat');
    clothPattern.setTransform(new DOMMatrix().scale(S / 16));
    const update = (dt) => {
      const g = game.current;
      if (!g || phaseRef.current !== 'playing') return;
      const p = g.player;

      // Player movement and firing
      let move = 0;
      if (keys.current.ArrowLeft || keys.current.a) move -= 1;
      if (keys.current.ArrowRight || keys.current.d) move += 1;
      if (g.touchX !== null) move = Math.max(-1, Math.min(1, (g.touchX - p.x) / 20));
      p.x = Math.max(16, Math.min(W - 16, p.x + move * 180 * dt));
      p.cooldown -= dt;
      p.hit = Math.max(0, p.hit - dt);
      if ((keys.current[' '] || g.touchX !== null) && !g.shot && p.cooldown <= 0) {
        g.shot = {
          x: p.x,
          y: 440,
        };
        p.cooldown = 0.35;
        playTone(880, 0.08, 'square', 0.025, 0.5);
      }

      // Player's shot
      if (g.shot) {
        g.shot.y -= 420 * dt;
        if (g.shot.y < 0) g.shot = null;
      }

      // Formation marches in steps; it speeds up as invaders are removed.
      const alive = g.invaders.filter((i) => i.alive);
      g.stepTimer -= dt;
      const interval = Math.max(0.06, 0.65 * (alive.length / 40)) / (1 + g.wave * 0.12);
      if (g.stepTimer <= 0) {
        g.stepTimer = interval;
        g.frame ^= 1;
        const minX = Math.min(...alive.map((i) => i.x));
        const maxX = Math.max(...alive.map((i) => i.x + 24));
        if ((g.dir > 0 && maxX + 8 > W) || (g.dir < 0 && minX - 8 < 0)) {
          g.dir *= -1;
          alive.forEach((i) => {
            i.y += 12;
          });
        } else {
          alive.forEach((i) => {
            i.x += g.dir * 8;
          });
        }
        playTone(g.frame ? 110 : 98, 0.06, 'triangle', 0.04);
      }

      // Enemy shots from the bottom invader of a random column.
      if (Math.random() < dt * (0.9 + g.wave * 0.25) && alive.length) {
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        const lowest = alive
          .filter((i) => Math.abs(i.x - shooter.x) < 4)
          .sort((a, b) => b.y - a.y)[0];
        g.enemyShots.push({
          x: lowest.x + 10,
          y: lowest.y + 20,
        });
      }
      g.enemyShots.forEach((s) => {
        s.y += 160 * dt;
      });

      // UFO across the top now and then.
      if (!g.ufo && Math.random() < dt * 0.08)
        g.ufo = {
          x: -30,
          dir: 1,
        };
      if (g.ufo) {
        g.ufo.x += 70 * dt;
        if (g.ufo.x > W + 30) g.ufo = null;
      }

      // Collisions: player's shot
      if (g.shot) {
        for (const inv of alive) {
          if (
            g.shot.x > inv.x - 2 &&
            g.shot.x < inv.x + 24 &&
            g.shot.y > inv.y &&
            g.shot.y < inv.y + 20
          ) {
            inv.alive = false;
            g.score += POINTS[inv.type];
            g.shot = null;
            playTone(300, 0.12, 'sawtooth', 0.03, 0.4);
            break;
          }
        }
      }
      if (
        g.shot &&
        g.ufo &&
        Math.abs(g.shot.x - (g.ufo.x + 12)) < 14 &&
        g.shot.y < 34 &&
        g.shot.y > 14
      ) {
        g.score += 100 + Math.floor(Math.random() * 3) * 50;
        g.ufo = null;
        g.shot = null;
        playTone(660, 0.3, 'triangle', 0.05, 2);
      }

      // Shots wear away shield stitches.
      const wear = (shot) => {
        const i = g.shields.findIndex(
          (st) =>
            shot.x > st.x - 1 &&
            shot.x < st.x + S + 1 &&
            shot.y > st.y &&
            shot.y < st.y + S + 4,
        );
        if (i >= 0) {
          g.shields.splice(i, 1);
          return true;
        }
        return false;
      };
      if (g.shot && wear(g.shot)) g.shot = null;
      g.enemyShots = g.enemyShots.filter((s) => !wear(s) && s.y < H);

      // Enemy shots hitting the player
      for (const s of g.enemyShots) {
        if (p.hit <= 0 && Math.abs(s.x - p.x) < 13 && s.y > 438 && s.y < 456) {
          s.y = H + 10;
          g.lives--;
          p.hit = 1.5;
          playTone(140, 0.5, 'sawtooth', 0.05, 0.4);
        }
      }

      // Invaders reaching the shields line ends the game; clearing the wave starts the next.
      const lowestY = alive.length ? Math.max(...alive.map((i) => i.y)) : 0;
      if (g.lives <= 0 || lowestY > 370) {
        setPhase('over');
        setBest((b) => {
          const next = Math.max(b, g.score);
          try {
            localStorage.setItem('stitch-invaders-best', String(next));
          } catch (e) {
            /* storage unavailable */
          }
          return next;
        });
      } else if (!alive.length) {
        g.wave++;
        Object.assign(g, newWave(g.wave));
        [523, 659, 784].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.15, 'triangle', 0.04), i * 100),
        );
      }

      // Only re-render the React HUD when something on it changed.
      const hudKey = `${g.score}|${g.lives}|${g.wave}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.score,
          lives: g.lives,
          wave: g.wave,
        });
      }
    };
    const draw = () => {
      const g = game.current;
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Aida cloth with its grid of holes
      ctx.fillStyle = '#f6f0e2';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = clothPattern;
      ctx.fillRect(0, 0, W, H);
      if (!g) return;
      g.invaders.forEach((inv) => {
        if (!inv.alive) return;
        drawStitches(ctx, PATTERNS[inv.type][g.frame], inv.x, inv.y, inv.color);
      });
      g.shields.forEach((st) => {
        ctx.strokeStyle = '#c98a2b';
        ctx.lineWidth = S * 0.38;
        ctx.beginPath();
        ctx.moveTo(st.x + 0.5, st.y + 0.5);
        ctx.lineTo(st.x + S - 0.5, st.y + S - 0.5);
        ctx.moveTo(st.x + S - 0.5, st.y + 0.5);
        ctx.lineTo(st.x + 0.5, st.y + S - 0.5);
        ctx.stroke();
      });
      if (g.ufo) drawStitches(ctx, PATTERNS.ufo, g.ufo.x, 18, '#c4374a', S * 0.9);

      // Player: blinks after being hit
      if (g.player.hit <= 0 || Math.floor(g.player.hit * 10) % 2) {
        drawStitches(ctx, PATTERNS.ship, g.player.x - 11, 442, '#2b2219');
      }

      // Shots are running stitches of thread
      ctx.strokeStyle = '#c4374a';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      if (g.shot) {
        ctx.beginPath();
        ctx.moveTo(g.shot.x, g.shot.y);
        ctx.lineTo(g.shot.x, g.shot.y + 10);
        ctx.stroke();
      }
      ctx.strokeStyle = '#6e5d4a';
      g.enemyShots.forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + 2, s.y + 8);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Ground line
      ctx.strokeStyle = 'rgba(43,34,25,.4)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, 462);
      ctx.lineTo(W, 462);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const down = (e) => {
      keys.current[e.key] = true;
      if (e.key === ' ') e.preventDefault();
      if (
        (e.key === ' ' || e.key === 'Enter') &&
        phaseRef.current !== 'playing' &&
        !e.repeat
      )
        start();
    };
    const up = (e) => {
      keys.current[e.key] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const touch = (e) => {
    const g = game.current;
    if (!g) return;
    const rect = canvasRef.current.getBoundingClientRect();
    g.touchX = ((e.clientX - rect.left) / rect.width) * W;
  };
  const release = () => {
    if (game.current) game.current.touchX = null;
  };
  return (
    <main className="font-body max-w-[640px] mx-auto py-6 flex flex-col items-center gap-4">
      <header className="w-full flex items-end justify-between gap-3">
        <h1 className="font-display text-[clamp(40px,11vw,62px)] leading-none">
          Stitch Invaders
        </h1>
        <div className="text-right text-sm">
          <div>
            Score <b className="text-lg">{hud.score}</b>
          </div>
          <div>
            Best {Math.max(best, hud.score)} · Wave {hud.wave}
          </div>
          <div aria-label={`${hud.lives} lives`}>
            {'✚ '.repeat(Math.max(0, hud.lives))}
          </div>
        </div>
      </header>

      <div className="relative rounded-full p-[clamp(10px,3vw,20px)] bg-hoop shadow-[inset_0_0_0_6px_#8a5f33,0_20px_40px_rgba(0,0,0,.25)] w-full max-w-[560px]">
        <div className="rounded-full overflow-hidden aspect-square flex items-center justify-center bg-aida">
          <canvas
            ref={canvasRef}
            onPointerDown={touch}
            onPointerMove={(e) => e.buttons && touch(e)}
            onPointerUp={release}
            onPointerLeave={release}
            aria-label="Embroidery hoop playfield"
            className="w-[66%] aspect-[360/480] touch-none"
          />
        </div>

        {phase !== 'playing' && (
          <div className="absolute inset-[12%] rounded-full bg-aida/90 flex flex-col items-center justify-center text-center gap-3 p-6">
            <p className="font-display text-3xl">
              {phase === 'over' ? 'Unravelled!' : 'Defend the sampler'}
            </p>
            <p className="text-sm text-muted max-w-[30ch]">
              {phase === 'over'
                ? `You stitched up ${hud.score} points across ${hud.wave} wave${hud.wave === 1 ? '' : 's'}.`
                : 'Move with ← → and fire with Space. On a touchscreen, hold and drag below the shields to move and fire.'}
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-6 py-2 rounded-full bg-thread text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Thread the needle again' : 'Start stitching'}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted text-center">
        Purple squids 30, blue crabs 20, green blobs 10. The red saucer is worth a mystery
        bonus.
      </p>
    </main>
  );
}
export default App;
