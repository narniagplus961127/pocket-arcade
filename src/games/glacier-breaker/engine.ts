import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLSpanElement;
  lvl: HTMLSpanElement;
  lives: HTMLSpanElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  oEyebrow: HTMLElement;
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
  const TAU = Math.PI * 2,
    rand = (a, b) => a + Math.random() * (b - a);
  const FW = 480,
    FH = 720;
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = Math.min(W / FW, (H - 50) / FH);
    OX = (W - FW * S) / 2;
    OY = 50 + (H - 50 - FH * S) / 2;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  let AC = null;
  function tone(f, d = 0.1, type = 'triangle', v = 0.07, slide = 0) {
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
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }
  const COLS = 8,
    BW = 52,
    BH = 24,
    GAP = 4,
    TOPY = 70,
    PY = 660,
    BR = 8;
  let state = 'title',
    bricks = [],
    balls = [],
    drops = [],
    parts = [],
    paddle = {
      x: FW / 2,
      w: 92,
    },
    score = 0,
    lives = 3,
    level = 1,
    wideT = 0,
    slowT = 0,
    keys = {} as KeyboardState,
    held = true,
    t = 0,
    best = 0;
  try {
    best = +localStorage.getItem('glacier-breaker-best') || 0;
  } catch (e) {}

  function build() {
    bricks = [];
    const rows = Math.min(5 + level, 10),
      ox = (FW - (COLS * BW + (COLS - 1) * GAP)) / 2;
    const pattern = level % 4;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < COLS; c++) {
        if (pattern === 1 && (r + c) % 2 === 1 && r > 1) continue;
        if (pattern === 2 && Math.abs(c - 3.5) > rows - r + 0.5) continue;
        if (pattern === 3 && (c === 3 || c === 4) && r % 3 === 1) continue;
        const hp = r < Math.floor(level / 2) ? 3 : r < level ? 2 : 1;
        bricks.push({
          x: ox + c * (BW + GAP),
          y: TOPY + r * (BH + GAP),
          hp: Math.min(hp, 3),
          max: Math.min(hp, 3),
          fish: Math.random() < 0.09,
          seed: Math.random(),
        });
      }
  }

  function newBall() {
    balls = [
      {
        x: paddle.x,
        y: PY - BR - 6,
        vx: 0,
        vy: 0,
      },
    ];
    held = true;
  }

  function speed() {
    return (360 + level * 25) * (slowT > 0 ? 0.68 : 1);
  }

  function start() {
    if (state === 'play') return;
    state = 'play';
    score = 0;
    lives = 3;
    level = 1;
    wideT = slowT = 0;
    drops = [];
    parts = [];
    build();
    newBall();
    hud();
    $('title').hidden = true;
    $('over').hidden = true;
  }

  function launch() {
    if (state !== 'play' || !held) return;
    held = false;
    const a = rand(-0.5, 0.5);
    const s = speed();
    balls[0].vx = Math.sin(a) * s;
    balls[0].vy = -Math.cos(a) * s;
    tone(520, 0.08);
  }

  function hud() {
    $('score').textContent = String(score);
    $('lives').textContent = String('❄'.repeat(lives) || '0');
    $('lvl').textContent = String(level);
  }

  function end(win) {
    state = 'over';
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('glacier-breaker-best', String(best));
      } catch (e) {}
    }
    $('oText').textContent = String(
      `Score ${score} · Reached floe ${level} · Best ${best}`,
    );
    $('over').hidden = false;
    $('again').focus();
  }
  const toX = (e) => (e.clientX - OX) / S;
  lifecycle.listen(cv, 'pointermove', (e) => {
    if (state === 'play') paddle.x = toX(e);
  });
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    if (state === 'play') {
      paddle.x = toX(e);
      launch();
    }
  });
  lifecycle.listen(window, 'keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state === 'play') launch();
      else if (!e.repeat) start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    keys[e.key] = false;
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function burst(x, y, n, c) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU),
        v = rand(40, 200);
      parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        life: rand(0.4, 0.8),
        c,
        s: rand(2, 5),
      });
    }
  }

  function hitBrick(b) {
    b.hp--;
    score += 10;
    tone(700 + (3 - b.hp) * 160 + rand(-30, 30), 0.07, 'square', 0.04);
    burst(
      b.x + BW / 2,
      b.y + BH / 2,
      b.hp > 0 ? 5 : 14,
      b.hp > 0 ? '#ffffff' : '#a9e3f5',
    );
    if (b.hp <= 0) {
      score += 15;
      if (b.fish)
        drops.push({
          x: b.x + BW / 2,
          y: b.y + BH / 2,
          kind: ['wide', 'triple', 'slow'][Math.floor(Math.random() * 3)],
        });
    }
    hud();
  }

  function update(dt) {
    t += dt;
    if (state !== 'play') return;
    wideT -= dt;
    slowT -= dt;
    const pw = wideT > 0 ? 140 : 92;
    paddle.w += (pw - paddle.w) * Math.min(1, dt * 10);
    if (keys.ArrowLeft || keys.a) paddle.x -= 560 * dt;
    if (keys.ArrowRight || keys.d) paddle.x += 560 * dt;
    paddle.x = Math.max(paddle.w / 2, Math.min(FW - paddle.w / 2, paddle.x));
    if (held) {
      balls[0].x = paddle.x;
      balls[0].y = PY - BR - 6;
    }
    const target = speed();
    for (const b of balls) {
      if (held) break;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      b.vx *= target / sp;
      b.vy *= target / sp;
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        if (b.x < BR) {
          b.x = BR;
          b.vx = Math.abs(b.vx);
          tone(300, 0.03, 'sine', 0.03);
        }
        if (b.x > FW - BR) {
          b.x = FW - BR;
          b.vx = -Math.abs(b.vx);
          tone(300, 0.03, 'sine', 0.03);
        }
        if (b.y < BR) {
          b.y = BR;
          b.vy = Math.abs(b.vy);
          tone(300, 0.03, 'sine', 0.03);
        }
        // floe
        if (
          b.vy > 0 &&
          b.y + BR >= PY - 6 &&
          b.y < PY + 10 &&
          Math.abs(b.x - paddle.x) < paddle.w / 2 + BR
        ) {
          const off = (b.x - paddle.x) / (paddle.w / 2),
            a = Math.max(-1, Math.min(1, off)) * 1.05,
            s = Math.hypot(b.vx, b.vy);
          b.vx = Math.sin(a) * s;
          b.vy = -Math.cos(a) * s;
          b.y = PY - 6 - BR;
          tone(420, 0.06, 'triangle', 0.06);
        }
        for (const br of bricks) {
          if (br.hp <= 0) continue;
          const cx = Math.max(br.x, Math.min(b.x, br.x + BW)),
            cy = Math.max(br.y, Math.min(b.y, br.y + BH));
          if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < BR * BR) {
            const ox = Math.min(b.x + BR - br.x, br.x + BW - (b.x - BR)),
              oy = Math.min(b.y + BR - br.y, br.y + BH - (b.y - BR));
            if (ox < oy) {
              b.vx = b.x < br.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
            } else {
              b.vy = b.y < br.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
            }
            hitBrick(br);
            break;
          }
        }
      }
      if (Math.abs(b.vy) < target * 0.25) b.vy = Math.sign(b.vy || -1) * target * 0.25;
    }
    balls = balls.filter((b) => b.y < FH + 20);
    if (!balls.length) {
      lives--;
      hud();
      tone(200, 0.5, 'sawtooth', 0.06, 0.5);
      if (lives <= 0) {
        end(false);
        return;
      }
      wideT = slowT = 0;
      newBall();
    }
    for (const d of drops) d.y += 160 * dt;
    drops = drops.filter((d) => {
      if (
        d.y > PY - 10 &&
        d.y < PY + 14 &&
        Math.abs(d.x - paddle.x) < paddle.w / 2 + 10
      ) {
        tone(660, 0.1);
        tone(990, 0.15, 'sine', 0.05);
        if (d.kind === 'wide') wideT = 12;
        if (d.kind === 'slow') slowT = 10;
        if (d.kind === 'triple' && !held) {
          const src = balls[0];
          for (const a of [-0.5, 0.5]) {
            const s = Math.hypot(src.vx, src.vy),
              ang = Math.atan2(src.vy, src.vx) + a;
            balls.push({
              x: src.x,
              y: src.y,
              vx: Math.cos(ang) * s,
              vy: Math.sin(ang) * s,
            });
          }
        }
        score += 25;
        hud();
        return false;
      }
      return d.y < FH + 20;
    });
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);
    if (bricks.every((b) => b.hp <= 0)) {
      level++;
      score += 100;
      hud();
      build();
      newBall();
      drops = [];
      [523, 659, 784, 1047].forEach((f, i) =>
        lifecycle.setTimeout(() => tone(f, 0.18), i * 90),
      );
    }
  }

  function drawPenguin(x, y) {
    ctx.fillStyle = '#1c3d5a';
    ctx.beginPath();
    ctx.ellipse(x, y - 18, 11, 15, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y - 15, 7, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c3d5a';
    ctx.beginPath();
    ctx.arc(x - 3, y - 25, 1.6, 0, TAU);
    ctx.arc(x + 3, y - 25, 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffb03b';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 22);
    ctx.lineTo(x + 3, y - 22);
    ctx.lineTo(x, y - 18);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 5, y - 3, 4, 2, 0, 0, TAU);
    ctx.ellipse(x + 5, y - 3, 4, 2, 0, 0, TAU);
    ctx.fill();
    const flap = Math.sin(t * 8) * 0.3;
    ctx.fillStyle = '#1c3d5a';
    ctx.save();
    ctx.translate(x - 10, y - 18);
    ctx.rotate(0.4 + flap);
    ctx.beginPath();
    ctx.ellipse(0, 4, 3, 8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x + 10, y - 18);
    ctx.rotate(-0.4 - flap);
    ctx.beginPath();
    ctx.ellipse(0, 4, 3, 8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#dff1fb');
    g.addColorStop(1, '#bfe4f4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    // field
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.roundRect(0, 0, FW, FH, 18);
    ctx.fill();
    // mountains
    ctx.fillStyle = 'rgba(169,227,245,.55)';
    ctx.beginPath();
    ctx.moveTo(0, 420);
    ctx.lineTo(90, 330);
    ctx.lineTo(170, 400);
    ctx.lineTo(260, 300);
    ctx.lineTo(360, 390);
    ctx.lineTo(480, 320);
    ctx.lineTo(480, 480);
    ctx.lineTo(0, 480);
    ctx.fill();
    // water
    const wg = ctx.createLinearGradient(0, 600, 0, FH);
    wg.addColorStop(0, '#5fb8de');
    wg.addColorStop(1, '#2d7fb0');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.roundRect(0, 620, FW, FH - 620, [0, 0, 18, 18]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 2;
    for (let y = 640; y < FH; y += 24) {
      ctx.beginPath();
      for (let x = 0; x <= FW; x += 8)
        ctx.lineTo(x, y + Math.sin(x * 0.05 + t * 2 + y) * 3);
      ctx.stroke();
    }
    for (const b of bricks) {
      if (b.hp <= 0) continue;
      const shade = ['#c9ecf9', '#8fd3ee', '#56b3db'][b.max - 1];
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, BW, BH, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillRect(b.x + 5, b.y + 4, BW - 18, 3);
      ctx.strokeStyle = 'rgba(28,61,90,.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, BW, BH, 6);
      ctx.stroke();
      if (b.fish) {
        ctx.fillStyle = 'rgba(255,176,59,.75)';
        ctx.beginPath();
        ctx.ellipse(b.x + BW / 2, b.y + BH / 2, 9, 5, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(b.x + BW / 2 + 8, b.y + BH / 2);
        ctx.lineTo(b.x + BW / 2 + 14, b.y + BH / 2 - 5);
        ctx.lineTo(b.x + BW / 2 + 14, b.y + BH / 2 + 5);
        ctx.fill();
      }
      if (b.hp < b.max) {
        ctx.strokeStyle = 'rgba(28,61,90,.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const cx = b.x + BW * (0.3 + b.seed * 0.4),
          cy = b.y + BH / 2;
        ctx.moveTo(cx, b.y);
        ctx.lineTo(cx + 4, cy - 2);
        ctx.lineTo(cx - 3, cy + 3);
        ctx.lineTo(cx + 2, b.y + BH);
        if (b.max - b.hp > 1) {
          ctx.moveTo(cx + 4, cy - 2);
          ctx.lineTo(cx + 14, cy - 6);
          ctx.moveTo(cx - 3, cy + 3);
          ctx.lineTo(cx - 13, cy + 6);
        }
        ctx.stroke();
      }
    }
    for (const d of drops) {
      ctx.fillStyle = '#ffb03b';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 12, 7, Math.sin(t * 6) * 0.2, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(d.x + 10, d.y);
      ctx.lineTo(d.x + 18, d.y - 6);
      ctx.lineTo(d.x + 18, d.y + 6);
      ctx.fill();
      ctx.fillStyle = '#1c3d5a';
      ctx.font = '800 10px "Baloo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.kind.toUpperCase(), d.x, d.y - 11);
    }
    // floe + penguin
    const bob = Math.sin(t * 2.5) * 1.5;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#8fd3ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(paddle.x - paddle.w / 2, PY - 6 + bob, paddle.w, 14, 7);
    ctx.fill();
    ctx.stroke();
    drawPenguin(paddle.x, PY - 6 + bob);
    for (const b of balls) {
      const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BR);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#cfe9f5');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BR, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(28,61,90,.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life * 1.5);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    if (held && state === 'play') {
      ctx.fillStyle = 'rgba(28,61,90,.6)';
      ctx.font = '700 16px "Baloo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap or press Space to launch', FW / 2, 560);
    }
    ctx.fillStyle = 'rgba(28,61,90,.75)';
    ctx.font = '700 12px "Baloo 2", sans-serif';
    ctx.textAlign = 'left';
    const tags = [];
    if (wideT > 0) tags.push(`Wide ${Math.ceil(wideT)}s`);
    if (slowT > 0) tags.push(`Slow ${Math.ceil(slowT)}s`);
    ctx.fillText(tags.join('  ·  '), 12, 606);
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  build();
  newBall();
  lifecycle.requestAnimationFrame(frame);
}
