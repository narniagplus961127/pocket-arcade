import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  lvl: HTMLSpanElement;
  moves: HTMLSpanElement;
  par: HTMLSpanElement;
  grid: HTMLDivElement;
  win: HTMLDivElement;
  winTitle: HTMLElement;
  stars: HTMLDivElement;
  winNote: HTMLElement;
  next: HTMLButtonElement;
  hint: HTMLButtonElement;
  restart: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC = null;
  function tone(f, d = 0.25, v = 0.07, type = 'sine') {
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
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  let level = 1;
  try {
    level = Math.max(1, +localStorage.getItem('bloom-grid-level') || 1);
  } catch (e) {}
  let n, cells, on, sol, moves, par, solved;
  function sizeFor(l) {
    return l < 3 ? 3 : l < 7 ? 4 : l < 13 ? 5 : 6;
  }

  function neighbors(i) {
    const r = Math.floor(i / n),
      c = i % n,
      out = [i];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  function build() {
    n = sizeFor(level);
    const taps = Math.min(2 + level, n * n - 2);
    on = new Array(n * n).fill(1);
    sol = new Set();
    while (sol.size < taps) sol.add(Math.floor(Math.random() * n * n));
    for (const i of sol) for (const j of neighbors(i)) on[j] ^= 1;
    if (on.every((v) => v)) return build();
    par = sol.size;
    moves = 0;
    solved = false;
    const g = $('grid');
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${n},1fr)`;
    cells = on.map((v, i) => {
      const b = document.createElement('button');
      b.className = 'cell';
      b.type = 'button';
      b.setAttribute(
        'aria-label',
        String(`Plot ${Math.floor(i / n) + 1}, ${(i % n) + 1}`),
      );
      b.innerHTML =
        '<span class="flower"><span class="petals"></span><span class="bud"></span><span class="core"></span></span>';
      lifecycle.listen(b, 'click', () => tap(i));
      g.appendChild(b);
      return b;
    });
    render();
    $('lvl').textContent = String(level);
    $('par').textContent = String(par);
    $('moves').textContent = String(0);
    $('win').hidden = true;
  }

  function render() {
    cells.forEach((b, i) => {
      b.dataset.on = on[i];
      b.setAttribute('aria-pressed', String(on[i] ? 'true' : 'false'));
    });
  }

  function tap(i) {
    if (solved) return;
    cells.forEach((c) => c.classList.remove('hint'));
    for (const j of neighbors(i)) on[j] ^= 1;
    if (sol.has(i)) sol.delete(i);
    else sol.add(i);
    moves++;
    $('moves').textContent = String(moves);
    render();
    const lit = on.reduce((a, b) => a + b, 0);
    tone(
      262 * Math.pow(2, PENTA[Math.min(9, Math.floor((lit / (n * n)) * 9))] / 12),
      0.3,
      0.06,
      'triangle',
    );
    if (lit === n * n) win();
  }

  function win() {
    solved = true;
    const stars = moves <= par ? 3 : moves <= par + 3 ? 2 : 1;
    $('stars').textContent = String('★'.repeat(stars) + '☆'.repeat(3 - stars));
    $('winTitle').textContent = String(
      ['Sprouting', 'Nearly there', 'Lovely', 'In full bloom'][stars],
    );
    $('winNote').textContent = String(
      moves <= par
        ? `Solved in ${moves} moves, at or under par.`
        : `Solved in ${moves} moves. Par is ${par}. Try a cleaner route next time.`,
    );
    $('win').hidden = false;
    [0, 4, 7, 12].forEach((s, k) =>
      lifecycle.setTimeout(
        () => tone(392 * Math.pow(2, s / 12), 0.5, 0.06, 'sine'),
        k * 110,
      ),
    );
    cells.forEach((c, k) => {
      c.animate(
        [
          {
            transform: 'scale(1)',
          },
          {
            transform: 'scale(1.08)',
          },
          {
            transform: 'scale(1)',
          },
        ],
        {
          duration: 400,
          delay: k * 25,
        },
      );
    });
    $('next').focus();
  }
  $('next').onclick = () => {
    level++;
    try {
      localStorage.setItem('bloom-grid-level', String(level));
    } catch (e) {}
    build();
  };
  $('restart').onclick = () => build();
  $('hint').onclick = () => {
    if (solved || !sol.size) return;
    const i = [...sol][0];
    cells[i].classList.add('hint');
    cells[i].focus();
    moves += 1;
    $('moves').textContent = String(moves);
  };
  build();
}
