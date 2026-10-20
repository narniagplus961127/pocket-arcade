import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function boom(isHit) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const length = Math.floor(audioCtx.sampleRate * (isHit ? 0.5 : 0.25));
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = isHit ? 700 : 2200;
    const gain = audioCtx.createGain();
    gain.gain.value = isHit ? 0.5 : 0.15;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audioCtx.destination);
    source.start(now);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Fleet ----------

const N = 10;
const FLEET = [
  {
    name: 'Carrier',
    size: 5,
  },
  {
    name: 'Battleship',
    size: 4,
  },
  {
    name: 'Cruiser',
    size: 3,
  },
  {
    name: 'Submarine',
    size: 3,
  },
  {
    name: 'Destroyer',
    size: 2,
  },
];

// Places every ship randomly, without touching another ship.
function placeFleet() {
  const taken = new Set();
  const ships = [];
  for (const spec of FLEET) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const horizontal = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horizontal ? N : N - spec.size + 1));
      const c = Math.floor(Math.random() * (horizontal ? N - spec.size + 1 : N));
      const cells = Array.from(
        {
          length: spec.size,
        },
        (_, k) => (horizontal ? r * N + c + k : (r + k) * N + c),
      );
      const touches = cells.some((i) => {
        const ri = Math.floor(i / N);
        const ci = i % N;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = ri + dr;
            const cc = ci + dc;
            if (rr >= 0 && rr < N && cc >= 0 && cc < N && taken.has(rr * N + cc))
              return true;
          }
        }
        return false;
      });
      if (!touches) {
        cells.forEach((i) => taken.add(i));
        ships.push({
          ...spec,
          cells,
        });
        break;
      }
    }
  }
  return ships;
}
const shipAt = (ships, i) => ships.find((s) => s.cells.includes(i));
const isSunk = (ship, shots) => ship.cells.every((i) => shots.has(i));

// ---------- Enemy admiral: hunt, then target ----------

