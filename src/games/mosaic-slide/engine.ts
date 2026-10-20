import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  artTitle: HTMLElement;
  artMeta: HTMLElement;
  moves: HTMLElement;
  time: HTMLElement;
  peek: HTMLButtonElement;
  newart: HTMLButtonElement;
  msg: HTMLElement;
  c: HTMLCanvasElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.06, type = 'triangle', v = 0.04) {
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
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const art = document.createElement('canvas');
  art.width = art.height = 600;
  const actx = art.getContext('2d');
  const PALETTES = [
    ['#e8d5b5', '#b8442c', '#1f4e79', '#e3a83b', '#2f6b4f'],
    ['#f2e9e4', '#22223b', '#4a4e69', '#c9ada7', '#e76f51'],
    ['#fefae0', '#283618', '#606c38', '#dda15e', '#bc6c25'],
    ['#edf6f9', '#006d77', '#83c5be', '#ffddd2', '#e29578'],
    ['#fff1e6', '#3d405b', '#e07a5f', '#81b29a', '#f2cc8f'],
  ];
  const NAMES = [
    'Harbour at Noon',
    'Study in Ochre',
    'Three Suns',
    'Garden, Interrupted',
    'Blue Afternoon',
    'Composition with Moon',
    'Quiet Geometry',
    'Orchard Weather',
  ];
  let artNo = 1;
  function paint() {
    const p = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    actx.fillStyle = p[0];
    actx.fillRect(0, 0, 600, 600);
    for (let i = 0; i < 7; i++) {
      actx.fillStyle = p[1 + Math.floor(Math.random() * 4)];
      actx.globalAlpha = 0.85;
      const k = Math.random();
      if (k < 0.4) {
        actx.beginPath();
        actx.arc(
          Math.random() * 600,
          Math.random() * 600,
          40 + Math.random() * 170,
          0,
          7,
        );
        actx.fill();
      } else if (k < 0.7) {
        actx.save();
        actx.translate(Math.random() * 600, Math.random() * 600);
        actx.rotate(Math.random() * 3);
        actx.fillRect(-150, -30, 300 + Math.random() * 200, 40 + Math.random() * 90);
        actx.restore();
      } else {
        actx.beginPath();
        actx.moveTo(Math.random() * 600, Math.random() * 600);
        actx.lineTo(Math.random() * 600, Math.random() * 600);
        actx.lineTo(Math.random() * 600, Math.random() * 600);
        actx.fill();
      }
    }
    actx.globalAlpha = 1;
    actx.strokeStyle = p[1];
    actx.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      actx.beginPath();
      actx.moveTo(0, Math.random() * 600);
      actx.bezierCurveTo(
        200,
        Math.random() * 600,
        400,
        Math.random() * 600,
        600,
        Math.random() * 600,
      );
      actx.stroke();
    }
    $('artTitle').textContent = String(
      `${NAMES[Math.floor(Math.random() * NAMES.length)]}, No. ${artNo++}`,
    );
  }
  let n = 4,
    tiles,
    blank,
    moves,
    t0,
    timer,
    solved,
    peek = false,
    anim = {};
  function shuffle() {
    tiles = [...Array(n * n).keys()];
    blank = n * n - 1;
    let last = -1;
    for (let i = 0; i < n * n * 30; i++) {
      const opts = neighbors(blank).filter((x) => x !== last);
      const pick = opts[Math.floor(Math.random() * opts.length)];
      last = blank;
      swapT(pick, false);
    }
    if (tiles.every((v, i) => v === i)) return shuffle();
    moves = 0;
    solved = false;
    t0 = 0;
    lifecycle.clearInterval(timer);
    $('moves').textContent = String(0);
    $('time').textContent = String('0:00');
    $('msg').textContent = String('');
  }

  function neighbors(i) {
    const r = Math.floor(i / n),
      c = i % n,
      o = [];
    if (r > 0) o.push(i - n);
    if (r < n - 1) o.push(i + n);
    if (c > 0) o.push(i - 1);
    if (c < n - 1) o.push(i + 1);
    return o;
  }

  function swapT(i, animate = true) {
    if (animate)
      anim[tiles[i]] = {
        from: i,
        t: 0,
      };
    [tiles[i], tiles[blank]] = [tiles[blank], tiles[i]];
    blank = i;
  }

  function slide(i) {
    if (solved || !neighbors(blank).includes(i)) return;
    if (!t0) {
      t0 = performance.now();
      timer = lifecycle.setInterval(() => {
        const s = Math.floor((performance.now() - t0) / 1000);
        $('time').textContent = String(
          `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
        );
      }, 300);
    }
    swapT(i);
    moves++;
    $('moves').textContent = String(moves);
    tone(300 + Math.random() * 60);
    if (tiles.every((v, k) => v === k)) {
      solved = true;
      lifecycle.clearInterval(timer);
      $('msg').textContent = String(
        `Restored in ${moves} moves. The curator is delighted.`,
      );
      [523, 659, 784, 1047].forEach((f, k) =>
        lifecycle.setTimeout(() => tone(f, 0.25, 'sine', 0.05), k * 110),
      );
    }
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
  fit();
  lifecycle.listen(cv, 'click', (e) => {
    const r = cv.getBoundingClientRect(),
      cs = r.width / n;
    slide(
      Math.floor((e.clientY - r.top) / cs) * n + Math.floor((e.clientX - r.left) / cs),
    );
  });
  lifecycle.listen(cv, 'keydown', (e) => {
    const m = {
      ArrowUp: n,
      ArrowDown: -n,
      ArrowLeft: 1,
      ArrowRight: -1,
    }[e.key];
    if (m === undefined) return;
    e.preventDefault();
    const i = blank + m;
    if (i < 0 || i >= n * n) return;
    if ((m === 1 && blank % n === n - 1) || (m === -1 && blank % n === 0)) return;
    slide(i);
  });
  const pk = $('peek');
  lifecycle.listen(pk, 'pointerdown', () => (peek = true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    lifecycle.listen(pk, ev, () => (peek = false)),
  );
  lifecycle.listen(pk, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') peek = true;
  });
  lifecycle.listen(pk, 'keyup', () => (peek = false));
  document.querySelectorAll<HTMLElement>('[data-n]').forEach(
    (b) =>
      (b.onclick = () => {
        n = +b.dataset.n;
        document
          .querySelectorAll<HTMLElement>('[data-n]')
          .forEach((x) => x.classList.toggle('on', x === b));
        shuffle();
      }),
  );
  $('newart').onclick = () => {
    paint();
    shuffle();
  };
  function draw() {
    if (SIZE) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
        '--mat',
      );
      ctx.fillRect(0, 0, SIZE, SIZE);
      const cs = SIZE / n,
        src = 600 / n,
        gap = solved || peek ? 0 : 2;
      if (peek) ctx.drawImage(art, 0, 0, SIZE, SIZE);
      else
        tiles.forEach((v, i) => {
          if (v === n * n - 1 && !solved) return;
          let r = Math.floor(i / n),
            c = i % n;
          const a = anim[v];
          if (a) {
            a.t = Math.min(1, a.t + 0.25);
            const fr = Math.floor(a.from / n),
              fc = a.from % n,
              e = 1 - (1 - a.t) ** 3;
            r = fr + (r - fr) * e;
            c = fc + (c - fc) * e;
            if (a.t >= 1) delete anim[v];
          }
          ctx.drawImage(
            art,
            (v % n) * src,
            Math.floor(v / n) * src,
            src,
            src,
            c * cs + gap / 2,
            r * cs + gap / 2,
            cs - gap,
            cs - gap,
          );
        });
    }
    lifecycle.requestAnimationFrame(draw);
  }
  paint();
  shuffle();
  lifecycle.requestAnimationFrame(draw);
}
