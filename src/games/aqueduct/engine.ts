import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  roman: HTMLDivElement;
  moves: HTMLSpanElement;
  time: HTMLSpanElement;
  built: HTMLSpanElement;
  c: HTMLCanvasElement;
  msg: HTMLDivElement;
  next: HTMLButtonElement;
  new: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  const N = 1,
    E = 2,
    S = 4,
    Wd = 8,
    DIRS = [
      [N, -1, 0, S],
      [E, 0, 1, Wd],
      [S, 1, 0, N],
      [Wd, 0, -1, E],
    ];
  const rotCW = (m) => ((m << 1) | (m >> 3)) & 15,
    rotCCW = (m) => ((m >> 1) | ((m & 1) << 3)) & 15;
  const ROMAN = [
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
    'X',
    'XI',
    'XII',
    'XIII',
    'XIV',
    'XV',
    'XVI',
    'XVII',
    'XVIII',
    'XIX',
    'XX',
  ];
  let AC = null;
  function tone(f, d = 0.12, type = 'triangle', v = 0.06) {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(),
      g = AC.createGain(),
      t0 = AC.currentTime;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }

  function water() {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    const T = AC.currentTime,
      len = 1.2,
      buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate),
      d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = AC.createBufferSource(),
      f = AC.createBiquadFilter(),
      g = AC.createGain();
    s.buffer = buf;
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, T);
    f.frequency.exponentialRampToValueAtTime(1600, T + len);
    g.gain.value = 0.12;
    s.connect(f).connect(g).connect(AC.destination);
    s.start(T);
  }
  let built = 0;
  try {
    built = +localStorage.getItem('aqueduct-built') || 0;
  } catch (e) {}
  let n,
    grid,
    angle,
    src,
    dst,
    wet,
    moves,
    startT,
    solved,
    cursor = {
      r: 0,
      c: 0,
    },
    showCursor = false;
  function sizeFor(b) {
    return b < 2 ? 4 : b < 5 ? 5 : b < 9 ? 6 : 7;
  }

  function makePath() {
    const r0 = Math.floor(Math.random() * n),
      seen = new Set(),
      path = [];
    const minLen = n + Math.floor(n / 2);
    let budget = 4000;
    function dfs(r, c) {
      if (--budget < 0) return false;
      path.push([r, c]);
      seen.add(r * n + c);
      if (c === n - 1 && path.length >= minLen) return true;
      const order = DIRS.map((d, i) => i).sort(() => Math.random() - 0.5);
      for (const i of order) {
        const [, dr, dc] = DIRS[i],
          nr = r + dr,
          nc = c + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n || seen.has(nr * n + nc)) continue;
        if (dfs(nr, nc)) return true;
      }
      path.pop();
      seen.delete(r * n + c);
      return false;
    }
    return dfs(r0, 0) ? path : makePath();
  }

  function build() {
    n = sizeFor(built);
    let path = makePath();
    grid = new Array(n * n).fill(0);
    path.forEach(([r, c], k) => {
      let m = 0;
      const link = (a, b) => {
        for (const [bit, dr, dc] of DIRS)
          if (a[0] + dr === b[0] && a[1] + dc === b[1]) return bit;
        return 0;
      };
      if (k === 0) m |= Wd;
      else m |= link(path[k], path[k - 1]);
      if (k === path.length - 1) m |= E;
      else m |= link(path[k], path[k + 1]);
      grid[r * n + c] = m;
    });
    const FILL = [5, 10, 3, 6, 12, 9, 7, 14, 13, 11];
    for (let i = 0; i < n * n; i++)
      if (!grid[i]) grid[i] = FILL[Math.floor(Math.random() * FILL.length)];
    src = path[0][0];
    dst = path[path.length - 1][0];
    angle = new Array(n * n).fill(0);
    for (let i = 0; i < n * n; i++) {
      const k = Math.floor(Math.random() * 4);
      for (let j = 0; j < k; j++) grid[i] = rotCW(grid[i]);
    }
    flow();
    if (solved) return build();
    moves = 0;
    startT = performance.now();
    solved = false;
    $('moves').textContent = String(0);
    $('built').textContent = String(built);
    $('roman').textContent = String(`AQVA · ${ROMAN[built % 20]}`);
    $('next').hidden = true;
    $('msg').textContent = String(
      'Turn the stones until water from the spring reaches the basin.',
    );
    cursor = {
      r: src,
      c: 0,
    };
  }

  function flow() {
    wet = new Set();
    solved = false;
    const start = src * n;
    if (!(grid[start] & Wd)) return;
    const q = [start];
    wet.add(start);
    while (q.length) {
      const i = q.shift(),
        r = Math.floor(i / n),
        c = i % n;
      for (const [bit, dr, dc, opp] of DIRS) {
        if (!(grid[i] & bit)) continue;
        const nr = r + dr,
          nc = c + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        const j = nr * n + nc;
        if (!wet.has(j) && grid[j] & opp) {
          wet.add(j);
          q.push(j);
        }
      }
    }
    const end = dst * n + n - 1;
    solved = wet.has(end) && !!(grid[end] & E);
  }

  function turn(i, ccw) {
    if (solved) return;
    grid[i] = ccw ? rotCCW(grid[i]) : rotCW(grid[i]);
    angle[i] = ccw ? Math.PI / 2 : -Math.PI / 2;
    moves++;
    $('moves').textContent = String(moves);
    const before = wet.size;
    flow();
    tone(wet.size > before ? 330 + wet.size * 20 : 196, 0.1, 'triangle', 0.05);
    if (solved) {
      built++;
      try {
        localStorage.setItem('aqueduct-built', String(built));
      } catch (e) {}
      $('built').textContent = String(built);
      const secs = Math.round((performance.now() - startT) / 1000);
      $('msg').textContent = String(
        `The basin fills. Built in ${moves} turns and ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}.`,
      );
      $('next').hidden = false;
      water();
      [0, 4, 7, 12].forEach((s, k) =>
        lifecycle.setTimeout(
          () => tone(392 * Math.pow(2, s / 12), 0.4, 'sine', 0.05),
          k * 120,
        ),
      );
    }
  }

  function cellAt(e) {
    const rect = cv.getBoundingClientRect(),
      L = layout(rect.width);
    const x = e.clientX - rect.left - L.ox,
      y = e.clientY - rect.top - L.oy;
    const c = Math.floor(x / L.cs),
      r = Math.floor(y / L.cs);
    return r >= 0 && r < n && c >= 0 && c < n ? r * n + c : -1;
  }
  lifecycle.listen(cv, 'click', (e) => {
    const i = cellAt(e);
    if (i >= 0) {
      showCursor = false;
      turn(i, e.shiftKey);
    }
  });
  lifecycle.listen(cv, 'contextmenu', (e) => {
    e.preventDefault();
    const i = cellAt(e);
    if (i >= 0) turn(i, true);
  });
  lifecycle.listen(cv, 'keydown', (e) => {
    const k = e.key;
    let used = true;
    if (k === 'ArrowUp') cursor.r = Math.max(0, cursor.r - 1);
    else if (k === 'ArrowDown') cursor.r = Math.min(n - 1, cursor.r + 1);
    else if (k === 'ArrowLeft') cursor.c = Math.max(0, cursor.c - 1);
    else if (k === 'ArrowRight') cursor.c = Math.min(n - 1, cursor.c + 1);
    else if (k === ' ' || k === 'Enter') turn(cursor.r * n + cursor.c, e.shiftKey);
    else used = false;
    if (used) {
      e.preventDefault();
      showCursor = true;
    }
  });
  $('next').onclick = () => {
    build();
    cv.focus();
  };
  $('new').onclick = () => build();
  function layout(size) {
    const pad = size * 0.09;
    const cs = (size - pad * 2) / n;
    return {
      ox: pad,
      oy: pad,
      cs,
    };
  }
  let SIZE = 0,
    DPR = 1;
  function fit() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    SIZE = cv.getBoundingClientRect().width;
    cv.width = SIZE * DPR;
    cv.height = SIZE * DPR;
  }
  new ResizeObserver(fit).observe(cv);
  const css = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function draw(t) {
    if (!SIZE) return;
    const C = {
      stone: css('--stone'),
      edge: css('--stone-edge'),
      ch: css('--channel'),
      water: css('--water'),
      hi: css('--water-hi'),
      ink: css('--ink'),
      accent: css('--accent'),
      bg: css('--bg'),
    };
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const L = layout(SIZE),
      cs = L.cs;
    // spring and basin
    const sy = L.oy + (src + 0.5) * cs,
      dy = L.oy + (dst + 0.5) * cs;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.roundRect(4, sy - cs * 0.35, L.ox - 6, cs * 0.7, 4);
    ctx.fill();
    ctx.fillStyle = C.water;
    ctx.fillRect(L.ox * 0.45, sy - cs * 0.1, L.ox * 0.6, cs * 0.2);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.roundRect(SIZE - L.ox + 2, dy - cs * 0.4, L.ox - 6, cs * 0.8, [0, 0, 10, 10]);
    ctx.fill();
    if (solved) {
      ctx.fillStyle = C.water;
      ctx.beginPath();
      ctx.roundRect(SIZE - L.ox + 5, dy - cs * 0.2, L.ox - 12, cs * 0.55, [0, 0, 8, 8]);
      ctx.fill();
    }
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const i = r * n + c,
          x = L.ox + c * cs,
          y = L.oy + r * cs,
          cx = x + cs / 2,
          cy = y + cs / 2;
        angle[i] *= 0.7;
        if (Math.abs(angle[i]) < 0.01) angle[i] = 0;
        ctx.fillStyle = C.edge;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 4, cs - 4, cs - 4, cs * 0.1);
        ctx.fill();
        ctx.fillStyle = C.stone;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, cs - 4, cs - 6, cs * 0.1);
        ctx.fill();
        ctx.save();
        ctx.translate(cx, cy - 1);
        ctx.rotate(angle[i]);
        const m = grid[i],
          isWet = wet.has(i),
          w = cs * 0.3;
        ctx.lineCap = 'round';
        const arms = [
          [0, -1, N],
          [1, 0, E],
          [0, 1, S],
          [-1, 0, Wd],
        ].filter((a) => m & a[2]);
        ctx.strokeStyle = C.ch;
        ctx.lineWidth = w;
        for (const [ax, ay] of arms) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo((ax * cs) / 2, (ay * cs) / 2);
          ctx.stroke();
        }
        if (isWet) {
          ctx.strokeStyle = C.water;
          ctx.lineWidth = w * 0.62;
          for (const [ax, ay] of arms) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo((ax * cs) / 2, (ay * cs) / 2);
            ctx.stroke();
          }
          ctx.strokeStyle = C.hi;
          ctx.lineWidth = w * 0.14;
          ctx.setLineDash([cs * 0.08, cs * 0.14]);
          ctx.lineDashOffset = -t / 40;
          for (const [ax, ay] of arms) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo((ax * cs) / 2, (ay * cs) / 2);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        ctx.restore();
        if (showCursor && cursor.r === r && cursor.c === c) {
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 3, y + 3, cs - 6, cs - 8);
        }
      }
    lifecycle.requestAnimationFrame(draw);
  }
  build();
  fit();
  lifecycle.setInterval(() => {
    if (!solved) {
      const s = Math.floor((performance.now() - startT) / 1000);
      $('time').textContent = String(
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
      );
    }
  }, 500);
  lifecycle.requestAnimationFrame(draw);
}
