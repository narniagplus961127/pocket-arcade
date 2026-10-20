import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Bloom Grid: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Bloom Grid');
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
          <div>
            <h1>Bloom Grid</h1>
            <p className="tag">Wake every bud in the bed.</p>
          </div>
          <div className="meta">
            <div>
              <span className="label">Bed</span>
              <span id="lvl" className="val">
                1
              </span>
            </div>
            <div>
              <span className="label">Moves</span>
              <span id="moves" className="val">
                0
              </span>
            </div>
            <div>
              <span className="label">Par</span>
              <span id="par" className="val">
                3
              </span>
            </div>
          </div>
        </header>
        <div className="bed">
          <div id="grid" className="grid" role="grid" aria-label="Flower bed"></div>
        </div>
        <div id="win" className="win" hidden={true}>
          <h2 id="winTitle">In full bloom</h2>
          <div id="stars" className="stars" aria-label="Rating">
            ★★★
          </div>
          <p id="winNote" className="note">
            Solved in par.
          </p>
          <div className="controls">
            <button id="next" className="ctl primary" type="button">
              Next bed
            </button>
          </div>
        </div>
        <div className="controls">
          <button id="hint" className="ctl" type="button">
            Hint (costs a move)
          </button>
          <button id="restart" className="ctl" type="button">
            Replant this bed
          </button>
        </div>
        <p className="note">
          Tapping a plot flips it and the four plots touching it: buds open, flowers
          close. Get the whole bed blooming. Every bed is solvable within par, and beds
          grow from 3×3 up to 6×6. Keyboard: Tab between plots, Enter to tap.
        </p>
      </main>
    </>
  );
}
