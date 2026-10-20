import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Gem Bazaar: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Gem Bazaar');
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
        <div className="arch">
          <h1>Gem Bazaar</h1>
          <p className="tag">Swap neighbouring gems to make rows of three or more.</p>
        </div>
        <div className="strip">
          <div>
            <span>Purse</span>
            <b id="score">0</b>
          </div>
          <div>
            <span>Target</span>
            <b id="target">3000</b>
          </div>
          <div>
            <span>Moves</span>
            <b id="moves">20</b>
          </div>
        </div>
        <div className="bar">
          <i id="bar"></i>
        </div>
        <div className="tray">
          <canvas id="c" aria-label="Gem tray"></canvas>
          <div id="msg" className="msg">
            <div>
              <h2 id="mTitle">Open the stall</h2>
              <p id="mText">
                Reach the target purse before your moves run out. Cascades pay more.
              </p>
              <button id="go" className="btn" type="button">
                Start trading
              </button>
            </div>
          </div>
        </div>
        <p className="note">
          Tap a gem, then tap a neighbour to swap them, or drag one gem onto the next. A
          swap only counts if it makes a match. Matches of four or five pay extra. Each
          market day raises the target.
        </p>
      </main>
    </>
  );
}
