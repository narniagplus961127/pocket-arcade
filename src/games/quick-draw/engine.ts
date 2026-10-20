import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  wins: HTMLElement;
  last: HTMLElement;
  call: HTMLDivElement;
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
  let AC;
  function ac() {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return null;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function bang(v = 0.4) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime,
      len = a.sampleRate * 0.4,
      b = a.createBuffer(1, len, a.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = a.createBufferSource(),
      f = a.createBiquadFilter(),
      g = a.createGain();
    s.buffer = b;
    f.type = 'lowpass';
    f.frequency.value = 1800;
    g.gain.value = v;
    s.connect(f).connect(g).connect(a.destination);
    s.start(t);
  }

  function tone(f, d = 0.3, type = 'sine', v = 0.05) {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(),
      g = a.createGain(),
      t = a.currentTime;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
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
  const NAMES = [
    'Dusty Pete',
    'Two-Bit Tess',
    'Rattlesnake Ray',
    'Calamity Cora',
    'Black Bart',
    'The Kid',
    'Sidewinder Sal',
    'One-Eyed Jack',
    'Mad Maude',
    'The Stranger',
  ];
  let state = 'title',
    wins = 0,
    phase = 'idle',
    drawAt = 0,
    oppTime = 0,
    myTime = 0,
    timer = null,
    result = null,
    tumble = {
      x: -60,
      r: 0,
    },
    t = 0,
    best = 0,
    times = [];
  try {
    best = +localStorage.getItem('quick-draw-best') || 0;
  } catch (e) {}
  const oppName = () => NAMES[Math.min(wins, NAMES.length - 1)];
  function call(txt) {
    $('call').textContent = String(txt);
  }

  function round() {
    phase = 'wait';
    result = null;
    call('');
    state = 'play';
    oppTime = Math.max(0.2, 0.52 - wins * 0.035 + Math.random() * 0.06);
    lifecycle.setTimeout(() => {
      if (phase === 'wait') call('Ready…');
      tone(220, 0.4, 'triangle', 0.04);
    }, 600);
    const delay = 2000 + Math.random() * 3200;
    timer = lifecycle.setTimeout(() => {
      if (phase !== 'wait') return;
      phase = 'draw';
      drawAt = performance.now();
      call('DRAW!');
      tone(880, 0.15, 'square', 0.06);
      timer = lifecycle.setTimeout(() => {
        if (phase === 'draw') resolve(null);
      }, oppTime * 1000);
    }, delay);
  }

  function shoot() {
    if (state !== 'play') return;
    if (phase === 'wait') {
      lifecycle.clearTimeout(timer);
      phase = 'done';
      bang(0.25);
      call('Too early!');
      result = 'early';
      lifecycle.setTimeout(
        () => gameOver('You drew before the call. The whole town saw it.'),
        1100,
      );
      return;
    }
    if (phase === 'draw') {
      lifecycle.clearTimeout(timer);
      resolve((performance.now() - drawAt) / 1000);
    }
  }

  function resolve(mt) {
    phase = 'done';
    bang();
    if (mt !== null && mt < oppTime) {
      myTime = mt;
      times.push(mt);
      result = 'win';
      wins++;
      $('wins').textContent = String(wins);
      $('last').textContent = String(`${Math.round(mt * 1000)} ms`);
      call(`${Math.round(mt * 1000)} ms`);
      lifecycle.setTimeout(() => {
        tone(523, 0.2);
        tone(659, 0.25);
      }, 300);
      lifecycle.setTimeout(round, 1800);
    } else {
      result = 'lose';
      if (mt !== null) $('last').textContent = String(`${Math.round(mt * 1000)} ms`);
      call('Outdrawn');
      lifecycle.setTimeout(
        () =>
          gameOver(
            `${oppName()} drew in ${Math.round(oppTime * 1000)} ms${mt !== null ? `, and you took ${Math.round(mt * 1000)} ms` : ''}.`,
          ),
        1200,
      );
    }
  }

  function gameOver(why) {
    state = 'over';
    call('');
    if (wins > best) {
      best = wins;
      try {
        localStorage.setItem('quick-draw-best', String(best));
      } catch (e) {}
    }
    const avg = times.length
      ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 1000)
      : null;
    $('oTitle').textContent = String(
      wins ? `${wins} outlaw${wins > 1 ? 's' : ''} beaten` : 'Outdrawn',
    );
    $('oText').textContent = String(
      `${why} ${avg ? `Your average winning draw was ${avg} ms.` : ''} Town record: ${best}.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }

  function start() {
    wins = 0;
    times = [];
    $('wins').textContent = String(0);
    $('last').textContent = String('—');
    $('title').hidden = true;
    $('over').hidden = true;
    round();
  }
  $('play').onclick = start;
  $('again').onclick = start;
  lifecycle.listen(cv, 'pointerdown', (e) => {
    e.preventDefault();
    shoot();
  });
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (state === 'play') shoot();
      else if (state === 'title' || !$('over').hidden) start();
    }
  });
  function figure(x, y, s, flip, arm, down, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -s : s, s);
    if (down) {
      ctx.rotate(-1.3);
      ctx.translate(-20, 30);
    }
    ctx.fillStyle = col;
    ctx.fillRect(-9, -60, 18, 40);
    ctx.fillRect(-9, -20, 7, 34);
    ctx.fillRect(2, -20, 7, 34);
    ctx.beginPath();
    ctx.arc(0, -70, 10, 0, 7);
    ctx.fill();
    ctx.fillRect(-20, -82, 40, 5);
    ctx.fillRect(-10, -96, 20, 15);
    ctx.save();
    ctx.translate(7, -55);
    ctx.rotate(arm);
    ctx.fillRect(0, -3, 26, 6);
    if (arm < -0.5) ctx.fillRect(22, -6, 14, 5);
    ctx.restore();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f9d79a');
    g.addColorStop(0.62, '#f6c27a');
    g.addColorStop(0.62, '#d9965a');
    g.addColorStop(1, '#c47f45');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,248,220,.9)';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.18, 46, 0, 7);
    ctx.fill();
    const hz = H * 0.62;
    ctx.fillStyle = '#b5754a';
    ctx.beginPath();
    ctx.moveTo(0, hz);
    ctx.lineTo(W * 0.15, hz - 60);
    ctx.lineTo(W * 0.3, hz - 30);
    ctx.lineTo(W * 0.45, hz);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W * 0.6, hz);
    ctx.lineTo(W * 0.78, hz - 80);
    ctx.lineTo(W, hz - 20);
    ctx.lineTo(W, hz);
    ctx.fill();
    ctx.fillStyle = '#7a4a2b';
    [
      [0, 0.14],
      [0.86, 0.14],
    ].forEach(([fx, fw]) => {
      ctx.fillRect(W * fx, hz - 150, W * fw, 150);
      ctx.fillRect(W * fx - 10 + (fx ? 0 : 0), hz - 160, W * fw + 20, 14);
    });
    ctx.fillStyle = '#f3e3c3';
    ctx.font = `400 ${Math.max(11, W * 0.014)}px Rye`;
    ctx.textAlign = 'center';
    ctx.fillText('SALOON', W * 0.07, hz - 120);
    ctx.fillText('BANK', W * 0.93, hz - 120);
    tumble.x += 60 / 60;
    tumble.r += 0.05;
    if (tumble.x > W + 60) tumble.x = -60;
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      tumble.x,
      hz + 30 - Math.abs(Math.sin(tumble.r * 2)) * 14,
      14,
      tumble.r,
      tumble.r + 5.5,
    );
    ctx.stroke();
    const s = Math.min(1.6, H / 500),
      y = hz + 70;
    const myArm =
      phase === 'done' && result !== 'early' ? -1.4 : phase === 'done' ? -1.4 : 0.9;
    const oppArm = phase === 'done' && result !== 'win' ? -1.4 : 0.9;
    figure(W * 0.28, y, s, false, myArm, result === 'lose', '#2b1a10');
    figure(W * 0.72, y, s, true, oppArm, result === 'win', '#4a2a1a');
    ctx.fillStyle = '#2b1a10';
    ctx.font = `700 ${Math.max(12, 14)}px "Merriweather Sans"`;
    ctx.fillText('You', W * 0.28, y + 40 * s);
    ctx.fillText(
      state === 'play' || state === 'over' ? oppName() : '???',
      W * 0.72,
      y + 40 * s,
    );
    if (phase === 'done' && result !== 'early') {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.arc(W * 0.28 + 50 * s, y - 55 * s, 10, 0, 7);
      ctx.fill();
    }
  }
  (function loop() {
    draw();
    lifecycle.requestAnimationFrame(loop);
  })();
}
