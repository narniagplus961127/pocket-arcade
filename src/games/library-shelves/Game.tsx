import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Library Shelves: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Library Shelves');
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
            <div className="call" id="call">
              Room I of VI
            </div>
            <h1>Library Shelves</h1>
          </div>
          <div className="ledger">
            <div>
              <span>Steps</span>
              <b id="steps">0</b>
            </div>
            <div>
              <span>Shelved</span>
              <b id="shelved">0/0</b>
            </div>
          </div>
        </header>
        <div className="frame">
          <canvas id="c" aria-label="Reading room floor"></canvas>
        </div>
        <div id="msg" className="msg" aria-live="polite">
          Push every book cart onto a brass shelf marker.
        </div>
        <div className="controls">
          <button id="undo" type="button">
            Undo (Z)
          </button>
          <button id="reset" type="button">
            Restart room (R)
          </button>
          <button id="prev" type="button">
            ← Room
          </button>
          <button id="next" type="button">
            Room →
          </button>
        </div>
        <div className="pad" aria-label="Direction pad">
          <span></span>
          <button type="button" data-d="0,-1" aria-label="Up">
            ↑
          </button>
          <span></span>
          <button type="button" data-d="-1,0" aria-label="Left">
            ←
          </button>
          <button type="button" data-d="0,1" aria-label="Down">
            ↓
          </button>
          <button type="button" data-d="1,0" aria-label="Right">
            →
          </button>
        </div>
        <p className="note">
          You're the night librarian. Walk with the arrow keys, WASD, swipes, or the pad.
          You can push a book cart but never pull it, and only one at a time, so a cart
          stuck in a corner stays stuck. Undo is free.
        </p>
      </main>
    </>
  );
}
