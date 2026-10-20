import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'square', volume = 0.03) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Rules ----------

const GEMS = [
  {
    name: 'Ruby',
    color: '#e63946',
  },
  {
    name: 'Topaz',
    color: '#f4a261',
  },
  {
    name: 'Citrine',
    color: '#f9e04b',
  },
  {
    name: 'Emerald',
    color: '#2ec27e',
  },
  {
    name: 'Sapphire',
    color: '#3a86ff',
  },
  {
    name: 'Amethyst',
    color: '#9d4edd',
  },
];
const SLOTS = 4;
const ATTEMPTS = 10;
const makeCode = (allowRepeats) => {
  if (allowRepeats)
    return Array.from(
      {
        length: SLOTS,
      },
      () => Math.floor(Math.random() * GEMS.length),
    );
  return [...GEMS.keys()].sort(() => Math.random() - 0.5).slice(0, SLOTS);
};

// Exact = right gem, right slot. Near = right gem, wrong slot.
function score(guess, code) {
  let exact = 0;
  const guessLeft = [];
  const codeLeft = [];
  guess.forEach((g, i) => {
    if (g === code[i]) exact++;
    else {
      guessLeft.push(g);
      codeLeft.push(code[i]);
    }
  });
  let near = 0;
  guessLeft.forEach((g) => {
    const k = codeLeft.indexOf(g);
    if (k >= 0) {
      near++;
      codeLeft.splice(k, 1);
    }
  });
  return {
    exact,
    near,
  };
}

// ---------- Components ----------

function Gem({ index, size = 'md', onClick = undefined, label = undefined }) {
  const dim = size === 'lg' ? 'w-[clamp(40px,11vw,52px)]' : 'w-[clamp(28px,8vw,38px)]';
  if (index === null || index === undefined) {
    return (
      <span
        className={`${dim} aspect-square rounded-full bg-black/40 shadow-[inset_0_3px_6px_rgba(0,0,0,.6)] inline-block`}
      />
    );
  }
  const gem = GEMS[index];
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={label || gem.name}
      className={`${dim} aspect-square inline-block rotate-45 rounded-[22%] shadow-[0_3px_0_rgba(0,0,0,.4)]
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink`}
      style={{
        background: `linear-gradient(135deg, #ffffffcc 0%, ${gem.color} 35%, ${gem.color} 70%, #00000055 100%)`,
      }}
    />
  );
}

