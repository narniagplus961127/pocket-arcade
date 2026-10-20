import React, { useState, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.15, type = 'triangle', volume = 0.05) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Question bank ----------
// [question, correct answer, three wrong answers, round name]

const BANK = [
  [
    'Which planet is known as the Red Planet?',
    'Mars',
    ['Venus', 'Jupiter', 'Mercury'],
    'Science',
  ],
  ['How many legs does a spider have?', '8', ['6', '10', '12'], 'Nature'],
  [
    'What is the largest ocean on Earth?',
    'Pacific',
    ['Atlantic', 'Indian', 'Arctic'],
    'Geography',
  ],
  [
    'Which gas do plants take in for photosynthesis?',
    'Carbon dioxide',
    ['Oxygen', 'Nitrogen', 'Helium'],
    'Science',
  ],
  [
    'Who painted the Mona Lisa?',
    'Leonardo da Vinci',
    ['Michelangelo', 'Raphael', 'Rembrandt'],
    'Arts',
  ],
  [
    'What is the hardest natural substance?',
    'Diamond',
    ['Quartz', 'Iron', 'Granite'],
    'Science',
  ],
  ['How many continents are there?', '7', ['5', '6', '8'], 'Geography'],
  ['What is the chemical symbol for gold?', 'Au', ['Ag', 'Gd', 'Go'], 'Science'],
  [
    'Which instrument usually has 88 keys?',
    'Piano',
    ['Harp', 'Accordion', 'Xylophone'],
    'Arts',
  ],
  [
    'In which country are the pyramids of Giza?',
    'Egypt',
    ['Mexico', 'Peru', 'Sudan'],
    'Geography',
  ],
  [
    'At sea level, water boils at how many degrees Celsius?',
    '100',
    ['90', '110', '212'],
    'Science',
  ],
  [
    'What is the largest mammal?',
    'Blue whale',
    ['African elephant', 'Giraffe', 'Sperm whale'],
    'Nature',
  ],
  ['How many sides does a hexagon have?', '6', ['5', '7', '8'], 'Numbers'],
  [
    'Which language has the most native speakers?',
    'Mandarin Chinese',
    ['English', 'Spanish', 'Hindi'],
    'Geography',
  ],
  ['What is the smallest prime number?', '2', ['1', '3', '0'], 'Numbers'],
  [
    'The Great Barrier Reef lies off which country?',
    'Australia',
    ['Brazil', 'Indonesia', 'Philippines'],
    'Geography',
  ],
  [
    'Who wrote "Romeo and Juliet"?',
    'William Shakespeare',
    ['Charles Dickens', 'Jane Austen', 'Christopher Marlowe'],
    'Arts',
  ],
  [
    'What is the capital of Canada?',
    'Ottawa',
    ['Toronto', 'Vancouver', 'Montreal'],
    'Geography',
  ],
  [
    'Which metal is liquid at room temperature?',
    'Mercury',
    ['Lead', 'Aluminium', 'Zinc'],
    'Science',
  ],
  [
    'How many minutes are there in a day?',
    '1,440',
    ['1,240', '1,640', '1,400'],
    'Numbers',
  ],
  [
    'Which planet has the most prominent rings?',
    'Saturn',
    ['Uranus', 'Neptune', 'Jupiter'],
    'Science',
  ],
  [
    'What is the tallest mountain above sea level?',
    'Mount Everest',
    ['K2', 'Kangchenjunga', 'Kilimanjaro'],
    'Geography',
  ],
  [
    'How many players does a football (soccer) team have on the pitch?',
    '11',
    ['9', '10', '12'],
    'Sport',
  ],
  [
    'Which bird is famous for copying human speech?',
    'Parrot',
    ['Owl', 'Pigeon', 'Penguin'],
    'Nature',
  ],
  [
    'In which year did humans first land on the Moon?',
    '1969',
    ['1965', '1972', '1959'],
    'History',
  ],
  [
    'What is the longest river in South America?',
    'Amazon',
    ['Paraná', 'Orinoco', 'Magdalena'],
    'Geography',
  ],
  [
    'Which vitamin does your skin make in sunlight?',
    'Vitamin D',
    ['Vitamin C', 'Vitamin A', 'Vitamin B12'],
    'Science',
  ],
  [
    'What is the main ingredient of guacamole?',
    'Avocado',
    ['Pea', 'Cucumber', 'Lime'],
    'Food',
  ],
  ['How many strings does a standard violin have?', '4', ['5', '6', '3'], 'Arts'],
  [
    'What is the largest hot desert in the world?',
    'Sahara',
    ['Gobi', 'Kalahari', 'Arabian'],
    'Geography',
  ],
  ['Water freezes at how many degrees Fahrenheit?', '32', ['0', '100', '12'], 'Science'],
  [
    'Which country gave the Statue of Liberty to the USA?',
    'France',
    ['United Kingdom', 'Spain', 'Italy'],
    'History',
  ],
  ['What is the square root of 144?', '12', ['14', '11', '16'], 'Numbers'],
  [
    'Who developed the theory of relativity?',
    'Albert Einstein',
    ['Isaac Newton', 'Niels Bohr', 'Galileo Galilei'],
    'Science',
  ],
  [
    'Which planet is closest to the Sun?',
    'Mercury',
    ['Venus', 'Mars', 'Earth'],
    'Science',
  ],
  ['What is the currency of Japan?', 'Yen', ['Won', 'Yuan', 'Ringgit'], 'Geography'],
  [
    'Which sea creature has three hearts?',
    'Octopus',
    ['Jellyfish', 'Starfish', 'Shark'],
    'Nature',
  ],
  [
    'How many bones are in the adult human body?',
    '206',
    ['186', '226', '256'],
    'Science',
  ],
  [
    'What is the capital of Australia?',
    'Canberra',
    ['Sydney', 'Melbourne', 'Perth'],
    'Geography',
  ],
  [
    'What does a seismograph measure?',
    'Earthquakes',
    ['Wind speed', 'Rainfall', 'Air pressure'],
    'Science',
  ],
  [
    'Which chess piece only ever moves diagonally?',
    'Bishop',
    ['Rook', 'Knight', 'Queen'],
    'Sport',
  ],
  [
    'What is the largest planet in our solar system?',
    'Jupiter',
    ['Saturn', 'Neptune', 'Earth'],
    'Science',
  ],
  [
    'In computing, what does CPU stand for?',
    'Central Processing Unit',
    ['Computer Power Unit', 'Core Program Utility', 'Central Peripheral Unit'],
    'Science',
  ],
  [
    'Which ocean lies between Africa and Australia?',
    'Indian Ocean',
    ['Atlantic Ocean', 'Pacific Ocean', 'Southern Ocean'],
    'Geography',
  ],
  ['How many hours are there in a week?', '168', ['144', '186', '172'], 'Numbers'],
  [
    'What is the national animal of Scotland?',
    'Unicorn',
    ['Lion', 'Stag', 'Golden eagle'],
    'History',
  ],
  [
    'Which famous ocean liner sank on its first voyage in 1912?',
    'Titanic',
    ['Lusitania', 'Britannic', 'Queen Mary'],
    'History',
  ],
  [
    'Which is the only mammal capable of true flight?',
    'Bat',
    ['Flying squirrel', 'Sugar glider', 'Colugo'],
    'Nature',
  ],
  [
    'What is the longest bone in the human body?',
    'Femur',
    ['Tibia', 'Humerus', 'Spine'],
    'Science',
  ],
  ['What is a baby kangaroo called?', 'Joey', ['Kid', 'Cub', 'Pup'], 'Nature'],
  [
    'Which language is spoken in Brazil?',
    'Portuguese',
    ['Spanish', 'French', 'Italian'],
    'Geography',
  ],
  [
    'What colour do you get by mixing blue and yellow paint?',
    'Green',
    ['Purple', 'Orange', 'Brown'],
    'Arts',
  ],
  [
    'Which organ pumps blood around the body?',
    'Heart',
    ['Liver', 'Lungs', 'Kidneys'],
    'Science',
  ],
  ['How many players are on a basketball team on court?', '5', ['6', '7', '4'], 'Sport'],
  [
    'What is the capital of Spain?',
    'Madrid',
    ['Barcelona', 'Seville', 'Valencia'],
    'Geography',
  ],
  [
    'Which fruit is traditionally used to make wine?',
    'Grapes',
    ['Apples', 'Plums', 'Cherries'],
    'Food',
  ],
  ['What is the freezing point of water in Celsius?', '0', ['−10', '4', '32'], 'Science'],
  [
    'Which famous scientist proposed the laws of motion and gravity in 1687?',
    'Isaac Newton',
    ['Albert Einstein', 'Charles Darwin', 'Marie Curie'],
    'History',
  ],
  [
    'Which country is home to the kiwi bird?',
    'New Zealand',
    ['Australia', 'South Africa', 'Chile'],
    'Nature',
  ],
  ['How many degrees are in a right angle?', '90', ['45', '180', '100'], 'Numbers'],
];
const QUESTIONS_PER_ROUND = 10;
const SECONDS_PER_QUESTION = 20;
function makeRound() {
  return [...BANK]
    .sort(() => Math.random() - 0.5)
    .slice(0, QUESTIONS_PER_ROUND)
    .map(([q, right, wrongs, topic]) => ({
      q,
      right,
      topic,
      options: [right, ...wrongs].sort(() => Math.random() - 0.5),
    }));
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'The Crown Pub Quiz');

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
  const [round, setRound] = useState(makeRound);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const [fiftyUsed, setFiftyUsed] = useState(false);
  const [hidden, setHidden] = useState([]);
  const [answers, setAnswers] = useState([]); // true/false per question
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem('pub-quiz-best')) || 0;
    } catch (e) {
      return 0;
    }
  });
  const finished = index >= QUESTIONS_PER_ROUND;
  const current = round[index];
  useEffect(() => {
    if (finished || picked !== null) return undefined;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [index, picked, finished]);
  useEffect(() => {
    if (timeLeft <= 0 && picked === null && !finished) choose('__timeout__');
  }, [timeLeft]);
  useEffect(() => {
    if (finished && score > best) {
      setBest(score);
      try {
        localStorage.setItem('pub-quiz-best', String(score));
      } catch (e) {
        /* storage unavailable */
      }
    }
  }, [finished]);
  function choose(option) {
    if (picked !== null || finished) return;
    setPicked(option);
    const right = option === current.right;
    setAnswers((a) => [...a, right]);
    if (right) {
      // Faster answers earn a small bonus.
      setScore((s) => s + 10 + Math.max(0, timeLeft));
      playTone(784, 0.18);
    } else {
      playTone(180, 0.3, 'sawtooth', 0.04);
    }
  }
  const next = () => {
    setIndex((i) => i + 1);
    setPicked(null);
    setHidden([]);
    setTimeLeft(SECONDS_PER_QUESTION);
  };
  const fifty = () => {
    if (fiftyUsed || picked !== null) return;
    const wrongs = current.options
      .filter((o) => o !== current.right)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    setHidden(wrongs);
    setFiftyUsed(true);
  };
  const restart = () => {
    setRound(makeRound());
    setIndex(0);
    setPicked(null);
    setScore(0);
    setTimeLeft(SECONDS_PER_QUESTION);
    setFiftyUsed(false);
    setHidden([]);
    setAnswers([]);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (finished) {
        if (e.key === 'Enter') restart();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && picked === null) choose(current.options[n - 1]);
      if (e.key === 'Enter' && picked !== null) next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const correctCount = answers.filter(Boolean).length;
  return (
    <main className="font-body max-w-[760px] mx-auto py-6 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[.3em] uppercase text-brass">
            Thursday night
          </div>
          <h1 className="font-display text-[clamp(34px,9vw,54px)] leading-none text-sheet">
            The Crown Pub Quiz
          </h1>
        </div>
        <div
          className="w-28 h-28 rounded-full bg-sheet text-ink flex flex-col items-center justify-center border-[6px] border-brass shadow-xl rotate-[-6deg]"
          aria-label={`Score ${score}`}
        >
          <span className="text-[10px] tracking-[.2em] uppercase text-muted">Score</span>
          <span className="font-display text-4xl leading-none">{score}</span>
        </div>
      </header>

      <section
        className="bg-sheet rounded-md shadow-2xl p-5 sm:p-7 flex flex-col gap-4"
        style={{
          backgroundImage:
            'repeating-linear-gradient(transparent 0 31px, rgba(29,35,31,.07) 31px 32px)',
        }}
      >
        {!finished ? (
          <>
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold">
                Question {index + 1} of {QUESTIONS_PER_ROUND} ·{' '}
                <span className="text-muted">{current.topic}</span>
              </span>
              <span
                className={`font-bold tabular-nums ${timeLeft <= 5 ? 'text-wrong' : 'text-muted'}`}
              >
                {Math.max(0, timeLeft)}s
              </span>
            </div>
            <div className="h-1.5 bg-[#e6e1d3] rounded-full overflow-hidden">
              <div
                className="h-full bg-green transition-[width] duration-1000 linear"
                style={{
                  width: `${(timeLeft / SECONDS_PER_QUESTION) * 100}%`,
                }}
              />
            </div>

            <h2 className="font-display text-[clamp(24px,5.5vw,34px)] leading-tight text-balance">
              {current.q}
            </h2>

            <div className="grid sm:grid-cols-2 gap-2">
              {current.options.map((o, i) => {
                const isRight = picked !== null && o === current.right;
                const isWrongPick = picked === o && o !== current.right;
                return (
                  <button
                    key={String(String(o))}
                    type="button"
                    onClick={() => choose(o)}
                    disabled={picked !== null || hidden.includes(o)}
                    className={`text-left rounded-lg border-2 px-4 py-3 font-semibold transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass
                        ${hidden.includes(o) ? 'opacity-20 line-through' : ''}
                        ${isRight ? 'border-right bg-right text-white' : isWrongPick ? 'border-wrong bg-wrong text-white' : 'border-ink/20 hover:border-green hover:bg-green/5'}`}
                  >
                    <span className="text-muted mr-2 font-normal">{i + 1}</span>
                    {o}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap min-h-[44px]">
              <button
                type="button"
                onClick={fifty}
                disabled={fiftyUsed || picked !== null}
                className="rounded-full border-2 border-ink px-4 py-2 text-sm font-bold disabled:opacity-30"
              >
                50 : 50 joker {fiftyUsed ? '(used)' : ''}
              </button>
              {picked !== null && (
                <div className="flex items-center gap-3">
                  <span className="font-semibold" role="status">
                    {picked === current.right
                      ? 'Correct!'
                      : picked === '__timeout__'
                        ? `Time's up. It's ${current.right}.`
                        : `Not quite. It's ${current.right}.`}
                  </span>
                  <button
                    type="button"
                    onClick={next}
                    className="rounded-full bg-green text-sheet px-5 py-2 font-bold"
                  >
                    {index + 1 === QUESTIONS_PER_ROUND
                      ? 'Hand in the sheet'
                      : 'Next question'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-4xl">Pens down!</h2>
            <p>
              You got <b>{correctCount}</b> out of {QUESTIONS_PER_ROUND} right, for{' '}
              <b>{score}</b> points.
              {correctCount >= 9
                ? ' The landlord buys you a pint.'
                : correctCount >= 6
                  ? ' A respectable showing.'
                  : ' Better luck next Thursday.'}
            </p>
            <p className="text-muted">Best night: {Math.max(best, score)} points.</p>
            <div className="flex gap-1.5" aria-label="Answer sheet">
              {answers.map((a, i) => (
                <span
                  key={String(String(i))}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold ${a ? 'bg-right' : 'bg-wrong'}`}
                >
                  {a ? '✓' : '✗'}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={restart}
              className="self-start rounded-full bg-green text-sheet px-6 py-3 font-bold mt-2"
            >
              Another round
            </button>
          </div>
        )}
      </section>

      <p className="text-sm text-[#bcd0c4]">
        Ten questions a round, {SECONDS_PER_QUESTION} seconds each. Correct answers score
        10 plus a point for every second left on the clock. One 50:50 joker per round.
        Keys 1–4 answer, and Enter moves on.
      </p>
    </main>
  );
}
export default App;
