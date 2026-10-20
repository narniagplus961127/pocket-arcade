import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  hole: HTMLSpanElement;
  par: HTMLSpanElement;
  strokes: HTMLSpanElement;
  total: HTMLSpanElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  between: HTMLDivElement;
  bHole: HTMLElement;
  bVerdict: HTMLElement;
  card1: HTMLElement;
  next: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  const TAU = Math.PI * 2;
  const FW = 360,
    FH = 600,
    BR = 8,
    CUP = 11;
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    S = Math.min((W - 24) / FW, (H - 90) / FH);
    OX = (W - FW * S) / 2;
    OY = 66 + (H - 66 - FH * S) / 2;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  let AC = null;
  function tone(f, d = 0.15, type = 'sine', v = 0.08, slide = 0, delay = 0) {
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
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(AC.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }
  const HOLES = [
    {
      par: 2,
      ball: [180, 520],
      cup: [180, 110],
      walls: [[120, 300, 120, 16]],
      water: [],
      sand: [],
      movers: [],
    },
    {
      par: 2,
      ball: [70, 530],
      cup: [290, 100],
      walls: [[0, 300, 230, 18]],
      water: [],
      sand: [[230, 160, 130, 60]],
      movers: [],
    },
    {
      par: 3,
      ball: [180, 540],
      cup: [180, 80],
      walls: [
        [60, 400, 240, 18],
        [0, 230, 140, 18],
        [220, 230, 140, 18],
      ],
      water: [],
      sand: [[150, 130, 60, 40]],
      movers: [],
    },
    {
      par: 3,
      ball: [60, 540],
      cup: [300, 90],
      walls: [],
      water: [[0, 260, 250, 90]],
      sand: [[200, 140, 160, 50]],
      movers: [],
    },
    {
      par: 3,
      ball: [180, 540],
      cup: [180, 90],
      walls: [
        [0, 300, 110, 18],
        [250, 300, 110, 18],
      ],
      water: [],
      sand: [],
      movers: [
        {
          x: 0,
          y: 190,
          w: 120,
          h: 18,
          range: 240,
          sp: 1.3,
          ph: 0,
        },
      ],
    },
    {
      par: 3,
      ball: [300, 540],
      cup: [300, 100],
      walls: [
        [0, 430, 250, 18],
        [110, 270, 250, 18],
      ],
      water: [[150, 330, 90, 70]],
      sand: [],
      movers: [],
    },
    {
      par: 3,
      ball: [180, 545],
      cup: [180, 70],
      walls: [
        [80, 330, 28, 28],
        [170, 260, 28, 28],
        [255, 340, 28, 28],
        [120, 170, 28, 28],
        [225, 160, 28, 28],
      ],
      water: [],
      sand: [[120, 440, 120, 40]],
      movers: [],
    },
    {
      par: 3,
      ball: [180, 540],
      cup: [180, 90],
      walls: [],
      water: [
        [0, 200, 150, 150],
        [210, 200, 150, 150],
      ],
      sand: [[120, 60, 120, 18]],
      movers: [],
    },
    {
      par: 4,
      ball: [180, 545],
      cup: [180, 70],
      walls: [
        [0, 400, 140, 18],
        [220, 400, 140, 18],
      ],
      water: [
        [0, 260, 60, 80],
        [300, 260, 60, 80],
      ],
      sand: [],
      movers: [
        {
          x: 0,
          y: 300,
          w: 110,
          h: 18,
          range: 250,
          sp: 1.6,
          ph: 0,
        },
        {
          x: 0,
          y: 160,
          w: 130,
          h: 18,
          range: 230,
          sp: 1.1,
          ph: 2,
        },
      ],
    },
  ];
  let hi = 0,
    ball,
    strokes = 0,
    scores = [],
    state = 'title',
    drag = null,
    lastPos,
    t = 0,
    sinking = 0,
    ripples = [];
  const inRect = (x, y, r) => x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3];
  function moverRect(m) {
    return [m.x + (Math.sin(t * m.sp + m.ph) * 0.5 + 0.5) * m.range, m.y, m.w, m.h];
  }

  function loadHole(i) {
    hi = i;
    const h = HOLES[i];
    ball = {
      x: h.ball[0],
      y: h.ball[1],
      vx: 0,
      vy: 0,
    };
    lastPos = {
      x: ball.x,
      y: ball.y,
    };
    strokes = 0;
    sinking = 0;
    ripples = [];
    $('hole').textContent = String(i + 1);
    $('par').textContent = String(h.par);
    $('strokes').textContent = String(0);
    $('total').textContent = String(scores.reduce((a, b) => a + b, 0));
  }

  function start() {
    scores = [];
    state = 'play';
    loadHole(0);
    $('title').hidden = true;
    $('between').hidden = true;
    tone(660, 0.1);
  }
  $('play').onclick = start;
  $('next').onclick = () => {
    if (scores.length >= 9) {
      start();
      return;
    }
    $('between').hidden = true;
    state = 'play';
    loadHole(hi + 1);
  };
  lifecycle.listen(window, 'keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && state !== 'play') {
      e.preventDefault();
      (state === 'title' ? $('play') : $('next')).click();
    }
  });
  const toWorld = (e) => ({
    x: (e.clientX - OX) / S,
    y: (e.clientY - OY) / S,
  });
  const still = () => Math.hypot(ball.vx, ball.vy) < 1 && !sinking;
  lifecycle.listen(cv, 'pointerdown', (e) => {
    if (state !== 'play' || !still()) return;
    cv.setPointerCapture(e.pointerId);
    drag = {
      s: toWorld(e),
      c: toWorld(e),
    };
  });
  lifecycle.listen(cv, 'pointermove', (e) => {
    if (drag) drag.c = toWorld(e);
  });
  lifecycle.listen(cv, 'pointerup', () => {
    if (!drag) return;
    const dx = drag.s.x - drag.c.x,
      dy = drag.s.y - drag.c.y,
      len = Math.min(Math.hypot(dx, dy), 160);
    drag = null;
    if (len < 6) return;
    const a = Math.atan2(dy, dx),
      sp = len * 5.4;
    lastPos = {
      x: ball.x,
      y: ball.y,
    };
    ball.vx = Math.cos(a) * sp;
    ball.vy = Math.sin(a) * sp;
    strokes++;
    $('strokes').textContent = String(strokes);
    tone(300 + len * 2, 0.08, 'triangle', 0.1);
  });
  lifecycle.listen(cv, 'pointercancel', () => {
    drag = null;
  });
  function collideRect(r) {
    const cx = Math.max(r[0], Math.min(ball.x, r[0] + r[2])),
      cy = Math.max(r[1], Math.min(ball.y, r[1] + r[3]));
    let nx = ball.x - cx,
      ny = ball.y - cy,
      d = Math.hypot(nx, ny);
    if (d >= BR) return false;
    if (d === 0) {
      // center inside: push out along the shallowest side
      const l = ball.x - r[0],
        rr = r[0] + r[2] - ball.x,
        tp = ball.y - r[1],
        bt = r[1] + r[3] - ball.y,
        m = Math.min(l, rr, tp, bt);
      nx = m === l ? -1 : m === rr ? 1 : 0;
      ny = m === tp ? -1 : m === bt ? 1 : 0;
      d = 1;
      ball.x += nx * (m + BR);
      ball.y += ny * (m + BR);
    } else {
      nx /= d;
      ny /= d;
      ball.x = cx + nx * BR;
      ball.y = cy + ny * BR;
    }
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= 1.8 * vn * nx;
      ball.vy -= 1.8 * vn * ny;
      if (-vn > 40)
        tone(180 + Math.min(-vn, 600) * 0.3, 0.05, 'square', Math.min(0.06, -vn / 8000));
    }
    return true;
  }

  function physics(dt) {
    const h = HOLES[hi];
    const sub = 5,
      d = dt / sub;
    for (let k = 0; k < sub; k++) {
      if (sinking) break;
      ball.x += ball.vx * d;
      ball.y += ball.vy * d;
      const bounds = [
        [-40, -40, FW + 80, 40],
        [-40, FH, FW + 80, 40],
        [-40, 0, 40, FH],
        [FW, 0, 40, FH],
      ];
      for (const r of bounds.concat(h.walls, h.movers.map(moverRect))) collideRect(r);
      const sand = h.sand.some((r) => inRect(ball.x, ball.y, r));
      const f = Math.exp(-(sand ? 4.2 : 1.05) * d);
      ball.vx *= f;
      ball.vy *= f;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp < 7) {
        ball.vx = 0;
        ball.vy = 0;
      }
      if (h.water.some((r) => inRect(ball.x, ball.y, r))) {
        ripples.push({
          x: ball.x,
          y: ball.y,
          r: 0,
        });
        tone(500, 0.35, 'sine', 0.07, 0.3);
        strokes++;
        $('strokes').textContent = String(strokes);
        ball.x = lastPos.x;
        ball.y = lastPos.y;
        ball.vx = ball.vy = 0;
      }
      const dc = Math.hypot(ball.x - h.cup[0], ball.y - h.cup[1]);
      if (dc < CUP && sp < 430) {
        sinking = 0.001;
        ball.vx = ball.vy = 0;
        tone(880, 0.15, 'sine', 0.08);
        tone(660, 0.3, 'triangle', 0.06, 0, 0.08);
      } else if (dc < CUP + 6 && sp < 200 && sp > 0) {
        ball.vx += (h.cup[0] - ball.x) * 2 * d;
        ball.vy += (h.cup[1] - ball.y) * 2 * d;
      }
    }
    if (!sinking && strokes >= 8 && still()) {
      sinking = 0.001;
      strokes = 8;
    }
  }
  const NAMES = {
    '-3': 'Albatross!',
    '-2': 'Eagle!',
    '-1': 'Birdie',
    '0': 'Par',
    '1': 'Bogey',
    '2': 'Double bogey',
  };
  function holeDone() {
    state = 'between';
    scores.push(strokes);
    const par = HOLES[hi].par,
      diff = strokes - par;
    $('bHole').textContent = String(
      scores.length === 9
        ? 'Round complete'
        : `Hole ${hi + 1} · ${strokes} stroke${strokes > 1 ? 's' : ''}`,
    );
    $('bVerdict').textContent = String(
      strokes === 1
        ? 'Hole in one!'
        : NAMES[diff] || (diff > 0 ? `+${diff}, picked up` : 'Incredible'),
    );
    if (scores.length === 9) {
      const tot = scores.reduce((a, b) => a + b, 0),
        parTot = HOLES.reduce((a, h) => a + h.par, 0),
        d = tot - parTot;
      $('bVerdict').textContent = String(
        `${tot} strokes (${d === 0 ? 'even' : d > 0 ? '+' + d : d})`,
      );
      let best = null;
      try {
        best = +localStorage.getItem('felt-fairways-best') || null;
      } catch (e) {}
      if (!best || tot < best) {
        try {
          localStorage.setItem('felt-fairways-best', String(tot));
        } catch (e) {}
        if (best) $('bVerdict').textContent += String(' · new club record');
      } else $('bVerdict').textContent += String(` · record ${best}`);
      $('next').textContent = String('Play another round');
    } else $('next').textContent = String('Next hole');
    const row = (lab, arr, cls?) =>
      `<tr><th>${lab}</th>${arr.map((v, i) => `<td class="${cls ? cls(i) : ''}">${v ?? ''}</td>`).join('')}</tr>`;
    const pars = HOLES.map((h) => h.par),
      mine = HOLES.map((_, i) => scores[i]);
    $('card1').innerHTML =
      row(
        'Hole',
        HOLES.map((_, i) => i + 1),
      ) +
      row('Par', pars) +
      row('You', mine, (i) =>
        scores[i] == null
          ? ''
          : scores[i] < pars[i]
            ? 'under'
            : scores[i] > pars[i]
              ? 'over'
              : '',
      );
    $('between').hidden = false;
    $('next').focus();
    if (diff < 0)
      [0, 4, 7, 12].forEach((s, k) =>
        tone(523 * Math.pow(2, s / 12), 0.25, 'triangle', 0.06, 0, k * 0.1),
      );
  }

  function rectPath(r, rad = 3) {
    ctx.beginPath();
    ctx.roundRect(r[0], r[1], r[2], r[3], rad);
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#14321f';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    const h = HOLES[hi];
    // frame and felt
    ctx.fillStyle = '#5c3a20';
    ctx.beginPath();
    ctx.roundRect(-14, -14, FW + 28, FH + 28, 14);
    ctx.fill();
    ctx.fillStyle = '#2f7a4a';
    ctx.fillRect(0, 0, FW, FH);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let y = 0; y < FH; y += 40) ctx.fillRect(0, y, FW, 20);
    ctx.strokeStyle = 'rgba(243,240,228,.25)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(h.ball[0], h.ball[1], 16, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const r of h.sand) {
      ctx.fillStyle = '#e8d29a';
      rectPath(r, 14);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,120,60,.25)';
      for (let i = 0; i < (r[2] * r[3]) / 120; i++)
        ctx.fillRect(r[0] + ((i * 37) % r[2]), r[1] + ((i * 53) % r[3]), 1.5, 1.5);
    }
    for (const r of h.water) {
      ctx.fillStyle = '#3b8fd1';
      rectPath(r, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1.5;
      for (let y = r[1] + 14; y < r[1] + r[3] - 6; y += 16) {
        ctx.beginPath();
        for (let x = r[0] + 8; x < r[0] + r[2] - 8; x += 4)
          ctx.lineTo(x, y + Math.sin(x * 0.12 + t * 2.5) * 2);
        ctx.stroke();
      }
    }
    for (const rp of ripples) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 1 - rp.r / 30)})`;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, TAU);
      ctx.stroke();
    }
    // cup and flag
    ctx.fillStyle = '#0d1a10';
    ctx.beginPath();
    ctx.arc(h.cup[0], h.cup[1], CUP, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f3f0e4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.cup[0], h.cup[1]);
    ctx.lineTo(h.cup[0], h.cup[1] - 46);
    ctx.stroke();
    ctx.fillStyle = '#e8483b';
    ctx.beginPath();
    ctx.moveTo(h.cup[0], h.cup[1] - 46);
    ctx.quadraticCurveTo(
      h.cup[0] + 14,
      h.cup[1] - 42 + Math.sin(t * 4) * 2,
      h.cup[0] + 24,
      h.cup[1] - 38,
    );
    ctx.lineTo(h.cup[0], h.cup[1] - 30);
    ctx.fill();
    const wood = (r) => {
      ctx.fillStyle = '#8a5a35';
      rectPath(r);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,170,.25)';
      ctx.fillRect(r[0] + 2, r[1] + 2, r[2] - 4, 3);
    };
    h.walls.forEach(wood);
    h.movers.forEach((m) => {
      const r = moverRect(m);
      wood(r);
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(r[0] + r[2] / 2 - 6, r[1] + r[3] / 2 - 1.5, 12, 3);
    });
    // aim
    if (drag && still()) {
      const dx = drag.s.x - drag.c.x,
        dy = drag.s.y - drag.c.y,
        len = Math.min(Math.hypot(dx, dy), 160);
      if (len > 6) {
        const a = Math.atan2(dy, dx),
          p = len / 160;
        for (let i = 1; i <= 8; i++) {
          const d = i * (14 + len * 0.5);
          ctx.fillStyle = `rgba(243,240,228,${0.85 - i * 0.08})`;
          ctx.beginPath();
          ctx.arc(
            ball.x + Math.cos(a) * d * 0.5,
            ball.y + Math.sin(a) * d * 0.5,
            2.6,
            0,
            TAU,
          );
          ctx.fill();
        }
        ctx.fillStyle = p > 0.8 ? '#e8483b' : p > 0.5 ? '#f2c14e' : '#f3f0e4';
        ctx.fillRect(ball.x - 20, ball.y + 16, 40 * p, 4);
      }
    }
    // ball
    const sc = sinking ? Math.max(0, 1 - sinking * 2.5) : 1;
    if (sc > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.arc(ball.x + 2, ball.y + 3, BR * sc, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(
        ball.x - 3,
        ball.y - 3,
        1,
        ball.x,
        ball.y,
        BR * sc,
      );
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#cfcab8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BR * sc, 0, TAU);
      ctx.fill();
    }
  }
  let last = performance.now();
  loadHole(0);
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    t += dt;
    if (state === 'play') {
      physics(dt);
      if (sinking) {
        sinking += dt;
        const h = HOLES[hi];
        ball.x += (h.cup[0] - ball.x) * 0.2;
        ball.y += (h.cup[1] - ball.y) * 0.2;
        if (sinking > 0.6) holeDone();
      }
    }
    for (const r of ripples) r.r += 40 * dt;
    ripples = ripples.filter((r) => r.r < 30);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  lifecycle.requestAnimationFrame(frame);
}
