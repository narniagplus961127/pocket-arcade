import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Tea Blend: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Tea Blend');
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
            <h1>Tea Blend</h1>
            <p className="tag">Merge matching leaves into rarer teas.</p>
          </div>
          <div className="tins">
            <div className="tin">
              <span>Score</span>
              <b id="score">0</b>
            </div>
            <div className="tin">
              <span>Best</span>
              <b id="best">0</b>
            </div>
          </div>
        </header>
        <div id="tray" className="tray" aria-label="Tea tray. Use arrow keys or swipe.">
          <div className="slots"></div>
          <div id="tiles" className="tiles"></div>
          <div id="msg" className="msg" hidden={true}>
            <div>
              <h2 id="mTitle">Tray full</h2>
              <p id="mText"></p>
              <button id="again" className="btn" type="button">
                Brew a new tray
              </button>
            </div>
          </div>
        </div>
        <div id="ladder" className="ladder" aria-label="Blend ladder"></div>
        <p className="note">
          Swipe or use the arrow keys (or WASD) to slide every leaf on the tray. Two
          matching teas that collide steep into the next tea up the ladder. Reach{' '}
          <b>Golden Tips</b> to win the house.
        </p>
        <div>
          <button id="newg" className="btn" type="button">
            New tray
          </button>
        </div>
      </main>
    </>
  );
}
