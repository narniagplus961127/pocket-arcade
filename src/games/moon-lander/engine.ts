import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLElement;
  fuel: HTMLElement;
  alt: HTMLElement;
  hs: HTMLElement;
  vs: HTMLElement;
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
  let AC, eng, eg;
  function ac() {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return null;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function engOn() {
    const a = ac();
    if (!a || eng) return;
    const len = a.sampleRate,
      b = a.createBuffer(1, len, a.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    eng = a.createBufferSource();
    eng.buffer = b;
    eng.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    eg = a.createGain();
    eg.gain.value = 0;
    eng.connect(f).connect(eg).connect(a.destination);
    eng.start();
  }

  function tone(f, d = 0.2, type = 'square', v = 0.05) {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(),
      g = a.createGain(),
      t = a.currentTime;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const VW = 900,
    VH = 600;
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = Math.min(W / VW, H / VH);
    OX = (W - VW * S) / 2;
    OY = (H - VH * S) / 2;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  const rand = (a, b) => a + Math.random() * (b - a),
    G = 16;
  const stars = Array.from(
    {
      length: 120,
    },
    () => ({
      x: Math.random() * VW,
      y: Math.random() * VH * 0.7,
      r: Math.random() * 1.2,
    }),
  );
  let terrain,
    pads,
    ship,
    state = 'title',
    score = 0,
    fuel = 1000,
    keys = {} as KeyboardState,
    debris = [],
    round = 0;
  function genTerrain() {
    terrain = [];
    pads = [];
    const padSpots: Array<[number, number, number] & { done?: boolean }> = (
      [
        [rand(80, 220), 80, 1],
        [rand(380, 480), 50, 3],
        [rand(640, 760), 34, 5],
      ] as Array<[number, number, number]>
    ).sort(() => Math.random() - 0.5);
    let x = 0,
      y = rand(430, 520);
    while (x <= VW) {
      const p = padSpots.find((p) => !p.done && x >= p[0]);
      if (p) {
        p.done = true;
        terrain.push([x, y]);
        terrain.push([x + p[1], y]);
        pads.push({
          x0: x,
          x1: x + p[1],
          y,
          mult: p[2],
        });
        x += p[1] + 20;
        continue;
      }
      terrain.push([x, y]);
      x += rand(14, 34);
      y = Math.max(260, Math.min(575, y + rand(-46, 46)));
    }
  }

  function groundAt(x) {
    for (let i = 1; i < terrain.length; i++) {
      const [x0, y0] = terrain[i - 1],
        [x1, y1] = terrain[i];
      if (x >= x0 && x <= x1)
        return y0 + (y1 - y0) * ((x - x0) / Math.max(1e-6, x1 - x0));
    }
    return VH;
  }

  function launch() {
    genTerrain();
    ship = {
      x: rand(120, VW - 120),
      y: 60,
      vx: rand(-25, 25),
      vy: 0,
      a: 0,
    };
    debris = [];
    state = 'fly';
    $('title').hidden = true;
    $('over').hidden = true;
    engOn();
  }

  function newGame() {
    score = 0;
    fuel = 1000;
    round = 0;
    launch();
  }

  function land(msgT, msgB) {
    state = 'landed';
    $('oTitle').textContent = String(msgT);
    $('oText').textContent = String(msgB);
    $('over').hidden = false;
    $('again').focus();
  }
  $('play').onclick = newGame;
  $('again').onclick = () => {
    if (fuel <= 0 || $('again').dataset.reset) {
      delete $('again').dataset.reset;
      newGame();
    } else launch();
  };
  const KM = {
    ArrowLeft: 'left',
    a: 'left',
    ArrowRight: 'right',
    d: 'right',
    ArrowUp: 'thrust',
    w: 'thrust',
    ' ': 'thrust',
  };
  lifecycle.listen(window, 'keydown', (e) => {
    const k = KM[e.key];
    if (k) {
      e.preventDefault();
      keys[k] = true;
    }
    if (e.key === 'Enter' && state !== 'fly') {
      (state === 'title' ? $('play') : $('again')).click();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    const k = KM[e.key];
    if (k) keys[k] = false;
  });
  document.querySelectorAll<HTMLElement>('.touch button').forEach((b) => {
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      keys[b.dataset.k] = true;
      b.setPointerCapture(e.pointerId);
    });
    ['pointerup', 'pointercancel'].forEach((ev) =>
      lifecycle.listen(b, ev, () => (keys[b.dataset.k] = false)),
    );
  });
  function update(dt) {
    for (const d of debris) {
      d.vy += G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.r += d.vr * dt;
    }
    if (state !== 'fly') {
      if (eg) eg.gain.value = 0;
      return;
    }
    if (keys.left) ship.a -= 2.2 * dt;
    if (keys.right) ship.a += 2.2 * dt;
    ship.a = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ship.a));
    const burning = keys.thrust && fuel > 0;
    if (burning) {
      ship.vx += Math.sin(ship.a) * 38 * dt;
      ship.vy -= Math.cos(ship.a) * 38 * dt;
      fuel = Math.max(0, fuel - 60 * dt);
    }
    if (eg) eg.gain.value = burning ? 0.12 : 0;
    ship.vy += G * dt;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    if (ship.x < 0) ship.x += VW;
    if (ship.x > VW) ship.x -= VW;
    const feet = ship.y + 12,
      gy = Math.min(groundAt(ship.x - 9), groundAt(ship.x + 9));
    const alt = Math.max(0, groundAt(ship.x) - feet);
    $('fuel').textContent = String(Math.round(fuel));
    $('alt').textContent = String(Math.round(alt));
    $('hs').textContent = String(Math.round(ship.vx));
    $('vs').textContent = String(Math.round(ship.vy));
    $('score').textContent = String(score);
    $('vs').className = ship.vy > 18 ? 'warn' : 'ok';
    $('hs').className = Math.abs(ship.vx) > 12 ? 'warn' : 'ok';
    $('fuel').className = fuel < 150 ? 'warn' : '';
    if (feet >= gy) {
      const pad = pads.find((p) => ship.x - 8 >= p.x0 && ship.x + 8 <= p.x1);
      const soft = ship.vy < 18 && Math.abs(ship.vx) < 12 && Math.abs(ship.a) < 0.2;
      if (pad && soft) {
        ship.y = pad.y - 12;
        round++;
        const pts = Math.round((50 + fuel * 0.05) * pad.mult * (ship.vy < 8 ? 1.5 : 1));
        score += pts;
        fuel = Math.min(1000, fuel + 120);
        [523, 659, 784].forEach((f, i) =>
          lifecycle.setTimeout(() => tone(f, 0.2, 'triangle', 0.06), i * 100),
        );
        land(
          ship.vy < 8 ? 'a perfect landing' : 'the eagle has landed',
          `Touchdown at ${ship.vy.toFixed(1)} m/s on a ×${pad.mult} pad. +${pts} points, and the crew refuels you with 120. Score ${score}.`,
        );
      } else {
        for (let i = 0; i < 18; i++)
          debris.push({
            x: ship.x,
            y: ship.y,
            vx: rand(-60, 60),
            vy: rand(-80, -10),
            r: 0,
            vr: rand(-6, 6),
            s: rand(2, 7),
          });
        tone(70, 0.9, 'sawtooth', 0.1);
        let best = 0;
        try {
          best = +localStorage.getItem('moon-lander-best') || 0;
          if (score > best) {
            best = score;
            localStorage.setItem('moon-lander-best', String(best));
          }
        } catch (e) {}
        const why = !pad
          ? 'off the pad'
          : Math.abs(ship.a) >= 0.2
            ? 'not upright'
            : ship.vy >= 18
              ? `too fast (${ship.vy.toFixed(1)} m/s)`
              : 'drifting sideways';
        ship.dead = true;
        $('again').dataset.reset = '1';
        land(
          'crater formed',
          `You came down ${why}. Final score ${score} over ${round} landings. Best: ${best}.`,
        );
      }
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    ctx.fillStyle = '#f2f1ec';
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + s.r * 0.4;
      ctx.fillRect(s.x, s.y, s.r + 0.3, s.r + 0.3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5a7cbf';
    ctx.beginPath();
    ctx.arc(780, 90, 26, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e8eef7';
    ctx.beginPath();
    ctx.arc(772, 84, 8, 0, 7);
    ctx.arc(790, 98, 6, 0, 7);
    ctx.fill();
    if (terrain) {
      ctx.fillStyle = '#26262a';
      ctx.beginPath();
      ctx.moveTo(0, VH + 200);
      terrain.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(VW, VH + 200);
      ctx.fill();
      ctx.strokeStyle = '#d9d7d0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      terrain.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      for (const p of pads) {
        ctx.strokeStyle = '#ffb000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x0, p.y);
        ctx.lineTo(p.x1, p.y);
        ctx.stroke();
        ctx.fillStyle = '#ffb000';
        ctx.font = '600 12px "IBM Plex Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(`×${p.mult}`, (p.x0 + p.x1) / 2, p.y + 18);
      }
    }
    if (ship && !ship.dead) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.a);
      ctx.strokeStyle = '#f2f1ec';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -2);
      ctx.lineTo(-5, -10);
      ctx.lineTo(5, -10);
      ctx.lineTo(7, -2);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeRect(-9, -2, 18, 7);
      ctx.beginPath();
      ctx.moveTo(-7, 5);
      ctx.lineTo(-11, 12);
      ctx.moveTo(7, 5);
      ctx.lineTo(11, 12);
      ctx.moveTo(-13, 12);
      ctx.lineTo(-9, 12);
      ctx.moveTo(9, 12);
      ctx.lineTo(13, 12);
      ctx.stroke();
      if (state === 'fly' && keys.thrust && fuel > 0) {
        ctx.fillStyle = '#ffb000';
        ctx.beginPath();
        ctx.moveTo(-4, 6);
        ctx.lineTo(4, 6);
        ctx.lineTo(0, 14 + Math.random() * 12);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.strokeStyle = '#d9d7d0';
    for (const d of debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.r);
      ctx.strokeRect(-d.s / 2, -d.s / 2, d.s, d.s);
      ctx.restore();
    }
  }
  genTerrain();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
