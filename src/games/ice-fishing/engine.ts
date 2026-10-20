import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLElement;
  time: HTMLElement;
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
  function tone(f, d = 0.1, type = 'triangle', v = 0.05, sl = 0) {
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
  const VH = 640,
    ICE = 170,
    BOTTOM = 610;
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
  const SPECIES = [
    {
      name: 'Perch',
      pts: 2,
      depth: [230, 330],
      len: 22,
      col: '#9bbf4a',
      str: 0.6,
      sp: 50,
      w: 50,
    },
    {
      name: 'Trout',
      pts: 5,
      depth: [320, 450],
      len: 32,
      col: '#c98a8a',
      str: 1,
      sp: 60,
      w: 30,
    },
    {
      name: 'Pike',
      pts: 10,
      depth: [440, 580],
      len: 46,
      col: '#5f8a5a',
      str: 1.5,
      sp: 70,
      w: 16,
    },
    {
      name: 'Golden char',
      pts: 25,
      depth: [300, 560],
      len: 30,
      col: '#f2c230',
      str: 1.3,
      sp: 110,
      w: 4,
    },
  ];
  let state = 'title',
    fish = [],
    hookY = ICE + 10,
    holding = false,
    phase = 'line',
    biter = null,
    tension = 30,
    pull = 0,
    progress = 0,
    slackT = 0,
    score = 0,
    timeLeft = 90,
    log = [],
    msgs = [],
    t = 0,
    best = 0;
  try {
    best = +localStorage.getItem('ice-angler-best') || 0;
  } catch (e) {}

  function pickSpecies() {
    const tot = SPECIES.reduce((a, s) => a + s.w, 0);
    let r = Math.random() * tot;
    for (const s of SPECIES) {
      if ((r -= s.w) < 0) return s;
    }
    return SPECIES[0];
  }

  function spawnFish() {
    const s = pickSpecies(),
      dir = Math.random() < 0.5 ? 1 : -1;
    fish.push({
      s,
      x: dir > 0 ? -60 : VW + 60,
      y: rand(...(s.depth as [number, number])),
      dir,
      wig: rand(0, 6),
    });
  }

  function start() {
    state = 'play';
    fish = [];
    for (let i = 0; i < 7; i++) {
      spawnFish();
      fish[i].x = rand(0, VW);
    }
    hookY = ICE + 10;
    phase = 'line';
    biter = null;
    score = 0;
    timeLeft = 90;
    log = [];
    msgs = [];
    $('title').hidden = true;
    $('over').hidden = true;
    $('score').textContent = String(0);
  }

  function say(txt, col) {
    msgs.push({
      txt,
      col,
      life: 1.6,
    });
  }

  function end() {
    state = 'over';
    holding = false;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('ice-angler-best', String(best));
      } catch (e) {}
    }
    const counts = {};
    log.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
    $('oText').textContent = String(
      `${score} points: ${
        Object.entries(counts)
          .map(([n, c]) => `${c} ${n.toLowerCase()}`)
          .join(', ') || 'no fish this time'
      }. Best day: ${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }
  const down = (e) => {
    if (e) e.preventDefault();
    holding = true;
  };
  lifecycle.listen(cv, 'pointerdown', down);
  lifecycle.listen(window, 'pointerup', () => (holding = false));
  lifecycle.listen(window, 'pointercancel', () => (holding = false));
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (state === 'play') holding = true;
      else if (!e.repeat && (state === 'title' || !$('over').hidden)) start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    if (e.key === ' ' || e.key === 'ArrowDown') holding = false;
  });
  $('play').onclick = start;
  $('again').onclick = start;
  const HX = () => VW / 2;
  function update(dt) {
    t += dt;
    for (const m of msgs) m.life -= dt;
    msgs = msgs.filter((m) => m.life > 0);
    for (const f of fish)
      if (f !== biter) {
        f.x += f.dir * f.s.sp * dt;
        f.wig += dt * 8;
      }
    fish = fish.filter((f) => f === biter || (f.x > -80 && f.x < VW + 80));
    while (fish.length < 7) spawnFish();
    if (state !== 'play') return;
    timeLeft -= dt;
    $('time').textContent = String(Math.ceil(Math.max(0, timeLeft)));
    if (timeLeft <= 0) return end();
    if (phase === 'line') {
      hookY += (holding ? 170 : -120) * dt;
      hookY = Math.max(ICE + 10, Math.min(BOTTOM - 10, hookY));
      for (const f of fish) {
        const mouth = f.x + f.dir * f.s.len * 0.5;
        if (Math.abs(mouth - HX()) < 8 && Math.abs(f.y - hookY) < 12) {
          biter = f;
          phase = 'reel';
          tension = 35;
          pull = 0;
          progress = 0;
          slackT = 0;
          tone(660, 0.1, 'square', 0.05);
          tone(880, 0.1, 'square', 0.05);
          say('Fish on!', '#e2553f');
          break;
        }
      }
    } else {
      const s = biter.s;
      pull += rand(-3, 3) * dt * 10;
      pull = Math.max(0, Math.min(1, pull));
      tension +=
        ((holding ? 70 : -85) + (pull * 60 + 20) * s.str * (holding ? 1 : 0.5)) * dt;
      tension = Math.max(0, tension);
      const inBand = tension > 40 && tension < 78;
      if (inBand) progress += dt * (0.32 / s.str);
      biter.y += (ICE + 30 - biter.y) * (inBand ? 0.9 : 0) * dt * (0.32 / s.str);
      biter.x = HX() - biter.dir * s.len * 0.5 + Math.sin(t * 9) * 6 * s.str;
      hookY = biter.y;
      if (Math.random() < dt * 3) tone(200 + tension * 4, 0.03, 'sine', 0.015);
      if (tension >= 100) {
        say('Snap! The line broke.', '#e2553f');
        tone(140, 0.3, 'sawtooth', 0.06, 0.4);
        biter.dir *= -1;
        biter.x += biter.dir * 20;
        biter = null;
        phase = 'line';
        hookY = ICE + 10;
      } else if (tension < 18) {
        slackT += dt;
        if (slackT > 1.4) {
          say('Too much slack. It got away.', '#5f7f99');
          biter.dir *= -1;
          biter = null;
          phase = 'line';
        }
      } else slackT = 0;
      if (biter && progress >= 1) {
        score += s.pts;
        log.push(s.name);
        $('score').textContent = String(score);
        say(`${s.name}! +${s.pts}`, '#46b37b');
        [523, 659, 784].forEach((f, i) =>
          lifecycle.setTimeout(() => tone(f, 0.15), i * 80),
        );
        fish.splice(fish.indexOf(biter), 1);
        biter = null;
        phase = 'line';
        hookY = ICE + 10;
      }
    }
  }

  function drawFish(f) {
    const s = f.s,
      L = s.len;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    ctx.rotate(Math.sin(f.wig) * 0.05);
    ctx.fillStyle = s.col;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.5, L * 0.2, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-L * 0.45, 0);
    ctx.lineTo(-L * 0.75, -L * 0.18 + Math.sin(f.wig * 1.5) * 3);
    ctx.lineTo(-L * 0.75, L * 0.18 + Math.sin(f.wig * 1.5) * 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath();
    ctx.ellipse(L * 0.05, L * 0.07, L * 0.3, L * 0.07, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#10202e';
    ctx.beginPath();
    ctx.arc(L * 0.32, -L * 0.04, 2, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#e6f2fb';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    // far pines
    ctx.fillStyle = '#b9d3e6';
    for (let x = 0; x < VW; x += 46) {
      const h = 50 + ((x * 37) % 40);
      ctx.beginPath();
      ctx.moveTo(x, ICE - 30);
      ctx.lineTo(x + 20, ICE - 30 - h);
      ctx.lineTo(x + 40, ICE - 30);
      ctx.fill();
    }
    ctx.fillStyle = '#f7fbff';
    ctx.fillRect(0, ICE - 34, VW, 34);
    const g = ctx.createLinearGradient(0, ICE, 0, BOTTOM);
    g.addColorStop(0, '#3a86b8');
    g.addColorStop(1, '#0f304b');
    ctx.fillStyle = g;
    ctx.fillRect(0, ICE, VW, VH - ICE);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(VW * (i / 6) + Math.sin(t * 0.3 + i) * 30, ICE);
      ctx.lineTo(VW * (i / 6) + 60, BOTTOM);
      ctx.lineTo(VW * (i / 6) + 20, BOTTOM);
      ctx.fill();
    }
    ctx.fillStyle = '#5d6b4a';
    ctx.beginPath();
    ctx.moveTo(0, BOTTOM);
    for (let x = 0; x <= VW; x += 30) ctx.lineTo(x, BOTTOM - 10 - Math.sin(x * 0.03) * 8);
    ctx.lineTo(VW, VH);
    ctx.lineTo(0, VH);
    ctx.fill();
    // ice sheet with hole
    ctx.fillStyle = '#dcecf7';
    ctx.fillRect(0, ICE - 6, HX() - 18, 22);
    ctx.fillRect(HX() + 18, ICE - 6, VW, 22);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillRect(0, ICE - 6, VW, 3);
    for (const f of fish) drawFish(f);
    // hut + angler
    const hx = HX();
    ctx.fillStyle = '#b5523a';
    ctx.fillRect(hx + 40, ICE - 110, 90, 76);
    ctx.fillStyle = '#8a3a28';
    ctx.beginPath();
    ctx.moveTo(hx + 32, ICE - 108);
    ctx.lineTo(hx + 85, ICE - 145);
    ctx.lineTo(hx + 138, ICE - 108);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(hx + 95, ICE - 92, 20, 18);
    ctx.fillStyle = '#16324a';
    ctx.fillRect(hx + 14, ICE - 72, 18, 38);
    ctx.fillStyle = '#e2553f';
    ctx.beginPath();
    ctx.arc(hx + 23, ICE - 82, 11, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#f2d1b3';
    ctx.beginPath();
    ctx.arc(hx + 23, ICE - 78, 7, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#4a3020';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx + 18, ICE - 60);
    ctx.lineTo(hx, ICE - 70);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(22,50,74,.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hx, ICE - 70);
    ctx.lineTo(hx, hookY);
    ctx.stroke();
    ctx.strokeStyle = '#c7ced6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx - 3, hookY, 4, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#e2553f';
    ctx.beginPath();
    ctx.arc(hx, Math.min(hookY, ICE + 2) - 6, 4, 0, 7);
    ctx.fill();
    if (phase === 'reel' && state === 'play') {
      const bx = Math.min(VW - 60, hx + 160),
        by = ICE + 30,
        bh = 200;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.roundRect(bx - 16, by - 10, 46, bh + 44, 12);
      ctx.fill();
      ctx.fillStyle = '#f3d0c9';
      ctx.fillRect(bx, by, 14, bh);
      ctx.fillStyle = '#bfe8cf';
      ctx.fillRect(bx, by + bh * (1 - 0.78), 14, bh * 0.38);
      ctx.fillStyle = '#16324a';
      ctx.fillRect(bx - 6, by + bh * (1 - Math.min(1, tension / 100)) - 2, 26, 4);
      ctx.fillStyle = '#46b37b';
      ctx.fillRect(bx + 18, by + bh * (1 - progress), 6, bh * progress);
      ctx.fillStyle = '#16324a';
      ctx.font = '800 10px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('TENSION', bx + 7, by + bh + 22);
    }
    ctx.font = '400 26px Chewy, cursive';
    ctx.textAlign = 'center';
    msgs.forEach((m, i) => {
      ctx.globalAlpha = Math.min(1, m.life);
      ctx.fillStyle = m.col;
      ctx.fillText(m.txt, HX(), ICE - 160 + i * 28);
    });
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 7; i++) {
    spawnFish();
    fish[i].x = rand(0, VW);
  }
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