function enemyShot(shots, myShips, level) {
  const open = [...Array(N * N).keys()].filter((i) => !shots.has(i));

  // Target mode: shoot next to hits that belong to ships not yet sunk.
  if (level > 0) {
    const liveHits = [...shots].filter((i) => {
      const ship = shipAt(myShips, i);
      return ship && !isSunk(ship, shots);
    });
    if (liveHits.length) {
      const candidates = [];
      for (const h of liveHits) {
        const r = Math.floor(h / N);
        const c = h % N;
        [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ].forEach(([dr, dc]) => {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < N && cc >= 0 && cc < N && !shots.has(rr * N + cc))
            candidates.push(rr * N + cc);
        });
      }
      // Prefer extending a line of two or more hits.
      if (liveHits.length >= 2) {
        const sameRow = liveHits.every(
          (h) => Math.floor(h / N) === Math.floor(liveHits[0] / N),
        );
        const inLine = candidates.filter((i) =>
          sameRow
            ? Math.floor(i / N) === Math.floor(liveHits[0] / N)
            : i % N === liveHits[0] % N,
        );
        if (inLine.length) return inLine[Math.floor(Math.random() * inLine.length)];
      }
      if (candidates.length)
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  // Hunt mode: on harder levels use a checkerboard pattern, since the smallest ship is two long.
  const pool =
    level === 2 ? open.filter((i) => (Math.floor(i / N) + (i % N)) % 2 === 0) : open;
  const list = pool.length ? pool : open;
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- Components ----------

const LETTERS = 'ABCDEFGHIJ';
function Board({
  title,
  ships,
  shots,
  revealShips,
  onShoot = undefined,
  disabled,
  lastShot,
}) {
  return (
    <section className="flex flex-col gap-2 min-w-0">
      <h2 className="font-stencil text-xl tracking-wider">{title}</h2>
      <div className="grid grid-cols-[18px_repeat(10,1fr)] gap-[2px] text-[10px] text-muted font-bold">
        <span />
        {LETTERS.split('').map((l) => (
          <span key={String(String(l))} className="text-center">
            {l}
          </span>
        ))}
        {Array.from({
          length: N,
        }).map((_, r) => (
          <React.Fragment key={String(String(r))}>
            <span className="flex items-center justify-center">{r + 1}</span>
            {Array.from({
              length: N,
            }).map((__, c) => {
              const i = r * N + c;
              const ship = shipAt(ships, i);
              const shot = shots.has(i);
              const sunk = ship && isSunk(ship, shots);
              let bg = 'bg-sea';
              if (ship && (revealShips || sunk)) bg = sunk ? 'bg-hit/70' : 'bg-hull';
              return (
                <button
                  key={String(String(c))}
                  type="button"
                  disabled={disabled || shot}
                  onClick={() => onShoot && onShoot(i)}
                  aria-label={`${LETTERS[c]}${r + 1}${shot ? (ship ? ', hit' : ', miss') : ''}`}
                  className={`relative aspect-square min-w-0 ${bg} rounded-[3px] border border-grid/60
                      enabled:hover:brightness-110 enabled:cursor-crosshair
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-hit
                      ${lastShot === i ? 'ring-2 ring-hit ring-offset-1 ring-offset-bg' : ''}`}
                >
                  {shot && ship && (
                    <span className="absolute inset-[18%] rounded-full bg-hit shadow-[0_0_8px_var(--hit)]" />
                  )}
                  {shot && !ship && (
                    <span className="absolute inset-[34%] rounded-full bg-splash" />
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function App() {
  usePageStyles(styles, 'Fleet Hunt');

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
  const [myShips, setMyShips] = useState(placeFleet);
  const [enemyShips, setEnemyShips] = useState(placeFleet);
  const [myShots, setMyShots] = useState(() => new Set());
  const [enemyShots, setEnemyShots] = useState(() => new Set());
  const [turn, setTurn] = useState('you');
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(1);
  const [log, setLog] = useState([
    'Your fleet is in position. Shuffle it if you like, then fire on enemy waters.',
  ]);
  const [lastMine, setLastMine] = useState(null);
  const [lastTheirs, setLastTheirs] = useState(null);
  const enemySunk = enemyShips.filter((s) => isSunk(s, myShots)).length;
  const mySunk = myShips.filter((s) => isSunk(s, enemyShots)).length;
  const winner =
    enemySunk === FLEET.length ? 'you' : mySunk === FLEET.length ? 'enemy' : null;
  const addLog = (line) => setLog((l) => [line, ...l].slice(0, 6));
  const fire = (i) => {
    if (turn !== 'you' || winner) return;
    setStarted(true);
    const next = new Set(myShots);
    next.add(i);
    setMyShots(next);
    setLastMine(i);
    const ship = shipAt(enemyShips, i);
    boom(Boolean(ship));
    const coord = `${LETTERS[i % N]}${Math.floor(i / N) + 1}`;
    if (ship) {
      addLog(
        isSunk(ship, next)
          ? `${coord}: hit, and you sank their ${ship.name}!`
          : `${coord}: hit!`,
      );
      if (enemyShips.every((s) => isSunk(s, next))) return; // victory, enemy does not fire
    } else {
      addLog(`${coord}: splash.`);
    }
    setTurn('enemy');
  };
  useEffect(() => {
    if (turn !== 'enemy' || winner) return undefined;
    const id = setTimeout(() => {
      const i = enemyShot(enemyShots, myShips, level);
      const next = new Set(enemyShots);
      next.add(i);
      setEnemyShots(next);
      setLastTheirs(i);
      const ship = shipAt(myShips, i);
      boom(Boolean(ship));
      const coord = `${LETTERS[i % N]}${Math.floor(i / N) + 1}`;
      if (ship)
        addLog(
          isSunk(ship, next)
            ? `Enemy fires at ${coord}: your ${ship.name} is sunk.`
            : `Enemy fires at ${coord}: you're hit.`,
        );
      else addLog(`Enemy fires at ${coord}: a miss.`);
      setTurn('you');
    }, 650);
    return () => clearTimeout(id);
  }, [turn, winner]);
  const restart = (nextLevel = level) => {
    setLevel(nextLevel);
    setMyShips(placeFleet());
    setEnemyShips(placeFleet());
    setMyShots(new Set());
    setEnemyShots(new Set());
    setTurn('you');
    setStarted(false);
    setLastMine(null);
    setLastTheirs(null);
    setLog(['A new engagement. Fire when ready.']);
  };
  return (
    <main className="font-body max-w-[1000px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-stencil text-[clamp(40px,11vw,64px)] leading-none tracking-wide">
            Fleet Hunt
          </h1>
          <p className="text-muted">
            Find and sink all five enemy ships before they find yours.
          </p>
        </div>
        <div className="flex gap-5 text-center">
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              Enemy sunk
            </div>
            <div className="font-stencil text-3xl">{enemySunk}/5</div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted">
              You lost
            </div>
            <div className="font-stencil text-3xl">{mySunk}/5</div>
          </div>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <Board
          title="Enemy waters"
          ships={enemyShips}
          shots={myShots}
          revealShips={Boolean(winner)}
          onShoot={fire}
          disabled={turn !== 'you' || Boolean(winner)}
          lastShot={lastMine}
        />
        <Board
          title="Your fleet"
          ships={myShips}
          shots={enemyShots}
          revealShips
          disabled
          lastShot={lastTheirs}
        />
      </div>

      {winner && (
        <p className="font-stencil text-3xl text-center" role="status">
          {winner === 'you' ? 'Victory at sea!' : 'Your fleet is lost.'}
        </p>
      )}

      <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
        <ol className="text-sm leading-relaxed" aria-live="polite">
          {log.map((line, i) => (
            <li
              key={String(String(i))}
              className={i === 0 ? 'font-semibold' : 'text-muted'}
            >
              {line}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {!started && (
            <button
              type="button"
              onClick={() => setMyShips(placeFleet())}
              className="rounded-md border-2 border-ink px-3 py-2 text-sm font-bold"
            >
              Shuffle my fleet
            </button>
          )}
          {['Cadet', 'Captain', 'Admiral'].map((name, i) => (
            <button
              key={String(String(name))}
              type="button"
              onClick={() => restart(i)}
              className={`rounded-md border-2 border-ink px-3 py-2 text-sm font-bold
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-hit
                  ${level === i ? 'bg-ink text-bg' : ''}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
export default App;
