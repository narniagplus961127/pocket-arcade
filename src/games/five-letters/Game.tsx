import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Letterpress Five: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Letterpress Five');
  useEffect(() => {
    const lifecycle = new GameLifecycle();
    try {
      startGame(lifecycle);
    } catch (error) {
      lifecycle.dispose();
      throw error;
    }
    return () => lifecycle.dispose();
  }, []);
  return (
    <>
      <main>
        <header>
          <h1>
            Letterpress
            <br />
            Five
          </h1>
          <div className="streak">
            Solved <b id="won">0</b> · Streak <b id="streak">0</b>
          </div>
        </header>
        <div id="board" className="board" aria-label="Guess grid"></div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <button id="next" className="btn" type="button" hidden={true}>
          Set a new word
        </button>
        <div id="kb" className="kb" aria-label="Keyboard"></div>
        <p className="note">
          Guess the hidden five-letter word in six tries. Green: right letter, right spot.
          Amber: in the word, wrong spot. Grey: not in the word.
        </p>
      </main>
    </>
  );
}
