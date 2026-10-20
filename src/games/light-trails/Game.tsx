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

// ---------- Arena ----------

const COLS = 40;
const ROWS = 28;
const TICK = 0.075;
const WINS_NEEDED = 5;
const BEST_KEY = 'light-trails-best';
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
const TURN_LEFT = {
  up: 'left',
  left: 'down',
  down: 'right',
  right: 'up',
};
const TURN_RIGHT = {
  up: 'right',
  right: 'down',
  down: 'left',
  left: 'up',
};
const NAMES = ['You', 'Teal', 'Ochre', 'Plum'];

// Rider 0 is always the player. Computer riders start on the other edges, facing inwards.
const SPAWNS = [
  {
    x: Math.floor(COLS * 0.25),
    y: ROWS - 3,
    dir: 'up',
  },
  {
    x: Math.floor(COLS * 0.75),
    y: 2,
    dir: 'down',
  },
  {
    x: 2,
    y: Math.floor(ROWS * 0.3),
    dir: 'right',
  },
  {
    x: COLS - 3,
    y: Math.floor(ROWS * 0.7),
    dir: 'left',
  },
];
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const isFree = (grid, x, y) => inBounds(x, y) && grid[y * COLS + x] === -1;

// Decorative contour lines: a few hills drawn as nested wobbly rings.
function makeContours() {
  const rings = [];
  for (let h = 0; h < 3; h++) {
    const cx = 6 + Math.random() * (COLS - 12);
    const cy = 5 + Math.random() * (ROWS - 10);
    const p1 = Math.random() * 6;
    const p2 = Math.random() * 6;
    for (let k = 0; k < 4; k++) {
      const radius = 2.5 + k * 2.6;
      const points = [];
      for (let s = 0; s < 56; s++) {
        const a = (s / 56) * Math.PI * 2;
        const wobble = 1 + 0.18 * Math.sin(a * 3 + p1) + 0.1 * Math.sin(a * 5 + p2);
        points.push([
          cx + Math.cos(a) * radius * wobble,
          cy + Math.sin(a) * radius * wobble * 0.8,
        ]);
      }
      rings.push(points);
    }
  }
  return rings;
}

function newRound(riderCount) {
  const grid = new Int8Array(COLS * ROWS).fill(-1);
  const riders = SPAWNS.slice(0, riderCount).map((s, i) => {
    grid[s.y * COLS + s.x] = i;
    return {
      x: s.x,
      y: s.y,
      dir: s.dir,
      alive: true,
      trail: [[s.x, s.y]],
      queue: [],
      crash: null,
      // How keen a computer rider is to cut in front of you this round.
      aggression: 0.3 + Math.random() * 0.5,
    };
  });
  return {
    grid,
    riders,
    acc: 0,
    countdown: 1.6,
    ending: 0,
    winner: null,
    contours: makeContours(),
  };
}

// Counts how many empty cells can be reached from (sx, sy), stopping at `limit`.
function floodSize(grid, sx, sy, limit) {
  if (!isFree(grid, sx, sy)) return 0;
  const seen = new Uint8Array(COLS * ROWS);
  const stack = [sy * COLS + sx];
  seen[stack[0]] = 1;
  let count = 0;
  while (stack.length && count < limit) {
    const cell = stack.pop();
    count++;
    const x = cell % COLS;
    const y = Math.floor(cell / COLS);
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isFree(grid, nx, ny)) continue;
      const id = ny * COLS + nx;
      if (seen[id]) continue;
      seen[id] = 1;
      stack.push(id);
    }
  }
  return count;
}

// ---------- Computer riders ----------
// Each tick a computer rider scores going straight, left and right:
// open space behind the move matters most, then a clear run ahead,
// and when you are close it is tempted to steer towards the spot in front of you.

