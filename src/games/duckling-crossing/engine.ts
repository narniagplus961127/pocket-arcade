import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  home: HTMLElement;
  score: HTMLElement;
  lives: HTMLElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  oTitle: HTMLElement;
  oText: HTMLElement;
  again: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
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
  const C = 13,
    R = 13;
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = Math.min(W / C, (H - 70) / R);
    OX = (W - S * C) / 2;
    OY = 56 + (H - 56 - S * R) / 2;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  // row 0 nests, 1-5 pond, 6 bank, 7-11 road, 12 start
  const NESTS = [1, 3.5, 6, 8.5, 11].map(Math.round);
  let lanes,
    duck,
    filled,
    lives,
    score,
    level,
    state = 'title',
    t = 0,
    deadT = 0,
    splat = null,
    bestRow;
  function makeLanes() {
    const sp = 1 + (level - 1) * 0.18;
    lanes = {
      1: {
        kind: 'pond',
        items: logs(3, 3, -1.2 * sp),
      },
      2: {
        kind: 'pond',
        items: logs(2, 4, 1.5 * sp),
      },
      3: {
        kind: 'pond',
        items: logs(4, 2, -1 * sp, true),
      },
      4: {
        kind: 'pond',
        items: logs(3, 3, 1.8 * sp),
      },
      5: {
        kind: 'pond',
        items: logs(3, 2, -1.4 * sp, true),
      },
      7: {
        kind: 'road',
        items: cars(3, 1, 2.2 * sp, '#e8573f'),
      },
      8: {
        kind: 'road',
        items: cars(2, 2, -1.6 * sp, '#3d6fd1'),
      },
      9: {
        kind: 'road',
        items: cars(4, 1, 2.8 * sp, '#f2b632'),
      },
      10: {
        kind: 'road',
        items: cars(2, 1, -3.3 * sp, '#8b5cf6'),
      },
      11: {
        kind: 'road',
        items: cars(3, 2, 1.3 * sp, '#14b8a6'),
      },
    };
  }

  function logs(n, len, v, pads?) {
    const gap = (C + 4) / n;
    return Array.from(
      {
        length: n,
      },
      (_, i) => ({
        x: i * gap + Math.random(),
        len,
        v,
        pad: !!pads,
      }),
    );
  }

  function cars(n, len, v, col) {
    const gap = (C + 4) / n;
    return Array.from(
      {
        length: n,
      },
      (_, i) => ({
        x: i * gap + Math.random() * 0.5,
        len,
        v,
        col,
      }),
    );
  }

  function resetDuck() {
    duck = {
      x: 6,
      y: 12,
      fx: 6,
      fy: 12,
      hop: 0,
    };
    bestRow = 12;
  }

  function start() {
    filled = new Set();
    lives = 3;
    score = 0;
    level = 1;
    makeLanes();
    resetDuck();
    state = 'play';
    hud();
    $('title').hidden = true;
    $('over').hidden = true;
  }

  function hud() {
    $('home').textContent = String(`${filled.size} / 5`);
    $('score').textContent = String(score);
    $('lives').textContent = String('♥'.repeat(Math.max(0, lives)) || '0');
  }

  function move(dx, dy) {
    if (state !== 'play' || duck.hop > 0) return;
    const nx = Math.round(duck.x) + dx,
      ny = duck.y + dy;
    if (nx < 0 || nx >= C || ny < 0 || ny >= R) return;
    duck.fx = duck.x;
    duck.fy = duck.y;
    duck.x = nx;
    duck.y = ny;
    duck.hop = 1;
    tone(880, 0.04, 'square', 0.03);
    if (ny < bestRow) {
      bestRow = ny;
      score += 10;
      hud();
    }
    if (ny === 0) {
      if (NESTS.includes(nx) && !filled.has(nx)) {
        filled.add(nx);
        score += 100;
        hud();
        [659, 784, 988].forEach((f, i) =>
          lifecycle.setTimeout(() => tone(f, 0.12, 'triangle', 0.07), i * 80),
        );
        if (filled.size === 5) {
          level++;
          score += 500;
          filled = new Set();
          makeLanes();
        }
        lifecycle.setTimeout(resetDuck, 250);
      } else die('bank');
    }
  }

  function die(why) {
    if (state !== 'play') return;
    lives--;
    hud();
    splat = {
      x: duck.x,
      y: duck.y,
      t: 0,
      why,
    };
    tone(
      why === 'water' ? 300 : 120,
      0.4,
      why === 'water' ? 'sine' : 'sawtooth',
      0.07,
      0.4,
    );
    state = 'dying';
    deadT = 0;
  }
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
      if (!e.repeat) move(...(k as [number, number]));
    } else if (
      (e.key === ' ' || e.key === 'Enter') &&
      state !== 'play' &&
      state !== 'dying'
    ) {
      e.preventDefault();
      start();
    }
  });
  document.querySelectorAll<HTMLElement>('.pad button').forEach((b) =>
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      move(...(b.dataset.d.split(',').map(Number) as [number, number]));
    }),
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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) {
      move(0, -1);
      return;
    }
    Math.abs(dx) > Math.abs(dy) ? move(Math.sign(dx), 0) : move(0, Math.sign(dy));
  });
  $('play').onclick = start;
  $('again').onclick = start;
  const wrap = (x) => ((((x + 2) % (C + 4)) + C + 4) % (C + 4)) - 2;
  function update(dt) {
    t += dt;
    for (const k in lanes) for (const it of lanes[k].items) it.x = wrap(it.x + it.v * dt);
    duck.hop = Math.max(0, duck.hop - dt * 7);
    if (state === 'dying') {
      deadT += dt;
      if (deadT > 1) {
        splat = null;
        if (lives <= 0) return over();
        state = 'play';
        resetDuck();
      }
      return;
    }
    if (state !== 'play' || duck.hop > 0) return;
    const lane = lanes[duck.y];
    if (!lane) return;
    if (lane.kind === 'road') {
      for (const c of lane.items)
        if (duck.x + 0.85 > c.x && duck.x + 0.15 < c.x + c.len) return die('car');
    } else {
      const ride = lane.items.find(
        (l) => duck.x + 0.5 > l.x + 0.1 && duck.x + 0.5 < l.x + l.len + 0.1,
      );
      if (!ride) return die('water');
      duck.x += ride.v * dt;
      if (duck.x < -0.4 || duck.x > C - 0.6) die('water');
    }
  }

  function over() {
    state = 'over';
    let best = 0;
    try {
      best = +localStorage.getItem('duckling-best') || 0;
      if (score > best) {
        best = score;
        localStorage.setItem('duckling-best', String(best));
      }
    } catch (e) {}
    $('oTitle').textContent = String('Out of feathers');
    $('oText').textContent = String(
      `Score ${score}. You reached park ${level}. Best ${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }

  function rr(x, y, w, h, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function drawDuck(x, y, s, baby) {
    const hop = Math.sin(duck.hop * Math.PI) * s * 0.2;
    y -= hop;
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3 + hop, s * 0.3, s * 0.1, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = baby ? '#ffe066' : '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.05, s * 0.3, s * 0.26, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - s * 0.2, s * 0.18, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.07, y - s * 0.3);
    ctx.lineTo(x + s * 0.07, y - s * 0.3);
    ctx.lineTo(x, y - s * 0.42);
    ctx.fill();
    ctx.fillStyle = '#24331a';
    ctx.beginPath();
    ctx.arc(x - s * 0.07, y - s * 0.22, s * 0.03, 0, 7);
    ctx.arc(x + s * 0.07, y - s * 0.22, s * 0.03, 0, 7);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#e9f7d9';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(OX, OY);
    for (let r = 0; r < R; r++) {
      const y = r * S,
        k = lanes[r]?.kind;
      ctx.fillStyle =
        k === 'road'
          ? '#5c6170'
          : k === 'pond'
            ? '#5ab8e0'
            : r % 2
              ? '#9fd36b'
              : '#93ca5f';
      ctx.fillRect(0, y, S * C, S);
      if (k === 'road' && r < 11) {
        ctx.fillStyle = '#f5f5f5';
        for (let x = 0.3; x < C; x += 1.5) ctx.fillRect(x * S, y + S - 2, S * 0.7, 3);
      }
      if (k === 'pond') {
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 2;
        for (let x = 0; x < C; x += 2) {
          ctx.beginPath();
          ctx.arc((x + ((t * 0.3 + r) % 2)) * S, y + S / 2, S * 0.2, 0.2, 2.9);
          ctx.stroke();
        }
      }
    }
    for (const n of NESTS) {
      rr(n * S + S * 0.1, S * 0.15, S * 0.8, S * 0.7, S * 0.35, '#8a6a3d');
      rr(n * S + S * 0.2, S * 0.25, S * 0.6, S * 0.5, S * 0.3, '#b08a52');
      if (filled.has(n)) drawDuck(n * S + S / 2, S * 0.5, S * 0.8, true);
    }
    for (const k in lanes)
      for (const it of lanes[k].items) {
        const y = Number(k) * S;
        if (lanes[k].kind === 'pond') {
          if (it.pad)
            for (let i = 0; i < it.len; i++) {
              ctx.fillStyle = '#3f9b4a';
              ctx.beginPath();
              ctx.arc((it.x + i + 0.5) * S, y + S / 2, S * 0.42, 0.4, Math.PI * 2);
              ctx.lineTo((it.x + i + 0.5) * S, y + S / 2);
              ctx.fill();
            }
          else {
            rr(it.x * S + 2, y + S * 0.15, it.len * S - 4, S * 0.7, S * 0.35, '#8b5a2b');
            ctx.fillStyle = 'rgba(255,255,255,.15)';
            ctx.fillRect(it.x * S + 8, y + S * 0.3, it.len * S - 16, 2);
          }
        } else {
          const x = it.x * S,
            w = it.len * S;
          rr(x + 3, y + S * 0.14, w - 6, S * 0.72, S * 0.18, it.col);
          rr(
            x + (it.v > 0 ? w * 0.55 : w * 0.12),
            y + S * 0.22,
            w * 0.3,
            S * 0.56,
            S * 0.1,
            'rgba(255,255,255,.6)',
          );
          ctx.fillStyle = '#fff59d';
          const fx = it.v > 0 ? x + w - 6 : x + 3;
          ctx.fillRect(fx, y + S * 0.2, 3, S * 0.12);
          ctx.fillRect(fx, y + S * 0.68, 3, S * 0.12);
        }
      }
    if (state === 'play' || state === 'title') {
      const p = duck.hop,
        x = duck.x * (1 - p) + duck.fx * p + 0.5,
        y = duck.y * (1 - p) + duck.fy * p + 0.5;
      drawDuck(x * S, y * S, S, false);
      drawDuck(x * S + S * 0.28, y * S + S * 0.25, S * 0.55, true);
    }
    if (splat) {
      ctx.fillStyle =
        splat.why === 'water' ? 'rgba(255,255,255,.8)' : 'rgba(255,224,102,.9)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 7,
          d = deadT * S * 0.8;
        ctx.beginPath();
        ctx.arc(
          (splat.x + 0.5) * S + Math.cos(a) * d,
          (splat.y + 0.5) * S + Math.sin(a) * d,
          S * 0.1,
          0,
          7,
        );
        ctx.fill();
      }
    }
  }
  resetDuck();
  level = 1;
  filled = new Set();
  makeLanes();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
