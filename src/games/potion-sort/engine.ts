import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  lvl: HTMLElement;
  pours: HTMLElement;
  shelf: HTMLDivElement;
  msg: HTMLDivElement;
  undo: HTMLButtonElement;
  restart: HTMLButtonElement;
  extra: HTMLButtonElement;
  next: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.15, type = 'sine', v = 0.05, sl = 0) {
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
  const COLORS = [
    '#e63946',
    '#2a9d8f',
    '#f4a261',
    '#7b2cbf',
    '#3a86ff',
    '#90be6d',
    '#ff70a6',
    '#ffd60a',
    '#6d4c41',
    '#e0e0e0',
  ];
  const CAP = 4;
  let level = 1,
    vials,
    start,
    hist,
    pours,
    sel = null,
    extraUsed = false,
    done = false;
  try {
    level = +localStorage.getItem('potion-level') || 1;
  } catch (e) {}

  function gen() {
    const k = Math.min(3 + Math.floor((level - 1) / 2), COLORS.length);
    const pool = [];
    for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) pool.push(c);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const v = [];
    for (let c = 0; c < k; c++) v.push(pool.slice(c * CAP, c * CAP + CAP));
    v.push([], []);
    if (v.some((x) => x.length && x.every((y) => y === x[0]))) return gen();
    return v;
  }

  function load(fresh) {
    if (fresh) start = gen();
    vials = start.map((v) => [...v]);
    hist = [];
    pours = 0;
    sel = null;
    extraUsed = false;
    done = false;
    $('lvl').textContent = String(level);
    $('msg').textContent = String('');
    $('next').hidden = true;
    $('extra').disabled = false;
    render();
  }

  function render() {
    const s = $('shelf');
    s.innerHTML = '';
    vials.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'vial' +
        (sel === i ? ' sel' : '') +
        (v.length === CAP && v.every((x) => x === v[0]) ? ' full' : '');
      b.setAttribute(
        'aria-label',
        String(`Vial ${i + 1}: ${v.length ? v.length + ' measures' : 'empty'}`),
      );
      b.innerHTML = `<div class="lip"></div><div class="tube">${v.map((c) => `<div class="layer" style="background:${COLORS[c]}"></div>`).join('')}</div>`;
      b.onclick = () => tap(i);
      s.appendChild(b);
    });
    $('pours').textContent = String(pours);
    $('undo').disabled = !hist.length;
  }

  function tap(i) {
    if (done) return;
    if (sel === null) {
      if (vials[i].length) {
        sel = i;
        tone(500, 0.06, 'triangle', 0.03);
        render();
      }
      return;
    }
    if (sel === i) {
      sel = null;
      render();
      return;
    }
    const a = vials[sel],
      b = vials[i],
      top = a[a.length - 1];
    if (b.length >= CAP || (b.length && b[b.length - 1] !== top)) {
      tone(140, 0.1, 'square', 0.03);
      sel = null;
      render();
      return;
    }
    hist.push(vials.map((v) => [...v]));
    let moved = 0;
    while (a.length && a[a.length - 1] === top && b.length < CAP) {
      b.push(a.pop());
      moved++;
    }
    pours++;
    sel = null;
    for (let k = 0; k < moved; k++)
      lifecycle.setTimeout(
        () => tone(300 + b.length * 80 + k * 40, 0.12, 'sine', 0.05, 1.3),
        k * 60,
      );
    render();
    if (
      vials.every((v) => !v.length || (v.length === CAP && v.every((x) => x === v[0])))
    ) {
      done = true;
      $('msg').textContent = String(`Recipe ${level} brewed in ${pours} pours.`);
      $('next').hidden = false;
      $('next').focus();
      [392, 523, 659, 784].forEach((f, k) =>
        lifecycle.setTimeout(() => tone(f, 0.3, 'triangle', 0.06), k * 120),
      );
    }
  }
  $('undo').onclick = () => {
    if (!hist.length || done) return;
    const n = vials.length;
    vials = hist.pop();
    while (vials.length < n) vials.push([]);
    sel = null;
    render();
  };
  $('restart').onclick = () => load(false);
  $('extra').onclick = () => {
    if (extraUsed || done) return;
    extraUsed = true;
    vials.push([]);
    $('extra').disabled = true;
    render();
  };
  $('next').onclick = () => {
    level++;
    try {
      localStorage.setItem('potion-level', String(level));
    } catch (e) {}
    load(true);
  };
  load(true);
}
