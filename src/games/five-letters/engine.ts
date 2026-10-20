import { getGameElement } from '../../shared/dom';
import type { GameLifecycle } from '../../shared/GameLifecycle';

type GameElements = {
  won: HTMLElement;
  streak: HTMLElement;
  board: HTMLDivElement;
  msg: HTMLDivElement;
  next: HTMLButtonElement;
  kb: HTMLDivElement;
};

/** Start the game after React has mounted its canvas and interface. */
export function startGame(lifecycle: GameLifecycle): void {
  const $ = <K extends keyof GameElements>(id: K): GameElements[K] =>
    getGameElement<GameElements[K]>(id);
  let AC;
  function tone(f, d = 0.05, type = 'square', v = 0.03) {
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
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination);
    o.start(t);
    o.stop(t + d + 0.03);
  }
  const ANSWERS =
    'about above actor acute adopt adult after again agent agree ahead alarm album alert alike alive allow alone along alter amber among angel anger angle angry apart apple apply arena argue arise armor array arrow aside asset audio avoid award aware badge baker basic beach beard beast begin being below bench berry birth black blade blame blank blast blaze bleed blend bless blind block bloom board boast bonus boost booth brain brand brave bread break brick bride brief bring broad brook brown brush build bunch burst cabin cable camel candy cargo carry catch cause chain chair chalk charm chart chase cheap check cheek chess chest chief child chill choir civic claim class clean clear clerk click cliff climb clock close cloth cloud coach coast cocoa coral couch could count court cover craft crane crash cream crisp crowd crown crumb cubic curve cycle daily dance dealt death delay depth diary dizzy dough draft drain drama dream dress drift drink drive eager eagle early earth eight elbow elder empty enjoy enter equal error event exact extra fable faint fairy faith false fancy feast fence ferry fever field fifty final flame flash fleet flock flood floor flour fluid flute focus force forge forum found frame fresh front frost fruit giant glass gleam globe glove grace grade grain grand grape graph grass grave great green greet grill group guard guess guest guide habit happy harsh heart heavy hedge honey horse hotel house human humor ideal image index inner input irony ivory jelly jewel joint judge juice knife knock label laser later laugh layer learn lemon level light limit linen local lodge logic loose lucky lunar lunch magic major maple march match mayor medal melon mercy metal meter might minor mirth model money month moral motor mount mouse mouth movie music naval nerve never night noble noise north novel nurse oasis ocean offer olive onion opera orbit order organ other otter outer owner paint panel paper party pasta patch peace peach pearl pedal penny phase phone photo piano piece pilot pinch pitch pixel pizza place plain plane plant plate plaza point polar porch pound power press price pride prime print prize proof proud prove pulse punch quest quick quiet quilt quite radar radio raise rally ranch range rapid raven reach react ready realm relax reply rider ridge right rival river roast robin robot rocky round route royal rural salad sauce scale scarf scene scent scope score scout scrap sense serve seven shade shake shape share shark sharp sheep sheet shelf shell shift shine shirt shore short shout sight silky skill skirt slate sleep slice slide slope small smart smile smoke snack snail snake solar solid sound south space spare spark speak spice spine spoon sport spray squad stack staff stage stair stamp stand start steam steel stern stick still stone stool storm story stove straw strip study style sugar suite sunny super swamp sweet swift sword table taste teach thank theme thick thing think thorn three throw thumb tiger timer toast token topic torch total touch tough tower trace track trade trail train treat trend trial tribe trick truck truly trunk trust truth tulip tutor twist ultra uncle under union unity upper urban usage usual valid value valve vapor vault verse video vigor vinyl viola visit vital vivid vocal voice wagon waltz watch water whale wheat wheel while whirl white whole world worry worth would wrist write yacht yield young youth zebra'.split(
      ' ',
    );
  const ROWS = 6;
  let answer,
    row,
    col,
    grid,
    over,
    won = 0,
    streak = 0;
  try {
    won = +localStorage.getItem('l5-won') || 0;
    streak = +localStorage.getItem('l5-streak') || 0;
  } catch (e) {}
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    const d = document.createElement('div');
    d.className = 'row';
    for (let c = 0; c < 5; c++) {
      const t = document.createElement('div');
      t.className = 'tile';
      d.appendChild(t);
      tiles.push(t);
    }
    $('board').appendChild(d);
  }
  const keyEls: Record<string, HTMLButtonElement> = {};
  ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'].forEach((line) => {
    const d = document.createElement('div');
    for (const ch of line) {
      const b = document.createElement('button');
      b.type = 'button';
      if (ch === '+') {
        b.textContent = String('Enter');
        b.className = 'wide';
        b.onclick = submit;
      } else if (ch === '-') {
        b.textContent = String('⌫');
        b.className = 'wide';
        b.setAttribute('aria-label', String('Delete'));
        b.onclick = back;
      } else {
        b.textContent = String(ch);
        b.onclick = () => type(ch);
        keyEls[ch] = b;
      }
      d.appendChild(b);
    }
    $('kb').appendChild(d);
  });
  function newGame() {
    answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    row = 0;
    col = 0;
    over = false;
    grid = [...Array(ROWS)].map(() => Array(5).fill(''));
    tiles.forEach((t) => {
      t.textContent = String('');
      t.className = 'tile';
    });
    Object.values(keyEls).forEach((k) => (k.className = ''));
    $('msg').textContent = String('');
    $('next').hidden = true;
    stats();
  }

  function stats() {
    $('won').textContent = String(won);
    $('streak').textContent = String(streak);
  }

  function type(ch) {
    if (over || col >= 5) return;
    grid[row][col] = ch;
    const t = tiles[row * 5 + col];
    t.textContent = String(ch);
    t.classList.add('filled');
    col++;
    tone(900 + Math.random() * 200);
  }

  function back() {
    if (over || col === 0) return;
    col--;
    grid[row][col] = '';
    const t = tiles[row * 5 + col];
    t.textContent = String('');
    t.classList.remove('filled');
  }
  let busy = false;
  function submit() {
    if (over || busy) return;
    if (col < 5) {
      const r = $('board').children[row];
      r.classList.remove('shake');
      void (r as HTMLElement).offsetWidth;
      r.classList.add('shake');
      $('msg').textContent = String('Set all five letters first.');
      return;
    }
    const g = grid[row].join(''),
      res = Array(5).fill('miss'),
      pool = {};
    for (let i = 0; i < 5; i++) {
      if (g[i] === answer[i]) res[i] = 'hit';
      else pool[answer[i]] = (pool[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++)
      if (res[i] !== 'hit' && pool[g[i]]) {
        res[i] = 'near';
        pool[g[i]]--;
      }
    const rank = {
      hit: 3,
      near: 2,
      miss: 1,
    };
    res.forEach((r, i) =>
      lifecycle.setTimeout(() => {
        tiles[row * 5 + i].classList.add(r);
        tone(r === 'hit' ? 660 : r === 'near' ? 520 : 260, 0.08, 'triangle', 0.05);
        const k = keyEls[g[i]],
          cur = ['hit', 'near', 'miss'].find((c) => k.classList.contains(c));
        if (!cur || rank[r] > rank[cur]) k.className = r;
      }, i * 110),
    );
    $('msg').textContent = String('');
    busy = true;
    lifecycle.setTimeout(() => {
      busy = false;
      if (g === answer) {
        over = true;
        won++;
        streak++;
        save();
        $('msg').textContent = String(
          [
            'Perfect impression!',
            'Masterful.',
            'Splendid.',
            'Nicely set.',
            'Good work.',
            'Phew, just in time.',
          ][row],
        );
        finish();
      } else if (++row >= ROWS) {
        over = true;
        streak = 0;
        save();
        $('msg').textContent = String(`The word was ${answer.toUpperCase()}.`);
        finish();
      } else col = 0;
    }, 600);
  }

  function save() {
    try {
      localStorage.setItem('l5-won', String(won));
      localStorage.setItem('l5-streak', String(streak));
    } catch (e) {}
    stats();
  }

  function finish() {
    $('next').hidden = false;
    $('next').focus();
  }
  $('next').onclick = newGame;
  lifecycle.listen(window, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      if (document.activeElement === $('next')) return;
      e.preventDefault();
      submit();
    } else if (e.key === 'Backspace') back();
    else if (/^[a-z]$/i.test(e.key)) type(e.key.toLowerCase());
  });
  newGame();
}
