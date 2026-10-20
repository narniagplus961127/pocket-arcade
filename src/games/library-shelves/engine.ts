import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  call: HTMLDivElement;
  steps: HTMLElement;
  shelved: HTMLElement;
  c: HTMLCanvasElement;
  msg: HTMLDivElement;
  undo: HTMLButtonElement;
  reset: HTMLButtonElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.08, type = 'triangle', v = 0.05) {
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
  const LEVELS = [
    `######
#@ $.#
######`,
    `#######
#.    #
# $## #
#  @  #
#######`,
    `########
#  .   #
# $$ @ #
#  .   #
########`,
    `#######
#.  # #
#.$   #
# $## #
#  @  #
#######`,
    `  ####
###  #
# $  #
# .#.#
#$ $ #
#.@  #
######`,
    ` #####
##   #
#  $ #
# #*.##
# $  @#
#  .  #
#######`,
  ];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  let lv = 0,
    W,
    Hh,
    wall,
    goals,
    boxes,
    player,
    steps,
    hist,
    solved,
    floor;
  try {
    lv = Math.min(LEVELS.length - 1, +localStorage.getItem('library-room') || 0);
  } catch (e) {}

  function load(i) {
    lv = i;
    const rows = LEVELS[i].split('\n');
    Hh = rows.length;
    W = Math.max(...rows.map((r) => r.length));
    wall = new Set();
    goals = new Set();
    boxes = [];
    floor = new Set();
    rows.forEach((r, y) =>
      [...r.padEnd(W)].forEach((ch, x) => {
        const k = y * W + x;
        if (ch === '#') wall.add(k);
        if ('.*+'.includes(ch)) goals.add(k);
        if ('$*'.includes(ch)) boxes.push(k);
        if ('@+'.includes(ch)) player = k;
      }),
    );
    // floor = cells reachable from the player, ignoring boxes
    const st = [player];
    while (st.length) {
      const k = st.pop();
      if (floor.has(k) || wall.has(k)) continue;
      floor.add(k);
      st.push(k + 1, k - 1, k + W, k - W);
    }
    steps = 0;
    hist = [];
    solved = false;
    fit();
    hud();
    $('call').textContent = String(`Room ${ROMAN[i]} of ${ROMAN[LEVELS.length - 1]}`);
    $('msg').textContent = String(
      i === 0
        ? 'Push every book cart onto a brass shelf marker.'
        : 'A new room. Plan before you push.',
    );
  }

  function hud() {
    $('steps').textContent = String(steps);
    $('shelved').textContent = String(
      `${boxes.filter((b) => goals.has(b)).length}/${goals.size}`,
    );
    $('prev').disabled = lv === 0;
    $('next').disabled = lv === LEVELS.length - 1;
  }

  function move(dx, dy) {
    if (solved) return;
    const d = dx + dy * W,
      np = player + d;
    if (wall.has(np)) return;
    const bi = boxes.indexOf(np);
    if (bi >= 0) {
      const nb = np + d;
      if (wall.has(nb) || boxes.includes(nb)) {
        tone(110, 0.06, 'square', 0.03);
        return;
      }
      hist.push([player, [...boxes]]);
      boxes[bi] = nb;
      tone(goals.has(nb) ? 660 : 220, 0.1);
    } else {
      hist.push([player, [...boxes]]);
      tone(440, 0.03, 'sine', 0.015);
    }
    player = np;
    steps++;
    hud();
    if (boxes.every((b) => goals.has(b))) {
      solved = true;
      try {
        localStorage.setItem('library-room', String(Math.min(LEVELS.length - 1, lv + 1)));
      } catch (e) {}
      $('msg').textContent = String(
        lv === LEVELS.length - 1
          ? `Every room is shelved. The library is yours. (${steps} steps)`
          : `Room shelved in ${steps} steps. On to the next room.`,
      );
      [392, 494, 587, 784].forEach((f, i) =>
        lifecycle.setTimeout(() => tone(f, 0.25), i * 100),
      );
      if (lv < LEVELS.length - 1) lifecycle.setTimeout(() => load(lv + 1), 1400);
    }
  }

  function undo() {
    if (!hist.length || solved) return;
    [player, boxes] = hist.pop();
    steps++;
    hud();
  }
  $('undo').onclick = undo;
  $('reset').onclick = () => load(lv);
  $('prev').onclick = () => lv > 0 && load(lv - 1);
  $('next').onclick = () => lv < LEVELS.length - 1 && load(lv + 1);
  const KEYS = {
    ArrowUp: [0, -1],
    w: [0, -1],
    ArrowDown: [0, 1],
    s: [0, 1],
    ArrowLeft: [-1, 0],
    a: [-1, 0],
    ArrowRight: [1, 0],
    d: [1, 0],
  };
  lifecycle.listen(window, 'keydown', (e) => {
    if (
      (e.target as HTMLElement).tagName === 'BUTTON' &&
      (e.key === ' ' || e.key === 'Enter')
    )
      return;
    const k = KEYS[e.key] || KEYS[(e.key || '').toLowerCase()];
    if (k) {
      e.preventDefault();
      move(...(k as [number, number]));
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'u') undo();
    else if (e.key === 'r' || e.key === 'R') load(lv);
  });
  document
    .querySelectorAll<HTMLElement>('.pad button')
    .forEach((b) =>
      lifecycle.listen(b, 'click', () =>
        move(...(b.dataset.d.split(',').map(Number) as [number, number])),
      ),
    );
  let sw = null;
  lifecycle.listen(cv, 'pointerdown', (e) => {
    sw = {
      x: e.clientX,
      y: e.clientY,
    };
  });
  lifecycle.listen(cv, 'pointerup', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x,
      dy = e.clientY - sw.y;
    sw = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    Math.abs(dx) > Math.abs(dy) ? move(Math.sign(dx), 0) : move(0, Math.sign(dy));
  });
  let CW = 0,
    DPR = 1;
  function fit() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    CW = cv.parentElement.clientWidth - 20;
    cv.style.height = (CW * Hh) / W + 'px';
    cv.width = CW * DPR;
    cv.height = ((CW * Hh) / W) * DPR;
  }
  new ResizeObserver(() => W && fit()).observe(cv.parentElement);
  const BOOK = ['#9b2c2c', '#2c5d9b', '#c79a2b', '#4b7a3a', '#6b3f8f'];
  function draw(t) {
    if (W && CW) {
      const s = CW / W;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, CW, (CW * Hh) / W);
      for (let y = 0; y < Hh; y++)
        for (let x = 0; x < W; x++) {
          const k = y * W + x,
            px = x * s,
            py = y * s;
          if (wall.has(k)) {
            ctx.fillStyle = '#3b2616';
            ctx.fillRect(px, py, s, s);
            for (let i = 0; i < 4; i++) {
              ctx.fillStyle = BOOK[(x * 3 + y * 5 + i) % 5];
              ctx.fillRect(px + s * (0.08 + i * 0.22), py + s * 0.12, s * 0.18, s * 0.36);
              ctx.fillRect(px + s * (0.08 + i * 0.22), py + s * 0.56, s * 0.18, s * 0.36);
            }
            ctx.fillStyle = '#5c3b22';
            ctx.fillRect(px, py + s * 0.48, s, s * 0.06);
          } else if (floor.has(k)) {
            ctx.fillStyle = (x + y) % 2 ? '#6b4a2f' : '#5e4029';
            ctx.fillRect(px, py, s, s);
            if (goals.has(k)) {
              ctx.strokeStyle = '#d4a64a';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.roundRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6, 4);
              ctx.stroke();
              ctx.fillStyle = 'rgba(212,166,74,.25)';
              ctx.fill();
            }
          }
        }
      for (const b of boxes) {
        const px = (b % W) * s,
          py = Math.floor(b / W) * s,
          on = goals.has(b);
        ctx.fillStyle = on ? '#d4a64a' : '#8a5a33';
        ctx.beginPath();
        ctx.roundRect(px + s * 0.1, py + s * 0.14, s * 0.8, s * 0.72, 5);
        ctx.fill();
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = BOOK[(b + i) % 5];
          ctx.fillRect(px + s * (0.17 + i * 0.135), py + s * 0.2, s * 0.1, s * 0.42);
        }
        ctx.fillStyle = '#2a1a0e';
        ctx.beginPath();
        ctx.arc(px + s * 0.25, py + s * 0.86, s * 0.06, 0, 7);
        ctx.arc(px + s * 0.75, py + s * 0.86, s * 0.06, 0, 7);
        ctx.fill();
      }
      const px = ((player % W) + 0.5) * s,
        py = (Math.floor(player / W) + 0.5) * s,
        bob = Math.sin(t / 250) * s * 0.02;
      ctx.fillStyle = '#1b2a22';
      ctx.beginPath();
      ctx.ellipse(px, py + s * 0.1 + bob, s * 0.22, s * 0.28, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#f0d3b0';
      ctx.beginPath();
      ctx.arc(px, py - s * 0.22 + bob, s * 0.16, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#d4a64a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px - s * 0.06, py - s * 0.22 + bob, s * 0.045, 0, 7);
      ctx.arc(px + s * 0.06, py - s * 0.22 + bob, s * 0.045, 0, 7);
      ctx.stroke();
      // lamp glow
      const g = ctx.createRadialGradient(px, py, 0, px, py, s * 2.5);
      g.addColorStop(0, 'rgba(255,220,150,.18)');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - s * 2.5, py - s * 2.5, s * 5, s * 5);
    }
    lifecycle.requestAnimationFrame(draw);
  }
  load(lv);
  lifecycle.requestAnimationFrame(draw);
}
