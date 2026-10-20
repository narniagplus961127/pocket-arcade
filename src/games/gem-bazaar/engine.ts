import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  score: HTMLElement;
  target: HTMLElement;
  moves: HTMLElement;
  bar: HTMLElement;
  c: HTMLCanvasElement;
  msg: HTMLDivElement;
  mTitle: HTMLElement;
  mText: HTMLElement;
  go: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.12, type = 'sine', v = 0.06) {
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
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const N = 8,
    KINDS = 6;
  const GEM = [
    {
      c: '#e63946',
      hi: '#ffb3ba',
      shape: 'diamond',
    },
    {
      c: '#2a9d8f',
      hi: '#a8f0e6',
      shape: 'circle',
    },
    {
      c: '#f2a51a',
      hi: '#ffe7a3',
      shape: 'square',
    },
    {
      c: '#7b4fd6',
      hi: '#d9c7ff',
      shape: 'hex',
    },
    {
      c: '#3a86ff',
      hi: '#bcd6ff',
      shape: 'tri',
    },
    {
      c: '#e9eef5',
      hi: '#ffffff',
      shape: 'star',
    },
  ];
  let grid,
    sel = null,
    busy = false,
    score = 0,
    moves = 20,
    target = 3000,
    day = 1,
    playing = false,
    fx = [];
  let SIZE = 0,
    DPR = 1;
  function fit() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    SIZE = cv.getBoundingClientRect().width;
    cv.width = SIZE * DPR;
    cv.height = SIZE * DPR;
  }
  new ResizeObserver(fit).observe(cv);
  fit();
  const rnd = () => Math.floor(Math.random() * KINDS);
  function fill() {
    grid = [...Array(N)].map(() =>
      Array(N)
        .fill(0)
        .map(() => ({
          k: rnd(),
          y: 0,
        })),
    );
    while (findMatches().length || !hasMove())
      grid.forEach((row) => row.forEach((g) => (g.k = rnd())));
    grid.forEach((row, r) => row.forEach((g) => (g.y = r)));
  }

  function findMatches() {
    const m = new Set();
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const k = grid[r][c]?.k;
        if (k == null) continue;
        if (c < N - 2 && grid[r][c + 1]?.k === k && grid[r][c + 2]?.k === k) {
          let e = c;
          while (e < N && grid[r][e]?.k === k) m.add(r * N + e++);
        }
        if (r < N - 2 && grid[r + 1][c]?.k === k && grid[r + 2][c]?.k === k) {
          let e = r;
          while (e < N && grid[e][c]?.k === k) m.add(e++ * N + c);
        }
      }
    return [...m];
  }

  function swap(a, b) {
    const [r1, c1] = a,
      [r2, c2] = b;
    const t = grid[r1][c1];
    grid[r1][c1] = grid[r2][c2];
    grid[r2][c2] = t;
  }

  function hasMove() {
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ]) {
          const r2 = r + dr,
            c2 = c + dc;
          if (r2 >= N || c2 >= N) continue;
          swap([r, c], [r2, c2]);
          const ok = findMatches().length > 0;
          swap([r, c], [r2, c2]);
          if (ok) return true;
        }
    return false;
  }
  const sleep = (ms) =>
    new Promise<void>((resolve) => lifecycle.setTimeout(() => resolve(), ms));
  async function trySwap(a, b) {
    if (busy || !playing) return;
    busy = true;
    swap(a, b);
    let m = findMatches();
    if (!m.length) {
      await sleep(160);
      swap(a, b);
      tone(180, 0.1, 'square', 0.04);
      busy = false;
      return;
    }
    moves--;
    let chain = 0;
    while (m.length) {
      chain++;
      const gain =
        m.length * 20 * chain + (m.length >= 4 ? 60 : 0) + (m.length >= 5 ? 120 : 0);
      score += gain;
      const cs = SIZE / N;
      m.forEach((i) => {
        const r = Math.floor(Number(i) / N),
          c = Number(i) % N;
        fx.push({
          x: (c + 0.5) * cs,
          y: (r + 0.5) * cs,
          t: 0,
          col: GEM[grid[r][c].k].c,
        });
        grid[r][c] = null;
      });
      tone(440 * 2 ** (Math.min(chain, 8) / 8), 0.2, 'triangle', 0.07);
      hud();
      await sleep(180);
      for (let c = 0; c < N; c++) {
        let w = N - 1;
        for (let r = N - 1; r >= 0; r--)
          if (grid[r][c]) {
            const g = grid[r][c];
            grid[r][c] = null;
            grid[w][c] = g;
            w--;
          }
        for (let r = w; r >= 0; r--)
          grid[r][c] = {
            k: rnd(),
            y: r - (w + 1),
          };
      }
      await sleep(260);
      m = findMatches();
    }
    if (!hasMove()) {
      fill();
    }
    busy = false;
    hud();
    if (score >= target) win();
    else if (moves <= 0) lose();
  }

  function hud() {
    $('score').textContent = String(score);
    $('moves').textContent = String(moves);
    $('target').textContent = String(target);
    $('bar').style.width = Math.min(100, (score / target) * 100) + '%';
  }

  function begin(fresh) {
    if (fresh) {
      score = 0;
      day = 1;
      target = 3000;
    }
    moves = 20;
    playing = true;
    sel = null;
    fill();
    hud();
    $('msg').hidden = true;
  }

  function win() {
    playing = false;
    day++;
    $('mTitle').textContent = String(`Market day ${day - 1} closed`);
    $('mText').textContent = String(
      `Purse: ${score}. Tomorrow the target is ${target + 2500 + day * 500}.`,
    );
    target += 2500 + day * 500;
    $('go').textContent = String('Next market day');
    $('go').onclick = () => begin(false);
    $('msg').hidden = false;
    $('go').focus();
    [523, 659, 784, 1047].forEach((f, i) =>
      lifecycle.setTimeout(() => tone(f, 0.2, 'triangle'), i * 90),
    );
  }

  function lose() {
    playing = false;
    let best = 0;
    try {
      best = +localStorage.getItem('gem-bazaar-best') || 0;
      if (score > best) {
        best = score;
        localStorage.setItem('gem-bazaar-best', String(best));
      }
    } catch (e) {}
    $('mTitle').textContent = String('Out of moves');
    $('mText').textContent = String(
      `You reached day ${day} with ${score} in the purse. Best: ${best}.`,
    );
    $('go').textContent = String('New stall');
    $('go').onclick = () => begin(true);
    $('msg').hidden = false;
    $('go').focus();
  }
  $('go').onclick = () => begin(true);
  function cellAt(e) {
    const r = cv.getBoundingClientRect(),
      cs = r.width / N;
    return [Math.floor((e.clientY - r.top) / cs), Math.floor((e.clientX - r.left) / cs)];
  }
  let down = null;
  lifecycle.listen(cv, 'pointerdown', (e) => {
    down = {
      cell: cellAt(e),
      x: e.clientX,
      y: e.clientY,
    };
  });
  lifecycle.listen(cv, 'pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y,
      a = down.cell;
    down = null;
    const cs = cv.getBoundingClientRect().width / N;
    if (Math.hypot(dx, dy) > cs * 0.4) {
      const b =
        Math.abs(dx) > Math.abs(dy)
          ? [a[0], a[1] + Math.sign(dx)]
          : [a[0] + Math.sign(dy), a[1]];
      if (b[0] >= 0 && b[0] < N && b[1] >= 0 && b[1] < N) {
        sel = null;
        trySwap(a, b);
      }
      return;
    }
    if (sel && Math.abs(sel[0] - a[0]) + Math.abs(sel[1] - a[1]) === 1) {
      const s = sel;
      sel = null;
      trySwap(s, a);
    } else {
      sel = a;
      tone(700, 0.04, 'sine', 0.03);
    }
  });
  function gemPath(shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, 7);
    else if (shape === 'square')
      ctx.roundRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.25);
    else if (shape === 'diamond') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.85, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.85, y);
    } else if (shape === 'tri') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.75);
      ctx.lineTo(x - r, y + r * 0.75);
    } else if (shape === 'hex')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
    else
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2,
          rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
    ctx.closePath();
  }

  function draw(t) {
    if (SIZE) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cs = SIZE / N;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          ctx.fillStyle = (r + c) % 2 ? 'rgba(253,243,223,.04)' : 'rgba(253,243,223,.08)';
          ctx.fillRect(c * cs, r * cs, cs, cs);
        }
      if (grid)
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++) {
            const g = grid[r][c];
            if (!g) continue;
            g.y += (r - g.y) * 0.3;
            const G = GEM[g.k],
              x = (c + 0.5) * cs,
              y = (g.y + 0.5) * cs,
              rad = cs * 0.36;
            const isSel = sel && sel[0] === r && sel[1] === c;
            if (isSel) {
              ctx.fillStyle = 'rgba(242,165,26,.35)';
              ctx.beginPath();
              ctx.roundRect(c * cs + 2, r * cs + 2, cs - 4, cs - 4, 8);
              ctx.fill();
            }
            const s = isSel ? 1 + Math.sin(t / 120) * 0.06 : 1;
            const gr = ctx.createLinearGradient(x - rad, y - rad, x + rad, y + rad);
            gr.addColorStop(0, G.hi);
            gr.addColorStop(0.5, G.c);
            gr.addColorStop(1, G.c);
            ctx.fillStyle = gr;
            gemPath(G.shape, x, y, rad * s);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,.25)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            ctx.beginPath();
            ctx.ellipse(
              x - rad * 0.3,
              y - rad * 0.35,
              rad * 0.22,
              rad * 0.12,
              -0.6,
              0,
              7,
            );
            ctx.fill();
          }
      for (const f of fx) {
        f.t += 0.05;
        ctx.strokeStyle = f.col;
        ctx.globalAlpha = Math.max(0, 1 - f.t);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, cs * (0.3 + f.t * 0.6), 0, 7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      fx = fx.filter((f) => f.t < 1);
    }
    lifecycle.requestAnimationFrame(draw);
  }
  fill();
  hud();
  lifecycle.requestAnimationFrame(draw);
}
