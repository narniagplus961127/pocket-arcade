import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Duckling Crossing: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Duckling Crossing');
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
      <canvas id="c" aria-label="Park map"></canvas>

      <div className="hud">
        <div>
          <span>Ducklings home</span>
          <b id="home">0 / 5</b>
        </div>
        <div
          style={{
            textAlign: 'center',
          }}
        >
          <span>Score</span>
          <b id="score">0</b>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <span>Lives</span>
          <b id="lives">3</b>
        </div>
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

      <div id="title" className="overlay">
        <div className="card">
          <h1>Duckling Crossing</h1>
          <p>
            Mama Duck has to walk five ducklings, one at a time, across the busy road and
            over the pond to the nests on the far bank.
          </p>
          <p>
            Hop with the arrow keys, WASD, swipes, or the pad. Cars are bad news. In the
            pond, ride the floating logs and lily pads, because these ducklings can't swim
            yet.
          </p>
          <button id="play" className="btn" type="button">
            Waddle!
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2 id="oTitle">Quack!</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Try again
          </button>
        </div>
      </div>
    </>
  );
}
