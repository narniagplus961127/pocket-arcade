import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  me: HTMLSpanElement;
  oppName: HTMLElement;
  opp: HTMLSpanElement;
  title: HTMLDivElement;
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
  function tone(f, d = 0.05, type = 'sine', v = 0.08) {
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
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const TW = 300,
    TH = 540; // table in logical units
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = Math.min((W - 32) / TW, (H - 110) / TH);
    OX = (W - TW * S) / 2;
    OY = 70 + (H - 70 - TH * S) / 2;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  const LV = [
    {
      name: 'Regular',
      sp: 240,
      err: 40,
      react: 0.25,
    },
    {
      name: 'Barista',
      sp: 340,
      err: 22,
      react: 0.15,
    },
    {
      name: 'Owner',
      sp: 460,
      err: 10,
      react: 0.08,
    },
  ];
  let lv = LV[0],
    me,
    ai,
    ball,
    sMe = 0,
    sAi = 0,
    state = 'title',
    serveT = 0,
    keys = {} as KeyboardState,
    aiTarget = TW / 2,
    aiThink = 0,
    trail = [];
  const PW = 56,
    PH = 10;
  function serve(toward) {
    ball = {
      x: TW / 2,
      y: TH / 2,
      vx: (Math.random() - 0.5) * 160,
      vy: toward * 260,
      z: 0,
    };
    serveT = 0.8;
    trail = [];
  }

  function start(l) {
    lv = LV[l];
    $('oppName').textContent = String(lv.name);
    sMe = sAi = 0;
    hud();
    me = {
      x: TW / 2,
    };
    ai = {
      x: TW / 2,
    };
    serve(Math.random() < 0.5 ? 1 : -1);
    state = 'play';
    $('title').hidden = true;
    $('over').hidden = true;
  }

  function hud() {
    $('me').textContent = String(sMe);
    $('opp').textContent = String(sAi);
  }
  document
    .querySelectorAll<HTMLElement>('[data-lv]')
    .forEach((b) => (b.onclick = () => start(+b.dataset.lv)));
  $('again').onclick = () => start(LV.indexOf(lv));
  lifecycle.listen(cv, 'pointermove', (e) => {
    me && (me.x = (e.clientX - OX) / S);
  });
  lifecycle.listen(cv, 'pointerdown', (e) => {
    me && (me.x = (e.clientX - OX) / S);
  });
  lifecycle.listen(window, 'keydown', (e) => {
    keys[e.key] = true;
  });
  lifecycle.listen(window, 'keyup', (e) => {
    keys[e.key] = false;
  });
  function point(mine) {
    mine ? sMe++ : sAi++;
    hud();
    tone(mine ? 880 : 220, 0.25, 'triangle', 0.07);
    if (sMe >= 7 || sAi >= 7) {
      state = 'over';
      $('oTitle').textContent = String(sMe > sAi ? 'You win!' : `${lv.name} wins`);
      $('oText').textContent = String(
        `${sMe} – ${sAi}. ${sMe > sAi ? 'Coffee is on the house.' : 'Have another espresso and try again.'}`,
      );
      $('over').hidden = false;
      $('again').focus();
      return;
    }
    serve(mine ? -1 : 1);
  }

  function paddleHit(p, dir) {
    const off = (ball.x - p.x) / (PW / 2);
    const sp = Math.min(Math.hypot(ball.vx, ball.vy) * 1.05 + 10, 720);
    const a = off * 0.9;
    ball.vx = Math.sin(a) * sp;
    ball.vy = dir * Math.cos(a) * sp;
    tone(dir < 0 ? 1100 : 900, 0.04, 'square', 0.06);
  }

  function update(dt) {
    if (state !== 'play') return;
    if (keys.ArrowLeft || keys.a) me.x -= 420 * dt;
    if (keys.ArrowRight || keys.d) me.x += 420 * dt;
    me.x = Math.max(PW / 2, Math.min(TW - PW / 2, me.x));
    aiThink -= dt;
    if (aiThink <= 0) {
      aiThink = lv.react;
      aiTarget =
        ball.vy < 0
          ? ball.x +
            ball.vx * Math.max(0, (ball.y - 30) / Math.max(1, -ball.vy)) * 0.6 +
            (Math.random() - 0.5) * lv.err * 2
          : TW / 2;
    }
    aiTarget = Math.max(PW / 2, Math.min(TW - PW / 2, aiTarget));
    ai.x += Math.max(-lv.sp * dt, Math.min(lv.sp * dt, aiTarget - ai.x));
    if (serveT > 0) {
      serveT -= dt;
      return;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += dt;
    trail.push({
      x: ball.x,
      y: ball.y,
    });
    if (trail.length > 10) trail.shift();
    if (ball.x < 5) {
      ball.x = 5;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x > TW - 5) {
      ball.x = TW - 5;
      ball.vx = -Math.abs(ball.vx);
    }
    if (
      ball.vy > 0 &&
      ball.y > TH - 30 - PH &&
      ball.y < TH - 18 &&
      Math.abs(ball.x - me.x) < PW / 2 + 6
    ) {
      ball.y = TH - 30 - PH;
      paddleHit(me, -1);
    }
    if (
      ball.vy < 0 &&
      ball.y < 30 + PH &&
      ball.y > 18 &&
      Math.abs(ball.x - ai.x) < PW / 2 + 6
    ) {
      ball.y = 30 + PH;
      paddleHit(ai, 1);
    }
    if (ball.y > TH + 20) point(false);
    else if (ball.y < -20) point(true);
  }

  function paddle(x, y, col) {
    ctx.fillStyle = '#7a5532';
    ctx.fillRect(x - 4, y + (y > TH / 2 ? PH : -14), 8, 14);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(x - PW / 2, y, PW, PH, 5);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#c9a27a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#b88e66';
    for (let x = 0; x < W; x += 60) ctx.fillRect(x, 0, 2, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.fillRect(8, 10, TW, TH);
    ctx.fillStyle = '#1f5fa8';
    ctx.fillRect(0, 0, TW, TH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, TW - 3, TH - 3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(TW / 2, 0);
    ctx.lineTo(TW / 2, TH);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(-10, TH / 2 - 2, TW + 20, 4);
    ctx.fillStyle = '#2f3a33';
    ctx.fillRect(-14, TH / 2 - 6, 6, 12);
    ctx.fillRect(TW + 8, TH / 2 - 6, 6, 12);
    if (ai) paddle(ai.x, 30 - PH + 2, '#2f3a33');
    if (me) paddle(me.x, TH - 30, '#e2453c');
    if (ball) {
      trail.forEach((p, i) => {
        ctx.fillStyle = `rgba(255,138,61,${(i / trail.length) * 0.35})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, 7);
        ctx.fill();
      });
      const h = Math.abs(Math.sin(ball.z * 6)) * 4;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.arc(ball.x + 3, ball.y + 4, 5, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y - h, 6, 0, 7);
      ctx.fill();
      if (serveT > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = '800 22px "Barlow Condensed"';
        ctx.textAlign = 'center';
        ctx.fillText('SERVE', TW / 2, TH / 2 - 20);
      }
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
