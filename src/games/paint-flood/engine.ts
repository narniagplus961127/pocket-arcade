import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  moves: HTMLSpanElement;
  max: HTMLSpanElement;
  pct: HTMLSpanElement;
  tubeFill: HTMLElement;
  c: HTMLCanvasElement;
  pots: HTMLDivElement;
  msg: HTMLDivElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.12, type = 'sine', v = 0.05) {
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
  const COLS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#7b5cd6', '#f78c3b'];
  let n = 14,
    max = 25,
    grid,
    owned,
    moves,
    over,
    wave = [];
  COLS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pot';
    b.style.background = c;
    b.setAttribute('aria-label', String(`Paint colour ${i + 1}`));
    b.innerHTML = `<kbd>${i + 1}</kbd>`;
    b.onclick = () => pick(i);
    $('pots').appendChild(b);
  });
  function build() {
    grid = [...Array(n * n)].map(() => Math.floor(Math.random() * 6));
    owned = new Uint8Array(n * n);
    moves = 0;
    over = false;
    wave = [];
    grow();
    hud();
    $('msg').textContent = String('');
    $('max').textContent = String(max);
  }

  function grow() {
    const c = grid[0],
      st = [0];
    owned.fill(0);
    owned[0] = 1;
    while (st.length) {
      const i = st.pop(),
        r = Math.floor(i / n),
        q = i % n;
      for (const j of [
        r > 0 ? i - n : -1,
        r < n - 1 ? i + n : -1,
        q > 0 ? i - 1 : -1,
        q < n - 1 ? i + 1 : -1,
      ])
        if (j >= 0 && !owned[j] && grid[j] === c) {
          owned[j] = 1;
          st.push(j);
        }
    }
  }

  function pick(c) {
    if (over || c === grid[0]) return;
    const before = owned.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n * n; i++) if (owned[i]) grid[i] = c;
    grow();
    moves++;
    const after = owned.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n * n; i++)
      if (owned[i])
        wave.push({
          i,
          t: (Math.floor(i / n) + (i % n)) * 0.02,
        });
    tone(330 + (after - before) * 8, 0.15, 'triangle', 0.06);
    hud();
    if (after === n * n) {
      over = true;
      $('msg').textContent = String(`Covered in ${moves} moves. A masterpiece!`);
      [523, 659, 784, 1047].forEach((f, k) =>
        lifecycle.setTimeout(() => tone(f, 0.25), k * 100),
      );
      save();
    } else if (moves >= max) {
      over = true;
      $('msg').textContent = String(
        `Out of paint at ${Math.round((after / n / n) * 100)}%. Try another canvas.`,
      );
      tone(160, 0.4, 'sawtooth', 0.05);
    }
  }

  function save() {
    try {
      const k = `flood-best-${n}`,
        b = +localStorage.getItem(k) || Infinity;
      if (moves < b) {
        localStorage.setItem(k, String(moves));
        $('msg').textContent += String(' New best for this size.');
      }
    } catch (e) {}
  }

  function hud() {
    const cov = owned.reduce((a, b) => a + b, 0);
    $('moves').textContent = String(moves);
    $('pct').textContent = String(Math.round((cov / n / n) * 100));
    $('tubeFill').style.width = `${100 - (moves / max) * 100}%`;
    document
      .querySelectorAll<HTMLButtonElement>('.pot')
      .forEach((p, i) => (p.disabled = over || i === grid[0]));
  }
  document.querySelectorAll<HTMLElement>('.size').forEach(
    (b) =>
      (b.onclick = () => {
        [n, max] = b.dataset.s.split(',').map(Number);
        document
          .querySelectorAll<HTMLElement>('.size')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        build();
      }),
  );
  lifecycle.listen(window, 'keydown', (e) => {
    const k = +e.key;
    if (k >= 1 && k <= 6) pick(k - 1);
  });
  lifecycle.listen(cv, 'click', (e) => {
    const r = cv.getBoundingClientRect(),
      cs = r.width / n;
    const i =
      Math.floor((e.clientY - r.top) / cs) * n + Math.floor((e.clientX - r.left) / cs);
    if (i >= 0 && i < n * n) pick(grid[i]);
  });
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
  let lastT = performance.now();
  function draw(now) {
    const dt = (now - lastT) / 1000;
    lastT = now;
    if (SIZE && grid) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const cs = SIZE / n;
      for (let i = 0; i < n * n; i++) {
        const r = Math.floor(i / n),
          c = i % n;
        ctx.fillStyle = COLS[grid[i]];
        ctx.fillRect(c * cs, r * cs, cs + 0.5, cs + 0.5);
        if (!owned[i]) {
          ctx.fillStyle = 'rgba(0,0,0,.08)';
          ctx.fillRect(c * cs + cs * 0.1, r * cs + cs * 0.1, cs * 0.8, cs * 0.8);
        }
      }
      for (const w of wave) {
        w.t -= dt;
        if (w.t <= 0 && w.t > -0.25) {
          const r = Math.floor(w.i / n),
            c = w.i % n,
            k = 1 + w.t * 4;
          ctx.fillStyle = `rgba(255,255,255,${0.5 * k})`;
          ctx.fillRect(c * cs, r * cs, cs, cs);
        }
      }
      wave = wave.filter((w) => w.t > -0.25);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < n * n; i++)
        if (owned[i]) {
          const r = Math.floor(i / n),
            c = i % n;
          if (r === 0 || !owned[i - n]) {
            ctx.beginPath();
            ctx.moveTo(c * cs, r * cs);
            ctx.lineTo((c + 1) * cs, r * cs);
            ctx.stroke();
          }
          if (c === n - 1 || !owned[i + 1]) {
            ctx.beginPath();
            ctx.moveTo((c + 1) * cs, r * cs);
            ctx.lineTo((c + 1) * cs, (r + 1) * cs);
            ctx.stroke();
          }
          if (r === n - 1 || !owned[i + n]) {
            ctx.beginPath();
            ctx.moveTo(c * cs, (r + 1) * cs);
            ctx.lineTo((c + 1) * cs, (r + 1) * cs);
            ctx.stroke();
          }
          if (c === 0 || !owned[i - 1]) {
            ctx.beginPath();
            ctx.moveTo(c * cs, r * cs);
            ctx.lineTo(c * cs, (r + 1) * cs);
            ctx.stroke();
          }
        }
    }
    lifecycle.requestAnimationFrame(draw);
  }
  build();
  lifecycle.requestAnimationFrame(draw);
}
