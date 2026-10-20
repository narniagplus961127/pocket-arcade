import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  bdot: HTMLSpanElement;
  turn: HTMLSpanElement;
  board: HTMLDivElement;
  restart: HTMLButtonElement;
  tally: HTMLDivElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.1, type = 'sine', v = 0.06) {
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
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const C = 7,
    R = 6;
  let b,
    depth = 4,
    over = false,
    busy = false,
    tally = {
      me: 0,
      ai: 0,
      d: 0,
    };
  try {
    tally = JSON.parse(localStorage.getItem('tide-four-tally')) || tally;
  } catch (e) {}
  const cols = [];
  for (let c = 0; c < C; c++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'col';
    btn.setAttribute('aria-label', String(`Column ${c + 1}`));
    for (let r = 0; r < R; r++) {
      const d = document.createElement('div');
      d.className = 'cell';
      btn.appendChild(d);
    }
    btn.onclick = () => play(c);
    $('board').appendChild(btn);
    cols.push(btn);
  }
  const cell = (r, c) => cols[c].children[r];
  function reset() {
    b = [...Array(R)].map(() => Array(C).fill(0));
    over = false;
    busy = false;
    document.querySelectorAll<HTMLElement>('.disc').forEach((d) => d.remove());
    turn('Your move. Drop a pebble in any column.', 1);
    cols.forEach((x) => (x.disabled = false));
    tallyShow();
  }

  function turn(txt, p) {
    $('turn').textContent = String(txt);
    $('bdot').style.background = p === 1 ? 'var(--coral)' : 'var(--glass)';
  }

  function tallyShow() {
    $('tally').textContent = String(
      `You ${tally.me} · Octopus ${tally.ai} · Draws ${tally.d}`,
    );
    try {
      localStorage.setItem('tide-four-tally', String(JSON.stringify(tally)));
    } catch (e) {}
  }
  const rowFor = (bd, c) => {
    for (let r = R - 1; r >= 0; r--) if (!bd[r][c]) return r;
    return -1;
  };
  function place(c, p) {
    const r = rowFor(b, c);
    if (r < 0) return -1;
    b[r][c] = p;
    const d = document.createElement('div');
    d.className = `disc p${p}`;
    d.style.setProperty('--h', String(r + 1));
    cell(r, c).appendChild(d);
    tone(p === 1 ? 520 : 390, 0.12);
    return r;
  }

  function lineAt(bd, p) {
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++)
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
          [1, 1],
          [1, -1],
        ]) {
          const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
          if (
            cells.every(([y, x]) => y >= 0 && y < R && x >= 0 && x < C && bd[y][x] === p)
          )
            return cells;
        }
    return null;
  }

  function score(bd) {
    let s = 0;
    for (let r = 0; r < R; r++)
      if (bd[r][3] === 2) s += 3;
      else if (bd[r][3] === 1) s -= 3;
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++)
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
          [1, 1],
          [1, -1],
        ]) {
          let a = 0,
            h = 0,
            ok = true;
          for (let k = 0; k < 4; k++) {
            const y = r + dr * k,
              x = c + dc * k;
            if (y < 0 || y >= R || x < 0 || x >= C) {
              ok = false;
              break;
            }
            if (bd[y][x] === 2) a++;
            else if (bd[y][x] === 1) h++;
          }
          if (!ok || (a && h)) continue;
          s += a === 3 ? 6 : a === 2 ? 2 : 0;
          s -= h === 3 ? 8 : h === 2 ? 2 : 0;
        }
    return s;
  }
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  function minimax(bd, d, alpha, beta, maxi) {
    if (lineAt(bd, 2)) return 100000 + d;
    if (lineAt(bd, 1)) return -100000 - d;
    const moves = ORDER.filter((c) => rowFor(bd, c) >= 0);
    if (!moves.length) return 0;
    if (d === 0) return score(bd);
    if (maxi) {
      let v = -Infinity;
      for (const c of moves) {
        const r = rowFor(bd, c);
        bd[r][c] = 2;
        v = Math.max(v, minimax(bd, d - 1, alpha, beta, false));
        bd[r][c] = 0;
        alpha = Math.max(alpha, v);
        if (alpha >= beta) break;
      }
      return v;
    }
    let v = Infinity;
    for (const c of moves) {
      const r = rowFor(bd, c);
      bd[r][c] = 1;
      v = Math.min(v, minimax(bd, d - 1, alpha, beta, true));
      bd[r][c] = 0;
      beta = Math.min(beta, v);
      if (alpha >= beta) break;
    }
    return v;
  }

  function aiMove() {
    let best = -Infinity,
      pick = 3;
    const moves = ORDER.filter((c) => rowFor(b, c) >= 0);
    for (const c of moves) {
      const r = rowFor(b, c);
      b[r][c] = 2;
      const v =
        minimax(b, depth - 1, -Infinity, Infinity, false) +
        (depth === 2 ? Math.random() * 6 : 0);
      b[r][c] = 0;
      if (v > best) {
        best = v;
        pick = c;
      }
    }
    return pick;
  }

  function check(p) {
    const line = lineAt(b, p);
    if (line) {
      over = true;
      line.forEach(([r, c]) => cell(r, c).firstChild.classList.add('win'));
      if (p === 1) {
        tally.me++;
        turn('Four in a row! The octopus sulks into its shell.', 1);
        [523, 659, 784, 1047].forEach((f, i) =>
          lifecycle.setTimeout(() => tone(f, 0.2, 'triangle'), i * 100),
        );
      } else {
        tally.ai++;
        turn('The octopus made four. Its tentacles wave smugly.', 2);
        tone(200, 0.5, 'sawtooth', 0.05);
      }
      tallyShow();
      cols.forEach((x) => (x.disabled = true));
      return true;
    }
    if (b[0].every((v) => v)) {
      over = true;
      tally.d++;
      tallyShow();
      turn('The pool is full. A draw.', 1);
      return true;
    }
    return false;
  }

  function play(c) {
    if (over || busy || rowFor(b, c) < 0) return;
    place(c, 1);
    if (check(1)) return;
    busy = true;
    turn('The octopus is thinking…', 2);
    lifecycle.setTimeout(() => {
      const m = aiMove();
      place(m, 2);
      busy = false;
      if (!check(2)) turn('Your move.', 1);
      cols.forEach((x, i) => (x.disabled = rowFor(b, i) < 0));
    }, 380);
  }
  document.querySelectorAll<HTMLElement>('[data-d]').forEach(
    (btn) =>
      (btn.onclick = () => {
        depth = +btn.dataset.d;
        document
          .querySelectorAll<HTMLElement>('[data-d]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
        reset();
      }),
  );
  $('restart').onclick = reset;
  lifecycle.listen(window, 'keydown', (e) => {
    const n = +e.key;
    if (n >= 1 && n <= 7) play(n - 1);
  });
  reset();
}
