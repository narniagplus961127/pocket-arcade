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

// ---------- Maze ----------
// '#' hedge, '.' berry, 'o' glowing mushroom, ' ' path, 'P' hedgehog start, 'F' fox start.
// The middle row is a tunnel that wraps from one side to the other.

const MAZE = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '####.#       #.####',
  '####.# ##### #.####',
  '    .  #FFF#  .    ',
  '####.# ##### #.####',
  '####.#       #.####',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
const COLS = MAZE[0].length;
const ROWS = MAZE.length;
const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};
const FOX_COLORS = ['#ff8a3d', '#d9663a', '#f2b25c'];
const isWall = (x, y) => {
  if (y < 0 || y >= ROWS) return true;
  const wrapped = (x + COLS) % COLS;
  return MAZE[y][wrapped] === '#';
};
function newLevel(level) {
  const food = new Map();
  let player = null;
  const foxes = [];
  MAZE.forEach((row, y) =>
    row.split('').forEach((ch, x) => {
      if (ch === '.' || ch === 'o') food.set(`${x},${y}`, ch);
      if (ch === 'P')
        player = {
          x,
          y,
          dir: 'left',
          want: 'left',
          progress: 0,
        };
      if (ch === 'F')
        foxes.push({
          x,
          y,
          dir: 'up',
          progress: 0,
          home: {
            x,
            y,
          },
          color: FOX_COLORS[foxes.length % 3],
          eaten: false,
        });
    }),
  );
  return {
    food,
    player,
    foxes,
    frightened: 0,
    level,
    foxSpeed: 4.6 + level * 0.35,
  };
}

