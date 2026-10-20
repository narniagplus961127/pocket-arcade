import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLDivElement;
  wave: HTMLDivElement;
  lives: HTMLDivElement;
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
  const TAU = Math.PI * 2,
    rand = (a, b) => a + Math.random() * (b - a);
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
  const keys = {} as KeyboardState;
  let state = 'title',
    ship,
    shots,
    junk,
    parts,
    score,
    lives,
    wave,
    inv,
    cool,
    best = 0;
  try {
    best = +localStorage.getItem('junk-orbit-best') || 0;
  } catch (e) {}

  function newShip() {
    ship = {
      x: W / 2,
      y: H / 2,
      a: -Math.PI / 2,
      vx: 0,
      vy: 0,
    };
    inv = 2.5;
  }

  function makeJunk(x, y, size) {
    const kind = size === 3 ? 'sat' : size === 2 ? 'panel' : 'bolt';
    const sp = rand(20, 50) * (4 - size) * (1 + wave * 0.08),
      a = rand(0, TAU);
    return {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: [0, 12, 24, 40][size],
      size,
      kind,
      rot: rand(0, TAU),
      vr: rand(-1.5, 1.5),
    };
  }

  function spawnWave() {
    junk = [];
    for (let i = 0; i < 3 + wave; i++) {
      let x, y;
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while (Math.hypot(x - ship.x, y - ship.y) < 200);
      junk.push(makeJunk(x, y, 3));
    }
  }

  function start() {
    score = 0;
    lives = 3;
    wave = 1;
    shots = [];
    parts = [];
    cool = 0;
    newShip();
    spawnWave();
    state = 'play';
    hud();
    $('title').hidden = true;
    $('over').hidden = true;
  }

  function hud() {
    $('score').textContent = String(score);
    $('wave').textContent = String(wave);
    $('lives').textContent = String(lives);
  }

  function burst(x, y, n, sp = 120) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU),
        v = rand(20, sp);
      parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.3, 0.9),
      });
    }
  }
  const wrap = (o) => {
    o.x = (o.x + W) % W;
    o.y = (o.y + H) % H;
  };
  function update(dt) {
    if (state === 'play') {
      if (keys.left) ship.a -= 4.2 * dt;
      if (keys.right) ship.a += 4.2 * dt;
      if (keys.thrust) {
        ship.vx += Math.cos(ship.a) * 260 * dt;
        ship.vy += Math.sin(ship.a) * 260 * dt;
        if (Math.random() < 0.5)
          parts.push({
            x: ship.x - Math.cos(ship.a) * 12,
            y: ship.y - Math.sin(ship.a) * 12,
            vx: -Math.cos(ship.a) * 80 + rand(-20, 20),
            vy: -Math.sin(ship.a) * 80 + rand(-20, 20),
            life: 0.3,
          });
      }
      ship.vx *= Math.exp(-dt * 0.5);
      ship.vy *= Math.exp(-dt * 0.5);
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrap(ship);
      cool -= dt;
      inv -= dt;
      if (keys.fire && cool <= 0) {
        cool = 0.2;
        shots.push({
          x: ship.x + Math.cos(ship.a) * 14,
          y: ship.y + Math.sin(ship.a) * 14,
          vx: Math.cos(ship.a) * 520 + ship.vx,
          vy: Math.sin(ship.a) * 520 + ship.vy,
          life: 1,
        });
        tone(1200, 0.06, 'square', 0.025, 0.5);
      }
    }
    for (const s of shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      wrap(s);
    }
    for (const j of junk) {
      j.x += j.vx * dt;
      j.y += j.vy * dt;
      j.rot += j.vr * dt;
      wrap(j);
    }
    for (const s of shots)
      for (const j of junk)
        if (!j.dead && s.life > 0 && Math.hypot(s.x - j.x, s.y - j.y) < j.r) {
          s.life = 0;
          j.dead = true;
          score += [0, 100, 50, 20][j.size];
          hud();
          burst(j.x, j.y, 10 + j.size * 6);
          tone([0, 900, 500, 260][j.size], 0.15, 'triangle', 0.06, 0.6);
          if (j.size > 1)
            for (let k = 0; k < 2; k++) junk.push(makeJunk(j.x, j.y, j.size - 1));
        }
    junk = junk.filter((j) => !j.dead);
    shots = shots.filter((s) => s.life > 0);
    if (state === 'play' && inv <= 0)
      for (const j of junk)
        if (Math.hypot(ship.x - j.x, ship.y - j.y) < j.r + 9) {
          lives--;
          hud();
          burst(ship.x, ship.y, 40, 200);
          tone(90, 0.7, 'sawtooth', 0.07, 0.4);
          if (lives <= 0) {
            state = 'over';
            end();
          } else newShip();
          break;
        }
    if (state === 'play' && !junk.length) {
      wave++;
      score += 250;
      hud();
      spawnWave();
      inv = 1.5;
      tone(660, 0.3, 'triangle', 0.06, 1.5);
    }
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);
  }

  function end() {
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('junk-orbit-best', String(best));
      } catch (e) {}
    }
    $('oText').textContent = String(
      `Cleared ${wave - 1} sectors and scored ${score} points. Best on record: ${best}.`,
    );
    lifecycle.setTimeout(() => {
      $('over').hidden = false;
      $('again').focus();
    }, 900);
  }

  function drawJunk(j) {
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.rotate(j.rot);
    ctx.strokeStyle = '#e8f3ff';
    ctx.lineWidth = 1.5;
    if (j.kind === 'sat') {
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-18, 0);
      ctx.moveTo(12, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.strokeRect(s > 0 ? 18 : -38, -9, 20, 18);
        ctx.beginPath();
        ctx.moveTo(s * 28, -9);
        ctx.lineTo(s * 28, 9);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, -12, 6, Math.PI, TAU);
      ctx.stroke();
    } else if (j.kind === 'panel') {
      ctx.strokeRect(-20, -10, 40, 20);
      for (let x = -10; x <= 10; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.lineTo(x, 10);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0f3b5c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(232,243,255,.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,243,255,.12)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, TAU);
    ctx.stroke();
    for (const j of junk || []) drawJunk(j);
    ctx.fillStyle = '#ffcf5c';
    for (const s of shots || []) {
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.fillStyle = '#e8f3ff';
    for (const p of parts || []) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (state === 'play' && (inv <= 0 || Math.floor(inv * 8) % 2)) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.a);
      ctx.strokeStyle = '#e8f3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -9);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, 9);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#ffcf5c';
      ctx.beginPath();
      ctx.arc(3, 0, 2.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  const KM = {
    ArrowLeft: 'left',
    a: 'left',
    ArrowRight: 'right',
    d: 'right',
    ArrowUp: 'thrust',
    w: 'thrust',
    ' ': 'fire',
  };
  lifecycle.listen(window, 'keydown', (e) => {
    const k = KM[e.key];
    if (k) {
      e.preventDefault();
      keys[k] = true;
    }
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      state !== 'play' &&
      !e.repeat &&
      ($('over').hidden === false || state === 'title')
    )
      start();
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
      lifecycle.listen(b, ev, () => {
        keys[b.dataset.k] = false;
      }),
    );
  });
  $('play').onclick = start;
  $('again').onclick = start;
  newShip();
  wave = 1;
  shots = [];
  parts = [];
  spawnWave();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
