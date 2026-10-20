import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Harbour Dice: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Harbour Dice');
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
          <h1>Harbour Dice</h1>
          <div className="pennant">
            Total<b id="total">0</b>
          </div>
        </header>
        <div className="tray">
          <div id="dice" className="dice" aria-label="Dice. Tap a die to hold it."></div>
          <button id="roll" className="btn" type="button">
            Roll · 3 left
          </button>
          <p className="hint" id="hint">
            Roll up to three times a turn. Tap dice to hold them between rolls, then score
            them in one box.
          </p>
        </div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <div className="sheet">
          <table id="card"></table>
        </div>
      </main>
    </>
  );
}
