import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  score: HTMLElement;
  time: HTMLElement;
  field: HTMLDivElement;
  card: HTMLDivElement;
  cText: HTMLElement;
  go: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.1, type = 'square', v = 0.05, sl = 0) {
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
  const MEERKAT = (fur, belly) =>
    `<svg viewBox="0 0 60 80" aria-hidden="true"><ellipse cx="30" cy="58" rx="18" ry="24" fill="${fur}"/><ellipse cx="30" cy="62" rx="10" ry="16" fill="${belly}"/><ellipse cx="30" cy="24" rx="15" ry="16" fill="${fur}"/><ellipse cx="22" cy="22" rx="5" ry="6" fill="#3a1e0c"/><ellipse cx="38" cy="22" rx="5" ry="6" fill="#3a1e0c"/><circle cx="23" cy="21" r="1.5" fill="#fff"/><circle cx="39" cy="21" r="1.5" fill="#fff"/><ellipse cx="30" cy="31" rx="3.5" ry="2.5" fill="#3a1e0c"/><circle cx="16" cy="11" r="4" fill="${fur}"/><circle cx="44" cy="11" r="4" fill="${fur}"/><ellipse cx="20" cy="50" rx="4" ry="7" fill="${fur}" transform="rotate(20 20 50)"/><ellipse cx="40" cy="50" rx="4" ry="7" fill="${fur}" transform="rotate(-20 40 50)"/></svg>`;
  const SNAKE = `<svg viewBox="0 0 60 80" aria-hidden="true"><path d="M30 80 C30 60 42 56 40 42 C38 30 22 34 22 22" stroke="#4f8a3a" stroke-width="14" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="18" rx="12" ry="9" fill="#4f8a3a"/><circle cx="20" cy="15" r="2.5" fill="#ffd34a"/><circle cx="29" cy="15" r="2.5" fill="#ffd34a"/><path d="M14 22 L6 24 M6 24 L2 22 M6 24 L2 27" stroke="#e63946" stroke-width="2"/></svg>`;
  const holes = [];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'burrow';
    b.setAttribute('aria-label', String(`Burrow ${i + 1}`));
    b.innerHTML =
      '<div class="hole"></div><div class="critter"></div><div class="mound"></div>';
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      bonk(i);
    });
    lifecycle.listen(b, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bonk(i);
      }
    });
    $('field').appendChild(b);
    holes.push({
      el: b,
      kind: null,
      until: 0,
    });
  }
  let score = 0,
    streak = 0,
    timeLeft = 45,
    playing = false,
    nextPop = 0,
    t0 = 0,
    best = 0;
  try {
    best = +localStorage.getItem('meerkat-pop-best') || 0;
  } catch (e) {}

  function pop(i, kind, dur) {
    const h = holes[i];
    h.kind = kind;
    h.until = performance.now() + dur;
    h.el.querySelector('.critter').innerHTML =
      kind === 'snake'
        ? SNAKE
        : kind === 'gold'
          ? MEERKAT('#e8b92e', '#fff2b3')
          : MEERKAT('#c68a4a', '#f3d9b0');
    h.el.classList.remove('bonked');
    h.el.classList.add('up');
    if (kind !== 'snake') tone(1200, 0.05, 'sine', 0.02, 1.4);
  }

  function hide(i) {
    const h = holes[i];
    h.kind = null;
    h.el.classList.remove('up');
  }

  function bonk(i) {
    if (!playing) return;
    const h = holes[i];
    if (!h.kind) {
      streak = 0;
      tone(200, 0.05, 'sine', 0.02);
      return;
    }
    let txt;
    if (h.kind === 'snake') {
      score = Math.max(0, score - 5);
      streak = 0;
      txt = '−5';
      tone(120, 0.3, 'sawtooth', 0.06, 0.5);
    } else {
      streak++;
      const pts = (h.kind === 'gold' ? 5 : 1) * (1 + Math.floor(streak / 5));
      score += pts;
      txt = `+${pts}`;
      tone(500 + Math.min(streak, 12) * 40, 0.08, 'square', 0.05);
    }
    h.kind = null;
    h.el.classList.remove('up');
    h.el.classList.add('bonked');
    const p = document.createElement('div');
    p.className = 'pow';
    p.textContent = String(txt);
    h.el.appendChild(p);
    lifecycle.setTimeout(() => p.remove(), 500);
    $('score').textContent = String(score);
  }

  function start() {
    score = 0;
    streak = 0;
    timeLeft = 45;
    playing = true;
    nextPop = 0;
    t0 = performance.now();
    $('score').textContent = String(0);
    $('card').hidden = true;
    holes.forEach((_, i) => hide(i));
    holes[4].el.focus();
  }

  function end() {
    playing = false;
    holes.forEach((_, i) => hide(i));
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('meerkat-pop-best', String(best));
      } catch (e) {}
    }
    $('cText').innerHTML =
      `<b>Time's up!</b> You booped ${score} points' worth of meerkats. Best: ${best}.`;
    $('go').textContent = String('Again · 45 s');
    $('card').hidden = false;
    $('go').focus();
    [523, 659, 784].forEach((f, i) =>
      lifecycle.setTimeout(() => tone(f, 0.15, 'triangle', 0.06), i * 100),
    );
  }
  $('go').onclick = start;
  lifecycle.listen(window, 'keydown', (e) => {
    const n = +e.key;
    if (n >= 1 && n <= 9) {
      const map = [6, 7, 8, 3, 4, 5, 0, 1, 2];
      bonk(map[n - 1]);
    }
  });
  (function loop() {
    const now = performance.now();
    if (playing) {
      const el = (now - t0) / 1000;
      timeLeft = Math.max(0, 45 - el);
      $('time').textContent = String(Math.ceil(timeLeft));
      holes.forEach((h, i) => {
        if (h.kind && now > h.until) {
          if (h.kind !== 'snake') streak = 0;
          hide(i);
        }
      });
      if (now > nextPop) {
        const free = holes.map((h, i) => (h.kind ? -1 : i)).filter((i) => i >= 0);
        if (free.length) {
          const i = free[Math.floor(Math.random() * free.length)],
            r = Math.random();
          const dur = Math.max(450, 1150 - el * 14);
          pop(i, r < 0.14 ? 'snake' : r < 0.2 ? 'gold' : 'meerkat', dur);
        }
        nextPop = now + Math.max(260, 800 - el * 12) * (0.6 + Math.random() * 0.7);
      }
      if (timeLeft <= 0) end();
    }
    lifecycle.requestAnimationFrame(loop);
  })();
}
