import type { KeyboardState } from '../../shared/input';
import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  lap: HTMLElement;
  cur: HTMLElement;
  lastLap: HTMLElement;
  rec: HTMLElement;
  big: HTMLDivElement;
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
  let AC, engine, eg;
  function ac() {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return null;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function tone(f, d = 0.15, type = 'square', v = 0.05) {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(),
      g = a.createGain(),
      t = a.currentTime;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }

  function engineOn() {
    const a = ac();
    if (!a || engine) return;
    engine = a.createOscillator();
    eg = a.createGain();
    engine.type = 'sawtooth';
    engine.frequency.value = 60;
    eg.gain.value = 0.02;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    engine.connect(f).connect(eg).connect(a.destination);
    engine.start();
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
  // track centerline as a smooth closed curve through control points
  const CTRL = [
    [0, 0],
    [700, -40],
    [1100, 150],
    [1150, 520],
    [900, 700],
    [620, 560],
    [480, 760],
    [700, 1040],
    [500, 1250],
    [100, 1180],
    [-150, 900],
    [-60, 560],
    [-280, 300],
    [-200, 60],
  ];
  const TRACK = [];
  for (let i = 0; i < CTRL.length; i++) {
    const p0 = CTRL[(i - 1 + CTRL.length) % CTRL.length],
      p1 = CTRL[i],
      p2 = CTRL[(i + 1) % CTRL.length],
      p3 = CTRL[(i + 2) % CTRL.length];
    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t,
        t3 = t2 * t;
      TRACK.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  const TW = 90,
    N = TRACK.length;
  function nearest(x, y, hint) {
    let best = 1e9,
      bi = 0;
    const range = hint == null ? N : 30;
    for (let k = -range; k < range; k++) {
      const i = ((hint == null ? 0 : hint) + k + N * 4) % N;
      const d = (TRACK[i][0] - x) ** 2 + (TRACK[i][1] - y) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    return {
      i: bi,
      d: Math.sqrt(best),
    };
  }
  const keys = {} as KeyboardState;
  let state = 'title',
    kart,
    lap,
    lapStart,
    raceStart,
    laps = [],
    prog,
    countdown = 0,
    best = null,
    cam = {
      x: 0,
      y: 0,
      a: 0,
    };
  try {
    best = +localStorage.getItem('kart-loop-best') || null;
  } catch (e) {}
  $('rec').textContent = String(best ? best.toFixed(2) : '—');
  function reset() {
    const a = Math.atan2(TRACK[3][1] - TRACK[0][1], TRACK[3][0] - TRACK[0][0]);
    kart = {
      x: TRACK[2][0],
      y: TRACK[2][1],
      a,
      v: 0,
      idx: 2,
    };
    lap = 0;
    laps = [];
    prog = 2;
    cam = {
      x: kart.x,
      y: kart.y,
      a,
    };
  }

  function start() {
    reset();
    state = 'count';
    countdown = 3.2;
    ac();
    engineOn();
    $('title').hidden = true;
    $('over').hidden = true;
    $('lap').textContent = String('1 / 3');
    $('lastLap').textContent = String('—');
  }

  function finish() {
    state = 'done';
    const total = laps.reduce((a, b) => a + b, 0),
      fast = Math.min(...laps);
    if (!best || total < best) {
      best = total;
      try {
        localStorage.setItem('kart-loop-best', String(best));
      } catch (e) {}
      $('rec').textContent = String(best.toFixed(2));
      $('oTitle').textContent = String('New track record!');
    } else $('oTitle').textContent = String('Chequered flag');
    $('oText').textContent = String(
      `Race time ${total.toFixed(2)} s. Fastest lap ${fast.toFixed(2)} s. Record ${best.toFixed(2)} s.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }
  const KM = {
    ArrowUp: 'gas',
    w: 'gas',
    ArrowDown: 'brake',
    s: 'brake',
    ArrowLeft: 'left',
    a: 'left',
    ArrowRight: 'right',
    d: 'right',
  };
  lifecycle.listen(window, 'keydown', (e) => {
    const k = KM[e.key];
    if (k) {
      e.preventDefault();
      keys[k] = true;
    }
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      (state === 'title' || state === 'done') &&
      !e.repeat
    ) {
      e.preventDefault();
      start();
    }
  });
  lifecycle.listen(window, 'keyup', (e) => {
    const k = KM[e.key];
    if (k) keys[k] = false;
  });
  document.querySelectorAll<HTMLElement>('.pedals button').forEach((b) => {
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      keys[b.dataset.k] = true;
      b.setPointerCapture(e.pointerId);
    });
    ['pointerup', 'pointercancel'].forEach((ev) =>
      lifecycle.listen(b, ev, () => (keys[b.dataset.k] = false)),
    );
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function update(dt) {
    if (state === 'count') {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const after = Math.ceil(countdown);
      $('big').textContent = String(countdown > 0 ? after : 'GO!');
      if (after !== before && after > 0) tone(440, 0.2);
      if (countdown <= 0) {
        state = 'race';
        raceStart = lapStart = performance.now();
        tone(880, 0.4);
        lifecycle.setTimeout(() => ($('big').textContent = String('')), 700);
      }
    }
    if (!kart) return;
    const racing = state === 'race';
    const near = nearest(kart.x, kart.y, kart.idx);
    kart.idx = near.i;
    const off = near.d > TW / 2,
      curb = near.d > TW / 2 - 10 && !off;
    const maxV = off ? 170 : 470;
    if (racing && keys.gas) kart.v += 360 * dt;
    if (keys.brake) kart.v -= 520 * dt;
    kart.v -= kart.v * (off ? 2.2 : 0.45) * dt;
    kart.v = Math.max(-80, Math.min(maxV, kart.v));
    const steer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    kart.a +=
      steer * dt * 2.6 * Math.min(1, Math.abs(kart.v) / 160) * Math.sign(kart.v || 1);
    kart.x += Math.cos(kart.a) * kart.v * dt;
    kart.y += Math.sin(kart.a) * kart.v * dt;
    if (engine) {
      engine.frequency.value = 50 + Math.abs(kart.v) * 0.35;
      eg.gain.value = racing ? 0.02 + (Math.abs(kart.v) / 470) * 0.025 : 0.012;
    }
    if (racing) {
      // progress: only count forward movement along the track indices
      const d = (near.i - prog + N) % N;
      if (d > 0 && d < 20) prog = near.i;
      if (
        prog < 10 &&
        laps.length === lap &&
        performance.now() - lapStart > 4000 &&
        near.i < 10 &&
        kart._half
      ) {
        const lt = (performance.now() - lapStart) / 1000;
        laps.push(lt);
        lap++;
        lapStart = performance.now();
        kart._half = false;
        $('lastLap').textContent = String(lt.toFixed(2));
        tone(660, 0.15);
        tone(990, 0.2);
        if (lap >= 3) {
          finish();
        } else {
          $('lap').textContent = String(`${lap + 1} / 3`);
          $('big').textContent = String(lap === 2 ? 'FINAL LAP' : `LAP ${lap + 1}`);
          lifecycle.setTimeout(() => ($('big').textContent = String('')), 1100);
        }
      }
      if (prog > N * 0.45 && prog < N * 0.55) kart._half = true;
      $('cur').textContent = String(((performance.now() - lapStart) / 1000).toFixed(2));
    }
    cam.x += (kart.x + Math.cos(kart.a) * kart.v * 0.35 - cam.x) * Math.min(1, dt * 5);
    cam.y += (kart.y + Math.sin(kart.a) * kart.v * 0.35 - cam.y) * Math.min(1, dt * 5);
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#5aa34a';
    ctx.fillRect(0, 0, W, H);
    const z = Math.min(1.1, Math.max(0.6, Math.min(W, H) / 700));
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    ctx.fillStyle = 'rgba(0,0,0,.05)';
    for (let x = Math.floor((cam.x - W) / 80) * 80; x < cam.x + W; x += 80)
      ctx.fillRect(x, cam.y - H, 40, H * 2);
    const path = () => {
      ctx.beginPath();
      TRACK.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = TW + 12;
    path();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = TW + 12;
    ctx.setLineDash([22, 22]);
    path();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#4a4d55';
    ctx.lineWidth = TW - 8;
    path();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 24]);
    path();
    ctx.stroke();
    ctx.setLineDash([]);
    // start line
    const s0 = TRACK[0],
      s1 = TRACK[1],
      na = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]) + Math.PI / 2;
    for (let k = -4; k < 4; k++)
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = (k + r) % 2 ? '#fff' : '#14161c';
        ctx.save();
        ctx.translate(s0[0] + Math.cos(na) * k * 10, s0[1] + Math.sin(na) * k * 10);
        ctx.rotate(na);
        ctx.fillRect(0, r * 10 - 10, 10, 10);
        ctx.restore();
      }
    // tyre stacks at the hairpin
    [
      [560, 660],
      [520, 700],
      [760, 980],
    ].forEach(([x, y]) => {
      ctx.fillStyle = '#14161c';
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 7);
      ctx.fill();
    });
    if (kart) {
      ctx.save();
      ctx.translate(kart.x, kart.y);
      ctx.rotate(kart.a);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(-15, -9, 32, 22);
      ctx.fillStyle = '#14161c';
      ctx.fillRect(-14, -13, 8, 5);
      ctx.fillRect(-14, 8, 8, 5);
      ctx.fillRect(8, -12, 7, 4);
      ctx.fillRect(8, 8, 7, 4);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.roundRect(-16, -9, 34, 18, 6);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(-3, 0, 6, 0, 7);
      ctx.fill();
      ctx.restore();
    }
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
