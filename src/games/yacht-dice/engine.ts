import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  total: HTMLElement;
  dice: HTMLDivElement;
  roll: HTMLButtonElement;
  hint: HTMLElement;
  msg: HTMLDivElement;
  card: HTMLElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.06, type = 'triangle', v = 0.05) {
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
  const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const counts = (d) => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    d.forEach((v) => c[v]++);
    return c;
  };
  const sum = (d) => d.reduce((a, b) => a + b, 0);
  const straight = (d, len) => {
    const s = new Set(d);
    return (
      len === 4
        ? [
            [1, 2, 3, 4],
            [2, 3, 4, 5],
            [3, 4, 5, 6],
          ]
        : [
            [1, 2, 3, 4, 5],
            [2, 3, 4, 5, 6],
          ]
    ).some((r) => r.every((v) => s.has(v)));
  };
  const CATS: Array<[string, string, (dice: number[]) => number]> = [
    ['Ones', '', (d) => counts(d)[1] * 1],
    ['Twos', '', (d) => counts(d)[2] * 2],
    ['Threes', '', (d) => counts(d)[3] * 3],
    ['Fours', '', (d) => counts(d)[4] * 4],
    ['Fives', '', (d) => counts(d)[5] * 5],
    ['Sixes', '', (d) => counts(d)[6] * 6],
    ['Three alike', 'sum of dice', (d) => (counts(d).some((c) => c >= 3) ? sum(d) : 0)],
    ['Four alike', 'sum of dice', (d) => (counts(d).some((c) => c >= 4) ? sum(d) : 0)],
    [
      'Full house',
      '25',
      (d) => {
        const c = counts(d).filter(Boolean).sort();
        return c.length === 2 && c[0] === 2 ? 25 : 0;
      },
    ],
    ['Small straight', '30', (d) => (straight(d, 4) ? 30 : 0)],
    ['Large straight', '40', (d) => (straight(d, 5) ? 40 : 0)],
    ['Yacht', '50', (d) => (counts(d).some((c) => c === 5) ? 50 : 0)],
    ['Chance', 'sum of dice', (d) => sum(d)],
  ];
  let dice, held, rolls, scores, turnStarted;
  const dieEls = [];
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'die';
    b.innerHTML = '<i></i>'.repeat(9);
    b.onclick = () => {
      if (!turnStarted || rolls === 0) return;
      held[i] = !held[i];
      tone(held[i] ? 660 : 440);
      renderDice();
    };
    $('dice').appendChild(b);
    dieEls.push(b);
  }

  function renderDice(anim?) {
    dice.forEach((v, i) => {
      const el = dieEls[i];
      el.classList.toggle('held', held[i]);
      el.disabled = !turnStarted || rolls === 0;
      el.setAttribute('aria-label', String(`Die showing ${v}${held[i] ? ', held' : ''}`));
      [...el.children].forEach(
        (p, k) =>
          (p.style.visibility =
            turnStarted && PIPS[v].includes(k) ? 'visible' : 'hidden'),
      );
      if (anim && !held[i]) {
        el.classList.remove('roll');
        void el.offsetWidth;
        el.classList.add('roll');
      }
    });
    $('roll').textContent = String(rolls > 0 ? `Roll · ${rolls} left` : 'Choose a box');
    $('roll').disabled = rolls === 0 || done();
  }
  const upper = () => scores.slice(0, 6).reduce((a, b) => a + (b ?? 0), 0);
  const bonus = () => (upper() >= 63 ? 35 : 0);
  const total = () => scores.reduce((a, b) => a + (b ?? 0), 0) + bonus();
  const done = () => scores.every((s) => s !== null);
  function renderCard() {
    const rows = [];
    rows.push('<tr><th>Box</th><th style="text-align:right">Score</th></tr>');
    CATS.forEach(([name, note, fn], i) => {
      if (i === 6)
        rows.push(
          `<tr class="sub"><td>Upper bonus <small>63+ earns 35 · now ${upper()}</small></td><td>${bonus() || '—'}</td></tr>`,
        );
      const s = scores[i];
      let cell;
      if (s !== null) cell = `<td class="done">${s}</td>`;
      else if (turnStarted) {
        const v = fn(dice);
        cell = `<td><button type="button" data-i="${i}" class="${v ? '' : 'zero'}" aria-label="Score ${v} in ${name}">${v}</button></td>`;
      } else cell = '<td></td>';
      rows.push(
        `<tr><td>${name}${note ? `<small>${note}</small>` : ''}</td>${cell}</tr>`,
      );
    });
    $('card').innerHTML = rows.join('');
    $('card')
      .querySelectorAll<HTMLElement>('button')
      .forEach((b) => (b.onclick = () => take(+b.dataset.i)));
    $('total').textContent = String(total());
  }

  function roll() {
    if (rolls === 0 || done()) return;
    turnStarted = true;
    dice = dice.map((v, i) => (held[i] ? v : 1 + Math.floor(Math.random() * 6)));
    rolls--;
    for (let k = 0; k < 5; k++)
      lifecycle.setTimeout(
        () => tone(200 + Math.random() * 300, 0.03, 'square', 0.03),
        k * 50,
      );
    renderDice(true);
    renderCard();
    if (counts(dice).some((c) => c === 5)) $('msg').textContent = String('Yacht!');
    else $('msg').textContent = String('');
  }

  function take(i) {
    if (!turnStarted || scores[i] !== null) return;
    scores[i] = CATS[i][2](dice);
    tone(scores[i] ? 784 : 300, 0.15);
    turnStarted = false;
    rolls = 3;
    held = [false, false, false, false, false];
    renderDice();
    renderCard();
    if (done()) {
      const t = total();
      let best = 0;
      try {
        best = +localStorage.getItem('harbour-dice-best') || 0;
        if (t > best) {
          best = t;
          localStorage.setItem('harbour-dice-best', String(best));
        }
      } catch (e) {}
      $('msg').textContent = String(`Final score ${t}. Club record: ${best}.`);
      $('roll').disabled = false;
      $('roll').textContent = String('New game');
      $('roll').onclick = newGame;
      [523, 659, 784, 1047].forEach((f, k) =>
        lifecycle.setTimeout(() => tone(f, 0.25, 'sine'), k * 110),
      );
    } else $('msg').textContent = String('');
  }

  function newGame() {
    dice = [1, 2, 3, 4, 5];
    held = [false, false, false, false, false];
    rolls = 3;
    scores = Array(13).fill(null);
    turnStarted = false;
    $('roll').onclick = roll;
    $('msg').textContent = String('');
    renderDice();
    renderCard();
  }
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') roll();
    const n = +e.key;
    if (n >= 1 && n <= 5) dieEls[n - 1].click();
  });
  newGame();
}
