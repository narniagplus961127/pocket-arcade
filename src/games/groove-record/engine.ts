import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLSpanElement;
  groove: HTMLElement;
  combo: HTMLSpanElement;
  bpm: HTMLSpanElement;
  title: HTMLDivElement;
  play: HTMLButtonElement;
  over: HTMLDivElement;
  sScore: HTMLElement;
  sCombo: HTMLElement;
  sBest: HTMLElement;
  sAcc: HTMLElement;
  again: HTMLButtonElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  const TAU = Math.PI * 2;
  let W, H, DPR, CX, CY, RR;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
    CX = W / 2;
    CY = H / 2 + 24;
    RR = Math.min(W, H - 120) * 0.38;
  }
  lifecycle.listen(window, 'resize', resize);
  resize();
  const LANES = [
    {
      a: -Math.PI / 2,
      c: '#ff7a1a',
      f: 392.0,
    },
    {
      a: 0,
      c: '#f5b82e',
      f: 440.0,
    },
    {
      a: Math.PI / 2,
      c: '#2fb5a6',
      f: 523.25,
    },
    {
      a: Math.PI,
      c: '#e8577a',
      f: 587.33,
    },
  ];
  const KEYMAP = {
    ArrowUp: 0,
    w: 0,
    W: 0,
    ArrowRight: 1,
    d: 1,
    D: 1,
    ArrowDown: 2,
    s: 2,
    S: 2,
    ArrowLeft: 3,
    a: 3,
    A: 3,
  };
  const TRAVEL = 1.6;
  let AC = null,
    noiseBuf = null;
  function initAudio() {
    if (!AC) {
      AC = lifecycle.createAudioContext();
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (AC.state === 'suspended') AC.resume();
  }

  function kick(T) {
    const o = AC.createOscillator(),
      g = AC.createGain();
    o.frequency.setValueAtTime(140, T);
    o.frequency.exponentialRampToValueAtTime(42, T + 0.14);
    g.gain.setValueAtTime(0.5, T);
    g.gain.exponentialRampToValueAtTime(0.001, T + 0.25);
    o.connect(g).connect(AC.destination);
    o.start(T);
    o.stop(T + 0.3);
  }

  function noise(T, hp, dur, v) {
    const s = AC.createBufferSource(),
      f = AC.createBiquadFilter(),
      g = AC.createGain();
    s.buffer = noiseBuf;
    f.type = 'highpass';
    f.frequency.value = hp;
    g.gain.setValueAtTime(v, T);
    g.gain.exponentialRampToValueAtTime(0.001, T + dur);
    s.connect(f).connect(g).connect(AC.destination);
    s.start(T);
    s.stop(T + dur + 0.02);
  }

  function bass(T, f) {
    const o = AC.createOscillator(),
      g = AC.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(0.12, T + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, T + 0.22);
    o.connect(g).connect(AC.destination);
    o.start(T);
    o.stop(T + 0.25);
  }

  function pluck(f, v = 0.12) {
    const T = AC.currentTime,
      o = AC.createOscillator(),
      o2 = AC.createOscillator(),
      g = AC.createGain();
    o.type = 'triangle';
    o2.type = 'sine';
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(v, T + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, T + 0.4);
    o.connect(g);
    o2.connect(g);
    g.connect(AC.destination);
    o.start(T);
    o2.start(T);
    o.stop(T + 0.45);
    o2.stop(T + 0.45);
  }
  let best = 0;
  try {
    best = +localStorage.getItem('groove-record-best') || 0;
  } catch (e) {}
  let state = 'title',
    notes = [],
    fx = [],
    score = 0,
    combo = 0,
    maxCombo = 0,
    perfects = 0,
    groove = 100,
    bpm = 96,
    nextT = 0,
    step = 0,
    padFlash = [0, 0, 0, 0],
    spin = 0,
    lastLane = -1;
  const BASSLINE = [98, 98, 130.81, 116.54, 98, 87.31, 98, 130.81];
  function schedule(T, i) {
    const s8 = i % 8;
    if (s8 === 0 || s8 === 4) kick(T);
    if (s8 === 2 || s8 === 6) noise(T, 1800, 0.18, 0.22);
    noise(T, 7000, 0.04, s8 % 2 ? 0.05 : 0.08);
    if (s8 % 2 === 0) bass(T, BASSLINE[(Math.floor(i / 8) % 2) * 4 + s8 / 2]);
    if (i < 8) return; // one bar of count-in
    const lvl = Math.min((bpm - 96) / 60, 1);
    const p = s8 % 2 === 0 ? 0.55 + lvl * 0.3 : 0.08 + lvl * 0.35;
    if (Math.random() < p) {
      let lane = Math.floor(Math.random() * 4);
      if (lane === lastLane && Math.random() < 0.5)
        lane = (lane + 1 + Math.floor(Math.random() * 3)) % 4;
      lastLane = lane;
      notes.push({
        lane,
        t: T,
        done: false,
      });
    }
  }

  function start() {
    if (state === 'play') return;
    initAudio();
    state = 'play';
    notes = [];
    fx = [];
    score = 0;
    combo = 0;
    maxCombo = 0;
    perfects = 0;
    groove = 100;
    bpm = 96;
    step = 0;
    lastLane = -1;
    nextT = AC.currentTime + 0.6;
    $('title').hidden = true;
    $('over').hidden = true;
    hud();
  }

  function end() {
    state = 'over';
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('groove-record-best', String(best));
      } catch (e) {}
    }
    $('sScore').textContent = String(score);
    $('sCombo').textContent = String(maxCombo);
    $('sBest').textContent = String(best);
    $('sAcc').textContent = String(
      `Perfect hits: ${perfects}. Top tempo: ${Math.round(bpm)} bpm.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }

  function hud() {
    $('score').textContent = String(score);
    $('combo').textContent = String(combo);
    $('bpm').textContent = String(`${Math.round(bpm)} bpm`);
    $('groove').style.width = `${groove}%`;
  }

  function hit(lane) {
    if (state !== 'play') return;
    padFlash[lane] = 1;
    const now = AC.currentTime;
    let bestN = null,
      bd = 1;
    for (const n of notes)
      if (!n.done && n.lane === lane) {
        const d = Math.abs(n.t - now);
        if (d < bd) {
          bd = d;
          bestN = n;
        }
      }
    if (bestN && bd < 0.15) {
      bestN.done = true;
      const j = bd < 0.05 ? ['Perfect', 300] : bd < 0.1 ? ['Good', 120] : ['OK', 50];
      if (bd < 0.05) perfects++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      score += Number(j[1]) * (1 + Math.min(3, Math.floor(combo / 10)));
      groove = Math.min(100, groove + 3);
      fx.push({
        lane,
        txt: j[0],
        life: 0.7,
        ring: 0,
      });
      pluck(LANES[lane].f * (combo % 16 >= 8 ? 2 : 1));
    } else {
      combo = 0;
      pluck(LANES[lane].f / 2, 0.05);
    }
    hud();
  }
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key in KEYMAP) {
      e.preventDefault();
      if (!e.repeat) hit(KEYMAP[e.key]);
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') {
      e.preventDefault();
      start();
    }
  });
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    const a = Math.atan2(e.clientY - CY, e.clientX - CX);
    const lane = Math.round((a + Math.PI / 2) / (Math.PI / 2) + 4) % 4;
    hit(lane);
  });
  $('play').onclick = start;
  $('again').onclick = start;
  function update(dt) {
    spin += dt * (state === 'play' ? (bpm / 60) * 0.9 : 0.5);
    for (let i = 0; i < 4; i++) padFlash[i] = Math.max(0, padFlash[i] - dt * 4);
    for (const f of fx) {
      f.life -= dt;
      f.ring += dt * 120;
    }
    fx = fx.filter((f) => f.life > 0);
    if (state !== 'play') return;
    const now = AC.currentTime;
    while (nextT < now + TRAVEL + 0.1) {
      schedule(nextT, step);
      step++;
      nextT += 60 / bpm / 2;
      if (step % 64 === 0) bpm = Math.min(160, bpm + 6);
    }
    for (const n of notes)
      if (!n.done && now - n.t > 0.15) {
        n.done = true;
        n.miss = true;
        combo = 0;
        groove -= 11;
        fx.push({
          lane: n.lane,
          txt: 'Miss',
          life: 0.6,
          ring: 0,
          miss: true,
        });
        hud();
      }
    notes = notes.filter((n) => !n.done || now - n.t < 0.3);
    if (groove <= 0) {
      groove = 0;
      hud();
      end();
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#2a160d';
    ctx.fillRect(0, 0, W, H);
    // sunburst
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(spin * 0.05);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,122,26,.07)' : 'rgba(245,184,46,.05)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Math.hypot(W, H), (i / 24) * TAU, ((i + 1) / 24) * TAU);
      ctx.fill();
    }
    ctx.restore();
    // record
    ctx.fillStyle = '#120a07';
    ctx.beginPath();
    ctx.arc(CX, CY, RR * 1.08, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,233,207,.06)';
    ctx.lineWidth = 1;
    for (let r = RR * 0.36; r < RR * 1.05; r += 5) {
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, TAU);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(251,233,207,.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, RR * 0.8, -0.4, 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, RR * 0.6, 2.6, 3.2);
    ctx.stroke();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(0, 0, RR * 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f5b82e';
    ctx.beginPath();
    ctx.arc(0, 0, RR * 0.3, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#2a160d';
    ctx.font = `400 ${Math.round(RR * 0.085)}px Shrikhand, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('GROOVE', 0, -RR * 0.1);
    ctx.fillStyle = '#2a160d';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
    // lanes
    for (let i = 0; i < 4; i++) {
      const L = LANES[i];
      ctx.strokeStyle = 'rgba(251,233,207,.08)';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(L.a) * RR * 0.32, CY + Math.sin(L.a) * RR * 0.32);
      ctx.lineTo(CX + Math.cos(L.a) * RR, CY + Math.sin(L.a) * RR);
      ctx.stroke();
    }
    const now = state === 'play' ? AC.currentTime : 0;
    for (const n of notes) {
      if (n.done && !n.miss) continue;
      const p = 1 - (n.t - now) / TRAVEL;
      if (p < 0) continue;
      const r = RR * (0.32 + 0.68 * Math.min(p, 1.15)),
        L = LANES[n.lane];
      const x = CX + Math.cos(L.a) * r,
        y = CY + Math.sin(L.a) * r;
      ctx.globalAlpha = n.miss ? 0.3 : 1;
      ctx.fillStyle = L.c;
      ctx.beginPath();
      ctx.arc(x, y, 9 + p * 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fbe9cf';
      ctx.beginPath();
      ctx.arc(x, y, 3 + p * 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // pads
    for (let i = 0; i < 4; i++) {
      const L = LANES[i],
        x = CX + Math.cos(L.a) * RR,
        y = CY + Math.sin(L.a) * RR,
        f = padFlash[i];
      ctx.lineWidth = 5;
      ctx.strokeStyle = L.c;
      ctx.fillStyle = f ? L.c : '#120a07';
      ctx.globalAlpha = 0.4 + f * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, 24 + f * 5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 24 + f * 5, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#fbe9cf';
      ctx.font = '700 13px "DM Sans", system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(['↑', '→', '↓', '←'][i], x, y + 1);
      ctx.textBaseline = 'alphabetic';
    }
    for (const f of fx) {
      const L = LANES[f.lane],
        x = CX + Math.cos(L.a) * RR,
        y = CY + Math.sin(L.a) * RR;
      ctx.globalAlpha = Math.max(0, f.life / 0.7);
      if (!f.miss) {
        ctx.strokeStyle = L.c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 26 + f.ring * 0.4, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = f.miss ? '#c69a74' : '#fbe9cf';
      ctx.font = '400 18px Shrikhand, Georgia, serif';
      const ox = Math.cos(L.a) * 52,
        oy = Math.sin(L.a) * 52;
      ctx.fillText(f.txt, x + ox, y + oy - (1 - f.life) * 20);
    }
    ctx.globalAlpha = 1;
  }
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(frame);
  }
  lifecycle.requestAnimationFrame(frame);
}
