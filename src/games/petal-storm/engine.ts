import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  time: HTMLElement;
  dew: HTMLElement;
  lives: HTMLElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
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
  function tone(f, d = 0.1, type = 'sine', v = 0.04, sl = 0) {
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
  let W, H, DPR;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  const TAU = Math.PI * 2,
    rand = (a, b) => a + Math.random() * (b - a);
  let state = 'title',
    bee = {
      x: 0,
      y: 0,
    },
    target = {
      x: 0,
      y: 0,
    },
    petals = [],
    dews = [],
    lives = 3,
    inv = 0,
    el = 0,
    dew = 0,
    pat = 0,
    patT = 0,
    spin = 0,
    keys = {} as KeyboardState,
    best = 0;
  try {
    best = +localStorage.getItem('petal-storm-best') || 0;
  } catch (e) {}
  const emitter = () => ({
    x: W / 2 + Math.sin(el * 0.4) * W * 0.25,
    y: Math.max(90, H * 0.16),
  });
  function fire(a, sp, kind = 0) {
    const e = emitter();
    petals.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(0, TAU),
      k: kind,
    });
  }

  function start() {
    state = 'play';
    petals = [];
    dews = [];
    lives = 3;
    inv = 1.5;
    el = 0;
    dew = 0;
    pat = 0;
    patT = 0;
    bee.x = target.x = W / 2;
    bee.y = target.y = H * 0.8;
    $('title').hidden = true;
    $('over').hidden = true;
    hud();
  }

  function hud() {
    $('lives').textContent = String('♥'.repeat(lives) + '♡'.repeat(3 - lives));
    $('dew').textContent = String(dew);
  }
  lifecycle.listen(cv, 'pointermove', (e) => {
    target.x = e.clientX;
    target.y = e.clientY - (e.pointerType === 'touch' ? 50 : 0);
  });
  lifecycle.listen(cv, 'pointerdown', (e) => {
    target.x = e.clientX;
    target.y = e.clientY - (e.pointerType === 'touch' ? 50 : 0);
  });
  lifecycle.listen(window, 'keydown', (e) => {
    keys[e.key] = true;
    if ((e.key === ' ' || e.key === 'Enter') && state !== 'play' && !e.repeat) {
      e.preventDefault();
      start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    keys[e.key] = false;
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function patterns(dt) {
    const lvl = Math.min(el / 90, 1),
      sp = 110 + lvl * 90;
    patT -= dt;
    spin += dt * (1.4 + lvl);
    if (patT > 0) return;
    pat = Math.floor(el / 6);
    const e = emitter();
    switch (pat % 4) {
      case 0:
        for (let k = 0; k < 2 + Math.floor(lvl * 2); k++)
          fire(spin + (k * TAU) / (2 + Math.floor(lvl * 2)), sp);
        patT = 0.09;
        break;
      case 1: {
        const n = 14 + Math.floor(lvl * 12),
          off = rand(0, TAU);
        for (let k = 0; k < n; k++) fire(off + (k * TAU) / n, sp * 0.9, 1);
        patT = 0.9 - lvl * 0.35;
        break;
      }
      case 2: {
        const a = Math.atan2(bee.y - e.y, bee.x - e.x);
        for (let k = -2; k <= 2; k++) fire(a + k * 0.16, sp * 1.15, 2);
        patT = 0.55 - lvl * 0.2;
        break;
      }
      case 3:
        for (let k = 0; k < 3; k++)
          (fire(-spin * 1.3 + (k * TAU) / 3, sp * 0.8, 1),
            fire(spin + (k * TAU) / 3, sp * 0.8));
        patT = 0.12;
        break;
    }
  }

  function update(dt) {
    if (state !== 'play') return;
    el += dt;
    inv -= dt;
    if (keys.ArrowLeft || keys.a) target.x -= 380 * dt;
    if (keys.ArrowRight || keys.d) target.x += 380 * dt;
    if (keys.ArrowUp || keys.w) target.y -= 380 * dt;
    if (keys.ArrowDown || keys.s) target.y += 380 * dt;
    target.x = Math.max(10, Math.min(W - 10, target.x));
    target.y = Math.max(H * 0.3, Math.min(H - 10, target.y));
    bee.x += (target.x - bee.x) * Math.min(1, dt * 18);
    bee.y += (target.y - bee.y) * Math.min(1, dt * 18);
    patterns(dt);
    if (Math.random() < dt * 0.6)
      dews.push({
        x: rand(30, W - 30),
        y: -10,
        vy: rand(50, 90),
      });
    for (const p of petals) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 3;
    }
    petals = petals.filter((p) => p.x > -30 && p.x < W + 30 && p.y > -30 && p.y < H + 30);
    for (const d of dews) d.y += d.vy * dt;
    dews = dews.filter((d) => {
      if (Math.hypot(d.x - bee.x, d.y - bee.y) < 20) {
        dew++;
        hud();
        tone(1320, 0.08, 'triangle', 0.05);
        return false;
      }
      return d.y < H + 20;
    });
    if (inv <= 0)
      for (const p of petals)
        if (Math.hypot(p.x - bee.x, p.y - bee.y) < 6) {
          lives--;
          inv = 2;
          hud();
          tone(200, 0.4, 'sawtooth', 0.05, 0.5);
          petals = petals.filter((q) => Math.hypot(q.x - bee.x, q.y - bee.y) > 90);
          if (lives <= 0) return end();
          break;
        }
    $('time').textContent = String(el.toFixed(1) + 's');
  }

  function end() {
    state = 'over';
    const score = Math.floor(el * 10) + dew * 25;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('petal-storm-best', String(best));
      } catch (e) {}
    }
    $('oText').textContent = String(
      `You lasted ${el.toFixed(1)} seconds and gathered ${dew} dewdrops, for a score of ${score}. Best: ${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }

  function petal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = ['#f48fb1', '#f8bbd0', '#ec407a'][p.k];
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.bezierCurveTo(6, -4, 6, 4, 0, 7);
    ctx.bezierCurveTo(-6, 4, -6, -4, 0, -7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(1.5, -3);
    ctx.lineTo(-1.5, -3);
    ctx.fill();
    ctx.restore();
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fdf1f4');
    g.addColorStop(1, '#e8f1fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const e =
      state === 'play'
        ? emitter()
        : {
            x: W / 2,
            y: Math.max(90, H * 0.16),
          };
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.x - 120, 0);
    ctx.quadraticCurveTo(e.x - 30, e.y - 50, e.x, e.y);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(e.x + 140, 0);
    ctx.quadraticCurveTo(e.x + 40, e.y - 30, e.x, e.y);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + now / 2000;
      ctx.fillStyle = i % 2 ? '#f8bbd0' : '#f48fb1';
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 18, 15, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#c2185b';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 9, 0, TAU);
    ctx.fill();
    for (const d of dews) {
      ctx.fillStyle = 'rgba(100,181,246,.8)';
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - 9);
      ctx.quadraticCurveTo(d.x + 7, d.y + 2, d.x, d.y + 6);
      ctx.quadraticCurveTo(d.x - 7, d.y + 2, d.x, d.y - 9);
      ctx.fill();
    }
    for (const p of petals) petal(p);
    if (state === 'play' && (inv <= 0 || Math.floor(inv * 10) % 2)) {
      const x = bee.x,
        y = bee.y,
        f = Math.sin(now / 20);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.ellipse(x - 6, y - 9, 7, 4 + f * 2, -0.5, 0, TAU);
      ctx.ellipse(x + 6, y - 9, 7, 4 + f * 2, 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.ellipse(x, y, 11, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3b2a33';
      ctx.fillRect(x - 3, y - 8, 3, 16);
      ctx.fillRect(x + 4, y - 7, 3, 14);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#c2185b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    lifecycle.requestAnimationFrame(draw);
  }
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    update(dt);
    lifecycle.requestAnimationFrame(loop);
  })(last);
  lifecycle.requestAnimationFrame(draw);
}
