import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Tide Pool Four: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Tide Pool Four');
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
        <div>
          <h1>Tide Pool Four</h1>
          <p className="tag">
            Line up four coral pebbles before the octopus lines up four bits of sea glass.
          </p>
        </div>
        <div className="banner" aria-live="polite">
          <span
            id="bdot"
            className="dot"
            style={{
              background: 'var(--coral)',
            }}
          ></span>
          <span id="turn">Your move. Drop a pebble in any column.</span>
        </div>
        <div id="board" className="board" aria-label="Board, 7 columns"></div>
        <div className="row">
          <span>Octopus:</span>
          <button className="ctl" type="button" data-d="2">
            Sleepy
          </button>
          <button className="ctl" type="button" data-d="4" aria-pressed="true">
            Curious
          </button>
          <button className="ctl" type="button" data-d="6">
            Cunning
          </button>
          <button id="restart" className="ctl" type="button">
            New game
          </button>
        </div>
        <div className="score" id="tally">
          You 0 · Octopus 0 · Draws 0
        </div>
      </main>
    </>
  );
}
