import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Rooftop Cat: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Rooftop Cat');
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
      <canvas id="c" aria-label="Rooftops at sunset"></canvas>

      <div className="hud">
        <div>
          <span>Distance</span>
          <b id="dist">0 m</b>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <span>Fish</span>
          <b id="fish">0</b>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Rooftop Cat</h1>
          <p>
            Mochi is late for dinner and running home over the rooftops. Tap, click, or
            press Space to jump. Hold it longer for a higher jump, and tap again in
            mid-air for a second jump.
          </p>
          <p>Grab the fish along the way. Mind the gaps and the chimneys.</p>
          <button id="play" className="btn" type="button">
            Run, Mochi!
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2 id="oTitle">Meow…</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            One more run
          </button>
        </div>
      </div>
    </>
  );
}
