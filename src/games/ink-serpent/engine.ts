import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  score: HTMLSpanElement;
  c: HTMLCanvasElement;
  over: HTMLDivElement;
  oTitle: HTMLElement;
  oText: HTMLElement;
  go: HTMLButtonElement;
  best: HTMLElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const cv = getGameElement<HTMLCanvasElement>('c'),
    ctx = cv.getContext('2d'),
    $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
      getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.12, type = 'sine', v = 0.07, sl = 0) {
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
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const store = {
    get: (k) => {
      try {
        return +localStorage.getItem(k) || 0;
      } catch (e) {
        return 0;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, String(v));
      } catch (e) {}
    },
  };
  const N = 20;
  let snake,
    dir,
    queue,
    food,
    score,
    alive = false,
    acc = 0,
    stepT = 0.14,
    best = store.get('ink-serpent-best'),
    drips = [];
  $('best').textContent = String(best);
  let SIZE = 0,
    DPR = 1;
  function fit() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    SIZE = cv.getBoundingClientRect().width;
    cv.width = SIZE * DPR;
    cv.height = SIZE * DPR;
  }
  new ResizeObserver(fit).observe(cv);
  fit();
  function place() {
    do {
      food = {
        x: Math.floor(Math.random() * N),
        y: Math.floor(Math.random() * N),
      };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function start() {
    snake = [
      {
        x: 8,
        y: 10,
      },
      {
        x: 7,
        y: 10,
      },
      {
        x: 6,
        y: 10,
      },
    ];
    dir = {
      x: 1,
      y: 0,
    };
    queue = [];
    score = 0;
    stepT = 0.14;
    acc = 0;
    drips = [];
    alive = true;
    place();
    $('score').textContent = String(0);
    $('over').hidden = true;
    tone(330, 0.2, 'triangle');
  }

  function turn(x, y) {
    if (!alive) return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (last.x === -x && last.y === -y) return;
    if (last.x === x && last.y === y) return;
    if (queue.length < 3)
      queue.push({
        x,
        y,
      });
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const h = {
      x: snake[0].x + dir.x,
      y: snake[0].y + dir.y,
    };
    if (
      h.x < 0 ||
      h.y < 0 ||
      h.x >= N ||
      h.y >= N ||
      snake.slice(0, -1).some((s) => s.x === h.x && s.y === h.y)
    )
      return die();
    snake.unshift(h);
    if (h.x === food.x && h.y === food.y) {
      score++;
      $('score').textContent = String(score);
      drips.push({
        x: food.x,
        y: food.y,
        r: 0,
      });
      if (score % 5 === 0) stepT = Math.max(0.06, stepT - 0.012);
      tone(440 + (score % 8) * 55, 0.12, 'triangle', 0.07);
      place();
    } else snake.pop();
  }

  function die() {
    alive = false;
    tone(160, 0.5, 'sawtooth', 0.06, 0.5);
    if (score > best) {
      best = score;
      store.set('ink-serpent-best', best);
      $('best').textContent = String(best);
    }
    $('oTitle').textContent = String(
      score >= 30
        ? 'A masterful stroke'
        : score >= 12
          ? 'A fine stroke'
          : 'The ink ran dry',
    );
    $('oText').textContent = String(`${score} drops of ink. Best: ${best}.`);
    $('go').textContent = String('Fresh sheet');
    $('over').hidden = false;
    $('go').focus();
  }
  $('go').onclick = start;
  const KEYS = {
    ArrowUp: [0, -1],
    w: [0, -1],
    ArrowDown: [0, 1],
    s: [0, 1],
    ArrowLeft: [-1, 0],
    a: [-1, 0],
    ArrowRight: [1, 0],
    d: [1, 0],
  };
  lifecycle.listen(window, 'keydown', (e) => {
    const k = KEYS[e.key] || KEYS[e.key.toLowerCase?.()];
    if (k) {
      e.preventDefault();
      turn(...(k as [number, number]));
    } else if ((e.key === ' ' || e.key === 'Enter') && !alive) {
      e.preventDefault();
      start();
    }
  });
  document.querySelectorAll<HTMLElement>('.pad button').forEach((b) =>
    lifecycle.listen(b, 'pointerdown', (e) => {
      e.preventDefault();
      turn(...(b.dataset.d.split(',').map(Number) as [number, number]));
    }),
  );
  let sw = null;
  lifecycle.listen(cv, 'pointerdown', (e) => {
    sw = {
      x: e.clientX,
      y: e.clientY,
    };
  });
  lifecycle.listen(cv, 'pointerup', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x,
      dy = e.clientY - sw.y;
    sw = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
  });
  function draw(t) {
    if (!SIZE) return lifecycle.requestAnimationFrame(draw);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const c = SIZE / N;
    ctx.fillStyle = '#eeeadf';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(22,19,15,.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < N; i++) {
      ctx.beginPath();
      ctx.moveTo(i * c, 0);
      ctx.lineTo(i * c, SIZE);
      ctx.moveTo(0, i * c);
      ctx.lineTo(SIZE, i * c);
      ctx.stroke();
    }
    for (const d of drips) {
      d.r += 0.6;
      ctx.fillStyle = `rgba(22,19,15,${Math.max(0, 0.12 - d.r / 400)})`;
      ctx.beginPath();
      ctx.arc((d.x + 0.5) * c, (d.y + 0.5) * c, c * 0.4 + d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    drips = drips.filter((d) => d.r < 48);
    if (snake) {
      // ink drop
      const fx = (food.x + 0.5) * c,
        fy = (food.y + 0.5) * c,
        b = Math.sin(t / 300) * c * 0.04;
      ctx.fillStyle = '#c23a2b';
      ctx.beginPath();
      ctx.moveTo(fx, fy - c * 0.38 - b);
      ctx.bezierCurveTo(
        fx + c * 0.32,
        fy,
        fx + c * 0.22,
        fy + c * 0.32,
        fx,
        fy + c * 0.32,
      );
      ctx.bezierCurveTo(
        fx - c * 0.22,
        fy + c * 0.32,
        fx - c * 0.32,
        fy,
        fx,
        fy - c * 0.38 - b,
      );
      ctx.fill();
      // brush stroke body: thick at the head, dry and thin at the tail
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = snake.length - 1; i > 0; i--) {
        const a = snake[i],
          p = snake[i - 1],
          k = 1 - i / (snake.length + 2);
        ctx.strokeStyle = `rgba(22,19,15,${0.55 + k * 0.45})`;
        ctx.lineWidth = c * (0.35 + k * 0.45);
        ctx.beginPath();
        ctx.moveTo((a.x + 0.5) * c, (a.y + 0.5) * c);
        ctx.lineTo((p.x + 0.5) * c, (p.y + 0.5) * c);
        ctx.stroke();
      }
      const h = snake[0];
      ctx.fillStyle = '#16130f';
      ctx.beginPath();
      ctx.arc((h.x + 0.5) * c, (h.y + 0.5) * c, c * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eeeadf';
      const ex = dir.y * c * 0.18,
        ey = dir.x * c * 0.18;
      ctx.beginPath();
      ctx.arc(
        (h.x + 0.5) * c + dir.x * c * 0.15 + ex,
        (h.y + 0.5) * c + dir.y * c * 0.15 + ey,
        c * 0.07,
        0,
        7,
      );
      ctx.arc(
        (h.x + 0.5) * c + dir.x * c * 0.15 - ex,
        (h.y + 0.5) * c + dir.y * c * 0.15 - ey,
        c * 0.07,
        0,
        7,
      );
      ctx.fill();
    }
    lifecycle.requestAnimationFrame(draw);
  }
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (alive) {
      acc += dt;
      while (acc >= stepT && alive) {
        acc -= stepT;
        step();
      }
    }
    lifecycle.requestAnimationFrame(loop);
  })(last);
  snake = [
    {
      x: 8,
      y: 10,
    },
    {
      x: 7,
      y: 10,
    },
    {
      x: 6,
      y: 10,
    },
  ];
  dir = {
    x: 1,
    y: 0,
  };
  place();
  lifecycle.requestAnimationFrame(draw);
}
