import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Potion Sort: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Potion Sort');
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
          <h1>Potion Sort</h1>
          <div className="label">
            Recipe <b id="lvl">1</b> · Pours <b id="pours">0</b>
          </div>
        </header>
        <div id="shelf" className="shelf" aria-label="Vials"></div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <div className="row">
          <button id="undo" className="ctl" type="button">
            Undo
          </button>
          <button id="restart" className="ctl" type="button">
            Restart recipe
          </button>
          <button id="extra" className="ctl" type="button">
            Fetch a spare vial
          </button>
          <button id="next" className="ctl" type="button" hidden={true}>
            Next recipe
          </button>
        </div>
        <p className="note">
          Tap a vial to pick it up, then tap another to pour. Liquid only pours onto the
          same colour or into an empty vial, and as much of the top colour moves as will
          fit. Sort every vial into a single colour. Each vial holds four measures. You
          get one spare vial per recipe if you're stuck.
        </p>
      </main>
    </>
  );
}
