import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  score: HTMLElement;
  best: HTMLElement;
  tray: HTMLDivElement;
  tiles: HTMLDivElement;
  msg: HTMLDivElement;
  mTitle: HTMLElement;
  mText: HTMLElement;
  again: HTMLButtonElement;
  ladder: HTMLDivElement;
  newg: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.12, type = 'sine', v = 0.07) {
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
  const TEAS = [
    ['Sprout', '#eaf2d7', '#3b4a26'],
    ['Green', '#cfe3a8', '#2f4419'],
    ['Jasmine', '#f4efc4', '#4d4613'],
    ['Oolong', '#d9c27a', '#3e3209'],
    ['Black', '#8a5a3a', '#fff3e4'],
    ['Earl Grey', '#6f7f9a', '#f2f5fb'],
    ['Chai', '#c06f3a', '#fff0e2'],
    ['Matcha', '#5f9a3a', '#f4ffe9'],
    ['Pu-erh', '#5a2f22', '#fbe7dc'],
    ['Gyokuro', '#2f6b4f', '#e8fff3'],
    ['Golden Tips', '#e2b33c', '#3a2a00'],
    ['Imperial', '#2b1f3a', '#ffe9a8'],
  ];
  $('ladder').innerHTML = TEAS.slice(0, 11)
    .map(
      (t, i) =>
        `<span style="background:${t[1]};color:${t[2]}">${2 ** (i + 1)} · ${t[0]}</span>`,
    )
    .join('');
  const slots = document.querySelector<HTMLElement>('.slots');
  slots.innerHTML = '<div></div>'.repeat(16);
  let grid,
    tiles,
    score,
    best = 0,
    won,
    id = 0,
    busy = false;
  try {
    best = +localStorage.getItem('tea-blend-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  function el(t) {
    const d = document.createElement('div');
    d.className = 'tile new';
    const tea = TEAS[Math.min(t.lv, TEAS.length - 1)];
    d.style.background = tea[1];
    d.style.color = tea[2];
    d.innerHTML = `<b>${tea[0]}</b><small>${2 ** (t.lv + 1)}</small>`;
    $('tiles').appendChild(d);
    t.el = d;
    pos(t);
  }

  function pos(t) {
    t.el.style.transform = `translate(calc(${t.c} * (100% + 10px)), calc(${t.r} * (100% + 10px)))`;
  }

  function spawn() {
    const free = [];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) if (!grid[r][c]) free.push([r, c]);
    if (!free.length) return;
    const [r, c] = free[Math.floor(Math.random() * free.length)];
    const t = {
      id: id++,
      lv: Math.random() < 0.9 ? 0 : 1,
      r,
      c,
    };
    grid[r][c] = t;
    el(t);
  }

  function start() {
    $('tiles').innerHTML = '';
    grid = [...Array(4)].map(() => Array(4).fill(null));
    score = 0;
    won = false;
    $('score').textContent = String(0);
    $('msg').hidden = true;
    spawn();
    spawn();
  }

  function move(dr, dc) {
    if (busy || !$('msg').hidden) return;
    let moved = false,
      gained = 0;
    const dead = [];
    const order = [0, 1, 2, 3];
    const rs = dr > 0 ? [...order].reverse() : order,
      cs = dc > 0 ? [...order].reverse() : order;
    const merged = new Set();
    for (const r of rs)
      for (const c of cs) {
        const t = grid[r][c];
        if (!t) continue;
        let nr = r,
          nc = c;
        while (true) {
          const tr = nr + dr,
            tc = nc + dc;
          if (tr < 0 || tr > 3 || tc < 0 || tc > 3) break;
          const o = grid[tr][tc];
          if (!o) {
            nr = tr;
            nc = tc;
            continue;
          }
          if (o.lv === t.lv && !merged.has(o.id)) {
            grid[r][c] = null;
            t.r = tr;
            t.c = tc;
            pos(t);
            dead.push(t);
            o.lv++;
            merged.add(o.id);
            gained += 2 ** (o.lv + 1);
            moved = true;
            nr = null;
            break;
          }
          break;
        }
        if (nr === null) continue;
        if (nr !== r || nc !== c) {
          grid[r][c] = null;
          grid[nr][nc] = t;
          t.r = nr;
          t.c = nc;
          pos(t);
          moved = true;
        }
      }
    if (!moved) return;
    busy = true;
    lifecycle.setTimeout(() => {
      dead.forEach((t) => t.el.remove());
      for (const row of grid)
        for (const t of row)
          if (t && merged.has(t.id)) {
            const tea = TEAS[Math.min(t.lv, TEAS.length - 1)];
            t.el.style.background = tea[1];
            t.el.style.color = tea[2];
            t.el.innerHTML = `<b>${tea[0]}</b><small>${2 ** (t.lv + 1)}</small>`;
            t.el.classList.remove('new', 'merged');
            void t.el.offsetWidth;
            t.el.classList.add('merged');
            if (t.lv === 10 && !won) {
              won = true;
              lifecycle.setTimeout(() => end(true), 250);
            }
          }
      score += gained;
      $('score').textContent = String(score);
      if (score > best) {
        best = score;
        $('best').textContent = String(best);
        try {
          localStorage.setItem('tea-blend-best', String(best));
        } catch (e) {}
      }
      if (gained) {
        const top = Math.max(
          ...[...merged].map((i) => grid.flat().find((t) => t && t.id === i)?.lv || 0),
        );
        tone(392 * 2 ** (top / 6), 0.18, 'triangle', 0.07);
      } else tone(220, 0.05, 'sine', 0.03);
      spawn();
      busy = false;
      if (!canMove()) end(false);
    }, 115);
  }

  function canMove() {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const t = grid[r][c];
        if (!t) return true;
        if (c < 3 && grid[r][c + 1] && grid[r][c + 1].lv === t.lv) return true;
        if (r < 3 && grid[r + 1][c] && grid[r + 1][c].lv === t.lv) return true;
      }
    return false;
  }

  function end(win) {
    $('mTitle').textContent = String(win ? 'Golden Tips!' : 'The tray is full');
    $('mText').textContent = String(
      win ? `A legendary blend. Score ${score}.` : `Final score ${score}. Best ${best}.`,
    );
    $('again').textContent = String(win ? 'Keep steeping' : 'Brew a new tray');
    $('msg').hidden = false;
    $('again').focus();
    $('again').onclick = win
      ? () => {
          $('msg').hidden = true;
        }
      : start;
  }
  const KEYS = {
    ArrowUp: [-1, 0],
    w: [-1, 0],
    ArrowDown: [1, 0],
    s: [1, 0],
    ArrowLeft: [0, -1],
    a: [0, -1],
    ArrowRight: [0, 1],
    d: [0, 1],
  };
  lifecycle.listen(window, 'keydown', (e) => {
    const k = KEYS[e.key] || KEYS[(e.key || '').toLowerCase()];
    if (k) {
      e.preventDefault();
      move(...(k as [number, number]));
    }
  });
  let sw = null;
  const tray = $('tray');
  lifecycle.listen(tray, 'pointerdown', (e) => {
    sw = {
      x: e.clientX,
      y: e.clientY,
    };
  });
  lifecycle.listen(tray, 'pointerup', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x,
      dy = e.clientY - sw.y;
    sw = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    Math.abs(dx) > Math.abs(dy) ? move(0, Math.sign(dx)) : move(Math.sign(dy), 0);
  });
  $('newg').onclick = start;
  start();
}
