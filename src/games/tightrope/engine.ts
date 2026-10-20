import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  dist: HTMLElement;
  best: HTMLElement;
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
  function tone(f, d = 0.2, type = 'triangle', v = 0.05, sl = 0) {
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
  const rand = (a, b) => a + Math.random() * (b - a);
  let state = 'title',
    ang = 0,
    angV = 0,
    input = 0,
    dist = 0,
    wind = 0,
    windT = 0,
    t = 0,
    fallT = 0,
    best = 0,
    keys = {} as KeyboardState,
    sideHold = 0,
    gust = null;
  try {
    best = +localStorage.getItem('tightrope-best') || 0;
  } catch (e) {}
  $('best').textContent = String(`${best} m`);
  function start() {
    state = 'play';
    ang = rand(-0.05, 0.05);
    angV = 0;
    dist = 0;
    wind = 0;
    windT = 1;
    fallT = 0;
    $('title').hidden = true;
    $('over').hidden = true;
    tone(523, 0.2);
    tone(659, 0.25);
  }

  function end() {
    state = 'falling';
    fallT = 0;
    tone(400, 0.8, 'sine', 0.07, 0.3);
    const m = Math.floor(dist);
    if (m > best) {
      best = m;
      try {
        localStorage.setItem('tightrope-best', String(best));
      } catch (e) {}
    }
    lifecycle.setTimeout(() => {
      state = 'over';
      $('best').textContent = String(`${best} m`);
      $('oText').textContent = String(
        `Zelda made it ${m} metres before the net caught her. Best walk: ${best} m. The crowd still cheers!`,
      );
      $('over').hidden = false;
      $('again').focus();
    }, 1200);
  }
  lifecycle.listen(window, 'keydown', (e) => {
    keys[e.key] = true;
    if (
      (e.key === ' ' || e.key === 'Enter') &&
      (state === 'title' || state === 'over') &&
      !e.repeat
    ) {
      e.preventDefault();
      start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    keys[e.key] = false;
  });
  document.querySelectorAll<HTMLElement>('.sides button').forEach((b) => {
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      sideHold = +b.dataset.s;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      lifecycle.listen(b, ev, () => (sideHold = 0)),
    );
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function update(dt) {
    t += dt;
    if (state === 'falling') {
      fallT += dt;
      ang += Math.sign(ang || 1) * dt * 3;
      return;
    }
    if (state !== 'play') return;
    const lvl = Math.min(dist / 300, 1);
    input =
      (keys.ArrowLeft || keys.a ? -1 : 0) +
      (keys.ArrowRight || keys.d ? 1 : 0) +
      sideHold;
    windT -= dt;
    if (windT <= 0) {
      windT = rand(1.5, 3.5) - lvl;
      gust = {
        dir: Math.random() < 0.5 ? -1 : 1,
        t: 1.2,
      };
      wind = gust.dir * rand(0.3, 0.8) * (1 + lvl * 1.5);
    }
    if (gust) {
      gust.t -= dt;
      if (gust.t <= 0) {
        gust = null;
        wind *= 0.3;
      }
    }
    // inverted pendulum: gravity amplifies the tilt, the player's lean pushes back
    const accel =
      Math.sin(ang) * (5 + lvl * 3) +
      wind * 0.9 +
      Math.sin(t * 1.7) * (0.25 + lvl * 0.6) +
      input * 4.2 -
      angV * 0.9;
    angV += accel * dt;
    ang += angV * dt;
    dist += dt * (2 + lvl * 1.5) * Math.max(0, 1 - Math.abs(ang) * 1.5);
    $('dist').textContent = String(`${Math.floor(dist)} m`);
    if (Math.floor(dist / 25) !== Math.floor((dist - dt * 3) / 25) && dist > 5) {
      tone(784, 0.1);
      tone(988, 0.15);
    }
    if (Math.abs(ang) > 1.0) end();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // tent stripes radiating from the top
    const cx = W / 2;
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = i % 2 ? '#b3202a' : '#f4e6cf';
      ctx.beginPath();
      ctx.moveTo(cx, -H * 0.2);
      const a0 = Math.PI * (i / 18),
        a1 = Math.PI * ((i + 1) / 18);
      ctx.lineTo(cx + Math.cos(a0) * W * 2, -H * 0.2 + Math.sin(a0) * H * 2);
      ctx.lineTo(cx + Math.cos(a1) * W * 2, -H * 0.2 + Math.sin(a1) * H * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(42,15,18,.45)';
    ctx.fillRect(0, 0, W, H);
    // spotlight
    const ry = H * 0.55;
    const g = ctx.createRadialGradient(
      cx,
      ry - 60,
      10,
      cx,
      ry - 60,
      Math.max(W, H) * 0.5,
    );
    g.addColorStop(0, 'rgba(255,240,200,.45)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // crowd
    ctx.fillStyle = '#1a0709';
    for (let x = 0; x < W; x += 22) {
      const b = Math.sin(t * 6 + x) * (state === 'play' ? 2 : 0);
      ctx.beginPath();
      ctx.arc(x + 11, H - 26 + b, 10, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x + 1, H - 26 + b, 20, 30);
    }
    // net
    ctx.strokeStyle = 'rgba(255,247,234,.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, H - 90);
      ctx.lineTo(x + 16, H - 70);
      ctx.moveTo(x + 16, H - 90);
      ctx.lineTo(x, H - 70);
      ctx.stroke();
    }
    // rope swaying
    const sway = Math.sin(t * 1.7) * 6;
    ctx.strokeStyle = '#f6c343';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, ry - 20);
    ctx.quadraticCurveTo(cx, ry + 14 + sway, W + 10, ry - 20);
    ctx.stroke();
    ctx.fillStyle = '#5a2a1a';
    ctx.fillRect(10, ry - 20, 12, H);
    ctx.fillRect(W - 22, ry - 20, 12, H);
    // performer
    const fy = state === 'falling' ? fallT * fallT * 500 : 0,
      px = cx,
      py = ry + 6 + sway * 0.6 + fy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    const step = state === 'play' ? Math.sin(t * 5) * 4 : 0;
    ctx.strokeStyle = '#2a0f12';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(-5 + step, 0);
    ctx.moveTo(0, -38);
    ctx.lineTo(5 - step, 0);
    ctx.stroke();
    ctx.fillStyle = '#e8457a';
    ctx.beginPath();
    ctx.moveTo(-12, -40);
    ctx.lineTo(12, -40);
    ctx.lineTo(8, -70);
    ctx.lineTo(-8, -70);
    ctx.fill();
    ctx.fillStyle = '#f2c6a0';
    ctx.beginPath();
    ctx.arc(0, -80, 9, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#2a0f12';
    ctx.beginPath();
    ctx.arc(0, -84, 9, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#f6c343';
    ctx.beginPath();
    ctx.moveTo(-6, -90);
    ctx.lineTo(0, -100);
    ctx.lineTo(6, -90);
    ctx.fill();
    ctx.strokeStyle = '#f4e6cf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-70, -54 + input * 4);
    ctx.lineTo(70, -54 - input * 4);
    ctx.stroke();
    ctx.fillStyle = '#b3202a';
    ctx.beginPath();
    ctx.arc(-70, -54 + input * 4, 5, 0, 7);
    ctx.arc(70, -54 - input * 4, 5, 0, 7);
    ctx.fill();
    ctx.restore();
    // balance gauge
    const gw = Math.min(280, W - 60),
      gx = cx - gw / 2,
      gy = H - 120;
    ctx.fillStyle = 'rgba(42,15,18,.8)';
    ctx.beginPath();
    ctx.roundRect(gx - 8, gy - 8, gw + 16, 22, 11);
    ctx.fill();
    const zone = 1 - Math.min(1, Math.abs(ang));
    ctx.fillStyle =
      Math.abs(ang) > 0.6 ? '#ff5a5a' : Math.abs(ang) > 0.3 ? '#f6c343' : '#7bd389';
    ctx.beginPath();
    ctx.arc(cx + (Math.max(-1, Math.min(1, ang)) * gw) / 2, gy + 3, 7, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,247,234,.6)';
    ctx.fillRect(cx - 1, gy - 4, 2, 14);
    if (gust && state === 'play') {
      ctx.fillStyle = 'rgba(255,247,234,.7)';
      ctx.font = '700 14px Barlow';
      ctx.textAlign = 'center';
      ctx.fillText(gust.dir > 0 ? 'gust →' : '← gust', cx, ry - 140);
    }
  }
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
