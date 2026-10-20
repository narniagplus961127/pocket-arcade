import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  wave: HTMLElement;
  money: HTMLElement;
  lives: HTMLElement;
  c: HTMLCanvasElement;
  over: HTMLDivElement;
  oTitle: HTMLElement;
  oText: HTMLElement;
  go: HTMLButtonElement;
  next: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.06, type = 'triangle', v = 0.035, sl = 0) {
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
  const C = 12,
    R = 8,
    CS = 50;
  const WAY = [
    [-1, 1],
    [3, 1],
    [3, 5],
    [7, 5],
    [7, 2],
    [10, 2],
    [10, 6],
    [12.5, 6],
  ];
  const pathCells = new Set();
  for (let i = 0; i < WAY.length - 1; i++) {
    let [x, y] = WAY[i];
    const [x2, y2] = WAY[i + 1];
    let guard = 0;
    while ((x !== x2 || y !== y2) && guard++ < 50) {
      if (x >= 0 && x < C) pathCells.add(y * C + Math.round(x));
      x += Math.sign(x2 - x) * (Math.abs(x2 - x) < 1 ? Math.abs(x2 - x) : 1);
      y += Math.sign(y2 - y);
    }
    pathCells.add(y2 * C + Math.min(C - 1, Math.round(x2)));
  }
  const TOWERS = [
    {
      name: 'flower',
      cost: 30,
      range: 2.2,
      rate: 0.45,
      dmg: 1,
      col: '#ff7eb6',
    },
    {
      name: 'pot',
      cost: 40,
      range: 1.7,
      rate: 0,
      dmg: 0,
      slow: 0.5,
      col: '#f5b301',
    },
    {
      name: 'bees',
      cost: 75,
      range: 2.7,
      rate: 1.3,
      dmg: 4,
      splash: 1,
      col: '#ffd75e',
    },
  ];
  let towers,
    enemies,
    shots,
    money,
    lives,
    wave,
    sel = 0,
    inWave = false,
    spawnQ = [],
    spawnT = 0,
    state = 'title',
    t = 0,
    best = 0;
  try {
    best = +localStorage.getItem('hive-defense-best') || 0;
  } catch (e) {}
  let SIZE = 0,
    DPR = 1,
    SC = 1;
  function fit() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    const w = cv.getBoundingClientRect().width;
    SIZE = w;
    SC = w / (C * CS);
    cv.width = w * DPR;
    cv.height = ((w * 2) / 3) * DPR;
  }
  new ResizeObserver(fit).observe(cv);
  fit();
  function hud() {
    $('wave').textContent = String(wave);
    $('money').textContent = String(money);
    $('lives').textContent = String(lives);
    document
      .querySelectorAll<HTMLElement>('[data-t]')
      .forEach(
        (b) => ((b as HTMLButtonElement).disabled = money < TOWERS[+b.dataset.t].cost),
      );
    $('next').disabled = inWave || state !== 'play';
  }

  function start() {
    towers = [];
    enemies = [];
    shots = [];
    money = 90;
    lives = 20;
    wave = 0;
    inWave = false;
    spawnQ = [];
    state = 'play';
    $('over').hidden = true;
    hud();
  }

  function sendWave() {
    if (inWave || state !== 'play') return;
    wave++;
    inWave = true;
    const n = 6 + wave * 2;
    spawnQ = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const kind =
        wave >= 4 && r < 0.18 ? 'hornet' : wave >= 2 && r < 0.4 ? 'beetle' : 'wasp';
      spawnQ.push(kind);
    }
    if (wave % 5 === 0) spawnQ.push('queen');
    spawnT = 0;
    hud();
    tone(330, 0.3, 'sawtooth', 0.04, 1.5);
  }

  function makeEnemy(kind) {
    const hpBase = 3 + wave * 1.6;
    const k = {
      wasp: {
        hp: hpBase,
        sp: 1.3,
        r: 8,
        col: '#f2c230',
        bounty: 4,
      },
      beetle: {
        hp: hpBase * 0.7,
        sp: 2.2,
        r: 7,
        col: '#3fa36b',
        bounty: 4,
      },
      hornet: {
        hp: hpBase * 3,
        sp: 0.9,
        r: 11,
        col: '#e2553f',
        bounty: 9,
      },
      queen: {
        hp: hpBase * 12,
        sp: 0.7,
        r: 15,
        col: '#a14be0',
        bounty: 40,
      },
    }[kind];
    return {
      ...k,
      kind,
      max: k.hp,
      seg: 0,
      x: WAY[0][0],
      y: WAY[0][1],
      slowT: 0,
    };
  }
  lifecycle.listen(cv, 'click', (e) => {
    if (state !== 'play') return;
    const r = cv.getBoundingClientRect(),
      cx = Math.floor((e.clientX - r.left) / (r.width / C)),
      cy = Math.floor((e.clientY - r.top) / (r.height / R)),
      k = cy * C + cx;
    const ex = towers.findIndex((tw) => tw.cx === cx && tw.cy === cy);
    if (ex >= 0) {
      money += Math.floor(TOWERS[towers[ex].t].cost / 2);
      towers.splice(ex, 1);
      tone(300, 0.1);
      hud();
      return;
    }
    if (pathCells.has(k) || (cx === C - 1 && cy === 6)) return;
    const T = TOWERS[sel];
    if (money < T.cost) {
      tone(150, 0.1, 'square', 0.03);
      return;
    }
    money -= T.cost;
    towers.push({
      cx,
      cy,
      t: sel,
      cool: 0,
      aim: 0,
    });
    tone(660, 0.08);
    hud();
  });
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(
    (b) =>
      (b.onclick = () => {
        sel = +b.dataset.t;
        document
          .querySelectorAll<HTMLElement>('[data-t]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }),
  );
  $('next').onclick = sendWave;
  $('go').onclick = start;
  function update(dt) {
    t += dt;
    if (state !== 'play') return;
    if (inWave) {
      spawnT -= dt;
      if (spawnQ.length && spawnT <= 0) {
        enemies.push(makeEnemy(spawnQ.shift()));
        spawnT = Math.max(0.35, 0.9 - wave * 0.03);
      }
    }
    for (const e of enemies) {
      let slow = 1;
      for (const tw of towers)
        if (
          TOWERS[tw.t].slow &&
          Math.hypot(tw.cx + 0.5 - (e.x + 0.5), tw.cy + 0.5 - (e.y + 0.5)) <=
            TOWERS[tw.t].range
        )
          slow = TOWERS[tw.t].slow;
      let move = e.sp * slow * dt;
      while (move > 0 && e.seg < WAY.length - 1) {
        const [tx, ty] = WAY[e.seg + 1],
          dx = tx - e.x,
          dy = ty - e.y,
          d = Math.hypot(dx, dy);
        if (d <= move) {
          e.x = tx;
          e.y = ty;
          e.seg++;
          move -= d;
        } else {
          e.x += (dx / d) * move;
          e.y += (dy / d) * move;
          move = 0;
        }
      }
      if (e.seg >= WAY.length - 1) {
        e.dead = true;
        e.leaked = true;
        lives -= e.kind === 'queen' ? 5 : e.kind === 'hornet' ? 2 : 1;
        tone(120, 0.2, 'square', 0.05);
        hud();
      }
    }
    for (const tw of towers) {
      const T = TOWERS[tw.t];
      if (!T.rate) continue;
      tw.cool -= dt;
      if (tw.cool > 0) continue;
      let target = null,
        far = -1;
      for (const e of enemies)
        if (
          !e.dead &&
          Math.hypot(tw.cx - e.x, tw.cy - e.y) <= T.range &&
          e.seg + (e.x + e.y) * 0.001 > far
        ) {
          far = e.seg + (e.x + e.y) * 0.001;
          target = e;
        }
      if (target) {
        tw.cool = T.rate;
        tw.aim = Math.atan2(target.y - tw.cy, target.x - tw.cx);
        shots.push({
          x: tw.cx,
          y: tw.cy,
          tg: target,
          sp: tw.t === 2 ? 6 : 10,
          dmg: T.dmg,
          splash: T.splash || 0,
          col: T.col,
        });
        tone(tw.t === 2 ? 240 : 880, 0.04, 'sine', 0.02);
      }
    }
    for (const s of shots) {
      const dx = s.tg.x - s.x,
        dy = s.tg.y - s.y,
        d = Math.hypot(dx, dy),
        m = s.sp * dt;
      if (d <= m || s.tg.dead) {
        s.done = true;
        if (s.tg.dead) continue;
        if (s.splash) {
          for (const e of enemies)
            if (Math.hypot(e.x - s.tg.x, e.y - s.tg.y) <= s.splash) e.hp -= s.dmg;
        } else s.tg.hp -= s.dmg;
      } else {
        s.x += (dx / d) * m;
        s.y += (dy / d) * m;
      }
    }
    for (const e of enemies)
      if (!e.dead && e.hp <= 0) {
        e.dead = true;
        money += e.bounty;
        tone(1200, 0.05, 'triangle', 0.03);
        hud();
      }
    enemies = enemies.filter((e) => !e.dead);
    shots = shots.filter((s) => !s.done);
    if (inWave && !spawnQ.length && !enemies.length) {
      inWave = false;
      money += 20 + wave * 3;
      hud();
      [523, 659].forEach((f, i) => lifecycle.setTimeout(() => tone(f, 0.15), i * 90));
    }
    if (lives <= 0) {
      state = 'over';
      lives = 0;
      hud();
      if (wave - 1 > best) {
        best = wave - 1;
        try {
          localStorage.setItem('hive-defense-best', String(best));
        } catch (e) {}
      }
      $('oTitle').textContent = String('The hive has fallen');
      $('oText').textContent = String(
        `You held out through ${wave - 1} full waves. Best: ${best}.`,
      );
      $('go').textContent = String('Defend again');
      $('over').hidden = false;
      $('go').focus();
    }
  }

  function hex(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function draw() {
    if (SIZE) {
      ctx.setTransform(DPR * SC, 0, 0, DPR * SC, 0, 0);
      for (let y = 0; y < R; y++)
        for (let x = 0; x < C; x++) {
          ctx.fillStyle = pathCells.has(y * C + x)
            ? '#b98a4e'
            : (x + y) % 2
              ? '#7dbb4f'
              : '#74b247';
          ctx.fillRect(x * CS, y * CS, CS, CS);
        }
      ctx.strokeStyle = 'rgba(122,82,40,.6)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      WAY.forEach(([x, y], i) =>
        i
          ? ctx.lineTo((x + 0.5) * CS, (y + 0.5) * CS)
          : ctx.moveTo((x + 0.5) * CS, (y + 0.5) * CS),
      );
      ctx.stroke();
      ctx.setLineDash([]);
      // hive
      const hx = (C - 0.5) * CS,
        hy = 6.5 * CS;
      ctx.fillStyle = '#d9930d';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(hx, hy - 16 + i * 10, 18 - Math.abs(i - 1.5) * 3, 7, 0, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = '#3b2a0a';
      ctx.beginPath();
      ctx.arc(hx, hy + 8, 4, 0, 7);
      ctx.fill();
      for (const tw of towers || []) {
        const T = TOWERS[tw.t],
          x = (tw.cx + 0.5) * CS,
          y = (tw.cy + 0.5) * CS;
        if (T.slow) {
          ctx.fillStyle = 'rgba(245,179,1,.12)';
          ctx.beginPath();
          ctx.arc(x, y, T.range * CS, 0, 7);
          ctx.fill();
        }
        if (tw.t === 0) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * 7 + t;
            ctx.fillStyle = '#ff7eb6';
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 7, 0, 7);
            ctx.fill();
          }
          ctx.fillStyle = '#ffd75e';
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 7);
          ctx.fill();
        } else if (tw.t === 1) {
          ctx.fillStyle = '#c47a1a';
          ctx.beginPath();
          ctx.roundRect(x - 14, y - 10, 28, 24, 8);
          ctx.fill();
          ctx.fillStyle = '#f5b301';
          ctx.fillRect(x - 15, y - 14, 30, 6);
          ctx.fillStyle = '#ffd75e';
          ctx.fillRect(x - 6, y - 4, 12, 3);
        } else {
          ctx.fillStyle = '#ffd75e';
          hex(x, y, 18);
          ctx.fill();
          ctx.strokeStyle = '#b8860b';
          ctx.lineWidth = 2;
          ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const a = t * 3 + i * 2.1;
            ctx.fillStyle = '#2b2410';
            ctx.beginPath();
            ctx.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 4, 3, a, 0, 7);
            ctx.fill();
          }
        }
      }
      for (const e of enemies || []) {
        const x = (e.x + 0.5) * CS,
          y = (e.y + 0.5) * CS,
          flap = Math.sin(t * 40) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath();
        ctx.ellipse(
          x - 3,
          y - e.r * 0.8,
          e.r * 0.5,
          e.r * (0.3 + flap * 0.3),
          -0.5,
          0,
          7,
        );
        ctx.ellipse(x + 3, y - e.r * 0.8, e.r * 0.5, e.r * (0.3 + flap * 0.3), 0.5, 0, 7);
        ctx.fill();
        ctx.fillStyle = e.col;
        ctx.beginPath();
        ctx.ellipse(x, y, e.r * 1.2, e.r * 0.8, 0, 0, 7);
        ctx.fill();
        if (e.kind !== 'beetle') {
          ctx.fillStyle = '#1a1405';
          ctx.fillRect(x - 2, y - e.r * 0.8, 3, e.r * 1.6);
          ctx.fillRect(x + 5, y - e.r * 0.7, 2.5, e.r * 1.4);
        }
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.fillRect(x - 12, y - e.r - 10, 24, 4);
        ctx.fillStyle = '#7cff6b';
        ctx.fillRect(x - 12, y - e.r - 10, 24 * Math.max(0, e.hp / e.max), 4);
      }
      for (const s of shots || []) {
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc((s.x + 0.5) * CS, (s.y + 0.5) * CS, s.splash ? 5 : 3, 0, 7);
        ctx.fill();
      }
    }
    lifecycle.requestAnimationFrame(draw);
  }
  towers = [];
  enemies = [];
  shots = [];
  money = 90;
  lives = 20;
  wave = 0;
  hud();
  $('next').disabled = true;
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    lifecycle.requestAnimationFrame(loop);
  })(last);
  lifecycle.requestAnimationFrame(draw);
}
