import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLElement;
  clock: HTMLElement;
  streak: HTMLElement;
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
  function tone(f, d = 0.1, type = 'sine', v = 0.06, sl = 0) {
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
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const VH = 600,
    FLOOR = 520,
    BR = 14,
    G = 1150;
  let W, H, DPR, S, VW, FW, FX;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = H / VH;
    VW = W / S;
    FW = Math.min(VW, 760);
    FX = (VW - FW) / 2;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  let state = 'title',
    ball,
    hoop,
    score = 0,
    streak = 0,
    clock = 60,
    drag = null,
    touched = false,
    scored = false,
    flash = 0,
    texts = [],
    t = 0,
    best = 0;
  try {
    best = +localStorage.getItem('hoop-arc-best') || 0;
  } catch (e) {}

  function newBall() {
    ball = {
      x: 50 + Math.random() * FW * 0.35,
      y: FLOOR - BR,
      vx: 0,
      vy: 0,
      live: false,
      age: 0,
      rot: 0,
    };
    touched = false;
    scored = false;
  }

  function resetHoop() {
    hoop = {
      x: FW - 100,
      y: 250,
      base: FW - 100,
      phase: 0,
    };
  }

  function start() {
    score = 0;
    streak = 0;
    clock = 60;
    resetHoop();
    newBall();
    state = 'play';
    $('title').hidden = true;
    $('over').hidden = true;
    hud();
  }

  function hud() {
    $('score').textContent = String(score);
    $('clock').textContent = String(Math.ceil(clock));
    $('streak').textContent = String(streak);
  }
  const toW = (e) => ({
    x: e.clientX / S - FX,
    y: e.clientY / S,
  });
  lifecycle.listen(cv, 'pointerdown', (e) => {
    if (state !== 'play' || ball.live) return;
    cv.setPointerCapture(e.pointerId);
    drag = {
      s: toW(e),
      c: toW(e),
    };
  });
  lifecycle.listen(cv, 'pointermove', (e) => {
    if (drag) drag.c = toW(e);
  });
  lifecycle.listen(cv, 'pointerup', () => {
    if (!drag) return;
    const v = shotV();
    drag = null;
    if (!v) return;
    ball.vx = v.x;
    ball.vy = v.y;
    ball.live = true;
    tone(160, 0.08, 'sine', 0.08);
  });
  function shotV() {
    const dx = drag.s.x - drag.c.x,
      dy = drag.s.y - drag.c.y,
      len = Math.hypot(dx, dy);
    if (len < 10) return null;
    const k = (Math.min(len, 220) / len) * 4.4;
    return {
      x: dx * k,
      y: dy * k,
    };
  }
  lifecycle.listen(window, 'keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && state !== 'play') {
      e.preventDefault();
      start();
    }
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function rimPts() {
    return [
      {
        x: hoop.x - 30,
        y: hoop.y,
      },
      {
        x: hoop.x + 30,
        y: hoop.y,
      },
    ];
  }

  function update(dt) {
    t += dt;
    flash = Math.max(0, flash - dt);
    for (const x of texts) {
      x.y -= 40 * dt;
      x.life -= dt;
    }
    texts = texts.filter((x) => x.life > 0);
    if (state !== 'play') return;
    clock -= dt;
    if (clock <= 0) {
      clock = 0;
      hud();
      return end();
    }
    if (score >= 10) {
      hoop.phase += dt * (score >= 30 ? 1.4 : 0.8);
      hoop.x = hoop.base - 120 + Math.sin(hoop.phase) * 120;
    }
    if (Math.floor(clock * 4) !== Math.floor((clock + dt) * 4)) hud();
    if (!ball.live) return;
    const sub = 4;
    for (let i = 0; i < sub; i++) {
      const d = dt / sub,
        py = ball.y;
      ball.vy += G * d;
      ball.x += ball.vx * d;
      ball.y += ball.vy * d;
      ball.rot += (ball.vx * d) / BR;
      for (const p of rimPts()) {
        const dx = ball.x - p.x,
          dy = ball.y - p.y,
          dist = Math.hypot(dx, dy);
        if (dist < BR + 3) {
          const nx = dx / dist,
            ny = dy / dist,
            vn = ball.vx * nx + ball.vy * ny;
          ball.x = p.x + nx * (BR + 3);
          ball.y = p.y + ny * (BR + 3);
          if (vn < 0) {
            ball.vx -= 1.6 * vn * nx;
            ball.vy -= 1.6 * vn * ny;
            touched = true;
            tone(520, 0.06, 'triangle', 0.05);
          }
        }
      }
      const bx = hoop.x + 36,
        by0 = hoop.y - 100,
        by1 = hoop.y + 12;
      if (ball.x + BR > bx && ball.x - BR < bx + 8 && ball.y > by0 && ball.y < by1) {
        if (ball.vx > 0) {
          ball.x = bx - BR;
          ball.vx *= -0.6;
          touched = true;
          tone(140, 0.08, 'square', 0.05);
        }
      }
      if (
        !scored &&
        py < hoop.y &&
        ball.y >= hoop.y &&
        ball.vy > 0 &&
        ball.x > hoop.x - 26 &&
        ball.x < hoop.x + 26
      ) {
        scored = true;
        streak++;
        const pts = (touched ? 2 : 3) * (streak >= 3 ? 2 : 1);
        score += pts;
        flash = 0.5;
        texts.push({
          x: hoop.x,
          y: hoop.y - 30,
          txt: `${touched ? '' : 'SWISH '}+${pts}`,
          life: 1,
        });
        [523, 659, 784].forEach((f, k) =>
          lifecycle.setTimeout(() => tone(f, 0.12, 'triangle', 0.06), k * 60),
        );
        hud();
      }
      if (ball.y > FLOOR - BR) {
        ball.y = FLOOR - BR;
        ball.vy *= -0.55;
        ball.vx *= 0.8;
        if (Math.abs(ball.vy) > 80) tone(90, 0.06, 'sine', 0.08);
      }
      if (ball.x < -BR - 40 || ball.x > FW + 60) ball.age = 9;
    }
    ball.age += dt;
    if (
      ball.age > 2.6 ||
      (ball.y >= FLOOR - BR - 1 && Math.abs(ball.vy) < 40 && ball.age > 0.6)
    ) {
      if (!scored) {
        streak = 0;
        hud();
      }
      newBall();
    }
  }

  function end() {
    state = 'over';
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('hoop-arc-best', String(best));
      } catch (e) {}
    }
    $('oText').textContent = String(
      `${score} points before the buzzer. Gym record: ${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
    tone(200, 0.9, 'sawtooth', 0.07);
  }

  function drawBall(x, y, rot, on) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (on) {
      ctx.fillStyle = 'rgba(255,120,30,.35)';
      ctx.beginPath();
      ctx.arc(0, 0, BR + 8 + Math.sin(t * 20) * 2, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#f2711c';
    ctx.beginPath();
    ctx.arc(0, 0, BR, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#3a1a06';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-BR, 0);
    ctx.lineTo(BR, 0);
    ctx.moveTo(0, -BR);
    ctx.lineTo(0, BR);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-BR * 1.2, 0, BR * 0.9, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(BR * 1.2, 0, BR * 0.9, Math.PI - 0.9, Math.PI + 0.9);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * S * FX, 0);
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    for (let x = -FX; x < FW + FX; x += 80) ctx.fillRect(x, 0, 40, FLOOR);
    for (let i = 0; i < 4; i++) {
      const lx = (FW * (i + 0.5)) / 4;
      const g = ctx.createRadialGradient(lx, 0, 0, lx, 0, 160);
      g.addColorStop(0, 'rgba(255,248,220,.18)');
      g.addColorStop(1, 'rgba(255,248,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 160, 0, 320, 200);
    }
    ctx.fillStyle = '#d79a5a';
    ctx.fillRect(-FX, FLOOR, FW + 2 * FX, VH - FLOOR);
    ctx.fillStyle = '#c4874a';
    for (let x = -FX; x < FW + FX; x += 46) ctx.fillRect(x, FLOOR, 2, VH - FLOOR);
    ctx.strokeStyle = '#f7f3ea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-FX, FLOOR + 1);
    ctx.lineTo(FW + FX, FLOOR + 1);
    ctx.stroke();
    if (hoop) {
      ctx.fillStyle = '#8a8f9c';
      ctx.fillRect(hoop.x + 60, hoop.y - 60, 10, FLOOR - hoop.y + 60);
      ctx.fillStyle = '#f7f3ea';
      ctx.fillRect(hoop.x + 36, hoop.y - 100, 8, 112);
      ctx.strokeStyle = '#ff4d3d';
      ctx.lineWidth = 2;
      ctx.strokeRect(hoop.x + 37, hoop.y - 50, 6, 36);
      ctx.fillStyle = '#8a8f9c';
      ctx.fillRect(hoop.x + 30, hoop.y - 4, 30, 6);
      ctx.strokeStyle = 'rgba(247,243,234,.75)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i <= 6; i++) {
        const x0 = hoop.x - 30 + i * 10,
          x1 = hoop.x - 18 + i * 6;
        ctx.beginPath();
        ctx.moveTo(x0, hoop.y);
        ctx.lineTo(x1, hoop.y + 44 + (flash ? Math.sin(t * 30 + i) * 4 : 0));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(hoop.x - 26, hoop.y + 16);
      ctx.lineTo(hoop.x + 26, hoop.y + 16);
      ctx.moveTo(hoop.x - 22, hoop.y + 32);
      ctx.lineTo(hoop.x + 22, hoop.y + 32);
      ctx.stroke();
    }
    if (drag && ball && !ball.live) {
      const v = shotV();
      if (v) {
        let x = ball.x,
          y = ball.y,
          vx = v.x,
          vy = v.y;
        ctx.fillStyle = 'rgba(247,243,234,.75)';
        for (let i = 0; i < 9; i++) {
          for (let k = 0; k < 4; k++) {
            vy += G * 0.01;
            x += vx * 0.01;
            y += vy * 0.01;
          }
          ctx.beginPath();
          ctx.arc(x, y, 3.5 - i * 0.3, 0, 7);
          ctx.fill();
        }
      }
    }
    if (ball) drawBall(ball.x, ball.y, ball.rot, streak >= 3);
    if (hoop) {
      ctx.strokeStyle = '#f2711c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hoop.x - 30, hoop.y);
      ctx.lineTo(hoop.x + 30, hoop.y);
      ctx.stroke();
    }
    ctx.font = '400 26px "Bowlby One SC", Impact';
    ctx.textAlign = 'center';
    for (const x of texts) {
      ctx.globalAlpha = Math.min(1, x.life * 2);
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(x.txt, x.x, x.y);
    }
    ctx.globalAlpha = 1;
  }
  resetHoop();
  newBall();
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
