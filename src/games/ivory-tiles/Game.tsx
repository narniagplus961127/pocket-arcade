import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.05, type = 'triangle', volume = 0.03) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}
const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A soft piano-ish voice: a triangle body, a quiet octave overtone, and a long decay.
function playNotes(notes) {
  notes.forEach((m) => {
    const f = midiToFreq(m);
    const low = m < 60;
    playTone(f, low ? 1.4 : 1.1, low ? 'sine' : 'triangle', low ? 0.07 : 0.06);
    playTone(f * 2, 0.4, 'sine', 0.012);
  });
}

// ---------- Programme ----------
// Each tap plays the next step. A step is a list of MIDI notes sounded together.
// All three pieces are long out of copyright.

const C4 = 60;
const ODE = [
  64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 64, 64, 65, 67, 67, 65, 64,
  62, 60, 60, 62, 64, 62, 60, 60, 62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62,
  60, 62, 55, 64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60,
].map((m) => [m]);
const ELISE = [
  76,
  75,
  76,
  75,
  76,
  71,
  74,
  72,
  69,
  C4,
  64,
  69,
  71,
  64,
  68,
  71,
  72,
  64,
  76,
  75,
  76,
  75,
  76,
  71,
  74,
  72,
  69,
  C4,
  64,
  69,
  71,
  64,
  72,
  71,
  69,
].map((m) => [m]);

// Pachelbel: the famous ground bass under the first two violin lines.
const CANON_BASS = [62, 57, 59, 54, 55, 50, 55, 57];
const CANON_TOP = [78, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 67, 66, 67, 64];
const CANON = CANON_TOP.map((m, i) => [CANON_BASS[i % 8], m]);
const PIECES = [
  {
    title: 'Ode to Joy',
    composer: 'Beethoven',
    steps: ODE,
  },
  {
    title: 'Für Elise',
    composer: 'Beethoven',
    steps: ELISE,
  },
  {
    title: 'Canon in D',
    composer: 'Pachelbel',
    steps: CANON,
  },
];

// ---------- Board ----------

const LANES = 4;
const VISIBLE_ROWS = 4;
const BASE = 1; // the first tile starts one row above the bottom edge
const KEYS = ['d', 'f', 'j', 'k'];
const BEST_KEY = 'ivory-tiles-best';
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
};
function newGame() {
  const g = {
    rows: [],
    next: 0,
    scroll: 0,
    started: false,
    fail: null,
    failing: 0,
    piece: 0,
    step: 0,
    ripples: [],
  };
  extendRows(g);
  return g;
}

// Keeps plenty of rows ahead. Each row has exactly one dark tile, never three in a row in one lane.
function extendRows(g) {
  while (g.rows.length < g.next + 10) {
    const n = g.rows.length;
    let lane = Math.floor(Math.random() * LANES);
    if (n >= 2 && g.rows[n - 1] === lane && g.rows[n - 2] === lane)
      lane = (lane + 1 + Math.floor(Math.random() * 3)) % LANES;
    g.rows.push(lane);
  }
}

// Row n's bottom edge, measured in rows up from the bottom of the board.
const rowBottom = (g, n) => n + BASE - g.scroll;

