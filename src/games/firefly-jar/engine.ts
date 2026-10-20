import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  count: HTMLSpanElement;
  streak: HTMLSpanElement;
  time: HTMLSpanElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  oTitle: HTMLElement;
  oText: HTMLElement;
  oBest: HTMLElement;
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
  let W, H, DPR, JAR;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    JAR = {
      x: W / 2,
      y: H - 70,
    };
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  let AC = null;
  function tone(f, d = 0.2, type = 'sine', v = 0.06, slide = 0) {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(),
      g = AC.createGain(),
      t0 = AC.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const grass = Array.from(
    {
      length: 140,
    },
    () => ({
      x: Math.random(),
      h: rand(30, 90),
      lean: rand(-0.3, 0.3),
      ph: rand(0, TAU),
    }),
  );
  const stars = Array.from(
    {
      length: 80,
    },
    () => ({
      x: Math.random(),
      y: Math.random() * 0.5,
      r: rand(0.4, 1.3),
      ph: rand(0, TAU),
    }),
  );
  const trees = Array.from(
    {
      length: 7,
    },
    (_, i) => ({
      x: i / 6 + rand(-0.05, 0.05),
      h: rand(0.25, 0.45),
      w: rand(50, 90),
    }),
  );
  let state = 'title',
    bugs = [],
    flying = [],
    jarGlows = [],
    rings = [],
    texts = [],
    count = 0,
    points = 0,
    timeLeft = 60,
    streak = 1,
    lastCatch = -9,
    t = 0,
    best = 0;
  try {
    best = +localStorage.getItem('firefly-jar-best') || 0;
  } catch (e) {}

  function makeBug(kind?) {
    const k = kind || (Math.random() < 0.14 ? 'moth' : 'fly');
    return {
      kind: k,
      x: rand(30, W - 30),
      y: rand(H * 0.12, H * 0.72),
      a: rand(0, TAU),
      sp: k === 'moth' ? rand(60, 90) : k === 'gold' ? rand(70, 100) : rand(30, 60),
      on: Math.random() < 0.4,
      timer: rand(0.2, 2),
      glow: 0,
      flap: rand(0, TAU),
    };
  }

  function populate() {
    bugs = [];
    for (let i = 0; i < 12; i++) bugs.push(makeBug());
  }

  function start() {
    if (state === 'play') return;
    state = 'play';
    count = 0;
    points = 0;
    timeLeft = 60;
    streak = 1;
    lastCatch = -9;
    flying = [];
    jarGlows = [];
    texts = [];
    rings = [];
    populate();
    hud();
    $('title').hidden = true;
    $('over').hidden = true;
    tone(523, 0.3, 'triangle', 0.05);
  }

  function end() {
    state = 'over';
    if (points > best) {
      best = points;
      try {
        localStorage.setItem('firefly-jar-best', String(best));
      } catch (e) {}
    }
    $('oTitle').textContent = String(
      points >= 60
        ? 'A lantern of a jar'
        : points >= 30
          ? 'A glowing jar'
          : 'A few little lights',
    );
    $('oText').textContent = String(`${count} fireflies caught, worth ${points} points.`);
    $('oBest').textContent = String(`Best jar: ${best} points`);
    $('over').hidden = false;
    $('again').focus();
  }

  function hud() {
    $('count').textContent = String(points);
    $('streak').textContent = String(`×${streak}`);
    $('time').textContent = String(Math.ceil(timeLeft));
    $('time').classList.toggle('low', timeLeft < 10);
  }
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    if (state !== 'play') return;
    const x = e.clientX,
      y = e.clientY;
    let bestB = null,
      bd = 40;
    for (const b of bugs) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd && (b.kind === 'moth' || b.glow > 0.3)) {
        bd = d;
        bestB = b;
      }
    }
    rings.push({
      x,
      y,
      r: 4,
      life: 0.4,
    });
    if (!bestB) return;
    bugs.splice(bugs.indexOf(bestB), 1);
    if (bestB.kind === 'moth') {
      timeLeft = Math.max(0, timeLeft - 4);
      streak = 1;
      texts.push({
        x,
        y,
        txt: '−4 s',
        c: '#b9a9c9',
        life: 1,
      });
      tone(160, 0.35, 'sawtooth', 0.05, 0.6);
      lifecycle.setTimeout(() => bugs.push(makeBug()), 1500);
    } else {
      streak = t - lastCatch < 1.3 ? Math.min(streak + 1, 6) : 1;
      lastCatch = t;
      const pts = bestB.kind === 'gold' ? 5 * streak : streak;
      points += pts;
      count++;
      if (bestB.kind === 'gold') {
        timeLeft += 3;
        texts.push({
          x,
          y: y - 18,
          txt: '+3 s',
          c: '#ffcf4a',
          life: 1.2,
        });
      }
      texts.push({
        x,
        y,
        txt: `+${pts}`,
        c: bestB.kind === 'gold' ? '#ffcf4a' : '#efff8a',
        life: 1,
      });
      flying.push({
        x,
        y,
        sx: x,
        sy: y,
        p: 0,
        gold: bestB.kind === 'gold',
      });
      const n = PENTA[Math.min(PENTA.length - 1, streak + (count % 3))];
      tone(523 * Math.pow(2, n / 12), 0.25, 'sine', 0.06);
      tone(523 * Math.pow(2, (n + 7) / 12), 0.3, 'triangle', 0.025);
      lifecycle.setTimeout(
        () => {
          if (state === 'play') bugs.push(makeBug(Math.random() < 0.08 ? 'gold' : null));
        },
        rand(300, 900),
      );
    }
    hud();
  });
  lifecycle.listen(window, 'keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') {
      e.preventDefault();
      start();
    }
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function update(dt) {
    t += dt;
    if (state === 'play') {
      timeLeft -= dt;
      if (t - lastCatch > 1.3 && streak > 1) {
        streak = 1;
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        hud();
        end();
      } else if (Math.floor(timeLeft * 10) % 3 === 0) hud();
    }
    for (const b of bugs) {
      b.a += rand(-2.5, 2.5) * dt;
      b.flap += dt * 30;
      b.x += Math.cos(b.a) * b.sp * dt;
      b.y += Math.sin(b.a) * b.sp * dt * 0.7;
      if (b.x < 20 || b.x > W - 20) {
        b.a = Math.PI - b.a;
        b.x = Math.max(20, Math.min(W - 20, b.x));
      }
      if (b.y < H * 0.1 || b.y > H * 0.75) {
        b.a = -b.a;
        b.y = Math.max(H * 0.1, Math.min(H * 0.75, b.y));
      }
      if (b.kind !== 'moth') {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.on = !b.on;
          b.timer = b.on
            ? b.kind === 'gold'
              ? rand(1.4, 1.9)
              : rand(0.9, 1.4)
            : rand(1, 2.6);
        }
        b.glow += ((b.on ? 1 : 0) - b.glow) * Math.min(1, dt * 9);
      }
    }
    if (
      state === 'play' &&
      bugs.filter((b) => b.kind !== 'moth').length < 9 &&
      Math.random() < dt
    )
      bugs.push(makeBug(Math.random() < 0.06 ? 'gold' : null));
    for (const f of flying) {
      f.p += dt * 1.6;
      const p = Math.min(1, f.p),
        e = p * p * (3 - 2 * p);
      f.x = f.sx + (JAR.x - f.sx) * e + Math.sin(p * Math.PI) * 40;
      f.y = f.sy + (JAR.y - 10 - f.sy) * e - Math.sin(p * Math.PI) * 60;
      if (f.p >= 1)
        jarGlows.push({
          dx: rand(-22, 22),
          dy: rand(-28, 20),
          ph: rand(0, TAU),
          gold: f.gold,
        });
    }
    flying = flying.filter((f) => f.p < 1);
    for (const r of rings) {
      r.r += 90 * dt;
      r.life -= dt;
    }
    rings = rings.filter((r) => r.life > 0);
    for (const x of texts) {
      x.y -= 30 * dt;
      x.life -= dt;
    }
    texts = texts.filter((x) => x.life > 0);
  }

  function glowDot(x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${a})`);
    g.addColorStop(0.25, `rgba(${color},${a * 0.55})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1424');
    sky.addColorStop(0.55, '#10261f');
    sky.addColorStop(1, '#0b1a17');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.fillStyle = `rgba(238,244,228,${0.3 + 0.4 * Math.sin(t * 1.5 + s.ph) ** 2})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,248,214,.9)';
    ctx.beginPath();
    ctx.arc(W * 0.82, H * 0.14, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0a1424';
    ctx.beginPath();
    ctx.arc(W * 0.82 + 9, H * 0.14 - 5, 20, 0, TAU);
    ctx.fill();
    // tree line
    ctx.fillStyle = '#081310';
    for (const tr of trees) {
      const bx = tr.x * W,
        by = H * 0.78,
        th = tr.h * H;
      ctx.beginPath();
      ctx.moveTo(bx - tr.w / 2, by);
      ctx.lineTo(bx, by - th);
      ctx.lineTo(bx + tr.w / 2, by);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - tr.w * 0.6, by - th * 0.3);
      ctx.lineTo(bx, by - th * 0.85);
      ctx.lineTo(bx + tr.w * 0.6, by - th * 0.3);
      ctx.fill();
    }
    ctx.fillStyle = '#0f2219';
    ctx.fillRect(0, H * 0.78, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bugs) {
      if (b.kind === 'moth') continue;
      const col = b.kind === 'gold' ? '255,207,74' : '239,255,138';
      if (b.glow > 0.02)
        glowDot(
          b.x,
          b.y,
          (b.kind === 'gold' ? 34 : 26) * (0.6 + b.glow * 0.4),
          col,
          b.glow,
        );
      ctx.fillStyle = `rgba(${col},${0.25 + b.glow * 0.75})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.4, 0, TAU);
      ctx.fill();
    }
    for (const f of flying)
      glowDot(f.x, f.y, 22, f.gold ? '255,207,74' : '239,255,138', 1);
    ctx.globalCompositeOperation = 'source-over';
    for (const b of bugs) {
      if (b.kind !== 'moth') continue;
      const w = 8 + Math.abs(Math.sin(b.flap)) * 6;
      ctx.fillStyle = 'rgba(185,169,201,.85)';
      ctx.beginPath();
      ctx.ellipse(b.x - w / 2, b.y, w / 2, 6, -0.3, 0, TAU);
      ctx.ellipse(b.x + w / 2, b.y, w / 2, 6, 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5b4f66';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 2.2, 6, 0, 0, TAU);
      ctx.fill();
    }
    // grass
    ctx.strokeStyle = '#173126';
    ctx.lineWidth = 2;
    for (const g of grass) {
      const x = g.x * W,
        sway = Math.sin(t * 1.4 + g.ph) * 6;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(
        x + g.lean * 20,
        H - g.h * 0.6,
        x + g.lean * 30 + sway,
        H - g.h,
      );
      ctx.stroke();
    }
    // jar
    const jw = 64,
      jh = 84,
      jx = JAR.x - jw / 2,
      jy = JAR.y - jh / 2;
    const fill = Math.min(1, jarGlows.length / 40);
    glowDot(JAR.x, JAR.y, 70 + fill * 60, '239,255,138', 0.12 + fill * 0.35);
    ctx.fillStyle = 'rgba(200,230,220,.12)';
    ctx.strokeStyle = 'rgba(220,240,230,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(jx, jy, jw, jh, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a7a4a';
    ctx.beginPath();
    ctx.roundRect(jx + 6, jy - 12, jw - 12, 14, 4);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of jarGlows.slice(-60)) {
      const x = JAR.x + g.dx + Math.sin(t * 2 + g.ph) * 4,
        y = JAR.y + g.dy + Math.cos(t * 1.7 + g.ph) * 4,
        a = 0.5 + 0.5 * Math.sin(t * 3 + g.ph);
      glowDot(x, y, 10, g.gold ? '255,207,74' : '239,255,138', a);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(jx + 8, jy + 10, 5, jh - 24);
    for (const r of rings) {
      ctx.strokeStyle = `rgba(238,244,228,${r.life * 1.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.font = '700 30px "Amatic SC", cursive';
    ctx.textAlign = 'center';
    for (const x of texts) {
      ctx.globalAlpha = Math.min(1, x.life);
      ctx.fillStyle = x.c;
      ctx.fillText(x.txt, x.x, x.y - 16);
    }
    ctx.globalAlpha = 1;
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  populate();
  lifecycle.requestAnimationFrame(frame);
}