function chooseDirection(rider, g) {
  const player = g.riders[0];
  const options = [rider.dir, TURN_LEFT[rider.dir], TURN_RIGHT[rider.dir]];
  let bestDir = rider.dir;
  let bestScore = -Infinity;
  for (const d of options) {
    const [dx, dy] = DIRS[d];
    const nx = rider.x + dx;
    const ny = rider.y + dy;
    if (!isFree(g.grid, nx, ny)) continue;
    let run = 0;
    while (run < 10 && isFree(g.grid, nx + dx * (run + 1), ny + dy * (run + 1))) run++;
    const space = floodSize(g.grid, nx, ny, 160);
    let score = space + run * 3 + Math.random() * 6;
    if (d === rider.dir) score += 4;
    if (player.alive && Math.hypot(player.x - rider.x, player.y - rider.y) < 14) {
      const tx = player.x + DIRS[player.dir][0] * 5;
      const ty = player.y + DIRS[player.dir][1] * 5;
      const gain = Math.hypot(tx - rider.x, ty - rider.y) - Math.hypot(tx - nx, ty - ny);
      score += gain * 14 * rider.aggression;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }
  return bestDir;
}

// ---------- Simulation ----------

function tick(g) {
  // 1. Everyone picks a direction.
  g.riders.forEach((r, i) => {
    if (!r.alive) return;
    if (i === 0) {
      if (r.queue.length) r.dir = r.queue.shift();
    } else {
      r.dir = chooseDirection(r, g);
    }
  });

  // 2. Work out where everyone is heading. Two riders entering the same cell both crash.
  const targets = g.riders.map((r) =>
    r.alive ? [r.x + DIRS[r.dir][0], r.y + DIRS[r.dir][1]] : null,
  );
  let crashed = false;
  g.riders.forEach((r, i) => {
    if (!r.alive) return;
    const [nx, ny] = targets[i];
    let dead = !isFree(g.grid, nx, ny);
    targets.forEach((t, j) => {
      if (j !== i && t && t[0] === nx && t[1] === ny) dead = true;
    });
    if (dead) {
      r.alive = false;
      r.crash = [nx, ny];
      crashed = true;
    }
  });

  // 3. Survivors move and lay trail.
  g.riders.forEach((r, i) => {
    if (!r.alive) return;
    const [nx, ny] = targets[i];
    r.x = nx;
    r.y = ny;
    g.grid[ny * COLS + nx] = i;
    r.trail.push([nx, ny]);
  });
  if (crashed) playTone(140, 0.35, 'sawtooth', 0.04);
}
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
};

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Light Trails');

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
  const [opponents, setOpponents] = useState(2);
  const opponentsRef = useRef(opponents);
  opponentsRef.current = opponents;
  const [hud, setHud] = useState({
    wins: [0, 0, 0],
    round: 1,
  });
  const [result, setResult] = useState(null);
  const [streak, setStreak] = useState(0);
  const streakRef = useRef(0);
  const [best, setBest] = useState(readBest);
  const start = () => {
    const count = opponentsRef.current + 1;
    game.current = {
      ...newRound(count),
      wins: Array(count).fill(0),
      round: 1,
      count,
    };
    setHud({
      wins: Array(count).fill(0),
      round: 1,
    });
    setResult(null);
    setPhase('playing');
    playTone(520, 0.08);
  };

  // Queues an absolute direction for the player; reversing is not allowed.
  const steer = (dir) => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing') return;
    const p = g.riders[0];
    if (!p.alive) return;
    const lastDir = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (dir === lastDir || dir === OPPOSITE[lastDir]) return;
    if (p.queue.length < 2) {
      p.queue.push(dir);
      playTone(880, 0.03, 'square', 0.015);
    }
  };

  // Relative turns, for the on-screen buttons.
  const turn = (side) => {
    const g = game.current;
    if (!g) return;
    const p = g.riders[0];
    const lastDir = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    steer(side === 'left' ? TURN_LEFT[lastDir] : TURN_RIGHT[lastDir]);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    let palette = null;
    let paletteAge = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    // Canvas colours follow the CSS tokens, so light and dark themes both work.
    const readPalette = () => {
      const css = getComputedStyle(document.documentElement);
      const v = (name) => css.getPropertyValue(name).trim();
      return {
        paper: v('--paper'),
        grid: v('--grid'),
        contour: v('--contour'),
        ink: v('--ink'),
        muted: v('--muted'),
        riders: [v('--r0'), v('--r1'), v('--r2'), v('--r3')],
      };
    };
    const finishRound = (g) => {
      const alive = g.riders.filter((r) => r.alive);
      g.winner = alive.length === 1 ? g.riders.indexOf(alive[0]) : null;
      if (g.winner !== null) g.wins[g.winner]++;
      g.ending = 2.2;
      if (g.winner === 0) {
        [523, 659, 784].forEach((f, k) => setTimeout(() => playTone(f, 0.14), k * 90));
      } else {
        playTone(220, 0.3, 'triangle', 0.04);
      }
    };
    const finishMatch = (g) => {
      // Flip the ref at once so the next frame cannot finish the match a second time.
      phaseRef.current = 'over';
      const champion = g.wins.findIndex((w) => w >= WINS_NEEDED);
      const won = champion === 0;
      const nextStreak = won ? streakRef.current + 1 : 0;
      streakRef.current = nextStreak;
      setStreak(nextStreak);
      setBest((b) => {
        const next = Math.max(b, nextStreak);
        try {
          localStorage.setItem(BEST_KEY, String(next));
        } catch (e) {
          // Storage unavailable.
        }
        return next;
      });
      setResult({
        won,
        champion,
        wins: [...g.wins],
      });
      setPhase('over');
    };
    const update = (dt) => {
      const g = game.current;
      if (!g || phaseRef.current !== 'playing') return;

      // Short pause between rounds, then either the next round or the end of the match.
      if (g.ending > 0) {
        g.ending -= dt;
        if (g.ending <= 0) {
          if (g.wins.some((w) => w >= WINS_NEEDED)) {
            finishMatch(g);
            return;
          }
          Object.assign(g, newRound(g.count), {
            round: g.round + 1,
          });
        }
      } else if (g.countdown > 0) {
        g.countdown -= dt;
      } else {
        // Once you are out, the remaining riders race to a finish at triple speed.
        const step = g.riders[0].alive ? TICK : TICK / 3;
        g.acc += dt;
        while (g.acc >= step && g.ending <= 0) {
          g.acc -= step;
          tick(g);
          if (g.riders.filter((r) => r.alive).length <= 1) finishRound(g);
        }
      }
      const hudKey = `${g.wins.join(',')}|${g.round}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          wins: [...g.wins],
          round: g.round,
        });
      }
    };
    const draw = (now) => {
      if (!palette || now - paletteAge > 1000) {
        palette = readPalette();
        paletteAge = now;
      }
      const g = game.current;
      const cell = canvas.width / COLS;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = palette.paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid: fine lines every cell, heavier every five.
      for (let x = 0; x <= COLS; x++) {
        ctx.fillStyle = palette.grid;
        ctx.globalAlpha = x % 5 === 0 ? 1 : 0.45;
        ctx.fillRect(
          Math.round(x * cell),
          0,
          Math.max(1, cell * (x % 5 === 0 ? 0.08 : 0.04)),
          canvas.height,
        );
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.globalAlpha = y % 5 === 0 ? 1 : 0.45;
        ctx.fillRect(
          0,
          Math.round(y * cell),
          canvas.width,
          Math.max(1, cell * (y % 5 === 0 ? 0.08 : 0.04)),
        );
      }
      ctx.globalAlpha = 1;
      if (!g) return;

      // Contours
      ctx.strokeStyle = palette.contour;
      ctx.lineWidth = Math.max(1, cell * 0.08);
      g.contours.forEach((ring) => {
        ctx.beginPath();
        ring.forEach(([x, y], k) => {
          if (k === 0) ctx.moveTo(x * cell, y * cell);
          else ctx.lineTo(x * cell, y * cell);
        });
        ctx.closePath();
        ctx.stroke();
      });

      // Frame
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = cell * 0.18;
      ctx.strokeRect(
        cell * 0.09,
        cell * 0.09,
        canvas.width - cell * 0.18,
        canvas.height - cell * 0.18,
      );
      const moving = g.countdown <= 0 && g.ending <= 0;
      const step = g.riders[0].alive ? TICK : TICK / 3;
      const t = moving ? Math.min(1, g.acc / step) : 0;

      // Trails, drawn as one thick polyline per rider, ending at the smoothly moving head.
      g.riders.forEach((r, i) => {
        const color = palette.riders[i];
        const [hx, hy] = r.alive
          ? [r.x + DIRS[r.dir][0] * t, r.y + DIRS[r.dir][1] * t]
          : [r.x, r.y];
        ctx.strokeStyle = color;
        ctx.globalAlpha = r.alive ? 1 : 0.45;
        ctx.lineWidth = cell * 0.5;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        r.trail.forEach(([x, y], k) => {
          const px = (x + 0.5) * cell;
          const py = (y + 0.5) * cell;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.lineTo((hx + 0.5) * cell, (hy + 0.5) * cell);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (r.alive) {
          // Head: a survey marker ring.
          ctx.fillStyle = palette.paper;
          ctx.beginPath();
          ctx.arc((hx + 0.5) * cell, (hy + 0.5) * cell, cell * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = cell * 0.22;
          ctx.strokeStyle = color;
          ctx.stroke();
          if (i === 0) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc((hx + 0.5) * cell, (hy + 0.5) * cell, cell * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (r.crash) {
          // Crash site: a surveyor's cross.
          const cx = (r.crash[0] + 0.5) * cell;
          const cy = (r.crash[1] + 0.5) * cell;
          const s = cell * 0.7;
          ctx.strokeStyle = color;
          ctx.lineWidth = cell * 0.25;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - s, cy - s);
          ctx.lineTo(cx + s, cy + s);
          ctx.moveTo(cx + s, cy - s);
          ctx.lineTo(cx - s, cy + s);
          ctx.stroke();
        }
      });

      // Banner text for countdowns and round results.
      let banner = null;
      if (g.countdown > 0) banner = `ROUND ${g.round} · ${Math.ceil(g.countdown / 0.55)}`;
      if (g.ending > 0) {
        if (g.winner === null) banner = 'DRAW · NO POINT';
        else if (g.winner === 0) banner = 'YOU TAKE THE ROUND';
        else banner = `${NAMES[g.winner].toUpperCase()} TAKES THE ROUND`;
      }
      if (banner) {
        const size = Math.min(cell * 1.6, canvas.width / (banner.length * 0.75));
        ctx.font = `700 ${size}px Tomorrow, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(banner).width + size * 1.4;
        ctx.fillStyle = palette.paper;
        ctx.fillRect(canvas.width / 2 - w / 2, canvas.height / 2 - size, w, size * 2);
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = Math.max(1, cell * 0.1);
        ctx.strokeRect(canvas.width / 2 - w / 2, canvas.height / 2 - size, w, size * 2);
        ctx.fillStyle = palette.ink;
        ctx.fillText(banner, canvas.width / 2, canvas.height / 2 + size * 0.05);
      }
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
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
      W: 'up',
      S: 'down',
      A: 'left',
      D: 'right',
    };
    const onKey = (e) => {
      const dir = KEYS[e.key];
      if (dir && phaseRef.current === 'playing') {
        e.preventDefault();
        steer(dir);
      }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current !== 'playing') {
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

  // Swipes on the map
  const swipe = useRef(null);
  const onPointerDown = (e) => {
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
    };
  };
  const onPointerMove = (e) => {
    if (!swipe.current) return;
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    steer(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
    );
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
    };
  };

  // Before the first match the scoreboard previews the chosen number of riders.
  const tally = phase === 'menu' ? Array(opponents + 1).fill(0) : hud.wins;
  return (
    <main className="font-mono max-w-[680px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-[clamp(30px,8.5vw,46px)] leading-none tracking-tight">
            Light Trails
          </h1>
          <p className="text-xs text-muted mt-1">
            SHEET {String(hud.round).padStart(2, '0')} · FIRST TO {WINS_NEEDED}
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <div>
            Win streak <b className="font-display text-lg text-ink">{streak}</b>
          </div>
          <div>Best streak {Math.max(best, streak)}</div>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap text-sm" aria-label="Rounds won">
        {tally.map((w, i) => (
          <div
            key={String(String(i))}
            className="flex items-center gap-2 border border-rule rounded px-2 py-1 bg-paper"
          >
            <span
              className={`inline-block w-3 h-3 rounded-full ${['bg-r0', 'bg-r1', 'bg-r2', 'bg-r3'][i]}`}
            />
            <span>{NAMES[i]}</span>
            <b className="font-display">{w}</b>
          </div>
        ))}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            swipe.current = null;
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          aria-label="Light cycle arena"
          className="w-full block rounded-md touch-none"
          style={{
            aspectRatio: `${COLS} / ${ROWS}`,
          }}
        />

        {phase !== 'playing' && (
          // On phones the map is too short to hold the menu, so the card sits below it; from 640px it overlays the map.
          <div className="mt-3 sm:mt-0 sm:absolute sm:inset-0 rounded-md bg-card border border-rule flex flex-col items-center justify-center gap-3 text-center p-4">
            <p className="font-display font-bold text-[clamp(22px,6vw,32px)] leading-tight">
              {phase === 'over'
                ? result && result.won
                  ? 'Match won'
                  : `${result ? NAMES[result.champion] : ''} wins the match`
                : 'Survey duel'}
            </p>
            <p className="text-muted text-sm max-w-[42ch]">
              {phase === 'over'
                ? `Final tally: ${result ? result.wins.map((w, i) => `${NAMES[i]} ${w}`).join(' · ') : ''}.`
                : 'Every rider draws a solid line. Hit any line or the edge and you are out. Last rider moving wins the round. First to 5 rounds wins.'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Rivals</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={String(String(n))}
                  type="button"
                  onClick={() => setOpponents(n)}
                  aria-pressed={opponents === n}
                  className={`w-9 h-9 rounded border-2 border-ink font-display font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-r0
                      ${opponents === n ? 'bg-ink text-paper' : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Arrows or WASD. Swipe on the map, or use the turn buttons on touch screens.
            </p>
            <button
              type="button"
              onClick={start}
              className="font-display font-bold text-xl px-6 py-2 rounded bg-r0 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {phase === 'over' ? 'Play again' : 'Start'}
            </button>
          </div>
        )}
      </div>

      <div className="touch-only grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-label="Turn left"
          onPointerDown={(e) => {
            e.preventDefault();
            turn('left');
          }}
          className="touch-none h-16 rounded-md border-2 border-ink bg-paper font-display font-bold text-lg select-none"
        >
          ↺ Left
        </button>
        <button
          type="button"
          aria-label="Turn right"
          onPointerDown={(e) => {
            e.preventDefault();
            turn('right');
          }}
          className="touch-none h-16 rounded-md border-2 border-ink bg-paper font-display font-bold text-lg select-none"
        >
          Right ↻
        </button>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        Turns are 90° only, and you cannot reverse. Computer riders look ahead to dodge
        walls, and sometimes swing in front of you to cut you off. Once you crash, the
        round plays out at speed.
      </p>
    </main>
  );
}
export default App;