// Moves an entity along the grid. At each tile it calls `choose` to pick the next direction.
function stepEntity(e, speed, dt, choose) {
  e.progress += speed * dt;
  while (e.progress >= 1) {
    e.progress -= 1;
    const [dx, dy] = DIRS[e.dir];
    e.x = (e.x + dx + COLS) % COLS;
    e.y += dy;
    const next = choose(e);
    if (next) e.dir = next;
    const [nx, ny] = DIRS[e.dir];
    if (isWall(e.x + nx, e.y + ny)) {
      e.progress = 0;
      e.stopped = true;
      return;
    }
  }
  e.stopped = false;
}
const openDirs = (x, y) =>
  Object.keys(DIRS).filter((d) => !isWall(x + DIRS[d][0], y + DIRS[d][1]));

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Hedgehog Hollow');

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
    score: 0,
    lives: 3,
    level: 1,
  });
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('hedgehog-hollow-best')) || 0;
    } catch (e) {
      return 0;
    }
  });
  const start = () => {
    game.current = {
      ...newLevel(1),
      score: 0,
      lives: 3,
      pause: 1.2,
    };
    setHud({
      score: 0,
      lives: 3,
      level: 1,
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
    const resetPositions = (g) => {
      const fresh = newLevel(g.level);
      g.player = fresh.player;
      g.foxes = fresh.foxes;
      g.frightened = 0;
      g.pause = 1.2;
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || phaseRef.current !== 'playing') return;
      if (g.pause > 0) {
        g.pause -= dt;
        return;
      }

      // Hedgehog: turn whenever the wanted direction opens up.
      const p = g.player;
      if (p.stopped || p.progress < 0.01) {
        const [wx, wy] = DIRS[p.want];
        if (!isWall(p.x + wx, p.y + wy)) {
          p.dir = p.want;
          p.stopped = false;
        }
      }
      if (OPPOSITE[p.dir] === p.want) {
        // Reversing is allowed mid-tile.
        const [dx, dy] = DIRS[p.dir];
        p.x = (p.x + dx + COLS) % COLS;
        p.y += dy;
        p.progress = 1 - p.progress;
        p.dir = p.want;
      }
      if (!p.stopped) {
        stepEntity(p, 6.2, dt, (e) => {
          const [wx, wy] = DIRS[e.want];
          return isWall(e.x + wx, e.y + wy) ? null : e.want;
        });
      }

      // Eat whatever is on the hedgehog's tile.
      const key = `${p.x},${p.y}`;
      const item = g.food.get(key);
      if (item) {
        g.food.delete(key);
        if (item === 'o') {
          g.score += 50;
          g.frightened = Math.max(3, 8 - g.level * 0.6);
          g.foxes.forEach((f) => {
            f.eaten = false;
          });
          playTone(330, 0.3, 'sine', 0.05);
        } else {
          g.score += 10;
          playTone(g.food.size % 2 ? 660 : 784, 0.04);
        }
      }

      // Foxes: chase the hedgehog, flee when frightened, head home when eaten.
      g.frightened = Math.max(0, g.frightened - dt);
      g.foxes.forEach((f, i) => {
        const scared = g.frightened > 0 && !f.eaten;
        const speed = f.eaten ? 9 : scared ? 3.4 : g.foxSpeed;
        stepEntity(f, speed, dt, (e) => {
          const options = openDirs(e.x, e.y).filter((d) => d !== OPPOSITE[e.dir]);
          const choices = options.length ? options : openDirs(e.x, e.y);
          if (scared) return choices[Math.floor(Math.random() * choices.length)];
          // Each fox aims a little differently so they don't all follow the same path.
          let tx = p.x;
          let ty = p.y;
          if (f.eaten) {
            tx = f.home.x;
            ty = f.home.y;
          } else if (i === 1) {
            tx = p.x + DIRS[p.dir][0] * 4;
            ty = p.y + DIRS[p.dir][1] * 4;
          } else if (i === 2 && Math.hypot(f.x - p.x, f.y - p.y) < 6) {
            tx = 0;
            ty = ROWS;
          }
          let bestDir = choices[0];
          let bestDist = Infinity;
          for (const d of choices) {
            const nx = e.x + DIRS[d][0];
            const ny = e.y + DIRS[d][1];
            const dist = (nx - tx) ** 2 + (ny - ty) ** 2 + Math.random() * 2;
            if (dist < bestDist) {
              bestDist = dist;
              bestDir = d;
            }
          }
          return bestDir;
        });
        if (f.eaten && f.x === f.home.x && f.y === f.home.y) f.eaten = false;

        // Collisions, using smooth positions.
        const fx = f.x + DIRS[f.dir][0] * f.progress;
        const fy = f.y + DIRS[f.dir][1] * f.progress;
        const px = p.x + DIRS[p.dir][0] * p.progress;
        const py = p.y + DIRS[p.dir][1] * p.progress;
        if (Math.hypot(fx - px, fy - py) < 0.7 && !f.eaten) {
          if (scared) {
            f.eaten = true;
            g.score += 200;
            playTone(900, 0.2, 'square', 0.04);
          } else {
            g.lives--;
            playTone(150, 0.6, 'sawtooth', 0.05);
            if (g.lives <= 0) {
              setPhase('over');
              setBest((b) => {
                const next = Math.max(b, g.score);
                try {
                  localStorage.setItem('hedgehog-hollow-best', String(next));
                } catch (e) {
                  /* storage unavailable */
                }
                return next;
              });
            } else {
              resetPositions(g);
            }
          }
        }
      });

      // Level cleared
      if (g.food.size === 0) {
        const nextLevel = g.level + 1;
        Object.assign(g, newLevel(nextLevel), {
          pause: 1.5,
        });
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.15), k * 100),
        );
      }
      const hudKey = `${g.score}|${g.lives}|${g.level}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.score,
          lives: g.lives,
          level: g.level,
        });
      }
    };
    const draw = (now) => {
      const g = game.current;
      const cell = canvas.width / COLS;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#2a3b26';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Hedges
      MAZE.forEach((row, y) =>
        row.split('').forEach((ch, x) => {
          if (ch !== '#') return;
          ctx.fillStyle = (x + y) % 2 ? '#3f6b35' : '#447339';
          ctx.beginPath();
          ctx.roundRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2, cell * 0.3);
          ctx.fill();
        }),
      );
      if (!g) return;

      // Food
      g.food.forEach((type, key) => {
        const [x, y] = key.split(',').map(Number);
        const cx = (x + 0.5) * cell;
        const cy = (y + 0.5) * cell;
        if (type === 'o') {
          const pulse = 1 + Math.sin(now / 200) * 0.15;
          ctx.fillStyle = 'rgba(180,255,190,.25)';
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.45 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#c9ffcf';
          ctx.beginPath();
          ctx.arc(cx, cy - cell * 0.05, cell * 0.25, Math.PI, 0);
          ctx.fill();
          ctx.fillRect(cx - cell * 0.06, cy - cell * 0.05, cell * 0.12, cell * 0.2);
        } else {
          ctx.fillStyle = '#e2445c';
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const posOf = (e) => [
        (((e.x + DIRS[e.dir][0] * e.progress + COLS) % COLS) + 0.5) * cell,
        (e.y + DIRS[e.dir][1] * e.progress + 0.5) * cell,
      ];

      // Foxes
      g.foxes.forEach((f) => {
        const [x, y] = posOf(f);
        const scared = g.frightened > 0 && !f.eaten;
        const blink = scared && g.frightened < 2 && Math.floor(now / 150) % 2;
        if (f.eaten) {
          ctx.fillStyle = '#ffffffaa';
          ctx.beginPath();
          ctx.arc(x - cell * 0.12, y, cell * 0.1, 0, Math.PI * 2);
          ctx.arc(x + cell * 0.12, y, cell * 0.1, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        ctx.fillStyle = scared ? (blink ? '#ffffff' : '#6fa8dc') : f.color;
        ctx.beginPath();
        ctx.moveTo(x - cell * 0.4, y + cell * 0.35);
        ctx.lineTo(x - cell * 0.38, y - cell * 0.2);
        ctx.lineTo(x - cell * 0.28, y - cell * 0.45);
        ctx.lineTo(x - cell * 0.1, y - cell * 0.25);
        ctx.lineTo(x + cell * 0.1, y - cell * 0.25);
        ctx.lineTo(x + cell * 0.28, y - cell * 0.45);
        ctx.lineTo(x + cell * 0.38, y - cell * 0.2);
        ctx.lineTo(x + cell * 0.4, y + cell * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(x, y + cell * 0.18, cell * 0.2, cell * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(x - cell * 0.14, y - cell * 0.02, cell * 0.06, 0, Math.PI * 2);
        ctx.arc(x + cell * 0.14, y - cell * 0.02, cell * 0.06, 0, Math.PI * 2);
        ctx.fill();
      });

      // Hedgehog
      const [hx, hy] = posOf(g.player);
      const angle = {
        right: 0,
        down: Math.PI / 2,
        left: Math.PI,
        up: -Math.PI / 2,
      }[g.player.dir];
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(angle);
      ctx.fillStyle = '#7a5a3e';
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * 0.55 + (k / 8) * Math.PI * 0.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * cell * 0.2, Math.sin(a) * cell * 0.2);
        ctx.lineTo(Math.cos(a) * cell * 0.48, Math.sin(a) * cell * 0.48);
        ctx.lineTo(Math.cos(a + 0.25) * cell * 0.2, Math.sin(a + 0.25) * cell * 0.2);
        ctx.fill();
      }
      ctx.fillStyle = '#c9a27a';
      ctx.beginPath();
      ctx.ellipse(cell * 0.05, 0, cell * 0.32, cell * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(cell * 0.36, 0, cell * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cell * 0.16, -cell * 0.1, cell * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (g.pause > 0 && phaseRef.current === 'playing') {
        ctx.fillStyle = '#f1ecd8';
        ctx.font = `900 ${cell * 1.1}px Grandstander, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('READY', canvas.width / 2, 10.8 * cell);
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
    const onKey = (e) => {
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        if (game.current) game.current.player.want = dir;
      }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current !== 'playing') start();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Swipes on touch screens
  const swipe = useRef(null);
  const onPointerDown = (e) => {
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
    };
  };
  const onPointerMove = (e) => {
    if (!swipe.current || !game.current) return;
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    game.current.player.want =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
    };
  };
  return (
    <main className="font-body max-w-[560px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[clamp(32px,9vw,48px)] leading-none">
          Hedgehog Hollow
        </h1>
        <div className="text-right text-sm">
          <div>
            Score <b className="font-display text-xl">{hud.score}</b>
          </div>
          <div className="text-muted">
            Best {Math.max(best, hud.score)} · Hedge {hud.level} ·{' '}
            {'♥'.repeat(Math.max(0, hud.lives))}
          </div>
        </div>
      </header>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            swipe.current = null;
          }}
          aria-label="Hedge maze"
          className="w-full block rounded-xl touch-none"
          style={{
            aspectRatio: `${COLS} / ${ROWS}`,
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 rounded-xl bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="font-display text-3xl">
              {phase === 'over' ? 'Caught by the foxes!' : 'Berry season'}
            </p>
            <p className="text-muted max-w-[34ch]">
              {phase === 'over'
                ? `You gathered ${hud.score} points. Best: ${Math.max(best, hud.score)}.`
                : 'Guide the hedgehog through the hedges and eat every berry. Eat a glowing mushroom and, for a short while, the foxes turn tail, and you can chase them.'}
            </p>
            <p className="text-sm text-muted">
              Arrow keys or WASD. Swipe on touch screens.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-6 py-2 rounded-full bg-berry text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Try again' : 'Start'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
