import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  tFill: HTMLButtonElement;
  tMark: HTMLButtonElement;
  grid: HTMLElement;
  msg: HTMLDivElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.05, type = 'square', v = 0.03) {
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
  let n = 5,
    sol,
    st,
    tool = 'f',
    drag = null,
    solved = false,
    cells = [],
    rowH = [],
    colH = [];
  const runs = (arr) => {
    const o = [];
    let k = 0;
    for (const v of arr) {
      if (v) k++;
      else if (k) {
        o.push(k);
        k = 0;
      }
    }
    if (k) o.push(k);
    return o.length ? o : [0];
  };
  function genSolution() {
    // a blobby random picture: noise smoothed by neighbours, so it reads as a shape rather than static
    let g = [...Array(n)].map(() =>
      [...Array(n)].map(() => (Math.random() < 0.55 ? 1 : 0)),
    );
    for (let pass = 0; pass < 2; pass++)
      g = g.map((row, r) =>
        row.map((v, c) => {
          let s = 0,
            k = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const y = r + dr,
                x = c + dc;
              if (y >= 0 && x >= 0 && y < n && x < n) {
                s += g[y][x];
                k++;
              }
            }
          return s / k > 0.48 ? 1 : 0;
        }),
      );
    const filled = g.flat().reduce((a, b) => a + b, 0);
    if (filled < n * n * 0.3 || filled > n * n * 0.75) return genSolution();
    return g;
  }

  function build() {
    sol = genSolution();
    st = [...Array(n)].map(() => Array(n).fill(0));
    solved = false;
    $('msg').textContent = String('');
    const cs = Math.max(
      18,
      Math.min(36, Math.floor((Math.min(560, innerWidth - 32) - 80) / n)),
    );
    const t = $('grid');
    t.style.setProperty('--cs', String(cs + 'px'));
    t.innerHTML = '';
    const head = document.createElement('tr');
    head.appendChild(document.createElement('th'));
    colH = [];
    for (let c = 0; c < n; c++) {
      const th = document.createElement('th');
      th.className = 'ch';
      th.innerHTML = runs(sol.map((r) => r[c])).join('<br>');
      head.appendChild(th);
      colH.push(th);
    }
    t.appendChild(head);
    cells = [];
    rowH = [];
    for (let r = 0; r < n; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'rh';
      th.textContent = String(runs(sol[r]).join(' '));
      tr.appendChild(th);
      rowH.push(th);
      const row = [];
      for (let c = 0; c < n; c++) {
        const td = document.createElement('td');
        td.className =
          'c' +
          ((r + 1) % 5 === 0 && r < n - 1 ? ' r5' : '') +
          ((c + 1) % 5 === 0 && c < n - 1 ? ' c5' : '');
        lifecycle.listen(td, 'pointerdown', (e) => {
          e.preventDefault();
          if (solved) return;
          const mode = e.button === 2 ? 'x' : tool;
          const cur = st[r][c];
          const target = mode === 'f' ? (cur === 1 ? 0 : 1) : cur === 2 ? 0 : 2;
          drag = target;
          set(r, c, target);
        });
        lifecycle.listen(td, 'pointerenter', () => {
          if (drag !== null && !solved) set(r, c, drag);
        });
        lifecycle.listen(td, 'contextmenu', (e) => e.preventDefault());
        tr.appendChild(td);
        row.push(td);
      }
      t.appendChild(tr);
      cells.push(row);
    }
  }
  lifecycle.listen(window, 'pointerup', () => {
    if (drag !== null) {
      drag = null;
      check();
    }
  });
  // touch: pointerenter does not fire while a finger drags, so track the element under the finger
  lifecycle.listen($('grid'), 'pointermove', (e) => {
    if (drag === null || e.pointerType === 'mouse') return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    for (let r = 0; r < n; r++) {
      const c = cells[r].indexOf(el);
      if (c >= 0) set(r, c, drag);
    }
  });
  function set(r, c, v) {
    if (st[r][c] === v) return;
    st[r][c] = v;
    cells[r][c].classList.toggle('f', v === 1);
    cells[r][c].classList.toggle('x', v === 2);
    tone(v === 1 ? 700 : v === 2 ? 400 : 250);
    rowH[r].classList.toggle(
      'done',
      runs(st[r].map((x) => x === 1)).join() === runs(sol[r]).join(),
    );
    colH[c].classList.toggle(
      'done',
      runs(st.map((x) => x[c] === 1)).join() === runs(sol.map((x) => x[c])).join(),
    );
  }

  function check() {
    for (let r = 0; r < n; r++)
      if (runs(st[r].map((x) => x === 1)).join() !== runs(sol[r]).join()) return;
    for (let c = 0; c < n; c++)
      if (runs(st.map((x) => x[c] === 1)).join() !== runs(sol.map((x) => x[c])).join())
        return;
    solved = true;
    cells.flat().forEach((td) => td.classList.remove('x'));
    let wins = 0;
    try {
      wins = (+localStorage.getItem('picross-wins') || 0) + 1;
      localStorage.setItem('picross-wins', String(wins));
    } catch (e) {}
    $('msg').textContent = String(
      `Solved! That's ${wins} puzzle${wins === 1 ? '' : 's'} so far. Pick a size for another.`,
    );
    [523, 659, 784, 1047].forEach((f, i) =>
      lifecycle.setTimeout(() => tone(f, 0.15, 'square', 0.04), i * 90),
    );
  }

  function setTool(t) {
    tool = t;
    $('tFill').setAttribute('aria-pressed', String(t === 'f'));
    $('tMark').setAttribute('aria-pressed', String(t === 'x'));
  }
  $('tFill').onclick = () => setTool('f');
  $('tMark').onclick = () => setTool('x');
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') setTool(tool === 'f' ? 'x' : 'f');
  });
  document.querySelectorAll<HTMLElement>('.size').forEach(
    (b) =>
      (b.onclick = () => {
        n = +b.dataset.n;
        build();
      }),
  );
  build();
}
