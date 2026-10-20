import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Aqueduct: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Aqueduct');
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
            <div className="roman" id="roman">
              AQVA · I
            </div>
            <h1>Aqueduct</h1>
          </div>
          <div className="ledger">
            <div>
              <span className="k">Turns</span>
              <span id="moves" className="v">
                0
              </span>
            </div>
            <div>
              <span className="k">Time</span>
              <span id="time" className="v">
                0:00
              </span>
            </div>
            <div>
              <span className="k">Built</span>
              <span id="built" className="v">
                0
              </span>
            </div>
          </div>
        </header>
        <div className="boardwrap">
          <canvas
            id="c"
            tabIndex={0}
            aria-label="Aqueduct board. Arrow keys move, Space turns a stone."
          ></canvas>
        </div>
        <div id="msg" className="msg" aria-live="polite">
          Turn the stones until water from the spring reaches the basin.
        </div>
        <div className="controls">
          <button id="next" className="primary" type="button" hidden={true}>
            Next aqueduct
          </button>
          <button id="new" type="button">
            Survey a new route
          </button>
        </div>
        <p className="note">
          Click a stone to turn it a quarter clockwise. Right-click or Shift-click turns
          it the other way. Water flows as soon as the channels line up, so you can watch
          your progress. The grid grows from 4×4 up to 7×7 as you go. Keyboard: arrow keys
          to move, Space to turn, Shift+Space to turn back.
        </p>
      </main>
    </>
  );
}
