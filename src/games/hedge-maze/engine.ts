import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  k0: HTMLSpanElement;
  k1: HTMLSpanElement;
  k2: HTMLSpanElement;
  time: HTMLDivElement;
  c: HTMLCanvasElement;
  over: HTMLDivElement;
  oTitle: HTMLElement;
  oText: HTMLElement;
  go: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements | string>(
      id: K,
    ): K extends keyof GameElements ? GameElements[K] : HTMLElement =>
      getGameElement<K extends keyof GameElements ? GameElements[K] : HTMLElement>(id);
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
  let N = 11,
    walls,
    seen,
    me,
    keys,
    got,
    gate,
    t0 = 0,
    timer,
    playing = false,
    level = 0,
    disp = {
      x: 0,
      y: 0,
    };
  // walls[y][x] = bitmask of open sides: 1 N, 2 E, 4 S, 8 W
  function gen() {
    walls = [...Array(N)].map(() => Array(N).fill(0));
    seen = [...Array(N)].map(() => Array(N).fill(0));
    const st = [[0, 0]],
      vis = new Set(['0,0']);
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const opts = [
        [0, -1, 1, 4],
        [1, 0, 2, 8],
        [0, 1, 4, 1],
        [-1, 0, 8, 2],
      ].filter(([dx, dy]) => {
        const nx = x + dx,
          ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && !vis.has(nx + ',' + ny);
      });
      if (!opts.length) {
        st.pop();
        continue;
      }
      const [dx, dy, b, ob] = opts[Math.floor(Math.random() * opts.length)];
      walls[y][x] |= b;
      walls[y + dy][x + dx] |= ob;
      vis.add(x + dx + ',' + (y + dy));
      st.push([x + dx, y + dy]);
    }
    // knock out a few extra walls so there are loops
    for (let i = 0; i < N; i++) {
      const x = 1 + Math.floor(Math.random() * (N - 2)),
        y = 1 + Math.floor(Math.random() * (N - 2));
      walls[y][x] |= 2;
      walls[y][x + 1] |= 8;
    }
    me = {
      x: 0,
      y: 0,
    };
    disp = {
      x: 0,
      y: 0,
    };
    gate = {
      x: N - 1,
      y: N - 1,
    };
    keys = [];
    while (keys.length < 3) {
      const k = {
        x: Math.floor(Math.random() * N),
        y: Math.floor(Math.random() * N),
      };
      if (
        k.x + k.y > N / 2 &&
        !(k.x === gate.x && k.y === gate.y) &&
        !keys.some((o) => o.x === k.x && o.y === k.y)
      )
        keys.push(k);
    }
    got = 0;
    [0, 1, 2].forEach((i) => $('k' + i).classList.remove('got'));
  }

  function start() {
    N = 11 + level * 2;
    gen();
    playing = true;
    $('over').hidden = true;
    t0 = performance.now();
    lifecycle.clearInterval(timer);
    timer = lifecycle.setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      $('time').textContent = String(
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
      );
    }, 250);
  }

  function move(dx, dy) {
    if (!playing) return;
    const bit = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1;
    if (!(walls[me.y][me.x] & bit)) {
      tone(140, 0.04, 'sine', 0.02);
      return;
    }
    me.x += dx;
    me.y += dy;
    tone(320 + Math.random() * 40, 0.03, 'sine', 0.015);
    const ki = keys.findIndex((k) => !k.got && k.x === me.x && k.y === me.y);
    if (ki >= 0) {
      keys[ki].got = true;
      $('k' + got).classList.add('got');
      got++;
      [784, 988].forEach((f, i) => lifecycle.setTimeout(() => tone(f, 0.15), i * 80));
    }
    if (me.x === gate.x && me.y === gate.y) {
      if (got < 3) {
        tone(200, 0.15, 'square', 0.03);
        return;
      }
      playing = false;
      lifecycle.clearInterval(timer);
      const s = Math.floor((performance.now() - t0) / 1000),
        key = `hedge-best-${N}`;
      let best = Infinity;
      try {
        best = +localStorage.getItem(key) || Infinity;
        if (s < best) localStorage.setItem(key, String(s));
      } catch (e) {}
      $('oTitle').textContent = String('Through the gate');
      $('oText').textContent = String(
        `Escaped a ${N}×${N} maze in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${s < best ? ', a new best for this size' : ''}. The next maze is larger.`,
      );
      $('go').textContent = String('Next garden');
      level = Math.min(level + 1, 7);
      $('over').hidden = false;
      $('go').focus();
      [523, 659, 784, 1047].forEach((f, i) =>
        lifecycle.setTimeout(() => tone(f, 0.25), i * 110),
      );
    }
  }
  $('go').onclick = start;
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
    const k = KEYS[e.key] || KEYS[(e.key || '').toLowerCase()];
    if (k) {
      e.preventDefault();
      move(...(k as [number, number]));
    }
  });
  document.querySelectorAll<HTMLElement>('.pad button').forEach((b) => {
    let rep;
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      const d = b.dataset.d.split(',').map(Number);
      move(...(d as [number, number]));
      rep = lifecycle.setInterval(() => move(...(d as [number, number])), 150);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      lifecycle.listen(b, ev, () => lifecycle.clearInterval(rep)),
    );
  });
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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
    Math.abs(dx) > Math.abs(dy) ? move(Math.sign(dx), 0) : move(0, Math.sign(dy));
  });
  let SIZE = 0,
    DPR = 1;
  function fit() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    SIZE = cv.getBoundingClientRect().width;
    cv.width = SIZE * DPR;
    cv.height = SIZE * DPR;
  }
  new ResizeObserver(fit).observe(cv);
  fit();
  function draw(t) {
    if (SIZE && walls) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = '#0b120f';
      ctx.fillRect(0, 0, SIZE, SIZE);
      const cs = SIZE / N,
        LR = 2.6;
      disp.x += (me.x - disp.x) * 0.35;
      disp.y += (me.y - disp.y) * 0.35;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d = Math.hypot(x - disp.x, y - disp.y);
          if (d <= LR + 0.5) seen[y][x] = 1;
          const light =
            playing || !$('over').hidden ? Math.max(0, 1 - d / (LR + 0.8)) : 1;
          const a = Math.max(light, seen[y][x] ? 0.14 : 0, playing ? 0 : 0.3);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = '#cdbf9f';
          ctx.fillRect(x * cs, y * cs, cs, cs);
          ctx.fillStyle = '#2f5a34';
          const wv = cs * 0.18,
            m = walls[y][x];
          if (!(m & 1)) ctx.fillRect(x * cs, y * cs, cs, wv);
          if (!(m & 4)) ctx.fillRect(x * cs, (y + 1) * cs - wv, cs, wv);
          if (!(m & 8)) ctx.fillRect(x * cs, y * cs, wv, cs);
          if (!(m & 2)) ctx.fillRect((x + 1) * cs - wv, y * cs, wv, cs);
          ctx.fillRect(x * cs, y * cs, wv, wv);
          ctx.fillRect((x + 1) * cs - wv, y * cs, wv, wv);
          ctx.fillRect(x * cs, (y + 1) * cs - wv, wv, wv);
          ctx.fillRect((x + 1) * cs - wv, (y + 1) * cs - wv, wv, wv);
        }
      ctx.globalAlpha = 1;
      for (const k of keys)
        if (!k.got && (Math.hypot(k.x - disp.x, k.y - disp.y) < LR + 0.5 || !playing)) {
          ctx.fillStyle = '#e8c35a';
          ctx.font = `${cs * 0.7}px Alice, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            '⚷',
            (k.x + 0.5) * cs,
            (k.y + 0.55) * cs + Math.sin(t / 300) * cs * 0.05,
          );
        }
      if (
        Math.hypot(gate.x - disp.x, gate.y - disp.y) < LR + 0.5 ||
        seen[gate.y][gate.x]
      ) {
        ctx.strokeStyle = got === 3 ? '#e8c35a' : '#7a6a3a';
        ctx.lineWidth = cs * 0.08;
        ctx.beginPath();
        ctx.arc((gate.x + 0.5) * cs, (gate.y + 0.65) * cs, cs * 0.28, Math.PI, 0);
        ctx.lineTo((gate.x + 0.78) * cs, (gate.y + 0.9) * cs);
        ctx.moveTo((gate.x + 0.22) * cs, (gate.y + 0.65) * cs);
        ctx.lineTo((gate.x + 0.22) * cs, (gate.y + 0.9) * cs);
        ctx.stroke();
      }
      const px = (disp.x + 0.5) * cs,
        py = (disp.y + 0.5) * cs;
      const g = ctx.createRadialGradient(px, py, 0, px, py, cs * 1.4);
      g.addColorStop(0, 'rgba(255,214,120,.35)');
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - cs * 1.4, py - cs * 1.4, cs * 2.8, cs * 2.8);
      ctx.fillStyle = '#7a3b2b';
      ctx.beginPath();
      ctx.arc(px, py, cs * 0.26, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ffd678';
      ctx.beginPath();
      ctx.arc(px + cs * 0.16, py - cs * 0.14, cs * 0.09, 0, 7);
      ctx.fill();
    }
    lifecycle.requestAnimationFrame(draw);
  }
  gen();
  lifecycle.requestAnimationFrame(draw);
}
