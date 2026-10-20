import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  c: HTMLCanvasElement;
  score: HTMLElement;
  wpm: HTMLElement;
  ink: HTMLElement;
  type: HTMLInputElement;
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
  function click(f = 1800, d = 0.03, v = 0.05) {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime,
      len = Math.floor(AC.sampleRate * d),
      b = AC.createBuffer(1, len, AC.sampleRate),
      dd = b.getChannelData(0);
    for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = AC.createBufferSource(),
      fl = AC.createBiquadFilter(),
      g = AC.createGain();
    s.buffer = b;
    fl.type = 'bandpass';
    fl.frequency.value = f;
    g.gain.value = v * 4;
    s.connect(fl).connect(g).connect(AC.destination);
    s.start(t);
  }

  function bell() {
    try {
      AC = AC || lifecycle.createAudioContext();
    } catch (e) {
      return;
    }
    const t = AC.currentTime,
      o = AC.createOscillator(),
      g = AC.createGain();
    o.frequency.value = 2093;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + 0.85);
  }
  const WORDS = (
    'ink paper quill margin chapter novel draft letter ribbon carriage platen keys spool comma period stanza verse prose poem story author editor proof galley serif ' +
    'midnight lamp coffee rain window thunder storm drizzle puddle umbrella cloud gutter soaked drip splash ' +
    'whisper lantern harbor compass voyage meadow orchard willow ember velvet marble copper silver amber cobalt crimson ' +
    'plot twist villain hero mystery clue alibi witness detective sleuth cipher riddle secret archive library ' +
    'eloquent typewriter manuscript paragraph adjective adverb metaphor narrative character dialogue epilogue prologue punctuation'
  ).split(' ');
  let W,
    H,
    DPR,
    words,
    typed = 0,
    chars = 0,
    ink,
    state = 'title',
    spawnT,
    t0,
    elapsed,
    best = 0;
  try {
    best = +localStorage.getItem('typewriter-rain-best') || 0;
  } catch (e) {}

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width;
    H = r.height;
    cv.width = W * DPR;
    cv.height = H * DPR;
  }
  new ResizeObserver(resize).observe(cv);
  resize();
  function spawn() {
    const lvl = Math.min(elapsed / 120, 1);
    const pool = WORDS.filter((w) => w.length <= 5 + Math.floor(lvl * 8));
    let w;
    do {
      w = pool[Math.floor(Math.random() * pool.length)];
    } while (words.some((x) => x.w === w));
    ctx.font = '700 20px "Courier Prime", monospace';
    const wid = ctx.measureText(w).width;
    words.push({
      w,
      x: 20 + Math.random() * Math.max(10, W - wid - 40),
      y: 40,
      v: 22 + lvl * 38 + Math.random() * 10,
      struck: 0,
    });
  }

  function start() {
    words = [];
    typed = 0;
    chars = 0;
    ink = 5;
    state = 'play';
    spawnT = 0;
    t0 = performance.now();
    elapsed = 0;
    $('title').hidden = true;
    $('over').hidden = true;
    $('type').value = '';
    $('type').focus();
    hud();
  }

  function hud() {
    $('score').textContent = String(typed);
    $('ink').textContent = String('♦'.repeat(ink) + '♢'.repeat(5 - ink));
    $('wpm').textContent = String(
      elapsed > 3 ? Math.round(chars / 5 / (elapsed / 60)) : 0,
    );
  }

  function end() {
    state = 'over';
    if (typed > best) {
      best = typed;
      try {
        localStorage.setItem('typewriter-rain-best', String(best));
      } catch (e) {}
    }
    $('oText').textContent = String(
      `You struck out ${typed} words at about ${Math.round(chars / 5 / Math.max(elapsed / 60, 0.01))} words a minute. Best: ${best} words.`,
    );
    $('over').hidden = false;
    $('again').focus();
  }
  lifecycle.listen($('type'), 'input', (e) => {
    if (state !== 'play') return;
    click(1500 + Math.random() * 800);
    const v = $('type').value;
    if (/[\s]$/.test(v)) submit(v.trim());
  });
  lifecycle.listen($('type'), 'keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit($('type').value.trim());
    }
  });
  function submit(v) {
    $('type').value = '';
    if (!v) return;
    const i = words.findIndex((w) => !w.struck && w.w === v.toLowerCase());
    if (i >= 0) {
      words[i].struck = 0.001;
      typed++;
      chars += v.length + 1;
      bell();
      hud();
    } else click(400, 0.08, 0.08);
  }
  $('play').onclick = start;
  $('again').onclick = start;
  lifecycle.listen(cv, 'pointerdown', () => $('type').focus());
  function update(dt) {
    if (state !== 'play') return;
    elapsed = (performance.now() - t0) / 1000;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawn();
      spawnT = Math.max(0.9, 2.6 - elapsed * 0.015);
    }
    const floor = H - 70;
    for (const w of words) {
      if (w.struck) {
        w.struck += dt * 2;
        continue;
      }
      w.y += w.v * dt;
      if (w.y > floor) {
        w.dead = true;
        ink--;
        hud();
        click(200, 0.15, 0.1);
        if (ink <= 0) end();
      }
    }
    words = words.filter((w) => !w.dead && w.struck < 1);
    if (Math.floor(elapsed * 4) % 2) hud();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(179,38,30,.35)';
    ctx.fillRect(56, 0, 1.5, H);
    const typing = ($('type').value || '').toLowerCase().trim();
    ctx.font = '700 20px "Courier Prime", monospace';
    ctx.textBaseline = 'alphabetic';
    for (const w of words || []) {
      const a = w.struck ? 1 - w.struck : 1;
      ctx.globalAlpha = a;
      const match = !w.struck && typing && w.w.startsWith(typing);
      // drip trail
      ctx.strokeStyle = 'rgba(30,27,24,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w.x + 6, w.y - 26);
      ctx.lineTo(w.x + 6, w.y - 18);
      ctx.stroke();
      if (match) {
        ctx.fillStyle = '#b3261e';
        ctx.fillText(w.w.slice(0, typing.length), w.x, w.y);
        const off = ctx.measureText(w.w.slice(0, typing.length)).width;
        ctx.fillStyle = '#1e1b18';
        ctx.fillText(w.w.slice(typing.length), w.x + off, w.y);
      } else {
        ctx.fillStyle = '#1e1b18';
        ctx.fillText(w.w, w.x, w.y);
      }
      if (w.struck) {
        const wid = ctx.measureText(w.w).width;
        ctx.strokeStyle = '#b3261e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(w.x - 2, w.y - 7);
        ctx.lineTo(w.x - 2 + (wid + 4) * Math.min(1, w.struck * 3), w.y - 7);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    lifecycle.requestAnimationFrame(loop);
  })(last);
}
