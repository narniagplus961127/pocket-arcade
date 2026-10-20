import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  dist: HTMLElement;
  fish: HTMLElement;
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
  function tone(f, d = 0.1, type = 'square', v = 0.04, sl = 0) {
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
  const rand = (a, b) => a + Math.random() * (b - a);
  const far = Array.from(
    {
      length: 30,
    },
    (_, i) => ({
      x: i * 90,
      w: rand(50, 90),
      h: rand(120, 260),
    }),
  );
  const mid = Array.from(
    {
      length: 20,
    },
    (_, i) => ({
      x: i * 140,
      w: rand(80, 130),
      h: rand(90, 190),
      win: Math.random(),
    }),
  );
  let state = 'title',
    roofs,
    fishes,
    cat,
    camX,
    speed,
    dist,
    fishN,
    holding,
    jumps,
    t = 0,
    best = 0;
  try {
    best = +localStorage.getItem('rooftop-cat-best') || 0;
  } catch (e) {}

  function genRoof(after) {
    const lvl = Math.min(dist / 4000, 1);
    const gap = rand(60, 110 + lvl * 90),
      w = rand(220, 420 - lvl * 120),
      y = Math.max(300, Math.min(500, after.y + rand(-90, 70)));
    const r = {
      x: after.x + after.w + gap,
      w,
      y,
      chim: Math.random() < 0.25 + lvl * 0.3 ? rand(0.3, 0.8) : -1,
      col: ['#3d2552', '#352049', '#44295a'][Math.floor(Math.random() * 3)],
    };
    roofs.push(r);
    const n = Math.floor(rand(0, 4));
    for (let i = 0; i < n; i++)
      fishes.push({
        x: r.x + 40 + i * 40,
        y: r.y - 60 - Math.sin(i / 2) * 30,
        got: false,
      });
  }

  function reset() {
    roofs = [
      {
        x: -100,
        w: 700,
        y: 420,
        chim: -1,
        col: '#3d2552',
      },
    ];
    fishes = [];
    cat = {
      x: 120,
      y: 420,
      vy: 0,
      ground: true,
    };
    camX = 0;
    speed = 260;
    dist = 0;
    fishN = 0;
    jumps = 0;
    holding = false;
    while (roofs[roofs.length - 1].x < 2000) genRoof(roofs[roofs.length - 1]);
  }

  function start() {
    reset();
    state = 'play';
    $('title').hidden = true;
    $('over').hidden = true;
    hud();
  }

  function hud() {
    $('dist').textContent = String(`${Math.floor(dist / 10)} m`);
    $('fish').textContent = String(fishN);
  }

  function jump() {
    if (state !== 'play') return;
    if (cat.ground || jumps < 2) {
      cat.vy = jumps === 0 ? -560 : -480;
      cat.ground = false;
      jumps++;
      holding = true;
      tone(jumps === 1 ? 520 : 700, 0.1, 'square', 0.04, 1.5);
    }
  }

  function end() {
    if (state !== 'play') return;
    state = 'over';
    const score = Math.floor(dist / 10) + fishN * 25;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('rooftop-cat-best', String(best));
      } catch (e) {}
    }
    $('oTitle').textContent = String(dist > 30000 ? 'Almost home!' : 'Meow…');
    $('oText').textContent = String(
      `${Math.floor(dist / 10)} m and ${fishN} fish, for a score of ${score}. Best: ${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
    tone(300, 0.5, 'triangle', 0.06, 0.4);
  }
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      e.preventDefault();
      if (state === 'play') {
        if (!e.repeat) jump();
      } else if (!e.repeat && (state === 'title' || !$('over').hidden)) start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') holding = false;
  });
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    jump();
  });
  lifecycle.listen(window, 'pointerup', () => {
    holding = false;
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function roofUnder(x) {
    return roofs.find((r) => x >= r.x && x <= r.x + r.w);
  }

  function update(dt) {
    t += dt;
    if (state !== 'play') return;
    speed = Math.min(560, 260 + dist * 0.012);
    cat.x += speed * dt;
    dist += speed * dt;
    cat.vy += (holding && cat.vy < 0 ? 1100 : 2000) * dt;
    const prevY = cat.y;
    cat.y += cat.vy * dt;
    const r = roofUnder(cat.x);
    if (r && cat.vy >= 0 && prevY <= r.y + 2 && cat.y >= r.y) {
      cat.y = r.y;
      cat.vy = 0;
      if (!cat.ground) tone(180, 0.05, 'sine', 0.03);
      cat.ground = true;
      jumps = 0;
    } else if (!r || cat.y < r.y - 1) cat.ground = false;
    // chimney: a block on the roof
    for (const rf of roofs)
      if (rf.chim > 0) {
        const cx = rf.x + rf.w * rf.chim;
        if (cat.x + 14 > cx && cat.x - 14 < cx + 34 && cat.y > rf.y - 56) end();
      }
    if (state !== 'play') return;
    if (r && cat.y > r.y + 6 && cat.x - r.x < 24) return end(); // ran into the side of a taller building
    if (cat.y > VH + 80) return end();
    for (const f of fishes)
      if (!f.got && Math.abs(f.x - cat.x) < 26 && Math.abs(f.y - (cat.y - 20)) < 30) {
        f.got = true;
        fishN++;
        tone(1046, 0.08, 'triangle', 0.05);
        tone(1318, 0.1, 'triangle', 0.04);
      }
    camX = cat.x - Math.min(VW * 0.3, 220);
    while (roofs[roofs.length - 1].x < camX + VW + 400) genRoof(roofs[roofs.length - 1]);
    roofs = roofs.filter((r) => r.x + r.w > camX - 100);
    fishes = fishes.filter((f) => f.x > camX - 50);
    hud();
  }

  function drawCat(x, y) {
    const run = cat.ground ? Math.sin(t * 22) : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#1b1027';
    ctx.beginPath();
    ctx.ellipse(0, -18, 20, 11, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(18, -28, 10, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, -35);
    ctx.lineTo(13, -46);
    ctx.lineTo(19, -37);
    ctx.moveTo(19, -37);
    ctx.lineTo(25, -45);
    ctx.lineTo(27, -33);
    ctx.fill();
    ctx.strokeStyle = '#1b1027';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, -22);
    ctx.quadraticCurveTo(-34, -30 - run * 6, -30, -46);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(-12 - run * 6, 0);
    ctx.moveTo(10, -12);
    ctx.lineTo(12 + run * 6, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(22, -30, 2.2, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7e57c2');
    g.addColorStop(0.55, '#ff8a65');
    g.addColorStop(1, '#ffcc80');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    ctx.fillStyle = 'rgba(255,236,179,.95)';
    ctx.beginPath();
    ctx.arc(VW * 0.72, 330, 70, 0, 7);
    ctx.fill();
    const cx = camX || 0;
    ctx.fillStyle = 'rgba(94,53,177,.45)';
    for (const b of far) {
      const x = ((((b.x - cx * 0.15) % 2700) + 2700) % 2700) - 100;
      ctx.fillRect(x, VH - b.h - 80, b.w, b.h + 80);
    }
    for (const b of mid) {
      const x = ((((b.x - cx * 0.4) % 2800) + 2800) % 2800) - 150;
      ctx.fillStyle = 'rgba(69,39,110,.8)';
      ctx.fillRect(x, VH - b.h - 40, b.w, b.h + 40);
      ctx.fillStyle = 'rgba(255,213,79,.6)';
      for (let wy = VH - b.h - 20; wy < VH - 20; wy += 26)
        for (let wx = x + 10; wx < x + b.w - 14; wx += 22)
          if ((wx * 7 + wy * 3 + Math.floor(b.win * 10)) % 5 < 2)
            ctx.fillRect(wx, wy, 8, 12);
    }
    ctx.save();
    ctx.translate(-cx, 0);
    for (const r of roofs) {
      ctx.fillStyle = r.col;
      ctx.fillRect(r.x, r.y, r.w, VH - r.y + 20);
      ctx.fillStyle = '#5b3a75';
      ctx.fillRect(r.x - 6, r.y - 6, r.w + 12, 10);
      ctx.fillStyle = 'rgba(255,213,79,.35)';
      for (let wy = r.y + 30; wy < VH; wy += 40)
        for (let wx = r.x + 20; wx < r.x + r.w - 30; wx += 46)
          ctx.fillRect(wx, wy, 16, 20);
      if (r.chim > 0) {
        const x = r.x + r.w * r.chim;
        ctx.fillStyle = '#8d4b3b';
        ctx.fillRect(x, r.y - 50, 34, 50);
        ctx.fillStyle = '#6d372b';
        ctx.fillRect(x - 4, r.y - 56, 42, 8);
      }
    }
    for (const f of fishes)
      if (!f.got) {
        const y = f.y + Math.sin(t * 4 + f.x) * 4;
        ctx.fillStyle = '#7fe3ff';
        ctx.beginPath();
        ctx.ellipse(f.x, y, 12, 7, 0, 0, 7);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(f.x - 10, y);
        ctx.lineTo(f.x - 20, y - 7);
        ctx.lineTo(f.x - 20, y + 7);
        ctx.fill();
        ctx.fillStyle = '#1b1027';
        ctx.beginPath();
        ctx.arc(f.x + 6, y - 2, 1.6, 0, 7);
        ctx.fill();
      }
    if (cat) drawCat(cat.x, cat.y);
    ctx.restore();
  }
  reset();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
