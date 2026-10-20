import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  status: HTMLDivElement;
  bells: HTMLDivElement;
  dots: HTMLDivElement;
  round: HTMLSpanElement;
  mercy: HTMLSpanElement;
  best: HTMLSpanElement;
  go: HTMLButtonElement;
  replay: HTMLButtonElement;
  '${id}': HTMLElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  const BELLS = [
    {
      f: 293.66,
      body: '#b87333',
      hi: '#f0b27a',
      name: 'Copper',
    },
    {
      f: 329.63,
      body: '#c9a227',
      hi: '#fde38a',
      name: 'Gold',
    },
    {
      f: 369.99,
      body: '#3f9b7c',
      hi: '#9fe3c6',
      name: 'Jade',
    },
    {
      f: 440.0,
      body: '#a8a9ad',
      hi: '#f2f2f4',
      name: 'Silver',
    },
    {
      f: 493.88,
      body: '#8c5a9b',
      hi: '#d8b4e6',
      name: 'Amethyst',
    },
    {
      f: 587.33,
      body: '#c45a3c',
      hi: '#f7a98f',
      name: 'Cinnabar',
    },
  ];
  let AC = null;
  function ac() {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return null;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function bellSound(f, v = 0.12) {
    const a = ac();
    if (!a) return;
    const T = a.currentTime;
    [
      [1, 1, 2.2],
      [2.76, 0.35, 1.2],
      [5.4, 0.18, 0.7],
      [0.5, 0.25, 2.6],
    ].forEach(([m, amp, d]) => {
      const o = a.createOscillator(),
        g = a.createGain();
      o.type = 'sine';
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, T);
      g.gain.exponentialRampToValueAtTime(v * amp, T + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, T + d);
      o.connect(g).connect(a.destination);
      o.start(T);
      o.stop(T + d + 0.05);
    });
  }

  function thud() {
    const a = ac();
    if (!a) return;
    const T = a.currentTime,
      o = a.createOscillator(),
      g = a.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(110, T);
    o.frequency.exponentialRampToValueAtTime(55, T + 0.4);
    g.gain.setValueAtTime(0.08, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.45);
    o.connect(g).connect(a.destination);
    o.start(T);
    o.stop(T + 0.5);
  }
  const els = BELLS.map((b, i) => {
    const btn = document.createElement('button');
    btn.className = 'bell';
    btn.type = 'button';
    btn.disabled = true;
    btn.style.setProperty('--glow', String(b.hi));
    btn.style.setProperty('--drop', String(`${[10, 4, 0, 0, 4, 10][i]}px`));
    btn.setAttribute('aria-label', String(`${b.name} bell, key ${i + 1}`));
    const id = `g${i}`;
    btn.innerHTML = `<span class="rope"></span>
  <svg viewBox="0 0 100 110" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${b.body}"/><stop offset=".35" stop-color="${b.hi}"/><stop offset=".7" stop-color="${b.body}"/><stop offset="1" stop-color="#2a1a10"/></linearGradient></defs>
    <rect x="42" y="2" width="16" height="12" rx="4" fill="${b.body}"/>
    <path d="M50 12 C28 12 24 30 22 58 C21 74 14 84 8 92 L92 92 C86 84 79 74 78 58 C76 30 72 12 50 12 Z" fill="url(#${id})"/>
    <rect x="6" y="90" width="88" height="8" rx="4" fill="${b.body}"/>
    <path d="M28 70 H72" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <circle cx="50" cy="104" r="6" fill="#3a2414"/>
  </svg><span class="key">${i + 1}</span>`;
    lifecycle.listen(btn, 'click', () => press(i));
    $('bells').appendChild(btn);
    return btn;
  });
  let seq = [],
    input = [],
    round = 0,
    mercy = 1,
    playing = false,
    accepting = false,
    reverse = false,
    best = 0;
  try {
    best = +localStorage.getItem('echo-bells-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  const sleep = (ms) =>
    new Promise<void>((resolve) => lifecycle.setTimeout(() => resolve(), ms));
  function ring(i, show = true) {
    bellSound(BELLS[i].f);
    const el = els[i];
    el.classList.remove('ring');
    void el.offsetWidth;
    el.classList.add('ring');
    if (show) {
      el.classList.add('lit');
      lifecycle.setTimeout(() => el.classList.remove('lit'), 380);
    }
  }

  function status(txt, cls = '') {
    const s = $('status');
    s.textContent = String(txt);
    s.className = 'status ' + cls;
  }

  function dots() {
    $('dots').innerHTML = seq
      .map((_, k) => `<i class="${k < input.length ? 'on' : ''}"></i>`)
      .join('');
  }

  function setBells(on) {
    els.forEach((b) => (b.disabled = !on));
  }
  async function playSeq() {
    playing = true;
    accepting = false;
    setBells(false);
    input = [];
    dots();
    $('replay').hidden = true;
    status(
      reverse ? 'Echo round. Listen, then ring it backwards.' : 'Listen…',
      reverse ? 'rev' : '',
    );
    await sleep(700);
    const gap = Math.max(260, 620 - round * 22);
    for (const i of seq) {
      ring(i);
      await sleep(gap);
    }
    playing = false;
    accepting = true;
    setBells(true);
    status(reverse ? 'Your turn: ring it backwards' : 'Your turn', reverse ? 'rev' : '');
    $('replay').hidden = mercy < 1;
  }

  function nextRound() {
    round++;
    $('round').textContent = String(round);
    seq.push(Math.floor(Math.random() * 6));
    reverse = round >= 5 && round % 3 === 2;
    playSeq();
  }

  function begin() {
    ac();
    seq = [];
    round = 0;
    mercy = 1;
    $('mercy').textContent = String(mercy);
    $('go').hidden = true;
    for (let k = 0; k < 2; k++) seq.push(Math.floor(Math.random() * 6));
    nextRound();
  }
  async function press(i) {
    if (!accepting) return;
    ring(i, true);
    const target = reverse ? seq[seq.length - 1 - input.length] : seq[input.length];
    if (i !== target) {
      accepting = false;
      setBells(false);
      thud();
      if (mercy > 0) {
        mercy--;
        $('mercy').textContent = String(mercy);
        status('Wrong bell. Mercy used. Listen again.', 'bad');
        await sleep(1100);
        playSeq();
        return;
      }
      status(`The tune slipped away after ${round - 1} rounds.`, 'bad');
      const score = round - 1;
      if (score > best) {
        best = score;
        try {
          localStorage.setItem('echo-bells-best', String(best));
        } catch (e) {}
        $('best').textContent = String(best);
        status(`New record: ${score} rounds.`, 'rev');
      }
      $('go').textContent = String('Play again');
      $('go').hidden = false;
      $('replay').hidden = true;
      $('go').focus();
      return;
    }
    input.push(i);
    dots();
    if (input.length === seq.length) {
      accepting = false;
      setBells(false);
      status(
        ['Well rung.', 'Clear as a temple morning.', 'The monks nod.', 'Perfect echo.'][
          round % 4
        ],
        'rev',
      );
      await sleep(900);
      nextRound();
    }
  }
  $('go').onclick = begin;
  $('replay').onclick = () => {
    if (mercy > 0 && accepting) {
      mercy--;
      $('mercy').textContent = String(mercy);
      playSeq();
    }
  };
  lifecycle.listen(window, 'keydown', (e) => {
    const n = +e.key;
    if (n >= 1 && n <= 6) {
      e.preventDefault();
      press(n - 1);
    }
  });
}
