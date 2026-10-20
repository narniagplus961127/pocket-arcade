import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Hoop Arc: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Hoop Arc');
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
      <canvas id="c" aria-label="Basketball court"></canvas>

      <div className="bar">
        <div>
          <span>POINTS</span>
          <b id="score">0</b>
        </div>
        <div>
          <span>CLOCK</span>
          <b id="clock">60</b>
        </div>
        <div>
          <span>STREAK</span>
          <b id="streak">0</b>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Hoop Arc</h1>
          <p>
            You have 60 seconds on the clock. Press on the ball (or anywhere), pull back
            like a slingshot, and let go to shoot. A short guide shows where the shot
            starts out.
          </p>
          <p>
            A swish that doesn't touch the rim is worth 3, anything else that drops is 2.
            Three makes in a row put you on fire for double points. After 10 points the
            hoop starts to move.
          </p>
          <button id="play" className="btn" type="button">
            Tip off
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2>Final buzzer</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Run it back
          </button>
        </div>
      </div>
    </>
  );
}
