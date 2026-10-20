import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLSpanElement;
  lives: HTMLDivElement;
  best: HTMLSpanElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  sScore: HTMLSpanElement;
  sTime: HTMLSpanElement;
  sBest: HTMLSpanElement;
  again: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  const TAU = Math.PI * 2,
    rand = (a, b) => a + Math.random() * (b - a);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, DPR;
  const L = {
    x: 0,
    y: 0,
  };
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    L.x = W / 2;
    L.y = H - Math.max(70, H * 0.11);
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  const reefR = () => Math.min(140, Math.max(95, W * 0.25));
  let AC = null;
  function tone(f, d = 0.2, type = 'sine', v = 0.08, slide = 0, delay = 0) {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(),
      g = AC.createGain(),
      t0 = AC.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }
  const KINDS = [
    {
      size: 9,
      speed: [58, 76],
      need: 0.35,
      pts: 1,
    },
    {
      size: 14,
      speed: [40, 52],
      need: 0.8,
      pts: 2,
    },
    {
      size: 22,
      speed: [27, 34],
      need: 1.5,
      pts: 4,
    },
  ];
  let best = 0;
  try {
    best = +localStorage.getItem('beam-keeper-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  let state = 'title',
    ships = [],
    parts = [],
    texts = [],
    score = 0,
    lives = 3,
    t = 0,
    spawnT = 1,
    aim = -Math.PI / 2,
    aimTarget = aim,
    shake = 0;
  const keys = {} as KeyboardState;
  const waves = Array.from(
    {
      length: 70,
    },
    () => ({
      x: Math.random(),
      y: Math.random(),
      w: rand(8, 22),
      s: rand(4, 12),
      p: rand(0, TAU),
    }),
  );
  const rocks = Array.from(
    {
      length: 15,
    },
    (_, i) => ({
      a: -Math.PI + 0.1 + (i / 14) * (Math.PI - 0.2) + rand(-0.05, 0.05),
      r: rand(8, 15),
      off: rand(-8, 8),
      v: Array.from(
        {
          length: 6,
        },
        (_, j) => rand(0.7, 1.15),
      ),
    }),
  );
  function clampAim(a) {
    if (a > 0) a = a < Math.PI / 2 ? -0.04 : -Math.PI + 0.04;
    return Math.min(-0.04, Math.max(-Math.PI + 0.04, a));
  }

  function point(e) {
    aimTarget = clampAim(Math.atan2(e.clientY - L.y, e.clientX - L.x));
  }
  lifecycle.listen(cv, 'pointermove', point);
  lifecycle.listen(cv, 'pointerdown', point);
  lifecycle.listen(window, 'keydown', (e) => {
    keys[e.key] = true;
    if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') {
      e.preventDefault();
      start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    keys[e.key] = false;
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function start() {
    if (state === 'play') return;
    state = 'play';
    ships = [];
    parts = [];
    texts = [];
    score = 0;
    lives = 3;
    t = 0;
    spawnT = 0.8;
    $('title').hidden = true;
    $('over').hidden = true;
    hud();
    tone(220, 0.5, 'triangle', 0.06);
    tone(330, 0.6, 'triangle', 0.05, 0, 0.15);
  }

  function hud() {
    $('score').textContent = String(score);
    $('lives').textContent = String(
      [0, 1, 2].map((i) => (i < lives ? '●' : '○')).join(' '),
    );
  }

  function end() {
    state = 'over';
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('beam-keeper-best', String(best));
      } catch (e) {}
    }
    $('best').textContent = String(best);
    $('sScore').textContent = String(score);
    $('sBest').textContent = String(best);
    $('sTime').textContent = String(
      `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
    );
    $('over').hidden = false;
    $('again').focus();
  }

  function spawn() {
    const lvl = Math.min(t / 90, 1);
    const r = Math.random(),
      kind = KINDS[r < 0.55 - lvl * 0.15 ? 0 : r < 0.87 - lvl * 0.1 ? 1 : 2];
    const a = rand(-Math.PI + 0.14, -0.14);
    // start just beyond the screen edge along this bearing
    const c = Math.cos(a),
      sn = Math.sin(a);
    const D =
      Math.min(-L.y / sn, c > 0 ? (W - L.x) / c : c < 0 ? -L.x / c : Infinity) + 30;
    const sp =
      rand(...(kind.speed as [number, number])) * (1 + Math.min(t * 0.006, 0.85));
    ships.push({
      ...kind,
      x: L.x + Math.cos(a) * D,
      y: L.y + Math.sin(a) * D,
      h: a + Math.PI + rand(-0.1, 0.1),
      sp,
      lit: 0,
      saved: false,
      turn: 1,
      bob: rand(0, TAU),
    });
  }
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  function update(dt) {
    t += state === 'play' ? dt : 0;
    if (keys.ArrowLeft || keys.a) aimTarget = clampAim(aimTarget - 2.4 * dt);
    if (keys.ArrowRight || keys.d) aimTarget = clampAim(aimTarget + 2.4 * dt);
    aim += (aimTarget - aim) * Math.min(1, dt * 14);
    if (state === 'play') {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawn();
        spawnT = Math.max(0.75, 2.8 - t * 0.022) * rand(0.7, 1.25);
      }
    }
    for (let i = ships.length - 1; i >= 0; i--) {
      const s = ships[i];
      const dx = s.x - L.x,
        dy = s.y - L.y,
        d = Math.hypot(dx, dy),
        sa = Math.atan2(dy, dx);
      if (!s.saved) {
        const diff = angDiff(sa, aim),
          hw = 0.2 + s.size / Math.max(d, 1);
        if (Math.abs(diff) < hw && state === 'play') {
          s.lit += dt;
          if (Math.random() < 0.3) tone(900 + s.lit * 400, 0.03, 'sine', 0.01);
        } else s.lit = Math.max(0, s.lit - dt * 0.45);
        if (s.lit >= s.need) {
          s.saved = true;
          s.turn = Math.sign(angDiff(sa, s.h + Math.PI)) || 1;
          score += s.pts;
          hud();
          texts.push({
            x: s.x,
            y: s.y - 24,
            txt: `+${s.pts}`,
            life: 1.2,
          });
          tone(s.size > 18 ? 98 : s.size > 12 ? 131 : 175, 0.7, 'sawtooth', 0.045);
          tone(s.size > 18 ? 147 : 196, 0.7, 'triangle', 0.04);
        }
        if (d < reefR() + s.size * 0.5) {
          ships.splice(i, 1);
          lives--;
          hud();
          for (let k = 0; k < 40; k++) {
            const a = rand(0, TAU),
              v = rand(30, 160);
            parts.push({
              x: s.x,
              y: s.y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              life: rand(0.5, 1.2),
              c: k % 3 ? '#ff7a5c' : '#ffd77a',
            });
          }
          if (!reduce) shake = 10;
          tone(80, 0.8, 'sawtooth', 0.09, 0.4);
          tone(55, 1, 'square', 0.05, 0.5);
          if (lives <= 0 && state === 'play') end();
          continue;
        }
      } else {
        const away = sa;
        s.h += Math.max(-1.8 * dt, Math.min(1.8 * dt, angDiff(away, s.h)));
        s.sp = Math.min(s.sp * (1 + dt * 0.4), 120);
        if (s.x < -80 || s.x > W + 80 || s.y < -80) {
          ships.splice(i, 1);
          continue;
        }
      }
      s.x += Math.cos(s.h) * s.sp * dt;
      s.y += Math.sin(s.h) * s.sp * dt;
      s.bob += dt * 2;
    }
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const x of texts) {
      x.y -= 26 * dt;
      x.life -= dt;
    }
    texts = texts.filter((x) => x.life > 0);
    shake *= Math.exp(-dt * 6);
  }

  function drawShip(s) {
    ctx.save();
    ctx.translate(s.x, s.y + Math.sin(s.bob) * 1.2);
    ctx.rotate(s.h);
    const lit = s.lit > 0 || s.saved,
      L2 = s.size * 1.1,
      w = s.size * 0.42;
    // wake
    ctx.strokeStyle = 'rgba(200,235,230,.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-L2, -w * 0.8);
    ctx.lineTo(-L2 - 30, -w * 2.2);
    ctx.moveTo(-L2, w * 0.8);
    ctx.lineTo(-L2 - 30, w * 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(L2, 0);
    ctx.quadraticCurveTo(L2 * 0.4, -w * 1.2, -L2, -w);
    ctx.lineTo(-L2, w);
    ctx.quadraticCurveTo(L2 * 0.4, w * 1.2, L2, 0);
    ctx.fillStyle = lit ? '#efe2c6' : '#3a666c';
    ctx.fill();
    ctx.fillStyle = lit ? '#b8553e' : '#22454a';
    ctx.fillRect(-L2 * 0.45, -w * 0.55, L2 * 0.7, w * 1.1);
    ctx.restore();
    // lantern
    ctx.fillStyle = `rgba(255,179,71,${0.55 + 0.45 * Math.sin(s.bob * 2)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.2, 0, TAU);
    ctx.fill();
    if (!s.saved && s.lit > 0) {
      ctx.strokeStyle = '#ffd77a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size + 9, -Math.PI / 2, -Math.PI / 2 + (s.lit / s.need) * TAU);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#031419');
    g.addColorStop(1, '#08303a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    const now = performance.now() / 1000;
    ctx.strokeStyle = 'rgba(143,179,173,.16)';
    ctx.lineWidth = 1.2;
    for (const w of waves) {
      const x = ((w.x * W + now * w.s) % (W + 40)) - 20,
        y = w.y * H + Math.sin(now + w.p) * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w.w / 2, y - 3, x + w.w, y);
      ctx.stroke();
    }
    // reef
    const R = reefR();
    for (const r of rocks) {
      const cx = L.x + Math.cos(r.a) * (R + r.off),
        cy = L.y + Math.sin(r.a) * (R + r.off);
      ctx.fillStyle = 'rgba(234,244,240,.08)';
      ctx.beginPath();
      ctx.arc(cx, cy, r.r + 4 + Math.sin(now * 2 + r.a * 5) * 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1d2a2c';
      ctx.beginPath();
      r.v.forEach((m, j) => {
        const a = (j / 6) * TAU;
        const px = cx + Math.cos(a) * r.r * m,
          py = cy + Math.sin(a) * r.r * m * 0.8;
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }
    for (const s of ships) drawShip(s);
    // beam
    ctx.globalCompositeOperation = 'lighter';
    const range = Math.hypot(W, H),
      hw = 0.2;
    const bg = ctx.createRadialGradient(L.x, L.y - 40, 10, L.x, L.y - 40, range);
    bg.addColorStop(0, 'rgba(255,215,122,.5)');
    bg.addColorStop(0.5, 'rgba(255,215,122,.12)');
    bg.addColorStop(1, 'rgba(255,215,122,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(L.x, L.y - 40);
    ctx.arc(L.x, L.y - 40, range, aim - hw, aim + hw);
    ctx.closePath();
    ctx.fill();
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // island and tower
    ctx.fillStyle = '#0f1d1f';
    ctx.beginPath();
    ctx.ellipse(L.x, L.y + 30, 80, 46, 0, Math.PI, TAU);
    ctx.lineTo(L.x + 80, H);
    ctx.lineTo(L.x - 80, H);
    ctx.fill();
    const tw = 14,
      th = 52,
      bx = L.x,
      by = L.y + 4;
    for (let i = 0; i < 4; i++) {
      const y0 = by - (i * th) / 4,
        y1 = y0 - th / 4,
        w0 = tw - i * 1.6,
        w1 = tw - (i + 1) * 1.6;
      ctx.fillStyle = i % 2 ? '#e8e2d4' : '#b8553e';
      ctx.beginPath();
      ctx.moveTo(bx - w0, y0);
      ctx.lineTo(bx + w0, y0);
      ctx.lineTo(bx + w1, y1);
      ctx.lineTo(bx - w1, y1);
      ctx.fill();
    }
    const lg = ctx.createRadialGradient(L.x, L.y - 54, 0, L.x, L.y - 54, 30);
    lg.addColorStop(0, 'rgba(255,240,190,1)');
    lg.addColorStop(0.3, 'rgba(255,215,122,.6)');
    lg.addColorStop(1, 'rgba(255,215,122,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(L.x, L.y - 54, 30, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d2a2c';
    ctx.beginPath();
    ctx.moveTo(L.x - 10, L.y - 60);
    ctx.lineTo(L.x, L.y - 70);
    ctx.lineTo(L.x + 10, L.y - 60);
    ctx.fill();
    ctx.font = '900 20px "Alegreya Sans SC", Georgia, serif';
    ctx.textAlign = 'center';
    for (const x of texts) {
      ctx.globalAlpha = Math.min(1, x.life);
      ctx.fillStyle = '#ffd77a';
      ctx.fillText(x.txt, x.x, x.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  for (let i = 0; i < 3; i++) spawn();
  lifecycle.requestAnimationFrame(frame);
}
