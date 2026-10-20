import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  moves: HTMLElement;
  time: HTMLElement;
  best: HTMLElement;
  grid: HTMLDivElement;
  msg: HTMLDivElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.1, type = 'triangle', v = 0.05) {
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
  const ICONS = [
    (c) =>
      `<circle cx="50" cy="50" r="20" fill="${c}"/>${[...Array(8)].map((_, i) => `<rect x="48" y="12" width="4" height="12" fill="${c}" transform="rotate(${i * 45} 50 50)"/>`).join('')}`,
    (c) => `<path d="M60 20a30 30 0 1 0 20 52a24 24 0 1 1 -20 -52z" fill="${c}"/>`,
    (c) =>
      `<path d="M10 80 L40 30 L55 52 L68 38 L90 80z" fill="${c}"/><path d="M40 30 L33 42 L47 42z" fill="#fff"/>`,
    (c) =>
      `<path d="M10 55 q10 -12 20 0 t20 0 t20 0 t20 0 M10 72 q10 -12 20 0 t20 0 t20 0 t20 0" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
    (c) =>
      `<path d="M50 14 L76 64 H24z" fill="${c}"/><path d="M50 34 L82 82 H18z" fill="${c}"/><rect x="45" y="80" width="10" height="12" fill="#7a4a2a"/>`,
    (c) =>
      `<path d="M20 50 L50 22 L80 50 V84 H20z" fill="${c}"/><rect x="42" y="60" width="16" height="24" fill="#fff"/>`,
    (c) =>
      `<path d="M14 62 H86 L74 80 H26z" fill="${c}"/><path d="M50 16 V60 M50 18 L76 56 H50" stroke="${c}" stroke-width="4" fill="${c}"/>`,
    (c) =>
      `<path d="M50 12 L60 40 L90 40 L66 58 L75 88 L50 70 L25 88 L34 58 L10 40 L40 40z" fill="${c}"/>`,
    (c) =>
      `<path d="M50 84 C10 56 14 22 36 22 C44 22 50 30 50 34 C50 30 56 22 64 22 C86 22 90 56 50 84z" fill="${c}"/>`,
    (c) =>
      `<ellipse cx="44" cy="50" rx="28" ry="16" fill="${c}"/><path d="M70 50 L90 34 V66z" fill="${c}"/><circle cx="30" cy="46" r="3.5" fill="#fff"/>`,
    (c) =>
      `<path d="M24 70 a16 16 0 0 1 4 -31 a22 22 0 0 1 42 6 a13 13 0 0 1 4 25z" fill="${c}"/>`,
    (c) =>
      `<path d="M14 44 Q32 26 50 46 Q68 26 86 44" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
    (c) =>
      `<circle cx="34" cy="50" r="16" fill="none" stroke="${c}" stroke-width="8"/><path d="M50 50 H88 M78 50 V64 M68 50 V60" stroke="${c}" stroke-width="8"/>`,
    (c) =>
      `<path d="M50 10 C70 34 74 50 74 62 a24 24 0 0 1 -48 0 C26 50 30 34 50 10z" fill="${c}"/>`,
    (c) =>
      `<rect x="30" y="20" width="40" height="66" rx="20" fill="${c}"/><circle cx="50" cy="40" r="8" fill="#fff"/><circle cx="50" cy="66" r="8" fill="#fff"/>`,
    (c) =>
      `<path d="M30 86 V40 a20 20 0 0 1 40 0 V86" stroke="${c}" stroke-width="10" fill="none"/><path d="M20 86 H80" stroke="${c}" stroke-width="8"/>`,
    (c) =>
      `<circle cx="50" cy="50" r="30" fill="${c}"/><path d="M20 50 H80 M50 20 C34 36 34 64 50 80 M50 20 C66 36 66 64 50 80" stroke="#fff" stroke-width="4" fill="none"/>`,
    (c) => `<path d="M26 20 H74 L62 50 L74 80 H26 L38 50z" fill="${c}"/>`,
  ];
  const COLORS = ['#d6453d', '#24557a', '#2f8a5a', '#d99a21', '#7a3f8f', '#1d8a96'];
  let first = null,
    lock = false,
    moves = 0,
    found = 0,
    total = 0,
    t0 = 0,
    timer,
    rows = 4,
    cols = 4,
    cards = [];
  function storeGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  function storeSet(k, v) {
    try {
      localStorage.setItem(k, String(v));
    } catch (e) {}
  }

  function deal(c, r) {
    cols = c;
    rows = r;
    total = (c * r) / 2;
    found = 0;
    moves = 0;
    first = null;
    lock = false;
    lifecycle.clearInterval(timer);
    t0 = 0;
    $('moves').textContent = String(0);
    $('time').textContent = String(0);
    $('msg').textContent = String('');
    const b = storeGet(`pairs-best-${c}x${r}`);
    $('best').textContent = String(b ? b + ' flips' : '–');
    const ids = [...Array(ICONS.length).keys()]
      .sort(() => Math.random() - 0.5)
      .slice(0, total);
    const deck = ids.flatMap((i) => [i, i]).sort(() => Math.random() - 0.5);
    const g = $('grid');
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${c},1fr)`;
    g.style.maxWidth = c === 6 ? '100%' : `${c * 110}px`;
    cards = deck.map((id, k) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'card';
      el.setAttribute('aria-label', String('Face-down stamp'));
      el.innerHTML = `<div class="inner"><div class="side back"></div><div class="side face"><svg viewBox="0 0 100 100" aria-hidden="true">${ICONS[id](COLORS[id % COLORS.length])}</svg></div></div>`;
      el.onclick = () => flip(k);
      g.appendChild(el);
      return {
        id,
        el,
        done: false,
      };
    });
  }

  function flip(k) {
    const c = cards[k];
    if (lock || c.done || c === first) return;
    if (!t0) {
      t0 = performance.now();
      timer = lifecycle.setInterval(
        () =>
          ($('time').textContent = String(Math.floor((performance.now() - t0) / 1000))),
        250,
      );
    }
    c.el.classList.add('flip');
    c.el.setAttribute('aria-label', String(`Stamp ${c.id + 1}`));
    tone(600, 0.05, 'sine', 0.03);
    if (!first) {
      first = c;
      return;
    }
    moves++;
    $('moves').textContent = String(moves);
    if (first.id === c.id) {
      first.done = c.done = true;
      first.el.classList.add('done');
      c.el.classList.add('done');
      first = null;
      found++;
      tone(660, 0.12);
      lifecycle.setTimeout(() => tone(880, 0.15), 90);
      if (found === total) win();
    } else {
      lock = true;
      const a = first;
      first = null;
      lifecycle.setTimeout(() => {
        a.el.classList.remove('flip');
        c.el.classList.remove('flip');
        a.el.setAttribute('aria-label', String('Face-down stamp'));
        c.el.setAttribute('aria-label', String('Face-down stamp'));
        lock = false;
      }, 800);
    }
  }

  function win() {
    lifecycle.clearInterval(timer);
    const s = Math.floor((performance.now() - t0) / 1000),
      key = `pairs-best-${cols}x${rows}`,
      b = +storeGet(key) || Infinity;
    if (moves < b) {
      storeSet(key, moves);
      $('best').textContent = String(moves + ' flips');
    }
    $('msg').textContent = String(
      `Album complete: ${moves} flips in ${s} seconds${moves < b ? '. A personal best' : ''}.`,
    );
    [523, 659, 784, 1047].forEach((f, i) =>
      lifecycle.setTimeout(() => tone(f, 0.2), i * 100),
    );
  }
  document
    .querySelectorAll<HTMLElement>('.sizes button')
    .forEach(
      (b) =>
        (b.onclick = () =>
          deal(...(b.dataset.s.split(',').map(Number) as [number, number]))),
    );
  deal(4, 4);
}
