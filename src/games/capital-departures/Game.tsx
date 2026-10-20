import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function chime(notes) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.18;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Data ----------
// Countries with a single, widely agreed capital.

const WORLD = {
  Europe: [
    ['France', 'Paris'],
    ['Germany', 'Berlin'],
    ['Italy', 'Rome'],
    ['Spain', 'Madrid'],
    ['Portugal', 'Lisbon'],
    ['Netherlands', 'Amsterdam'],
    ['Belgium', 'Brussels'],
    ['Switzerland', 'Bern'],
    ['Austria', 'Vienna'],
    ['Poland', 'Warsaw'],
    ['Czechia', 'Prague'],
    ['Hungary', 'Budapest'],
    ['Greece', 'Athens'],
    ['Sweden', 'Stockholm'],
    ['Norway', 'Oslo'],
    ['Denmark', 'Copenhagen'],
    ['Finland', 'Helsinki'],
    ['Ireland', 'Dublin'],
    ['Iceland', 'Reykjavík'],
    ['Romania', 'Bucharest'],
    ['Bulgaria', 'Sofia'],
    ['Croatia', 'Zagreb'],
    ['Serbia', 'Belgrade'],
    ['Ukraine', 'Kyiv'],
    ['Estonia', 'Tallinn'],
    ['Latvia', 'Riga'],
    ['Lithuania', 'Vilnius'],
    ['Slovakia', 'Bratislava'],
    ['Slovenia', 'Ljubljana'],
    ['United Kingdom', 'London'],
  ],
  Asia: [
    ['Japan', 'Tokyo'],
    ['China', 'Beijing'],
    ['South Korea', 'Seoul'],
    ['India', 'New Delhi'],
    ['Pakistan', 'Islamabad'],
    ['Bangladesh', 'Dhaka'],
    ['Thailand', 'Bangkok'],
    ['Vietnam', 'Hanoi'],
    ['Philippines', 'Manila'],
    ['Malaysia', 'Kuala Lumpur'],
    ['Nepal', 'Kathmandu'],
    ['Mongolia', 'Ulaanbaatar'],
    ['Iran', 'Tehran'],
    ['Iraq', 'Baghdad'],
    ['Saudi Arabia', 'Riyadh'],
    ['Turkey', 'Ankara'],
    ['Kazakhstan', 'Astana'],
    ['Afghanistan', 'Kabul'],
    ['Qatar', 'Doha'],
    ['Jordan', 'Amman'],
  ],
  Africa: [
    ['Egypt', 'Cairo'],
    ['Nigeria', 'Abuja'],
    ['Kenya', 'Nairobi'],
    ['Ethiopia', 'Addis Ababa'],
    ['Ghana', 'Accra'],
    ['Morocco', 'Rabat'],
    ['Algeria', 'Algiers'],
    ['Tunisia', 'Tunis'],
    ['Senegal', 'Dakar'],
    ['Tanzania', 'Dodoma'],
    ['Uganda', 'Kampala'],
    ['Rwanda', 'Kigali'],
    ['Zimbabwe', 'Harare'],
    ['Zambia', 'Lusaka'],
    ['Angola', 'Luanda'],
    ['Madagascar', 'Antananarivo'],
    ['Mali', 'Bamako'],
    ['Libya', 'Tripoli'],
    ['Namibia', 'Windhoek'],
    ['Botswana', 'Gaborone'],
  ],
  Americas: [
    ['United States', 'Washington, D.C.'],
    ['Canada', 'Ottawa'],
    ['Mexico', 'Mexico City'],
    ['Brazil', 'Brasília'],
    ['Argentina', 'Buenos Aires'],
    ['Chile', 'Santiago'],
    ['Peru', 'Lima'],
    ['Colombia', 'Bogotá'],
    ['Venezuela', 'Caracas'],
    ['Ecuador', 'Quito'],
    ['Uruguay', 'Montevideo'],
    ['Paraguay', 'Asunción'],
    ['Cuba', 'Havana'],
    ['Jamaica', 'Kingston'],
    ['Costa Rica', 'San José'],
    ['Panama', 'Panama City'],
    ['Guatemala', 'Guatemala City'],
    ['Honduras', 'Tegucigalpa'],
  ],
  Oceania: [
    ['Australia', 'Canberra'],
    ['New Zealand', 'Wellington'],
    ['Fiji', 'Suva'],
    ['Papua New Guinea', 'Port Moresby'],
    ['Samoa', 'Apia'],
    ['Tonga', 'Nukuʻalofa'],
    ['Vanuatu', 'Port Vila'],
    ['Solomon Islands', 'Honiara'],
  ],
};
const REGIONS = ['World', ...Object.keys(WORLD)];
const FLIGHTS = 12;
function makeFlights(region) {
  const pool =
    region === 'World'
      ? Object.entries(WORLD).flatMap(([r, list]) => list.map((c) => [...c, r]))
      : WORLD[region].map((c) => [...c, region]);
  return [...pool]
    .sort(() => Math.random() - 0.5)
    .slice(0, FLIGHTS)
    .map(([country, capital, r]) => {
      const sameRegion = WORLD[r]
        .map((c) => c[1])
        .filter((c) => c !== capital)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      return {
        country,
        capital,
        code: `${country.slice(0, 2).toUpperCase()}${100 + Math.floor(Math.random() * 900)}`,
        gate: `${'ABCDE'[Math.floor(Math.random() * 5)]}${1 + Math.floor(Math.random() * 30)}`,
        options: [capital, ...sameRegion].sort(() => Math.random() - 0.5),
      };
    });
}