// Tiles per second, rising as you play.
const speedOf = (g) => Math.min(8.5, 2.3 + g.next * 0.045);

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Ivory Tiles');

  // Close the synthesizer when this game leaves the page.
  React.useEffect(
    () => () => {
      if (audioCtx) {
        void audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    },
    [],
  );
  const canvasRef = useRef(null);
  const game = useRef(null);
  const [phase, setPhase] = useState('ready');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [hud, setHud] = useState({
    score: 0,
    piece: 0,
  });
  const [best, setBest] = useState(readBest);
  const start = () => {
    game.current = newGame();
    setHud({
      score: 0,
      piece: 0,
    });
    setPhase('playing');
  };
  const fail = (row, lane) => {
    const g = game.current;
    g.fail = {
      row,
      lane,
    };
    g.failing = 1;
    // Pull the board back so the mistake is in view.
    g.scrollTarget = Math.min(g.scroll, row + BASE - 0.4);
    playTone(midiToFreq(37), 0.9, 'sawtooth', 0.05);
    playTone(midiToFreq(38), 0.9, 'sawtooth', 0.05);
  };
  const hit = () => {
    const g = game.current;
    const lane = g.rows[g.next];
    const piece = PIECES[g.piece];
    playNotes(piece.steps[g.step]);
    g.ripples.push({
      row: g.next,
      lane,
      life: 0.35,
    });
    g.started = true;
    g.next += 1;
    g.step += 1;
    if (g.step >= piece.steps.length) {
      g.step = 0;
      g.piece = (g.piece + 1) % PIECES.length;
    }
    extendRows(g);
  };

  // A tap on `lane`. rowPos is the board row under the finger, or null for the D F J K keys.
  const tap = (lane, rowPos) => {
    const g = game.current;
    if (!g || phaseRef.current !== 'playing' || g.failing > 0) return;
    const target = g.next;
    const targetLane = g.rows[target];
    if (rowPos === null) {
      // Keys only count once the next tile is actually on screen.
      if (rowBottom(g, target) > VISIBLE_ROWS - 0.3) return;
      if (lane === targetLane) hit();
      else fail(target, lane);
      return;
    }

    // Generous vertical tolerance on the right lane.
    if (lane === targetLane && Math.abs(rowPos - (target + 0.5)) < 0.9) {
      hit();
      return;
    }
    const row = Math.floor(rowPos);
    if (row < target) return; // already played rows are harmless
    if (g.rows[row] !== lane) fail(row, lane); // ivory tapped
    // A dark tile further up is simply ignored: tiles must go in order.
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    const gameOver = (g) => {
      phaseRef.current = 'over';
      setPhase('over');
      setBest((b) => {
        const next = Math.max(b, g.next);
        try {
          localStorage.setItem(BEST_KEY, String(next));
        } catch (e) {
          // Storage unavailable.
        }
        return next;
      });
    };
    const update = (dt) => {
      const g = game.current;
      if (!g) return;
      g.ripples.forEach((r) => {
        r.life -= dt;
      });
      g.ripples = g.ripples.filter((r) => r.life > 0);
      if (phaseRef.current !== 'playing') return;
      if (g.failing > 0) {
        g.failing -= dt;
        g.scroll += (g.scrollTarget - g.scroll) * Math.min(1, dt * 10);
        if (g.failing <= 0) gameOver(g);
        return;
      }
      if (g.started) {
        g.scroll += speedOf(g) * dt;
        // Letting a dark tile slide off the bottom ends the concert.
        if (rowBottom(g, g.next) < -0.6) fail(g.next, g.rows[g.next]);
      }
      const hudKey = `${g.next}|${g.piece}`;
      if (hudKey !== g.hudKey) {
        g.hudKey = hudKey;
        setHud({
          score: g.next,
          piece: g.piece,
        });
      }
    };
    const draw = (now) => {
      const g = game.current;
      const w = canvas.width;
      const h = canvas.height;
      const laneW = w / LANES;
      const rowH = h / VISIBLE_ROWS;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Ivory lanes with a warm, slightly aged gradient.
      const ivory = ctx.createLinearGradient(0, 0, 0, h);
      ivory.addColorStop(0, '#e9dec4');
      ivory.addColorStop(1, '#f6eedc');
      ctx.fillStyle = ivory;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(120,100,70,0.35)';
      for (let k = 1; k < LANES; k++)
        ctx.fillRect(Math.round(k * laneW), 0, Math.max(1, w * 0.003), h);

      // Key letters at the foot of each lane
      ctx.fillStyle = 'rgba(120,100,70,0.45)';
      ctx.font = `${rowH * 0.16}px Bellefair, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      KEYS.forEach((key, k) =>
        ctx.fillText(key.toUpperCase(), (k + 0.5) * laneW, h - rowH * 0.12),
      );
      if (!g) return;
      const first = Math.max(0, Math.floor(g.scroll - BASE) - 1);
      for (let n = first; n < first + VISIBLE_ROWS + 3 && n < g.rows.length; n++) {
        const bottomY = h - rowBottom(g, n) * rowH;
        const topY = bottomY - rowH;
        if (bottomY < 0 || topY > h) continue;
        const lane = g.rows[n];
        const x = lane * laneW;
        const pad = Math.max(1, laneW * 0.02);
        const played = n < g.next;

        // Lacquered dark tile; played tiles sink back to a soft grey.
        if (played) {
          ctx.fillStyle = 'rgba(30,26,22,0.18)';
          ctx.fillRect(x + pad, topY + pad, laneW - pad * 2, rowH - pad * 2);
        } else {
          const lacquer = ctx.createLinearGradient(x, topY, x + laneW, bottomY);
          lacquer.addColorStop(0, '#2b2723');
          lacquer.addColorStop(0.5, '#0f0e0c');
          lacquer.addColorStop(1, '#1d1a17');
          ctx.fillStyle = lacquer;
          ctx.fillRect(x + pad, topY + pad, laneW - pad * 2, rowH - pad * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + pad * 3, topY + pad * 3, laneW * 0.12, rowH - pad * 6);
          ctx.fillStyle = '#c9a45c';
          ctx.fillRect(
            x + pad,
            bottomY - pad - Math.max(2, rowH * 0.025),
            laneW - pad * 2,
            Math.max(2, rowH * 0.025),
          );
        }
        if (n === 0 && !g.started) {
          ctx.fillStyle = '#c9a45c';
          ctx.font = `${Math.min(laneW * 0.28, rowH * 0.2)}px Bellefair, serif`;
          ctx.fillText('START', x + laneW / 2, topY + rowH / 2);
        }
      }

      // Ripples from a good tap
      g.ripples.forEach((r) => {
        const bottomY = h - rowBottom(g, r.row) * rowH;
        const t = 1 - r.life / 0.35;
        ctx.strokeStyle = `rgba(201,164,92,${1 - t})`;
        ctx.lineWidth = Math.max(2, laneW * 0.03);
        ctx.beginPath();
        ctx.arc(
          (r.lane + 0.5) * laneW,
          bottomY - rowH / 2,
          laneW * (0.2 + t * 0.4),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      });

      // The mistake blinks red.
      if (g.fail && Math.floor(now / 120) % 2 === 0) {
        const bottomY = h - rowBottom(g, g.fail.row) * rowH;
        ctx.fillStyle = 'rgba(170,32,28,0.85)';
        ctx.fillRect(g.fail.lane * laneW, bottomY - rowH, laneW, rowH);
      }

      // Score, printed in gold at the head of the board.
      ctx.font = `${rowH * 0.42}px Bellefair, serif`;
      ctx.lineWidth = Math.max(2, rowH * 0.03);
      ctx.strokeStyle = 'rgba(13,12,11,0.65)';
      ctx.strokeText(String(g.next), w / 2, rowH * 0.32);
      ctx.fillStyle = '#c9a45c';
      ctx.fillText(String(g.next), w / 2, rowH * 0.32);
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e) => {
      if (e.repeat) return;
      const lane = KEYS.indexOf(e.key.toLowerCase());
      if (lane >= 0 && phaseRef.current === 'playing') {
        e.preventDefault();
        tap(lane, null);
      }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current !== 'playing') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Mouse and touch taps; each finger counts separately.
  const onPointerDown = (e) => {
    const g = game.current;
    if (!g) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const lane = Math.max(0, Math.min(LANES - 1, Math.floor((x / rect.width) * LANES)));
    const rowPos = ((rect.height - y) / rect.height) * VISIBLE_ROWS + g.scroll - BASE;
    tap(lane, rowPos);
  };
  const piece = PIECES[hud.piece];
  return (
    <main className="font-body max-w-[480px] mx-auto py-5 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3 border-b border-[#c9a45c99] pb-3">
        <div>
          <h1 className="font-display text-[clamp(36px,11vw,56px)] leading-none tracking-wide">
            Ivory Tiles
          </h1>
          <p className="text-sm text-muted italic">
            Now playing: <span className="text-gold not-italic">{piece.title}</span> ·{' '}
            {piece.composer}
          </p>
        </div>
        <div className="text-right text-sm text-muted">
          <div>
            Tiles <b className="font-display text-2xl text-ink">{hud.score}</b>
          </div>
          <div>Best {Math.max(best, hud.score)}</div>
        </div>
      </header>

      <div
        className="relative mx-auto border-[6px] border-[#16130f] rounded-sm shadow-[0_0_0_1px_#c9a45c66,0_20px_40px_rgba(0,0,0,0.6)]"
        style={{
          width: 'min(100%, calc(72vh * 0.75))',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          aria-label="Piano tiles"
          className="w-full block touch-none select-none"
          style={{
            aspectRatio: '3 / 4',
          }}
        />

        {phase !== 'playing' && (
          <div className="absolute inset-0 bg-card flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="font-display text-4xl text-gold">
              {phase === 'over' ? 'The final bow' : 'Recital'}
            </p>
            <p className="max-w-[32ch]">
              {phase === 'over'
                ? `You played ${hud.score} notes of ${piece.title}. Best: ${Math.max(best, hud.score)}.`
                : 'Tap the black tile in each row, from the bottom up. Each tap plays the next note of the tune.'}
            </p>
            <p className="text-sm text-muted max-w-[32ch]">
              Touching the ivory ends the recital, and so does letting a black tile slip
              past. The tempo rises as you go.
            </p>
            <p className="text-sm text-muted">Tap or click, or use the keys D F J K.</p>
            <button
              type="button"
              onClick={start}
              className="font-display text-2xl px-8 py-2 border border-gold text-gold hover:bg-gold hover:text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ivory"
            >
              {phase === 'over' ? 'Play again' : 'Begin'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export default App;
