import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  count: HTMLDivElement;
  best: HTMLSpanElement;
  perfect: HTMLDivElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  sCount: HTMLSpanElement;
  sPerfect: HTMLSpanElement;
  sBest: HTMLSpanElement;
  again: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  const rand = (a, b) => a + Math.random() * (b - a),
    TAU = Math.PI * 2;
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
  let AC = null;
  function tone(f, d = 0.15, type = 'triangle', v = 0.1, slide = 0) {
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
  const PH = 20; // pancake thickness
  const FIELD = () => Math.min(W - 32, 420);
  const MAXW = () => FIELD() * 0.62;
  let best = 0;
  try {
    best = +localStorage.getItem('pancake-tower-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  let state = 'title',
    stack = [],
    mover = null,
    falling = [],
    drips = [],
    camY = 0,
    perfectRun = 0,
    perfects = 0,
    flash = 0,
    t = 0;
  function reset() {
    const w = MAXW();
    stack = [
      {
        x: -w / 2,
        w,
        y: 0,
        tone: 0,
        butter: false,
      },
    ];
    falling = [];
    drips = [];
    camY = 0;
    perfectRun = 0;
    perfects = 0;
    newMover();
    $('count').textContent = String(0);
  }

  function newMover() {
    const top = stack[stack.length - 1],
      from = stack.length % 2 ? -1 : 1;
    const speed = Math.min(150 + stack.length * 7, 420);
    mover = {
      x: from > 0 ? FIELD() / 2 - top.w * 0.7 : -FIELD() / 2 - top.w * 0.3,
      w: top.w,
      y: top.y - PH,
      dir: -from,
      speed,
      tone: rand(-0.08, 0.08),
    };
  }

  function start() {
    if (state === 'play') return;
    state = 'play';
    reset();
    $('title').hidden = true;
    $('over').hidden = true;
  }

  function end() {
    state = 'over';
    const n = stack.length - 1;
    if (n > best) {
      best = n;
      try {
        localStorage.setItem('pancake-tower-best', String(best));
      } catch (e) {}
    }
    $('best').textContent = String(best);
    $('sCount').textContent = String(n);
    $('sPerfect').textContent = String(perfects);
    $('sBest').textContent = String(best);
    lifecycle.setTimeout(() => {
      $('over').hidden = false;
      $('again').focus();
    }, 700);
  }

  function drop() {
    if (state !== 'play' || !mover) return;
    const top = stack[stack.length - 1],
      m = mover;
    const left = Math.max(m.x, top.x),
      right = Math.min(m.x + m.w, top.x + top.w);
    if (right - left <= 1) {
      falling.push({
        ...m,
        vy: 0,
        vx: m.dir * 60,
        rot: 0,
        vr: m.dir * 2,
      });
      mover = null;
      tone(180, 0.5, 'sawtooth', 0.07, 0.4);
      end();
      return;
    }
    let piece;
    if (Math.abs(m.x - top.x) < 5) {
      perfectRun++;
      perfects++;
      let w = top.w;
      if (perfectRun >= 3) w = Math.min(w + 10, MAXW());
      piece = {
        x: top.x - (w - top.w) / 2,
        w,
        y: m.y,
        tone: m.tone,
      };
      flash = 1;
      $('perfect').hidden = false;
      $('perfect').textContent = String(
        perfectRun >= 3 ? `Perfect ×${perfectRun}` : 'Perfect!',
      );
      tone(523 * Math.pow(2, Math.min(perfectRun, 8) / 12), 0.18);
      tone(784, 0.2, 'sine', 0.05);
    } else {
      perfectRun = 0;
      $('perfect').hidden = true;
      piece = {
        x: left,
        w: right - left,
        y: m.y,
        tone: m.tone,
      };
      const offL = left - m.x,
        offR = m.x + m.w - right;
      if (offL > 0)
        falling.push({
          x: m.x,
          w: offL,
          y: m.y,
          tone: m.tone,
          vy: 0,
          vx: -40,
          rot: 0,
          vr: -2.5,
        });
      if (offR > 0)
        falling.push({
          x: right,
          w: offR,
          y: m.y,
          tone: m.tone,
          vy: 0,
          vx: 40,
          rot: 0,
          vr: 2.5,
        });
      tone(300, 0.12, 'triangle', 0.09, 0.7);
    }
    piece.butter = stack.length % 10 === 0;
    stack.push(piece);
    if (piece.butter) tone(660, 0.3, 'sine', 0.07, 1.5);
    if (Math.random() < 0.6)
      drips.push({
        x: piece.x + rand(0.15, 0.85) * piece.w,
        y: piece.y,
        len: 0,
        max: rand(8, 22),
        si: stack.length - 1,
      });
    $('count').textContent = String(stack.length - 1);
    newMover();
  }
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    drop();
  });
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'play') drop();
    else if (state === 'title' || !$('over').hidden) start();
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function update(dt) {
    t += dt;
    if (mover) {
      mover.x += mover.dir * mover.speed * dt;
      const lim = FIELD() / 2;
      if (mover.x + mover.w > lim + mover.w * 0.6) {
        mover.dir = -1;
      }
      if (mover.x < -lim - mover.w * 0.6) {
        mover.dir = 1;
      }
    }
    for (const f of falling) {
      f.vy += 1200 * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.rot += f.vr * dt;
    }
    falling = falling.filter((f) => f.y + (H - 150) - camY < H + 200);
    for (const d of drips) d.len = Math.min(d.max, d.len + dt * 14);
    const topY = stack[stack.length - 1].y;
    const target = Math.min(0, topY + (H - 150) - H * 0.45);
    camY += (target - camY) * (1 - Math.exp(-dt * 5));
    flash = Math.max(0, flash - dt * 2.5);
    if (flash === 0 && state === 'play' && perfectRun === 0) $('perfect').hidden = true;
  }

  function pancake(x, y, w, toneShift, butter, rot = 0) {
    ctx.save();
    ctx.translate(x + w / 2, y + PH / 2);
    ctx.rotate(rot);
    const hw = w / 2,
      r = Math.min(PH / 2, hw);
    const g = ctx.createLinearGradient(0, -PH / 2, 0, PH / 2);
    const l = 62 + toneShift * 60;
    g.addColorStop(0, `hsl(36,85%,${l}%)`);
    g.addColorStop(0.45, `hsl(32,80%,${l - 8}%)`);
    g.addColorStop(1, `hsl(26,70%,${l - 24}%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-hw, -PH / 2, w, PH, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,.55)';
    ctx.beginPath();
    ctx.roundRect(-hw + 4, -PH / 2 + 2, Math.max(0, w - 8), 4, 2);
    ctx.fill();
    if (butter) {
      ctx.fillStyle = '#ffe680';
      ctx.strokeStyle = '#e8c23a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-14, -PH / 2 - 12, 28, 13, 3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#bfe3f0';
    ctx.fillRect(0, 0, W, H);
    // gingham tablecloth band that scrolls away as the stack rises
    const tableY = H - 150 - camY;
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = ((-camY * 0.1) % 60) - 60; x < W; x += 60) ctx.fillRect(x, 0, 2, H);
    if (tableY < H) {
      ctx.fillStyle = '#fdfdfb';
      ctx.fillRect(0, tableY, W, H);
      const sq = 22;
      for (let y = 0; tableY + y < H; y += sq)
        for (let x = 0; x < W; x += sq) {
          const a = ((x / sq) | 0) % 2,
            b = ((y / sq) | 0) % 2;
          if (a || b) {
            ctx.fillStyle = a && b ? 'rgba(226,69,107,.75)' : 'rgba(226,69,107,.3)';
            ctx.fillRect(x, tableY + y, sq, sq);
          }
        }
    }
    ctx.save();
    ctx.translate(W / 2, H - 150 - camY);
    // plate
    const pw = MAXW() + 70;
    ctx.fillStyle = 'rgba(43,33,64,.15)';
    ctx.beginPath();
    ctx.ellipse(0, 22, pw / 2 + 6, 14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 14, pw / 2, 14, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#9fc6d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 14, pw / 2 - 18, 8, 0, 0, TAU);
    ctx.stroke();
    for (const s of stack) pancake(s.x, s.y, s.w, s.tone, s.butter);
    ctx.fillStyle = '#8a3e14';
    for (const d of drips) {
      const s = stack[d.si];
      if (!s) continue;
      ctx.beginPath();
      ctx.roundRect(d.x - 2.5, s.y + PH - 4, 5, d.len, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(d.x, s.y + PH - 4 + d.len, 3.2, 0, TAU);
      ctx.fill();
    }
    // syrup on top
    const top = stack[stack.length - 1];
    if (stack.length > 1) {
      ctx.fillStyle = 'rgba(138,62,20,.85)';
      ctx.beginPath();
      ctx.ellipse(top.x + top.w / 2, top.y + 2, Math.max(4, top.w / 2 - 6), 4, 0, 0, TAU);
      ctx.fill();
    }
    if (mover) {
      ctx.fillStyle = 'rgba(43,33,64,.12)';
      ctx.fillRect(mover.x, top.y - 2, mover.w, 3);
      pancake(
        mover.x,
        mover.y - Math.abs(Math.sin(t * 6)) * 3,
        mover.w,
        mover.tone,
        false,
      );
    }
    for (const f of falling) pancake(f.x, f.y, f.w, f.tone, false, f.rot);
    ctx.restore();
    if (flash) {
      ctx.fillStyle = `rgba(255,216,77,${flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  reset();
  mover = null;
  lifecycle.requestAnimationFrame(frame);
}
