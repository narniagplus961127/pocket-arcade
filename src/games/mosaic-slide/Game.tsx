import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Mosaic Slide: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Mosaic Slide');
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
        <div className="label">
          <h1>Mosaic Slide</h1>
          <p className="title-art" id="artTitle">
            Untitled No. 1
          </p>
          <p className="meta" id="artMeta">
            Generated gouache on canvas · 2026
          </p>
          <p className="meta">
            The painting has been cut into tiles and shuffled. Slide tiles into the gap
            until it's whole again. Click or tap a tile next to the gap, or use the arrow
            keys to move a tile into it.
          </p>
          <div className="stats">
            <div>
              <span>Moves</span>
              <b id="moves">0</b>
            </div>
            <div>
              <span>Time</span>
              <b id="time">0:00</b>
            </div>
          </div>
          <div className="controls">
            <button type="button" data-n="3">
              3 × 3
            </button>
            <button type="button" data-n="4" className="on">
              4 × 4
            </button>
            <button type="button" data-n="5">
              5 × 5
            </button>
          </div>
          <div className="controls">
            <button id="peek" type="button">
              Hold to peek
            </button>
            <button id="newart" type="button">
              New painting
            </button>
          </div>
          <p id="msg" className="msg" aria-live="polite"></p>
        </div>
        <div className="frame">
          <div className="mat">
            <canvas id="c" tabIndex={0} aria-label="Sliding tile puzzle"></canvas>
          </div>
        </div>
      </main>
    </>
  );
}
