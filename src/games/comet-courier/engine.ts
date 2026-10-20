import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLSpanElement;
  best: HTMLSpanElement;
  mute: HTMLButtonElement;
  combo: HTMLDivElement;
  toast: HTMLDivElement;
  toastLabel: HTMLSpanElement;
  toastName: HTMLElement;
  hint: HTMLDivElement;
  titleCard: HTMLDivElement;
  play: HTMLButtonElement;
  overCard: HTMLDivElement;
  reason: HTMLElement;
  newBest: HTMLSpanElement;
  sScore: HTMLSpanElement;
  sPlanets: HTMLSpanElement;
  sSparks: HTMLSpanElement;
  sChain: HTMLSpanElement;
  again: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d');
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const VH = 820; // logical view height; width follows the screen
  let W, H, DPR, S, VW;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    S = H / VH;
    VW = W / S;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const fieldHalf = () => Math.min(VW, 560) / 2;
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(String(h.slice(i, i + 2)), 16));
  const rgba = (h, a) => {
    const [r, g, b] = hexRgb(h);
    return `rgba(${r},${g},${b},${a})`;
  };
  const PALETTES = [
    ['#ffe0c2', '#ff8a5c', '#6e2440'],
    ['#d4fff3', '#47c9b0', '#123f4a'],
    ['#ece0ff', '#9b7bff', '#2e1d63'],
    ['#fff4b8', '#f2b13e', '#6d3f12'],
    ['#ffd0e4', '#ff6fa5', '#561838'],
    ['#d6ecff', '#5aa2ff', '#182c66'],
  ];
  const SECTORS: Array<[string, [string, string]]> = [
    ['Home Orbit', ['#1b1140', '#0b1d33']],
    ['Amber Reach', ['#2c1534', '#1c1222']],
    ['The Drift', ['#0c2438', '#0a1326']],
    ['Rockfall Belt', ['#28152a', '#121128']],
    ['Lilac Deep', ['#24144a', '#0e0f2e']],
    ['Far Lanterns', ['#0b2b30', '#0b1424']],
  ];
  let bgTop = hexRgb(SECTORS[0][1][0]),
    bgBot = hexRgb(SECTORS[0][1][1]);

  // ---------- backdrop ----------
  const STAR_T = VH + 60;
  const starLayers = [0.12, 0.3, 0.55].map((f, li) => ({
    f,
    stars: Array.from(
      {
        length: 60 - li * 12,
      },
      () => ({
        fx: Math.random(),
        y: Math.random() * STAR_T,
        r: rand(0.4, 1.1) + li * 0.45,
        tw: rand(0, TAU),
        sp: rand(1, 3),
      }),
    ),
  }));
  const nebulae = Array.from(
    {
      length: 5,
    },
    (_, i) => ({
      fx: rand(0.05, 0.95),
      y: i * 300 + rand(0, 160),
      r: rand(200, 340),
      c: pick(['#c6a6ff', '#ffb38a', '#7ef0d0', '#ff6fa5']),
    }),
  );

  // ---------- state ----------
  let state = 'title';
  let score = 0,
    hops = 0,
    chain = 0,
    bestChain = 0,
    sparksGot = 0,
    sector = 0,
    genCount = 0;
  let planets = [],
    sparks = [],
    rocks = [],
    parts = [],
    texts = [];
  let player,
    camY = 0,
    shake = 0,
    deadT = 0,
    t = 0,
    overShownAt = 0;
  let best = 0;
  try {
    best = +localStorage.getItem('comet-courier-best') || 0;
  } catch (e) {}
  $('best').textContent = String(best);
  const orbitSpeed = () => 210 + Math.min(hops * 3, 110);
  const flySpeed = () => 460 + Math.min(hops * 4, 170);
  const lifeFor = (k) => Math.max(1.9, 4.6 - k * 0.05);
  function makePlanet(x, y, k) {
    const r = k === 0 ? 26 : rand(15, 28);
    const oR = r + rand(30, 40);
    let vx = 0;
    if (k > 6 && Math.random() < Math.min(0.55, (k - 6) * 0.045))
      vx = (rand(18, 36) + Math.min(k, 40)) * (Math.random() < 0.5 ? -1 : 1);
    const life = lifeFor(k);
    return {
      x,
      y,
      r,
      oR,
      vx,
      k,
      pal: pick(PALETTES),
      rings: Math.random() < 0.32,
      tilt: rand(-0.5, 0.5),
      spin: rand(0, TAU),
      life,
      maxLife: life,
      visited: k === 0,
      craters: Array.from(
        {
          length: 3 + ((Math.random() * 3) | 0),
        },
        () => ({
          a: rand(0, TAU),
          d: rand(0.1, 0.7),
          s: rand(0.1, 0.24),
        }),
      ),
    };
  }

  function genNext() {
    const last = planets[planets.length - 1];
    const k = ++genCount;
    const gap = rand(195, 245) + Math.min(k * 2.5, 70);
    const y = last.y - gap;
    const p = makePlanet(0, y, k);
    const h = Math.max(10, fieldHalf() - p.oR);
    let x = 0;
    for (let i = 0; i < 16; i++) {
      x = rand(-h, h);
      if (
        Math.abs(x - last.x) > 50 &&
        Math.hypot(x - last.x, y - last.y) > last.oR + p.oR + 60
      )
        break;
    }
    p.x = x;
    planets.push(p);
    // a spark roughly on the flight path
    if (Math.random() < 0.62) {
      const mx = (x + last.x) / 2,
        my = (y + last.y) / 2,
        off = rand(-45, 45);
      sparks.push({
        x: mx + off,
        y: my + rand(-20, 20),
        ph: rand(0, TAU),
      });
    }
    // rocks arrive in later sectors
    if (k >= 10 && Math.random() < Math.min(0.55, 0.15 + (k - 10) * 0.025)) {
      const verts = Array.from(
        {
          length: 8,
        },
        (_, i) => ({
          a: (i / 8) * TAU,
          m: rand(0.72, 1.15),
        }),
      );
      rocks.push({
        x: rand(-fieldHalf(), fieldHalf()),
        y: (y + last.y) / 2 + rand(-30, 30),
        r: rand(9, 14),
        vx: (rand(45, 85) + Math.min(k, 40)) * (Math.random() < 0.5 ? -1 : 1),
        rot: rand(0, TAU),
        vr: rand(-2, 2),
        verts,
      });
    }
  }

  function reset() {
    planets = [];
    sparks = [];
    rocks = [];
    parts = [];
    texts = [];
    score = 0;
    hops = 0;
    chain = 0;
    bestChain = 0;
    sparksGot = 0;
    sector = 0;
    genCount = 0;
    const p0 = makePlanet(0, 0, 0);
    planets.push(p0);
    player = {
      mode: 'orbit',
      p: p0,
      a: Math.PI * 0.5,
      dir: 1,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      dwell: 0,
      from: null,
      flyT: 0,
      speed: 0,
      quick: false,
    };
    camY = p0.y - VH * 0.64;
    while (planets[planets.length - 1].y > camY - VH * 0.6) genNext();
    updateHud();
  }

  // ---------- audio ----------
  let AC = null,
    muted = false;
  function audio() {
    if (!AC) {
      try {
        AC = lifecycle.createAudioContext();
      } catch (e) {
        return null;
      }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function tone(f, d = 0.12, type = 'sine', v = 0.1, slide = 0, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(),
      g = a.createGain(),
      t0 = a.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + d + 0.03);
  }
  const SCALE = [0, 2, 4, 7, 9];
  const note = (i) => 392 * Math.pow(2, (SCALE[i % 5] + 12 * Math.floor(i / 5)) / 12);

  // ---------- effects ----------
  function burst(x, y, n, cols, spd = 160, life = 0.7, size = 2.4) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU),
        s = rand(0.25, 1) * spd;
      parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.5, 1) * life,
        max: life,
        c: pick(cols),
        s: rand(0.6, 1.2) * size,
      });
    }
  }

  function floatText(x, y, txt, c) {
    texts.push({
      x,
      y,
      txt,
      c,
      life: 1,
    });
  }

  function updateHud() {
    $('score').textContent = String(score);
    const el = $('combo');
    if (chain >= 2) {
      const mult = 1 + Math.min(4, Math.floor(chain / 3));
      el.textContent = String(`Chain ${chain}${mult > 1 ? ' · ×' + mult : ''}`);
      el.hidden = false;
      el.classList.add('bump');
      lifecycle.setTimeout(() => el.classList.remove('bump'), 150);
    } else el.hidden = true;
  }
  let toastTimer: number | undefined;
  function showToast(label: string, name: string) {
    const el = $('toast');
    $('toastLabel').textContent = String(label);
    $('toastName').textContent = String(name);
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    lifecycle.clearTimeout(toastTimer);
    toastTimer = lifecycle.setTimeout(() => {
      el.hidden = true;
    }, 2400);
  }

  // ---------- actions ----------
  function start() {
    if (state === 'play') return;
    audio();
    reset();
    state = 'play';
    $('titleCard').hidden = true;
    $('overCard').hidden = true;
    $('hint').hidden = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    showToast('Sector 1', SECTORS[0][0]);
    tone(note(0), 0.18, 'triangle', 0.08);
    tone(note(2), 0.18, 'triangle', 0.08, 0, 0.08);
    tone(note(4), 0.25, 'triangle', 0.08, 0, 0.16);
  }

  function launch() {
    if (state !== 'play' || player.mode !== 'orbit') return;
    const p = player.p,
      sp = flySpeed();
    player.vx = -Math.sin(player.a) * player.dir * sp + p.vx;
    player.vy = Math.cos(player.a) * player.dir * sp;
    player.speed = Math.hypot(player.vx, player.vy);
    player.from = p;
    player.mode = 'fly';
    player.flyT = 0;
    player.quick = player.dwell < 1.05;
    burst(player.x, player.y, 10, ['#ffb38a', '#fff3d6'], 120, 0.4, 2);
    tone(260 + Math.min(chain, 10) * 18, 0.16, 'sine', 0.07, 2.2);
  }

  function capture(q) {
    const dx = player.x - q.x,
      dy = player.y - q.y;
    player.a = Math.atan2(dy, dx);
    player.dir = dx * player.vy - dy * player.vx >= 0 ? 1 : -1;
    player.mode = 'orbit';
    player.p = q;
    player.dwell = 0;
    player.x = q.x + Math.cos(player.a) * q.oR;
    player.y = q.y + Math.sin(player.a) * q.oR;
    if (q.visited) {
      tone(300, 0.1, 'sine', 0.05);
      return;
    }
    q.visited = true;
    hops++;
    chain = player.quick ? chain + 1 : 1;
    bestChain = Math.max(bestChain, chain);
    const mult = 1 + Math.min(4, Math.floor(chain / 3));
    score += mult;
    floatText(
      q.x,
      q.y - q.oR - 14,
      mult > 1 ? `+${mult}` : '+1',
      mult > 1 ? '#7ef0d0' : '#f4ecff',
    );
    burst(player.x, player.y, 18, [q.pal[0], q.pal[1], '#ffffff'], 150, 0.6);
    const n = Math.min(chain, 12);
    tone(note(n), 0.22, 'triangle', 0.09);
    tone(note(n + 2), 0.26, 'sine', 0.05, 0, 0.06);
    if (hops === 2) $('hint').hidden = true;
    const s = Math.floor(hops / 10);
    if (s !== sector) {
      sector = s;
      const sec = SECTORS[s % SECTORS.length];
      showToast(`Sector ${s + 1}`, sec[0]);
      tone(note(5), 0.3, 'triangle', 0.07);
      tone(note(7), 0.3, 'triangle', 0.07, 0, 0.1);
      tone(note(9), 0.4, 'triangle', 0.07, 0, 0.2);
    }
    updateHud();
  }
  const REASONS = {
    void: 'Drifted into deep space.',
    decay: 'Orbit decayed. The planet pulled you in.',
    rock: 'Clipped a passing rock.',
  };
  function die(reason) {
    if (state !== 'play') return;
    state = 'dying';
    deadT = 0;
    player.mode = 'dead';
    $('reason').textContent = String(REASONS[reason]);
    burst(
      player.x,
      player.y,
      60,
      ['#ffb38a', '#ff6b81', '#fff3d6', '#c6a6ff'],
      260,
      1.1,
      3,
    );
    if (!reduceMotion) shake = 14;
    tone(220, 0.6, 'sawtooth', 0.07, 0.25);
    tone(110, 0.7, 'sine', 0.1, 0.5);
    $('hint').hidden = true;
    $('combo').hidden = true;
  }

  function showOver() {
    state = 'over';
    overShownAt = performance.now();
    const isBest = score > best;
    if (isBest) {
      best = score;
      try {
        localStorage.setItem('comet-courier-best', String(best));
      } catch (e) {}
    }
    $('best').textContent = String(best);
    $('newBest').hidden = !isBest || score === 0;
    $('sScore').textContent = String(score);
    $('sPlanets').textContent = String(hops);
    $('sSparks').textContent = String(sparksGot);
    $('sChain').textContent = String(bestChain);
    $('overCard').hidden = false;
    $('again').focus({
      preventScroll: true,
    });
  }

  // ---------- input ----------
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    if (state === 'play') launch();
  });
  lifecycle.listen(window, 'keydown', (e) => {
    if (![' ', 'Enter', 'ArrowUp', 'w', 'W'].includes(e.key)) return;
    if (e.target && (e.target as HTMLElement).id === 'mute') return;
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'play') launch();
    else if (state === 'title') start();
    else if (state === 'over' && performance.now() - overShownAt > 450) start();
  });
  lifecycle.listen($('play'), 'click', start);
  lifecycle.listen($('again'), 'click', start);
  lifecycle.listen($('mute'), 'click', () => {
    muted = !muted;
    $('mute').textContent = String(muted ? 'Sound off' : 'Sound on');
    if (!muted) tone(note(4), 0.12, 'triangle', 0.07);
  });

  // ---------- update ----------
  function update(dt) {
    t += dt;
    const fh = fieldHalf();
    for (const p of planets) {
      p.spin += dt * 0.25;
      if (p.vx) {
        p.x += p.vx * dt;
        const h = fh - p.oR;
        if (p.x > h) {
          p.x = h;
          p.vx = -Math.abs(p.vx);
        } else if (p.x < -h) {
          p.x = -h;
          p.vx = Math.abs(p.vx);
        }
      }
    }
    for (const r of rocks) {
      r.x += r.vx * dt;
      r.rot += r.vr * dt;
      const h = fh + 40;
      if (r.x > h) r.x = -h;
      else if (r.x < -h) r.x = h;
    }
    const pl = player;
    if (pl.mode === 'orbit') {
      const p = pl.p;
      pl.a += pl.dir * (orbitSpeed() / p.oR) * dt;
      pl.x = p.x + Math.cos(pl.a) * p.oR;
      pl.y = p.y + Math.sin(pl.a) * p.oR;
      if (state === 'play') {
        pl.dwell += dt;
        p.life -= dt;
        if (p.life <= 0) {
          p.life = 0;
          die('decay');
        }
      }
      if (Math.random() < 0.5)
        parts.push({
          x: pl.x,
          y: pl.y,
          vx: rand(-10, 10),
          vy: rand(-10, 10),
          life: 0.35,
          max: 0.35,
          c: '#7ef0d0',
          s: 1.6,
        });
    } else if (pl.mode === 'fly') {
      pl.flyT += dt;
      // gentle steering assist toward planets ahead
      let ax = 0,
        ay = 0;
      for (const q of planets) {
        if (q === pl.from) continue;
        const dx = q.x - pl.x,
          dy = q.y - pl.y,
          d = Math.hypot(dx, dy),
          R = q.oR * 2.3;
        if (d < R && d > 1) {
          const f = 340 * (1 - d / R);
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
      }
      pl.vx += ax * dt;
      pl.vy += ay * dt;
      const m = Math.hypot(pl.vx, pl.vy) || 1;
      pl.vx = (pl.vx / m) * pl.speed;
      pl.vy = (pl.vy / m) * pl.speed;
      pl.x += pl.vx * dt;
      pl.y += pl.vy * dt;
      for (const q of planets) {
        if (q === pl.from) continue;
        if (Math.hypot(pl.x - q.x, pl.y - q.y) <= q.oR + 1) {
          capture(q);
          break;
        }
      }
      for (let i = 0; i < 3; i++)
        parts.push({
          x: pl.x + rand(-2, 2),
          y: pl.y + rand(-2, 2),
          vx: -pl.vx * 0.08 + rand(-18, 18),
          vy: -pl.vy * 0.08 + rand(-18, 18),
          life: 0.55,
          max: 0.55,
          c: pick(['#ffb38a', '#ffd6b8', '#c6a6ff']),
          s: rand(1.6, 3),
        });
      const sx = pl.x + VW / 2,
        sy = pl.y - camY;
      if (
        pl.mode === 'fly' &&
        (sx < -24 || sx > VW + 24 || sy > VH + 30 || pl.flyT > 3.2)
      )
        die('void');
    }
    if (state === 'play') {
      for (const r of rocks)
        if (Math.hypot(r.x - pl.x, r.y - pl.y) < r.r + 6) {
          die('rock');
          break;
        }
    }
    if (state === 'play') {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        if (Math.hypot(s.x - pl.x, s.y - pl.y) < 22) {
          sparks.splice(i, 1);
          sparksGot++;
          const mult = 1 + Math.min(4, Math.floor(chain / 3)),
            pts = 3 * mult;
          score += pts;
          floatText(s.x, s.y - 12, `spark +${pts}`, '#fff3b0');
          burst(s.x, s.y, 16, ['#fff3b0', '#ffd27a', '#ffffff'], 140, 0.5);
          tone(note(8), 0.1, 'square', 0.035);
          tone(note(10), 0.14, 'square', 0.035, 0, 0.06);
          updateHud();
        }
      }
    }
    if (state === 'dying') {
      deadT += dt;
      if (deadT > 1.1) showOver();
    }

    // camera only climbs
    const focusY = pl.mode === 'orbit' ? pl.p.y : pl.y;
    const target = focusY - VH * 0.64;
    if (target < camY) camY += (target - camY) * (1 - Math.exp(-dt * 3.5));
    while (planets[planets.length - 1].y > camY - VH * 0.6) genNext();
    const cull = (o) => o.y - camY < VH + 400;
    planets = planets.filter((p) => cull(p) || p === pl.p || p === pl.from);
    sparks = sparks.filter(cull);
    rocks = rocks.filter(cull);
    for (const p of parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const tx of texts) {
      tx.y -= 34 * dt;
      tx.life -= dt * 0.9;
    }
    texts = texts.filter((tx) => tx.life > 0);
    shake *= Math.exp(-dt * 7);
    const sec = SECTORS[sector % SECTORS.length][1];
    const tt = hexRgb(sec[0]),
      tb = hexRgb(sec[1]),
      k = 1 - Math.exp(-dt * 1.2);
    for (let i = 0; i < 3; i++) {
      bgTop[i] += (tt[i] - bgTop[i]) * k;
      bgBot[i] += (tb[i] - bgBot[i]) * k;
    }
  }

  // ---------- draw ----------
  const mod = (a, n) => ((a % n) + n) % n;
  function drawPlanet(p) {
    const cur = player.p === p && player.mode === 'orbit';
    const [c0, c1, c2] = p.pal;
    // orbit ring
    const danger = cur && state === 'play' && p.life / p.maxLife < 0.35;
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = -t * 12;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = danger
      ? rgba('#ff6b81', 0.45 + 0.35 * Math.sin(t * 18))
      : p.visited
        ? 'rgba(244,236,255,.16)'
        : rgba('#7ef0d0', 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.oR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // remaining orbit time
    if (cur && state === 'play') {
      const f = p.life / p.maxLife;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = danger ? '#ff6b81' : 'rgba(255,179,138,.85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.oR + 8, -Math.PI / 2, -Math.PI / 2 + f * TAU);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // halo
    const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.7, p.x, p.y, p.r * 2.4);
    g.addColorStop(0, rgba(c1, 0.35));
    g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.4, 0, TAU);
    ctx.fill();
    // ring, back half shows behind body
    if (p.rings) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt);
      ctx.strokeStyle = rgba(c0, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.85, p.r * 0.5, 0, Math.PI, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // body
    const b = ctx.createRadialGradient(
      p.x - p.r * 0.4,
      p.y - p.r * 0.45,
      p.r * 0.1,
      p.x,
      p.y,
      p.r,
    );
    b.addColorStop(0, c0);
    b.addColorStop(0.55, c1);
    b.addColorStop(1, c2);
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = rgba(c2, 0.28);
    for (const c of p.craters) {
      const a = c.a + p.spin,
        cx = p.x + Math.cos(a) * c.d * p.r,
        cy = p.y + Math.sin(a) * c.d * p.r * 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, c.s * p.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (p.rings) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt);
      ctx.strokeStyle = rgba(c0, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.85, p.r * 0.5, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSpark(s) {
    const bob = Math.sin(t * 3 + s.ph) * 4,
      x = s.x,
      y = s.y + bob,
      rot = t * 1.5 + s.ph;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
    g.addColorStop(0, 'rgba(255,243,176,.55)');
    g.addColorStop(1, 'rgba(255,243,176,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4,
        r = i % 2 ? 2.6 : 8;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawRock(r) {
    const g = ctx.createRadialGradient(r.x, r.y, r.r * 0.5, r.x, r.y, r.r * 2.2);
    g.addColorStop(0, 'rgba(255,107,129,.22)');
    g.addColorStop(1, 'rgba(255,107,129,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 2.2, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.beginPath();
    r.verts.forEach((v, i) => {
      const px = Math.cos(v.a) * r.r * v.m,
        py = Math.sin(v.a) * r.r * v.m;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = '#4b3a5e';
    ctx.fill();
    ctx.strokeStyle = '#a58cc4';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const pl = player;
    if (pl.mode === 'dead') return;
    if (pl.mode === 'orbit') {
      // aim guide along the tangent
      const tx = -Math.sin(pl.a) * pl.dir,
        ty = Math.cos(pl.a) * pl.dir;
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,179,138,.38)';
      ctx.beginPath();
      ctx.moveTo(pl.x + tx * 12, pl.y + ty * 12);
      ctx.lineTo(pl.x + tx * 120, pl.y + ty * 120);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const g = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, 20);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(0.25, 'rgba(255,214,184,.7)');
    g.addColorStop(1, 'rgba(255,179,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 20, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fffaf2';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 5, 0, TAU);
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `rgb(${bgTop.map(Math.round)})`);
    bg.addColorStop(1, `rgb(${bgBot.map(Math.round)})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    // nebulae
    const NT = 1500;
    for (const n of nebulae) {
      const x = n.fx * VW,
        y = mod(n.y - camY * 0.06, NT) - 350;
      const g = ctx.createRadialGradient(x, y, 0, x, y, n.r);
      g.addColorStop(0, rgba(n.c, 0.1));
      g.addColorStop(1, rgba(n.c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - n.r, y - n.r, n.r * 2, n.r * 2);
    }
    // stars
    for (const L of starLayers)
      for (const s of L.stars) {
        const y = mod(s.y - camY * L.f, STAR_T) - 30;
        ctx.fillStyle = `rgba(244,236,255,${0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.sp + s.tw))})`;
        ctx.beginPath();
        ctx.arc(s.fx * VW, y, s.r, 0, TAU);
        ctx.fill();
      }
    ctx.save();
    const sx = shake ? rand(-shake, shake) : 0,
      sy = shake ? rand(-shake, shake) : 0;
    ctx.translate(VW / 2 + sx, -camY + sy);
    for (const s of sparks) drawSpark(s);
    for (const p of planets) drawPlanet(p);
    for (const r of rocks) drawRock(r);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawPlayer();
    ctx.textAlign = 'center';
    ctx.font = '700 17px Unbounded, "Trebuchet MS", sans-serif';
    for (const tx of texts) {
      ctx.globalAlpha = Math.min(1, tx.life * 1.5);
      ctx.fillStyle = tx.c;
      ctx.fillText(tx.txt, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  lifecycle.listen(document, 'visibilitychange', () => {
    last = performance.now();
  });
  reset();
  lifecycle.requestAnimationFrame(frame);
}
