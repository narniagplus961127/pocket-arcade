import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  left: HTMLElement;
  time: HTMLElement;
  best: HTMLElement;
  grid: HTMLDivElement;
  msg: HTMLDivElement;
  mode: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.12, type = 'sine', v = 0.07, sl = 0) {
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
  const SHROOM =
    '<svg class="shroom" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12a10 8 0 0 1 20 0z" fill="#c8442f"/><circle cx="8" cy="8" r="1.6" fill="#fff"/><circle cx="14" cy="6" r="1.3" fill="#fff"/><circle cx="17" cy="10" r="1.2" fill="#fff"/><rect x="9" y="12" width="6" height="9" rx="2.5" fill="#f3ead6"/></svg>';
  let n = 9,
    mines = 10,
    cells,
    mine,
    open,
    flag,
    first,
    over,
    t0,
    timer,
    markMode = false;
  function store(k, v?) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, String(v));
    } catch (e) {
      return null;
    }
  }

  function nb(i) {
    const r = Math.floor(i / n),
      c = i % n,
      o = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr,
          cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) o.push(rr * n + cc);
      }
    return o;
  }

  function build() {
    lifecycle.clearInterval(timer);
    $('time').textContent = String(0);
    mine = new Array(n * n).fill(false);
    open = new Array(n * n).fill(false);
    flag = new Array(n * n).fill(false);
    first = true;
    over = false;
    const g = $('grid');
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${n},1fr)`;
    cells = [];
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.setAttribute(
        'aria-label',
        String(`Plot ${Math.floor(i / n) + 1}, ${(i % n) + 1}`),
      );
      lifecycle.listen(b, 'click', () => (markMode ? toggle(i) : dig(i)));
      lifecycle.listen(b, 'contextmenu', (e) => {
        e.preventDefault();
        toggle(i);
      });
      let lp;
      lifecycle.listen(b, 'pointerdown', (e) => {
        if (e.pointerType === 'touch')
          lp = lifecycle.setTimeout(() => {
            lp = 'done';
            toggle(i);
          }, 420);
      });
      lifecycle.listen(b, 'pointerup', (e) => {
        if (lp === 'done') {
          e.preventDefault();
          b.dataset.skip = '1';
        }
        lifecycle.clearTimeout(lp);
        lp = null;
      });
      lifecycle.listen(
        b,
        'click',
        (e) => {
          if (b.dataset.skip) {
            e.stopImmediatePropagation();
            delete b.dataset.skip;
          }
        },
        true,
      );
      g.appendChild(b);
      cells.push(b);
    }
    $('left').textContent = String(mines);
    $('msg').textContent = String('Your first dig is always safe.');
    const best = store(`forage-best-${n}`);
    $('best').textContent = String(best ? best + 's' : '–');
  }

  function plant(safe) {
    const banned = new Set([safe, ...nb(safe)]);
    let k = 0;
    while (k < mines) {
      const i = Math.floor(Math.random() * n * n);
      if (!mine[i] && !banned.has(i)) {
        mine[i] = true;
        k++;
      }
    }
  }
  const count = (i) => nb(i).filter((j) => mine[j]).length;
  function reveal(i) {
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (open[j] || flag[j]) continue;
      open[j] = true;
      const c = count(j),
        b = cells[j];
      b.classList.add('open');
      b.setAttribute('aria-label', String(c ? `${c} toadstools nearby` : 'Clear ground'));
      if (c) {
        b.textContent = String(c);
        b.style.color = `var(--n${c})`;
      } else stack.push(...nb(j));
    }
  }

  function dig(i) {
    if (over || flag[i]) return;
    if (first) {
      first = false;
      plant(i);
      t0 = performance.now();
      timer = lifecycle.setInterval(
        () =>
          ($('time').textContent = String(Math.floor((performance.now() - t0) / 1000))),
        250,
      );
    }
    if (open[i]) {
      // chord
      const ns = nb(i);
      if (ns.filter((j) => flag[j]).length !== count(i)) return;
      for (const j of ns)
        if (!open[j] && !flag[j]) {
          if (mine[j]) return lose(j);
          reveal(j);
        }
    } else {
      if (mine[i]) return lose(i);
      reveal(i);
    }
    tone(300 + Math.random() * 80, 0.06, 'triangle', 0.05);
    if (open.filter(Boolean).length === n * n - mines) win();
  }

  function toggle(i) {
    if (over || open[i]) return;
    flag[i] = !flag[i];
    cells[i].classList.toggle('flag', flag[i]);
    $('left').textContent = String(mines - flag.filter(Boolean).length);
    tone(flag[i] ? 660 : 440, 0.06, 'square', 0.03);
  }

  function lose(i) {
    over = true;
    lifecycle.clearInterval(timer);
    cells[i].classList.add('boom');
    mine.forEach((m, j) => {
      if (m) {
        cells[j].classList.remove('flag');
        cells[j].innerHTML = SHROOM;
      }
    });
    $('msg').textContent = String(
      'Toadstool! The basket is spoiled. Pick a size to forage again.',
    );
    tone(140, 0.6, 'sawtooth', 0.07, 0.5);
  }

  function win() {
    over = true;
    lifecycle.clearInterval(timer);
    const s = Math.floor((performance.now() - t0) / 1000);
    mine.forEach((m, j) => {
      if (m) {
        flag[j] = true;
        cells[j].classList.add('flag');
      }
    });
    $('left').textContent = String(0);
    const best = +store(`forage-best-${n}`) || Infinity;
    if (s < best) {
      store(`forage-best-${n}`, s);
      $('best').textContent = String(s + 's');
    }
    $('msg').textContent = String(
      `A full basket in ${s} seconds${s < best ? ', a new record' : ''}.`,
    );
    [523, 659, 784].forEach((f, k) =>
      lifecycle.setTimeout(() => tone(f, 0.25, 'triangle'), k * 110),
    );
  }
  $('mode').onclick = () => {
    markMode = !markMode;
    $('mode').setAttribute('aria-pressed', String(markMode));
    $('mode').textContent = String(`Mark mode: ${markMode ? 'on' : 'off'}`);
  };
  document.querySelectorAll<HTMLElement>('.size').forEach(
    (b) =>
      (b.onclick = () => {
        [n, mines] = b.dataset.s.split(',').map(Number);
        build();
      }),
  );
  build();
}
