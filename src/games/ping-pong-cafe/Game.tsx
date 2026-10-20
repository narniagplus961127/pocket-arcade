import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Ping Pong Café: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Ping Pong Café');
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
      <canvas id="c" aria-label="Table tennis table"></canvas>

      <div className="board">
        <div>
          <small>You</small>
          <span id="me">0</span>
        </div>
        <div>·</div>
        <div>
          <small id="oppName">Barista</small>
          <span id="opp">0</span>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Ping Pong Café</h1>
          <p>
            The table in the back corner is free. Your paddle is at the bottom. Move it
            with the mouse, a finger, or the arrow keys. Hitting the ball near the
            paddle's edge sends it out at a sharper angle.
          </p>
          <p>First to 7 wins. Pick an opponent:</p>
          <div className="levels">
            <button className="btn primary" type="button" data-lv="0">
              The regular
            </button>
            <button className="btn" type="button" data-lv="1">
              The barista
            </button>
            <button className="btn" type="button" data-lv="2">
              The owner
            </button>
          </div>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2 id="oTitle">Match</h2>
          <p id="oText"></p>
          <button id="again" className="btn primary" type="button">
            Rematch
          </button>
        </div>
      </div>
    </>
  );
}
