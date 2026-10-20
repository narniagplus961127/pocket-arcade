import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  over: HTMLDivElement;
  oTitle: HTMLElement;
  oText: HTMLElement;
  go: HTMLButtonElement;
  score: HTMLSpanElement;
  lines: HTMLSpanElement;
  level: HTMLSpanElement;
  next: HTMLCanvasElement;
  best: HTMLSpanElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    nx = getGameElement<HTMLCanvasElement>('next'),
    nctx = nx.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.1, type = 'square', v = 0.05, sl = 0) {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(),
      g = AC.createGain(),
      t = AC.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (sl) o.frequency.exponentialRampToValueAtTime(f * sl, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const COLS = 10,
    ROWS = 20;
  const SHAPES = [
    [[1, 1, 1, 1]],
    [
      [1, 1],
      [1, 1],
    ],
    [
      [0, 1, 0],
      [1, 1, 1],
    ],
    [
      [1, 0, 0],
      [1, 1, 1],
    ],
    [
      [0, 0, 1],
      [1, 1, 1],
    ],
    [
      [0, 1, 1],
      [1, 1, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 1],
    ],
  ];
  const COLORS = [
    '#e8573f',
    '#2fa4a9',
    '#f2b632',
    '#3d6fd1',
    '#8bc34a',
    '#d6457a',
    '#f08a2a',
  ];
  let board,
    cur,
    nextP,
    score,
    lines,
    level,
    alive = false,
    paused = false,
    acc = 0,
    best = 0;
  try {
    best = +localStorage.getItem('crate-docks-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  const rotate = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
  const piece = () => {
    const k = Math.floor(Math.random() * 7);
    return {
      m: SHAPES[k],
      k,
      x: 0,
      y: 0,
    };
  };
  function fits(m, x, y) {
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++)
        if (m[r][c]) {
          const bx = x + c,
            by = y + r;
          if (bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx] >= 0))
            return false;
        }
    return true;
  }

  function spawn() {
    cur = nextP;
    nextP = piece();
    cur.x = Math.floor((COLS - cur.m[0].length) / 2);
    cur.y = -1;
    if (!fits(cur.m, cur.x, cur.y)) end();
    drawNext();
  }

  function start() {
    board = [...Array(ROWS)].map(() => Array(COLS).fill(-1));
    score = 0;
    lines = 0;
    level = 1;
    acc = 0;
    alive = true;
    paused = false;
    nextP = piece();
    spawn();
    hud();
    $('over').hidden = true;
  }

  function hud() {
    $('score').textContent = String(score);
    $('lines').textContent = String(lines);
    $('level').textContent = String(level);
  }

  function lock() {
    cur.m.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v && cur.y + r >= 0) board[cur.y + r][cur.x + c] = cur.k;
      }),
    );
    if (cur.y < 0) return end();
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--)
      if (board[r].every((v) => v >= 0)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(-1));
        cleared++;
        r++;
      }
    if (cleared) {
      score += [0, 100, 300, 500, 800][cleared] * level;
      lines += cleared;
      level = 1 + Math.floor(lines / 10);
      [392, 523, 659, 784]
        .slice(0, cleared + 1)
        .forEach((f, i) =>
          lifecycle.setTimeout(() => tone(f, 0.15, 'triangle', 0.07), i * 70),
        );
    } else tone(110, 0.08, 'square', 0.04);
    hud();
    spawn();
  }

  function act(a) {
    if (!alive || paused) return;
    if (a === 'left' && fits(cur.m, cur.x - 1, cur.y)) cur.x--;
    if (a === 'right' && fits(cur.m, cur.x + 1, cur.y)) cur.x++;
    if (a === 'down') {
      if (fits(cur.m, cur.x, cur.y + 1)) {
        cur.y++;
        score++;
        hud();
      } else lock();
    }
    if (a === 'rot') {
      const m = rotate(cur.m);
      for (const k of [0, -1, 1, -2, 2])
        if (fits(m, cur.x + k, cur.y)) {
          cur.m = m;
          cur.x += k;
          tone(660, 0.03, 'sine', 0.03);
          break;
        }
    }
    if (a === 'drop') {
      let d = 0;
      while (fits(cur.m, cur.x, cur.y + 1)) {
        cur.y++;
        d++;
      }
      score += d * 2;
      hud();
      lock();
    }
  }

  function end() {
    alive = false;
    if (score > best) {
      best = score;
      $('best').textContent = String(best);
      try {
        localStorage.setItem('crate-docks-best', String(best));
      } catch (e) {}
    }
    $('oTitle').textContent = String('Hold is full');
    $('oText').textContent = String(`${lines} rows shipped, ${score} points.`);
    $('go').textContent = String('Next shift');
    $('over').hidden = false;
    $('go').focus();
    tone(150, 0.6, 'sawtooth', 0.06, 0.4);
  }
  $('go').onclick = start;
  const KEY = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'rot',
    ' ': 'drop',
    x: 'rot',
    a: 'left',
    d: 'right',
    s: 'down',
    w: 'rot',
  };
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      paused = !paused;
      return;
    }
    const a = KEY[e.key];
    if (!a) {
      if (e.key === 'Enter' && !alive) start();
      return;
    }
    e.preventDefault();
    if (!alive) {
      if (e.key === ' ' && !e.repeat) start();
      return;
    }
    act(a);
  });
  document.querySelectorAll<HTMLElement>('.pad button').forEach((b) => {
    let rep;
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      act(b.dataset.a);
      if (['left', 'right', 'down'].includes(b.dataset.a))
        rep = lifecycle.setInterval(() => act(b.dataset.a), 110);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      lifecycle.listen(b, ev, () => lifecycle.clearInterval(rep)),
    );
  });
  function crate(g, x, y, s, k, a = 1) {
    g.globalAlpha = a;
    g.fillStyle = COLORS[k];
    g.fillRect(x + 1, y + 1, s - 2, s - 2);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 1; i < 4; i++) g.fillRect(x + (i * s) / 4 - 1, y + 3, 1.5, s - 6);
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.fillRect(x + 1, y + 1, s - 2, 3);
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = 1;
    g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
    g.globalAlpha = 1;
  }

  function drawNext() {
    const d = Math.min(devicePixelRatio || 1, 2);
    nx.width = 88 * d;
    nx.height = 64 * d;
    nctx.setTransform(d, 0, 0, d, 0, 0);
    nctx.clearRect(0, 0, 88, 64);
    const s = 16,
      m = nextP.m;
    m.forEach((row, r) =>
      row.forEach(
        (v, c) =>
          v &&
          crate(
            nctx,
            44 - (m[0].length * s) / 2 + c * s,
            32 - (m.length * s) / 2 + r * s,
            s,
            nextP.k,
          ),
      ),
    );
  }

  function draw() {
    const d = Math.min(devicePixelRatio || 1, 2),
      w = cv.clientWidth,
      h = cv.clientHeight;
    if (cv.width !== Math.round(w * d)) {
      cv.width = Math.round(w * d);
      cv.height = Math.round(h * d);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const s = Math.min(w / COLS, h / ROWS);
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, w, h);
    ctx.translate((w - s * COLS) / 2, (h - s * ROWS) / 2);
    ctx.fillStyle = '#13263a';
    ctx.fillRect(0, 0, s * COLS, s * ROWS);
    ctx.strokeStyle = 'rgba(138,160,184,.08)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * s, 0);
      ctx.lineTo(c * s, s * ROWS);
      ctx.stroke();
    }
    if (board) {
      board.forEach((row, r) =>
        row.forEach((k, c) => k >= 0 && crate(ctx, c * s, r * s, s, k)),
      );
      if (alive) {
        let gy = cur.y;
        while (fits(cur.m, cur.x, gy + 1)) gy++;
        cur.m.forEach((row, r) =>
          row.forEach((v, c) => {
            if (v && gy + r >= 0) {
              ctx.strokeStyle = 'rgba(255,181,71,.5)';
              ctx.setLineDash([4, 4]);
              ctx.strokeRect((cur.x + c) * s + 2, (gy + r) * s + 2, s - 4, s - 4);
              ctx.setLineDash([]);
            }
          }),
        );
        cur.m.forEach((row, r) =>
          row.forEach(
            (v, c) =>
              v &&
              cur.y + r >= 0 &&
              crate(ctx, (cur.x + c) * s, (cur.y + r) * s, s, cur.k),
          ),
        );
        // crane cable
        ctx.strokeStyle = 'rgba(232,238,245,.4)';
        ctx.beginPath();
        ctx.moveTo((cur.x + cur.m[0].length / 2) * s, 0);
        ctx.lineTo((cur.x + cur.m[0].length / 2) * s, Math.max(0, cur.y * s));
        ctx.stroke();
      }
      if (paused) {
        ctx.fillStyle = 'rgba(13,27,42,.7)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffb547';
        ctx.font = '900 28px "Big Shoulders Display"';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', w / 2, h / 2);
      }
    }
  }
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (alive && !paused) {
      acc += dt;
      const step = Math.max(0.07, 0.8 - (level - 1) * 0.07);
      while (acc > step && alive) {
        acc -= step;
        act('down');
        score = Math.max(0, score - 1);
        hud();
      }
    }
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
