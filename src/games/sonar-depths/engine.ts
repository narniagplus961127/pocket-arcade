import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  dist: HTMLSpanElement;
  pearls: HTMLSpanElement;
  best: HTMLSpanElement;
  ping: HTMLButtonElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  cause: HTMLElement;
  sScore: HTMLSpanElement;
  sPearls: HTMLSpanElement;
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
  const VH = 600;
  let W, H, DPR, S, VW;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = H / VH;
    VW = W / S;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
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

  function tone(f, d = 0.3, type = 'sine', v = 0.08, slide = 0) {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(),
      g = a.createGain(),
      t0 = a.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }
  const STEP = 10;
  let best = 0;
  try {
    best = +localStorage.getItem('sonar-depths-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  let state = 'title',
    cols,
    mines,
    pearls,
    rings,
    bubbles,
    sub,
    camX,
    dist,
    pearlCount,
    autoT,
    manualCD,
    now = 0,
    holding = false,
    deadT = 0;
  let center, cTarget, genX, nextObj;
  function gen(x) {
    const gap = Math.max(165, 330 - x * 0.012);
    if (Math.random() < 0.02) cTarget = rand(150, 450);
    center += (cTarget - center) * 0.04;
    const top = Math.max(16, center - gap / 2),
      bot = Math.min(VH - 16, center + gap / 2);
    const jag = () => rand(-6, 6);
    cols.push({
      x,
      top: top + jag(),
      bot: bot + jag(),
      tt: -9,
      bt: -9,
      tid: -1,
      bid: -1,
    });
    if (x > nextObj) {
      nextObj = x + rand(220, 380) - Math.min(x * 0.01, 120);
      const y = rand(top + 34, bot - 34);
      if (x > 600 && Math.random() < 0.62)
        mines.push({
          x,
          y,
          t: -9,
          id: -1,
          ph: rand(0, TAU),
        });
      else
        pearls.push({
          x,
          y,
          t: -9,
          id: -1,
        });
    }
  }

  function reset() {
    cols = [];
    mines = [];
    pearls = [];
    rings = [];
    bubbles = [];
    center = 300;
    cTarget = 300;
    nextObj = 500;
    genX = 0;
    while (genX < VW + 400) {
      gen(genX);
      genX += STEP;
    }
    sub = {
      x: 160,
      y: 300,
      vy: 0,
    };
    camX = 0;
    dist = 0;
    pearlCount = 0;
    autoT = 0.3;
    manualCD = 0;
    deadT = 0;
  }
  let ringId = 0;
  function ping(manual) {
    rings.push({
      x: sub.x,
      y: sub.y,
      r: 0,
      id: ++ringId,
    });
    tone(manual ? 1180 : 980, 0.9, 'sine', 0.07, 0.82);
    if (manual) {
      manualCD = 0.9;
      $('ping').disabled = true;
    }
  }

  function start() {
    if (state === 'play') return;
    ac();
    reset();
    state = 'play';
    $('title').hidden = true;
    $('over').hidden = true;
  }

  function die(cause) {
    if (state !== 'play') return;
    state = 'dying';
    $('cause').textContent = String(cause);
    rings.push({
      x: sub.x,
      y: sub.y,
      r: 0,
      id: ++ringId,
      big: true,
    });
    tone(70, 1.2, 'sawtooth', 0.1, 0.4);
    tone(140, 0.8, 'square', 0.04, 0.3);
    for (let i = 0; i < 30; i++)
      bubbles.push({
        x: sub.x,
        y: sub.y,
        vx: rand(-80, 80),
        vy: rand(-140, 20),
        life: rand(0.6, 1.4),
      });
  }

  function score() {
    return Math.floor(dist / 10) + pearlCount * 50;
  }

  function end() {
    state = 'over';
    const s = score();
    if (s > best) {
      best = s;
      try {
        localStorage.setItem('sonar-depths-best', String(best));
      } catch (e) {}
    }
    $('best').textContent = String(best);
    $('sScore').textContent = String(s);
    $('sPearls').textContent = String(pearlCount);
    $('sBest').textContent = String(best);
    $('over').hidden = false;
    $('again').focus();
  }
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    holding = true;
    if (state !== 'play') return;
  });
  lifecycle.listen(window, 'pointerup', () => {
    holding = false;
  });
  lifecycle.listen(window, 'pointercancel', () => {
    holding = false;
  });
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      e.preventDefault();
      if (state === 'title' || state === 'over') {
        if (!e.repeat) start();
        return;
      }
      holding = true;
    }
    if ((e.key === 'e' || e.key === 'E') && state === 'play' && manualCD <= 0) ping(true);
  });
  lifecycle.listen(window, 'keyup', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') holding = false;
  });
  lifecycle.listen($('ping'), 'pointerdown', (e) => {
    e.stopPropagation();
  });
  lifecycle.listen($('ping'), 'click', () => {
    if (state === 'play' && manualCD <= 0) ping(true);
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function colAt(x) {
    const i = Math.floor((x - cols[0].x) / STEP);
    return cols[Math.max(0, Math.min(cols.length - 1, i))];
  }

  function update(dt) {
    now += dt;
    if (state === 'play') {
      const speed = Math.min(140 + dist * 0.006, 270);
      sub.x += speed * dt;
      dist += speed * dt;
      sub.vy += (holding ? -720 : 480) * dt;
      sub.vy = Math.max(-300, Math.min(300, sub.vy));
      sub.y += sub.vy * dt;
      autoT -= dt;
      if (autoT <= 0) {
        ping(false);
        autoT = 2.4;
      }
      manualCD -= dt;
      if (manualCD <= 0) $('ping').disabled = false;
      const c = colAt(sub.x);
      if (sub.y - 8 < c.top || sub.y + 8 > c.bot) die('Scraped the trench wall');
      for (const m of mines)
        if (Math.hypot(m.x - sub.x, m.y + Math.sin(now * 2 + m.ph) * 6 - sub.y) < 20)
          die('Struck a mine');
      for (let i = pearls.length - 1; i >= 0; i--) {
        const p = pearls[i];
        if (Math.hypot(p.x - sub.x, p.y - sub.y) < 22) {
          pearls.splice(i, 1);
          pearlCount++;
          tone(880, 0.2, 'triangle', 0.07);
          tone(1320, 0.3, 'sine', 0.05);
        }
      }
      if (Math.random() < 0.3)
        bubbles.push({
          x: sub.x - 18,
          y: sub.y + rand(-3, 3),
          vx: rand(-40, -10),
          vy: rand(-30, -10),
          life: rand(0.4, 0.9),
        });
      $('dist').textContent = String(`${Math.floor(dist / 10)} m`);
      $('pearls').textContent = String(pearlCount);
    } else if (state === 'dying') {
      deadT += dt;
      if (deadT > 1.3) end();
    } else {
      sub.x += 120 * dt;
      sub.y = 300 + Math.sin(now) * 40;
      autoT -= dt;
      if (autoT <= 0) {
        rings.push({
          x: sub.x,
          y: sub.y,
          r: 0,
          id: ++ringId,
        });
        autoT = 2.4;
      }
    }
    camX = sub.x - Math.min(VW * 0.28, 190);
    while (genX < camX + VW + 300) {
      gen(genX);
      genX += STEP;
    }
    while (cols.length && cols[0].x < camX - 60) cols.shift();
    mines = mines.filter((m) => m.x > camX - 60);
    pearls = pearls.filter((p) => p.x > camX - 60);
    for (const r of rings) {
      const prev = r.r;
      r.r += (r.big ? 700 : 480) * dt;
      for (const c of cols) {
        if (Math.abs(c.x - r.x) > r.r) continue;
        if (c.tid !== r.id && Math.hypot(c.x - r.x, c.top - r.y) <= r.r) {
          c.tt = now;
          c.tid = r.id;
        }
        if (c.bid !== r.id && Math.hypot(c.x - r.x, c.bot - r.y) <= r.r) {
          c.bt = now;
          c.bid = r.id;
        }
      }
      for (const o of mines.concat(pearls))
        if (o.id !== r.id && Math.hypot(o.x - r.x, o.y - r.y) <= r.r) {
          o.t = now;
          o.id = r.id;
          if (mines.includes(o) && state === 'play') tone(420, 0.08, 'square', 0.02);
        }
    }
    rings = rings.filter((r) => r.r < 900);
    for (const b of bubbles) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    bubbles = bubbles.filter((b) => b.life > 0);
  }
  const FADE = 2.8;
  function vis(o, x, y) {
    const age = now - o;
    let a = age < FADE ? 1 - age / FADE : 0;
    const d = Math.hypot(x - sub.x, y - sub.y);
    if (d < 80) a = Math.max(a, 0.45 * (1 - d / 80));
    return a;
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#030c14';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    // faint range grid
    ctx.strokeStyle = 'rgba(255,179,71,.05)';
    ctx.lineWidth = 1;
    for (let x = -((camX * 0.5) % 60); x < VW; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VH);
      ctx.stroke();
    }
    for (let y = 0; y < VH; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VW, y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(-camX, 0);
    // echoes of the trench walls
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (let i = 1; i < cols.length; i++) {
      const a = cols[i - 1],
        b = cols[i];
      const at = Math.min(vis(a.tt, a.x, a.top), vis(b.tt, b.x, b.top)),
        ab = Math.min(vis(a.bt, a.x, a.bot), vis(b.bt, b.x, b.bot));
      if (at > 0.01) {
        ctx.strokeStyle = `rgba(255,179,71,${at})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.top);
        ctx.lineTo(b.x, b.top);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,179,71,${at * 0.07})`;
        ctx.fillRect(a.x, 0, STEP + 0.5, a.top);
      }
      if (ab > 0.01) {
        ctx.strokeStyle = `rgba(255,179,71,${ab})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.bot);
        ctx.lineTo(b.x, b.bot);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,179,71,${ab * 0.07})`;
        ctx.fillRect(a.x, a.bot, STEP + 0.5, VH - a.bot);
      }
    }
    for (const m of mines) {
      const y = m.y + Math.sin(now * 2 + m.ph) * 6,
        a = vis(m.t, m.x, y);
      if (a < 0.01) continue;
      ctx.strokeStyle = `rgba(255,107,90,${a})`;
      ctx.fillStyle = `rgba(255,107,90,${a * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, y, 10, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(ang) * 10, y + Math.sin(ang) * 10);
        ctx.lineTo(m.x + Math.cos(ang) * 15, y + Math.sin(ang) * 15);
        ctx.stroke();
      }
    }
    for (const p of pearls) {
      const a = vis(p.t, p.x, p.y);
      if (a < 0.01) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
      g.addColorStop(0, `rgba(255,220,230,${a})`);
      g.addColorStop(0.4, `rgba(255,143,163,${a * 0.7})`);
      g.addColorStop(1, 'rgba(255,143,163,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, TAU);
      ctx.fill();
    }
    for (const r of rings) {
      const a = Math.max(0, 1 - r.r / 900);
      ctx.strokeStyle = `rgba(255,179,71,${a * 0.55})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,226,184,.5)';
    for (const b of bubbles) {
      ctx.globalAlpha = Math.min(1, b.life);
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (state !== 'dying' && state !== 'over') {
      ctx.save();
      ctx.translate(sub.x, sub.y);
      ctx.rotate(Math.max(-0.35, Math.min(0.35, sub.vy / 900)));
      ctx.strokeStyle = '#ffb347';
      ctx.fillStyle = '#1a1206';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 8.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-4, -15, 10, 8, 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, -15);
      ctx.lineTo(3, -20);
      ctx.lineTo(9, -20);
      ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(10, -1, 2.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-26, -6 * Math.sin(now * 30));
      ctx.lineTo(-26, 6 * Math.sin(now * 30));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // vignette
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const v = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.3,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.75,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.04, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  reset();
  lifecycle.requestAnimationFrame(frame);
}
