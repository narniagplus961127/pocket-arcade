import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Felt Fairways: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Felt Fairways');
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
      <canvas id="c" aria-label="Mini golf course"></canvas>

      <div className="bar">
        <div className="hole">
          <small>Hole</small>
          <span id="hole">1</span> / 9 · Par <span id="par">2</span>
        </div>
        <div className="strokes">
          <small>Strokes · total</small>
          <span id="strokes">0</span> · <span id="total">0</span>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="eyebrow">The Tabletop Club · Nine holes</p>
          <h1>Felt Fairways</h1>
          <p>
            Drag anywhere on the course, pull back like a slingshot, and let go to putt.
            The longer the pull, the harder the shot.
          </p>
          <p>
            Sand slows you down. Water costs a stroke and puts you back where you shot
            from. Wooden gates slide, so time your putt.
          </p>
          <button id="play" className="btn" type="button">
            Tee off
          </button>
        </div>
      </div>

      <div id="between" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow" id="bHole">
            Hole 1
          </p>
          <h2 id="bVerdict" className="verdict">
            Birdie
          </h2>
          <div className="sc">
            <table id="card1"></table>
          </div>
          <button id="next" className="btn" type="button">
            Next hole
          </button>
        </div>
      </div>
    </>
  );
}