function Lamps({ exact, near }) {
  const lamps = [...Array(exact).fill('exact'), ...Array(near).fill('near')];
  while (lamps.length < SLOTS) lamps.push('off');
  return (
    <span className="grid grid-cols-2 gap-1" aria-label={`${exact} exact, ${near} close`}>
      {lamps.map((l, i) => (
        <span
          key={String(String(i))}
          className={`w-3 h-3 rounded-full ${l === 'exact' ? 'bg-lamp shadow-[0_0_8px_#ff3b3b]' : l === 'near' ? 'bg-ink' : 'bg-black/50'}`}
        />
      ))}
    </span>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Vault Breaker');

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
  const [repeats, setRepeats] = useState(false);
  const [code, setCode] = useState(() => makeCode(false));
  const [history, setHistory] = useState([]); // { guess, exact, near }
  const [current, setCurrent] = useState([]);
  const [state, setState] = useState('playing'); // playing | open | locked
  const [record, setRecord] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('vault-record')) || {
          opened: 0,
          best: null,
        }
      );
    } catch (e) {
      return {
        opened: 0,
        best: null,
      };
    }
  });
  const addGem = (i) => {
    if (state !== 'playing' || current.length >= SLOTS) return;
    if (!repeats && current.includes(i)) return;
    setCurrent([...current, i]);
    playTone(300 + i * 80, 0.05);
  };
  const removeLast = () => setCurrent(current.slice(0, -1));
  const submit = () => {
    if (current.length < SLOTS || state !== 'playing') return;
    const result = score(current, code);
    const nextHistory = [
      ...history,
      {
        guess: current,
        ...result,
      },
    ];
    setHistory(nextHistory);
    setCurrent([]);

    // Tumblers click once per exact match.
    Array.from({
      length: result.exact,
    }).forEach((_, i) => setTimeout(() => playTone(900, 0.04), i * 120));
    if (result.exact === SLOTS) {
      setState('open');
      const tries = nextHistory.length;
      const next = {
        opened: record.opened + 1,
        best: record.best ? Math.min(record.best, tries) : tries,
      };
      setRecord(next);
      try {
        localStorage.setItem('vault-record', String(JSON.stringify(next)));
      } catch (e) {
        /* storage unavailable */
      }
      [392, 523, 659, 784].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.25, 'triangle', 0.06), 500 + i * 120),
      );
    } else if (nextHistory.length >= ATTEMPTS) {
      setState('locked');
      playTone(110, 0.8, 'sawtooth', 0.05);
    }
  };
  useEffect(() => {
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= GEMS.length) addGem(n - 1);
      else if (e.key === 'Backspace') removeLast();
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const restart = (nextRepeats = repeats) => {
    setRepeats(nextRepeats);
    setCode(makeCode(nextRepeats));
    setHistory([]);
    setCurrent([]);
    setState('playing');
  };
  const rows = Array.from(
    {
      length: ATTEMPTS,
    },
    (_, i) => history[i] || null,
  );
  return (
    <main className="font-body max-w-[520px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(24px,7vw,34px)] leading-tight tracking-wide">
            Vault Breaker
          </h1>
          <p className="text-muted text-sm mt-1">
            Crack the four-gem combination in ten tries.
          </p>
        </div>
        <div className="text-right text-sm text-muted">
          Vaults opened <b className="text-ink font-display">{record.opened}</b>
          <br />
          Fewest tries <b className="text-ink font-display">{record.best ?? '–'}</b>
        </div>
      </header>

      <div className="brushed rounded-3xl p-4 border-4 border-[#555b66] shadow-2xl flex flex-col gap-2">
        <div className="flex items-center justify-between bg-plate rounded-xl px-3 py-2 mb-1">
          <span className="text-[11px] tracking-[.2em] uppercase text-muted">
            Combination
          </span>
          <span className="flex gap-3">
            {code.map((g, i) =>
              state === 'playing' ? (
                <span
                  key={String(String(i))}
                  className="w-[clamp(28px,8vw,38px)] aspect-square rounded-md bg-black/60 flex items-center justify-center text-muted font-display text-xs"
                >
                  ?
                </span>
              ) : (
                <Gem key={String(String(i))} index={g} />
              ),
            )}
          </span>
        </div>

        {rows.map((row, i) => {
          const isCurrent = i === history.length && state === 'playing';
          const gems = row ? row.guess : isCurrent ? current : [];
          return (
            <div
              key={String(String(i))}
              className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${isCurrent ? 'bg-plate ring-2 ring-lamp/50' : 'bg-plate/60'}`}
            >
              <span className="font-display text-xs text-muted w-6 tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex gap-3 flex-1">
                {Array.from({
                  length: SLOTS,
                }).map((_, k) => (
                  <Gem key={String(String(k))} index={gems[k] ?? null} />
                ))}
              </span>
              {row ? (
                <Lamps exact={row.exact} near={row.near} />
              ) : (
                <span className="w-7" />
              )}
            </div>
          );
        })}
      </div>

      {state === 'playing' ? (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-2 flex-wrap bg-plate rounded-2xl p-3">
            {GEMS.map((g, i) => (
              <Gem
                key={String(String(g.name))}
                index={i}
                size="lg"
                onClick={() => addGem(i)}
                label={`Add ${g.name} (key ${i + 1})`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={removeLast}
              className="flex-1 rounded-xl border-2 border-steel py-3 font-bold"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={current.length < SLOTS}
              className="flex-[2] rounded-xl bg-lamp text-white py-3 font-display text-sm tracking-widest disabled:opacity-40"
            >
              TRY COMBINATION
            </button>
          </div>
        </div>
      ) : (
        <div
          className="bg-plate rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap"
          role="status"
        >
          <p className="font-display text-sm leading-relaxed">
            {state === 'open'
              ? `The vault swings open in ${history.length} tries.`
              : 'Ten tries used. The alarm sounds. The code is shown above.'}
          </p>
          <button
            type="button"
            onClick={() => restart()}
            className="rounded-xl bg-lamp text-white px-4 py-2.5 font-bold"
          >
            New vault
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={repeats}
          onChange={(e) => restart(e.target.checked)}
          className="w-4 h-4 accent-[#ff3b3b]"
        />
        Harder vaults: a gem can appear more than once (starts a new vault)
      </label>

      <p className="text-sm text-muted leading-relaxed">
        After each try, a red lamp means a gem is in exactly the right slot, and a white
        lamp means the gem is in the combination but in another slot. Lamps don't say
        which gem they mean. Keys 1–6 add gems, Backspace removes one, and Enter tries the
        combination.
      </p>
    </main>
  );
}
export default App;