// ---------- Components ----------

// A row of split-flap letters.
function Flaps({ text, size = 'lg' }) {
  const cell =
    size === 'lg'
      ? 'w-[clamp(18px,5.4vw,34px)] h-[clamp(28px,8vw,48px)] text-[clamp(16px,5vw,30px)]'
      : 'w-5 h-7 text-base';
  return (
    <div className="flex flex-wrap gap-[3px]" aria-label={text}>
      {text
        .toUpperCase()
        .split('')
        .map((ch, i) => (
          <span
            key={String(String(`${text}-${i}`))}
            className={`flip ${cell} bg-flap rounded-[3px] font-mono font-bold text-amber flex items-center justify-center relative
              after:absolute after:left-0 after:right-0 after:top-1/2 after:h-px after:bg-black/60`}
            style={{
              animationDelay: `${i * 0.03}s`,
            }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
    </div>
  );
}

function App() {
  usePageStyles(styles, 'Capital Departures');

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
  const [region, setRegion] = useState('World');
  const [flights, setFlights] = useState(() => makeFlights('World'));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [boarded, setBoarded] = useState(0);
  const [log, setLog] = useState([]);
  const done = index >= FLIGHTS;
  const flight = flights[index];
  const choose = (option) => {
    if (picked || done) return;
    setPicked(option);
    const right = option === flight.capital;
    if (right) {
      setBoarded((b) => b + 1);
      chime([659, 880]);
    } else {
      chime([330, 262]);
    }
    setLog((l) => [
      {
        ...flight,
        right,
      },
      ...l,
    ]);
  };
  const next = () => {
    setIndex((i) => i + 1);
    setPicked(null);
  };
  const restart = (r = region) => {
    setRegion(r);
    setFlights(makeFlights(r));
    setIndex(0);
    setPicked(null);
    setBoarded(0);
    setLog([]);
  };
  useEffect(() => {
    if (!done) return;
    try {
      const key = `capitals-best-${region}`;
      const best = Number(localStorage.getItem(key)) || 0;
      if (boarded > best) localStorage.setItem(key, String(boarded));
    } catch (e) {
      // Storage may be unavailable.
    }
  }, [done]);
  useEffect(() => {
    const onKey = (e) => {
      if (done) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && !picked) choose(flight.options[n - 1]);
      if (e.key === 'Enter' && picked) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  let best = 0;
  try {
    best = Number(localStorage.getItem(`capitals-best-${region}`)) || 0;
  } catch (e) {
    best = 0;
  }
  return (
    <main className="font-body max-w-[820px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[.3em] uppercase text-muted">
            Terminal 2 · International
          </div>
          <h1 className="text-[clamp(30px,8vw,48px)] leading-none font-bold mt-1">
            Capital Departures
          </h1>
          <p className="text-muted mt-1">
            Each flight goes to a country's capital. Pick the right city to board.
          </p>
        </div>
        <div className="text-right font-mono">
          <div className="text-[11px] tracking-[.2em] uppercase text-muted">Boarded</div>
          <div className="text-4xl text-amber">
            {boarded}/{FLIGHTS}
          </div>
        </div>
      </header>

      <section className="bg-board rounded-xl p-4 sm:p-6 shadow-2xl border border-white/5 flex flex-col gap-5">
        {!done ? (
          <>
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center text-xs font-mono text-muted uppercase tracking-widest">
              <span>Flight</span>
              <span>Destination country</span>
              <span>Gate</span>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
              <Flaps text={flight.code} size="sm" key={String(String(`c${index}`))} />
              <Flaps text={flight.country} key={String(String(`d${index}`))} />
              <Flaps text={flight.gate} size="sm" key={String(String(`g${index}`))} />
            </div>

            <p className="text-sm text-muted">
              Which city is the capital? Flight {index + 1} of {FLIGHTS}.
            </p>

            <div className="grid sm:grid-cols-2 gap-2">
              {flight.options.map((o, i) => {
                const right = picked && o === flight.capital;
                const wrong = picked === o && o !== flight.capital;
                return (
                  <button
                    key={String(String(o))}
                    type="button"
                    onClick={() => choose(o)}
                    disabled={Boolean(picked)}
                    className={`rounded-lg px-4 py-3 text-left font-mono font-bold border-2 transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber
                        ${right ? 'border-go bg-go/15 text-go' : wrong ? 'border-stop bg-stop/15 text-stop' : 'border-white/15 hover:border-amber hover:text-amber'}`}
                  >
                    <span className="text-muted mr-2">{i + 1}</span>
                    {o}
                  </button>
                );
              })}
            </div>

            {picked && (
              <div
                className="flex items-center justify-between gap-3 flex-wrap"
                role="status"
              >
                <span
                  className={`font-mono font-bold ${picked === flight.capital ? 'text-go' : 'text-stop'}`}
                >
                  {picked === flight.capital
                    ? 'BOARDING. Have a good flight.'
                    : `GATE CLOSED. The capital is ${flight.capital}.`}
                </span>
                <button
                  type="button"
                  onClick={next}
                  className="rounded-lg bg-amber text-hall px-5 py-2.5 font-bold"
                >
                  {index + 1 === FLIGHTS ? "See the day's log" : 'Next departure'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Flaps
              text={
                boarded >= 10 ? 'FREQUENT FLYER' : boarded >= 6 ? 'ON TIME' : 'DELAYED'
              }
            />
            <p>
              You boarded {boarded} of {FLIGHTS} flights. Best for {region}:{' '}
              {Math.max(best, boarded)}.
            </p>
            <button
              type="button"
              onClick={() => restart()}
              className="self-start rounded-lg bg-amber text-hall px-5 py-2.5 font-bold"
            >
              New day of flights
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => (
          <button
            key={String(String(r))}
            type="button"
            onClick={() => restart(r)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber
                ${region === r ? 'bg-amber text-hall border-amber' : 'border-white/25'}`}
          >
            {r}
          </button>
        ))}
      </div>

      {log.length > 0 && (
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="text-muted text-left">
              <th className="py-1 font-normal">Flight</th>
              <th className="font-normal">Country</th>
              <th className="font-normal">Capital</th>
              <th className="font-normal text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {log.slice(0, 6).map((f, i) => (
              <tr key={String(String(i))} className="border-t border-white/10">
                <td className="py-1.5 text-amber">{f.code}</td>
                <td>{f.country}</td>
                <td>{f.capital}</td>
                <td className={`text-right ${f.right ? 'text-go' : 'text-stop'}`}>
                  {f.right ? 'Boarded' : 'Missed'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
export default App;
