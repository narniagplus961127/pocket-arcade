import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  tips: HTMLElement;
  served: HTMLElement;
  lost: HTMLElement;
  rail: HTMLDivElement;
  plate: HTMLDivElement;
  msg: HTMLDivElement;
  bins: HTMLDivElement;
  serve: HTMLButtonElement;
  trash: HTMLButtonElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  oText: HTMLElement;
  again: HTMLButtonElement;
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
  const ING = [
    {
      n: 'Bottom bun',
      c: '#e0a458',
      h: 22,
      w: 200,
      r: '6px 6px 18px 18px',
    },
    {
      n: 'Patty',
      c: '#6b3e26',
      h: 22,
      w: 210,
      r: '12px',
    },
    {
      n: 'Cheese',
      c: '#ffcf33',
      h: 8,
      w: 214,
      r: '3px',
    },
    {
      n: 'Lettuce',
      c: '#6cc24a',
      h: 10,
      w: 220,
      r: '10px',
    },
    {
      n: 'Tomato',
      c: '#e63946',
      h: 10,
      w: 190,
      r: '6px',
    },
    {
      n: 'Onion',
      c: '#e9d5f2',
      h: 8,
      w: 180,
      r: '8px',
    },
    {
      n: 'Pickles',
      c: '#3c8d2f',
      h: 7,
      w: 170,
      r: '4px',
    },
    {
      n: 'Top bun',
      c: '#e0a458',
      h: 34,
      w: 200,
      r: '100px 100px 8px 8px',
    },
  ];
  const NAMES = [
    'Dot',
    'Earl',
    'Mabel',
    'Hank',
    'Lou',
    'Peg',
    'Gus',
    'Rosie',
    'Vern',
    'Bea',
    'Sal',
    'Ida',
  ];
  ING.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = 'bin';
    b.type = 'button';
    b.innerHTML = `<span class="chip" style="background:${g.c}"></span>${g.n}<kbd>${i + 1}</kbd>`;
    b.onclick = () => add(i);
    $('bins').appendChild(b);
  });
  let orders,
    stack,
    tips,
    served,
    lost,
    playing = false,
    nextOrderT,
    el,
    t0;
  function makeOrder() {
    const lvl = Math.min(el / 120, 1),
      n = 1 + Math.floor(Math.random() * (2 + lvl * 3));
    const mid = [1];
    for (let i = 0; i < n; i++) mid.push(1 + Math.floor(Math.random() * 6));
    return {
      who: NAMES[Math.floor(Math.random() * NAMES.length)],
      items: [0, ...mid, 7],
      pat: 1,
      rate: 1 / (24 - lvl * 10 + mid.length * 1.5),
      born: el,
    };
  }

  function renderRail() {
    const rail = $('rail');
    rail.innerHTML = '';
    for (let k = 0; k < 3; k++) {
      const o = orders[k];
      if (!o) {
        const e = document.createElement('div');
        e.className = 'empty';
        e.textContent = String('No order');
        rail.appendChild(e);
        continue;
      }
      const d = document.createElement('div');
      d.className = 'ticket' + (k === 0 ? ' active' : '');
      d.innerHTML = `<div class="who">${o.who}</div><ol>${o.items.map((it, i) => `<li class="${k === 0 && i < stack.length && stack[i] === it ? 'done' : ''}"><span class="sw" style="background:${ING[it].c}"></span>${ING[it].n}</li>`).join('')}</ol><div class="pat"><i style="width:${o.pat * 100}%;background:${o.pat < 0.3 ? '#d7263d' : o.pat < 0.6 ? '#f2a516' : '#2bb673'}"></i></div>`;
      rail.appendChild(d);
    }
  }

  function renderPlate() {
    $('plate').innerHTML = stack
      .map((i) => {
        const g = ING[i];
        return `<div class="layer" style="width:${g.w * 0.9}px;max-width:76%;height:${g.h}px;background:${g.c};border-radius:${g.r};margin-top:-2px"></div>`;
      })
      .join('');
  }

  function hud() {
    $('tips').textContent = String(`$${tips}`);
    $('served').textContent = String(served);
    $('lost').textContent = String(`${lost}/3`);
  }

  function add(i) {
    if (!playing || stack.length >= 12) return;
    stack.push(i);
    tone(300 + i * 60, 0.06);
    renderPlate();
    renderRail();
  }

  function trash() {
    if (!playing || !stack.length) return;
    stack = [];
    renderPlate();
    renderRail();
    tone(150, 0.15, 'sawtooth', 0.04);
  }

  function serve() {
    if (!playing || !orders.length || !stack.length) return;
    const o = orders[0];
    if (stack.join() === o.items.join()) {
      const tip = 3 + Math.round(o.pat * 7) + o.items.length;
      tips += tip;
      served++;
      orders.shift();
      $('msg').textContent = String(`${o.who} tips $${tip}. Order up!`);
      [784, 988, 1175].forEach((f, k) =>
        lifecycle.setTimeout(() => tone(f, 0.12), k * 70),
      );
    } else {
      tips = Math.max(0, tips - 3);
      $('msg').textContent = String(`That's not what ${o.who} ordered. −$3`);
      tone(180, 0.3, 'square', 0.05);
    }
    stack = [];
    renderPlate();
    renderRail();
    hud();
  }

  function start() {
    orders = [];
    stack = [];
    tips = 0;
    served = 0;
    lost = 0;
    el = 0;
    nextOrderT = 0;
    playing = true;
    t0 = performance.now();
    $('title').hidden = true;
    $('over').hidden = true;
    $('msg').textContent = String('');
    renderPlate();
    hud();
    orders.push(makeOrder());
    renderRail();
  }

  function end() {
    playing = false;
    let best = 0;
    try {
      best = +localStorage.getItem('burger-rush-best') || 0;
      if (tips > best) {
        best = tips;
        localStorage.setItem('burger-rush-best', String(best));
      }
    } catch (e) {}
    $('oText').textContent = String(
      `You served ${served} burgers and earned $${tips} in tips. Best shift: $${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }
  $('serve').onclick = serve;
  $('trash').onclick = trash;
  $('play').onclick = start;
  $('again').onclick = start;
  lifecycle.listen(window, 'keydown', (e) => {
    const n = +e.key;
    if (n >= 1 && n <= 8) {
      add(n - 1);
      return;
    }
    if (e.key === 'Enter') {
      if (!playing) return;
      e.preventDefault();
      serve();
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      trash();
    }
  });
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      el += dt;
      nextOrderT -= dt;
      if (nextOrderT <= 0 && orders.length < 3) {
        orders.push(makeOrder());
        nextOrderT = Math.max(5, 12 - el * 0.05);
        renderRail();
      }
      let changed = false;
      for (const o of orders) {
        o.pat -= o.rate * dt;
      }
      const before = orders.length;
      orders = orders.filter((o) => {
        if (o.pat <= 0) {
          lost++;
          $('msg').textContent = String(`${o.who} walked out!`);
          tone(120, 0.4, 'sawtooth', 0.05);
          return false;
        }
        return true;
      });
      if (orders.length !== before) {
        hud();
        changed = true;
        if (lost >= 3) end();
      }
      if (!orders.length && nextOrderT > 1.5) nextOrderT = 1.5;
      document.querySelectorAll<HTMLElement>('.pat i').forEach((bar, k) => {
        const o = orders[k];
        if (o) {
          bar.style.width = o.pat * 100 + '%';
          bar.style.background =
            o.pat < 0.3 ? '#d7263d' : o.pat < 0.6 ? '#f2a516' : '#2bb673';
        }
      });
      if (changed) renderRail();
    }
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
